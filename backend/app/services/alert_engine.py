"""预警规则引擎 — 规则 CRUD、条件评估、冷却期管理。"""

import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis_pool
from app.core.sql_compat import insert_returning, update_returning, jsonb_func_cast
from app.models.alert import (
    AlertRuleCreate,
    AlertRuleResponse,
    AlertRuleUpdate,
    AlertTriggerResponse,
    Condition,
    ConditionExpression,
    LogicGroup,
    MetricType,
    Operator,
)

logger = logging.getLogger(__name__)


class QuotaExceededError(Exception):
    """会员规则额度已满。"""
    pass


class RuleNotFoundError(Exception):
    """规则不存在或无权操作。"""
    pass


class AlertRuleEngine:
    """预警规则评估核心逻辑。"""

    # 会员等级 → 规则上限
    RULE_LIMITS: dict[int, int] = {0: 3, 1: 20, 2: 100}
    # 冷却期（秒）
    COOLDOWN_TTL: int = 300

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── CRUD ──────────────────────────────────────────────

    async def create_rule(
        self, user_id: str, level: int, rule: AlertRuleCreate
    ) -> AlertRuleResponse:
        """创建规则，校验会员额度。"""
        current_count = await self._count_user_rules(user_id)
        limit = self.RULE_LIMITS.get(level, 3)
        if current_count >= limit:
            raise QuotaExceededError(
                f"当前等级最多 {limit} 条规则，已有 {current_count} 条"
            )

        result = await insert_returning(
            self._session,
            f"""
                INSERT INTO alert_rules
                    (user_id, name, symbol, expression, notify_channels)
                VALUES
                    (:user_id, :name, :symbol, {jsonb_func_cast(':expression')}, {jsonb_func_cast(':notify_channels')})
                RETURNING id, name, symbol, expression, enabled, notify_channels,
                          last_triggered_at, created_at
            """,
            {
                "user_id": user_id,
                "name": rule.name,
                "symbol": rule.symbol,
                "expression": rule.expression.model_dump_json(),
                "notify_channels": json.dumps(rule.notify_channels),
            },
            table="alert_rules",
        )
        row = result.mappings().first()
        return self._row_to_response(row)

    async def list_rules(self, user_id: str) -> list[AlertRuleResponse]:
        """获取当前用户的所有预警规则。"""
        result = await self._session.execute(
            text("""
                SELECT id, name, symbol, expression, enabled, notify_channels,
                       last_triggered_at, created_at
                FROM alert_rules
                WHERE user_id = :user_id
                ORDER BY created_at DESC
            """),
            {"user_id": user_id},
        )
        return [self._row_to_response(row) for row in result.mappings()]

    async def update_rule(
        self, user_id: str, rule_id: UUID, update: AlertRuleUpdate
    ) -> AlertRuleResponse:
        """修改预警规则（仅限本人创建的规则）。"""
        await self._verify_ownership(user_id, rule_id)

        sets: list[str] = []
        params: dict = {"rule_id": str(rule_id), "user_id": user_id}

        if update.name is not None:
            sets.append("name = :name")
            params["name"] = update.name
        if update.expression is not None:
            sets.append(f"expression = {jsonb_func_cast(':expression')}")
            params["expression"] = update.expression.model_dump_json()
        if update.enabled is not None:
            sets.append("enabled = :enabled")
            params["enabled"] = update.enabled
        if update.notify_channels is not None:
            sets.append(f"notify_channels = {jsonb_func_cast(':notify_channels')}")
            params["notify_channels"] = json.dumps(update.notify_channels)

        if not sets:
            # 无更新字段，直接返回当前数据
            return (await self.list_rules(user_id))[0]

        set_clause = ", ".join(sets)
        result = await update_returning(
            self._session,
            f"""
                UPDATE alert_rules SET {set_clause}, updated_at = NOW()
                WHERE id = :rule_id AND user_id = :user_id
                RETURNING id, name, symbol, expression, enabled, notify_channels,
                          last_triggered_at, created_at
            """,
            params,
            table="alert_rules", where="id = :rule_id AND user_id = :user_id",
        )
        row = result.mappings().first()
        if row is None:
            raise RuleNotFoundError(f"规则 {rule_id} 不存在或无权操作")
        return self._row_to_response(row)

    async def delete_rule(self, user_id: str, rule_id: UUID) -> None:
        """删除预警规则（仅限本人创建的规则）。"""
        await self._verify_ownership(user_id, rule_id)
        await self._session.execute(
            text("DELETE FROM alert_rules WHERE id = :rule_id AND user_id = :user_id"),
            {"rule_id": str(rule_id), "user_id": user_id},
        )

    async def list_triggers(
        self, user_id: str, limit: int = 100
    ) -> list[AlertTriggerResponse]:
        """获取触发历史（最近100条）。"""
        result = await self._session.execute(
            text("""
                SELECT t.id, t.rule_id, r.name AS rule_name,
                       t.triggered_value, t.metric_type,
                       t.notify_channel, t.notify_status, t.triggered_at
                FROM alert_triggers t
                JOIN alert_rules r ON r.id = t.rule_id
                WHERE r.user_id = :user_id
                ORDER BY t.triggered_at DESC
                LIMIT :limit
            """),
            {"user_id": user_id, "limit": limit},
        )
        return [
            AlertTriggerResponse(
                id=row["id"],
                rule_id=row["rule_id"],
                rule_name=row["rule_name"],
                triggered_value=float(row["triggered_value"]),
                metric_type=row["metric_type"],
                notify_channel=row["notify_channel"],
                notify_status=row["notify_status"],
                triggered_at=row["triggered_at"],
            )
            for row in result.mappings()
        ]

    # ── 评估逻辑 ──────────────────────────────────────────

    async def evaluate(
        self,
        symbol: str,
        metric_type: MetricType,
        current_value: float,
        prev_value: float | None,
    ) -> list[UUID]:
        """评估所有匹配的已启用规则，返回触发的 rule_id 列表。"""
        rules = await self._get_active_rules(symbol)
        triggered: list[UUID] = []

        for rule in rules:
            try:
                expression = ConditionExpression.model_validate(rule["expression"])
                if self._check_expression(
                    expression, metric_type, current_value, prev_value
                ):
                    rule_id = UUID(str(rule["id"]))
                    if not await self._is_cooling_down(rule_id):
                        triggered.append(rule_id)
                        await self._set_cooldown(rule_id)
            except Exception as exc:
                logger.warning("评估规则 %s 失败: %s", rule["id"], exc)
                continue

        return triggered

    def _check_condition(
        self, cond: Condition, current: float, prev: float | None
    ) -> bool:
        """单条件评估，包含 cross_above/cross_below 穿越判断。"""
        match cond.operator:
            case Operator.GT:
                return current > cond.threshold
            case Operator.LT:
                return current < cond.threshold
            case Operator.GTE:
                return current >= cond.threshold
            case Operator.LTE:
                return current <= cond.threshold
            case Operator.CROSS_ABOVE:
                return (
                    prev is not None
                    and prev <= cond.threshold
                    and current > cond.threshold
                )
            case Operator.CROSS_BELOW:
                return (
                    prev is not None
                    and prev >= cond.threshold
                    and current < cond.threshold
                )
        return False

    def _check_expression(
        self,
        expr: ConditionExpression,
        metric: MetricType,
        current: float,
        prev: float | None,
    ) -> bool:
        """递归评估条件表达式（AND/OR 组合）。"""
        results: list[bool] = []

        for c in expr.conditions:
            if c.metric == metric:
                results.append(self._check_condition(c, current, prev))

        for sg in expr.sub_groups:
            results.append(
                self._check_expression(sg, metric, current, prev)
            )

        if not results:
            return False

        if expr.logic == LogicGroup.AND:
            return all(results)
        return any(results)

    # ── 触发记录 ──────────────────────────────────────────

    async def record_trigger(
        self,
        rule_id: UUID,
        current_value: float,
        metric_type: str,
        notify_channel: str,
    ) -> None:
        """记录触发历史并更新规则的最后触发时间。"""
        await self._session.execute(
            text("""
                INSERT INTO alert_triggers
                    (rule_id, triggered_value, metric_type, notify_channel)
                VALUES
                    (:rule_id, :value, :metric_type, :channel)
            """),
            {
                "rule_id": str(rule_id),
                "value": current_value,
                "metric_type": metric_type,
                "channel": notify_channel,
            },
        )
        await self._session.execute(
            text(
                "UPDATE alert_rules SET last_triggered_at = NOW() WHERE id = :rule_id"
            ),
            {"rule_id": str(rule_id)},
        )

    async def get_rule(self, rule_id: UUID) -> AlertRuleResponse | None:
        """根据 ID 获取单条规则。"""
        result = await self._session.execute(
            text("""
                SELECT id, name, symbol, expression, enabled, notify_channels,
                       last_triggered_at, created_at
                FROM alert_rules WHERE id = :rule_id
            """),
            {"rule_id": str(rule_id)},
        )
        row = result.mappings().first()
        if row is None:
            return None
        return self._row_to_response(row)

    # ── 内部方法 ──────────────────────────────────────────

    async def _count_user_rules(self, user_id: str) -> int:
        """统计用户当前规则数量。"""
        result = await self._session.execute(
            text("SELECT COUNT(*) AS cnt FROM alert_rules WHERE user_id = :user_id"),
            {"user_id": user_id},
        )
        return result.scalar_one()

    async def _verify_ownership(self, user_id: str, rule_id: UUID) -> None:
        """校验规则归属，不属于当前用户则抛出异常。"""
        result = await self._session.execute(
            text(
                "SELECT id FROM alert_rules WHERE id = :rule_id AND user_id = :user_id"
            ),
            {"rule_id": str(rule_id), "user_id": user_id},
        )
        if result.first() is None:
            raise RuleNotFoundError(f"规则 {rule_id} 不存在或无权操作")

    async def _get_active_rules(self, symbol: str) -> list[dict]:
        """获取指定交易对的所有已启用规则。"""
        result = await self._session.execute(
            text("""
                SELECT id, expression, notify_channels
                FROM alert_rules
                WHERE symbol = :symbol AND enabled = true
            """),
            {"symbol": symbol},
        )
        rows: list[dict] = []
        for row in result.mappings():
            expr = row["expression"]
            if isinstance(expr, str):
                expr = json.loads(expr)
            rows.append({
                "id": row["id"],
                "expression": expr,
                "notify_channels": row["notify_channels"],
            })
        return rows

    async def _is_cooling_down(self, rule_id: UUID) -> bool:
        """检查规则是否在冷却期内（Redis key 存在即冷却中）。"""
        redis = get_redis_pool()
        key = f"alert_cooldown:{rule_id}"
        return await redis.exists(key) > 0

    async def _set_cooldown(self, rule_id: UUID) -> None:
        """设置规则冷却期（Redis SETEX）。"""
        redis = get_redis_pool()
        key = f"alert_cooldown:{rule_id}"
        await redis.setex(key, self.COOLDOWN_TTL, "1")

    @staticmethod
    def _row_to_response(row) -> AlertRuleResponse:  # type: ignore[type-arg]
        """将数据库行映射为 AlertRuleResponse。"""
        expression = row["expression"]
        if isinstance(expression, str):
            expression = json.loads(expression)
        notify_channels = row["notify_channels"]
        if isinstance(notify_channels, str):
            notify_channels = json.loads(notify_channels)
        return AlertRuleResponse(
            id=row["id"],
            name=row["name"],
            symbol=row["symbol"],
            expression=expression,
            enabled=row["enabled"],
            notify_channels=notify_channels,
            last_triggered_at=row["last_triggered_at"],
            created_at=row["created_at"],
        )
