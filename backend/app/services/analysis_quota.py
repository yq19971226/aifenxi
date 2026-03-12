"""分析配额服务 — Redis 计数器，按模式独立计数，每日 UTC 00:00 重置。

- check_and_increment: 检查额度并递增计数，超限时回滚；锁定模式直接拒绝
- get_remaining: 查询当日某模式剩余次数
- get_all_quotas: 查询所有模式的配额信息（含锁定状态）
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from redis.asyncio import Redis

from app.core.redis import get_redis_pool
from app.models.analysis import AnalysisMode, QuotaInfo, MODE_LEVEL_REQUIREMENTS

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 硬编码回退默认值 — 动态配置不可用时使用
# key = (会员等级, 模式值)
# ---------------------------------------------------------------------------

ANALYSIS_DAILY_LIMITS: dict[tuple[int, str], int] = {
    (0, "scalping"): 5,
    (1, "scalping"): 50,
    (2, "scalping"): 200,
    (0, "intraday"): 0,    # locked
    (1, "intraday"): 20,
    (2, "intraday"): 100,
    (0, "trend"): 0,        # locked
    (1, "trend"): 0,        # locked
    (2, "trend"): 50,
}

# 动态配置键映射 — 仅包含有实际配额的组合
_LIMIT_CONFIG_KEYS: dict[tuple[int, str], str] = {
    (0, "scalping"): "analysis_daily_limit_free_scalping",
    (1, "scalping"): "analysis_daily_limit_pro_scalping",
    (2, "scalping"): "analysis_daily_limit_flagship_scalping",
    (1, "intraday"): "analysis_daily_limit_pro_intraday",
    (2, "intraday"): "analysis_daily_limit_flagship_intraday",
    (2, "trend"): "analysis_daily_limit_flagship_trend",
}


async def _get_analysis_daily_limit(level: int, mode: AnalysisMode) -> int:
    """从动态配置读取每日分析限额，失败时回退到硬编码默认值。"""
    combo = (level, mode.value)
    config_key = _LIMIT_CONFIG_KEYS.get(combo)
    fallback = ANALYSIS_DAILY_LIMITS.get(combo, 0)

    if config_key is None:
        return fallback

    try:
        from app.services.config_service import get_config_value

        raw = await get_config_value(config_key, str(fallback))
        return int(raw)
    except Exception:
        logger.warning(
            "读取动态配置失败，使用默认值: key=%s, default=%d",
            config_key, fallback,
        )
        return fallback


class AnalysisQuotaService:
    """分析配额服务 — 按模式独立计数，基于 Redis 计数器模式实现。"""

    def __init__(self, redis: Redis | None = None) -> None:
        self._redis = redis

    @property
    def redis(self) -> Redis:
        """延迟获取 Redis 客户端，支持注入和自动获取。"""
        if self._redis is None:
            self._redis = get_redis_pool()
        return self._redis

    @staticmethod
    def _quota_key(user_id: UUID, mode: AnalysisMode) -> str:
        """生成当日限流计数器的 Redis key。

        格式: analysis_quota:{user_id}:{mode}:{date}
        """
        today = datetime.now(timezone.utc).date().isoformat()
        return f"analysis_quota:{user_id}:{mode.value}:{today}"

    @staticmethod
    def _seconds_until_utc_midnight() -> int:
        """计算从当前时刻到次日 UTC 00:00 的秒数。"""
        now = datetime.now(timezone.utc)
        tomorrow = datetime(
            now.year, now.month, now.day, tzinfo=timezone.utc,
        )
        tomorrow = tomorrow.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow += timedelta(days=1)
        diff = int((tomorrow - now).total_seconds())
        # 至少保留 1 秒 TTL，避免边界情况
        return max(diff, 1)

    @staticmethod
    def _bonus_key(user_id: UUID, mode: AnalysisMode) -> str:
        """奖励次数 Redis key: bonus_credits:{user_id}:{mode}"""
        return f"bonus_credits:{user_id}:{mode.value}"

    async def _try_use_bonus(self, user_id: UUID, mode: AnalysisMode) -> bool:
        """尝试扣减奖励次数。成功返回 True。"""
        key = self._bonus_key(user_id, mode)
        try:
            current = await self.redis.decr(key)
            if current < 0:
                # 没有余额，回滚
                await self.redis.incr(key)
                return False
            logger.debug(
                "bonus_credit 扣减: 用户 %s 模式=%s, 剩余=%d",
                user_id, mode.value, current,
            )
            return True
        except Exception:
            logger.exception("bonus_credit 扣减失败 user_id=%s mode=%s", user_id, mode.value)
            return False

    async def get_bonus_remaining(self, user_id: UUID, mode: AnalysisMode) -> int:
        """查询某模式的奖励次数余额。"""
        key = self._bonus_key(user_id, mode)
        try:
            raw = await self.redis.get(key)
            return max(int(raw), 0) if raw is not None else 0
        except Exception:
            return 0

    async def add_bonus_credits(
        self, user_id: UUID, mode: AnalysisMode, amount: int,
    ) -> int:
        """为用户添加奖励分析次数。返回添加后的余额。"""
        key = self._bonus_key(user_id, mode)
        try:
            new_total = await self.redis.incrby(key, amount)
            logger.info(
                "bonus_credits 添加: 用户 %s 模式=%s, 添加=%d, 余额=%d",
                user_id, mode.value, amount, new_total,
            )
            return new_total
        except Exception:
            logger.exception("bonus_credits 添加失败 user_id=%s mode=%s", user_id, mode.value)
            raise

    async def check_and_increment(
        self, user_id: UUID, level: int, mode: AnalysisMode,
    ) -> tuple[bool, int]:
        """检查并递增计数。返回 (是否允许, 剩余次数)。

        配额检查优先级:
        1. 先检查 bonus_credits → 有余额则扣减 bonus，放行
        2. bonus 用完 → 扣减日常配额 daily_limit
        3. 日常配额也用完 → 拒绝
        特殊: 免费用户锁定模式日常配额=0，但若有 bonus 仍可使用
        """
        limit = await _get_analysis_daily_limit(level, mode)

        # 优先尝试使用奖励次数（即使日常配额为 0 / 锁定模式）
        if await self._try_use_bonus(user_id, mode):
            bonus_remaining = await self.get_bonus_remaining(user_id, mode)
            daily_remaining = 0
            if limit > 0:
                daily_remaining = await self.get_remaining(user_id, level, mode)
            return True, bonus_remaining + daily_remaining

        # 锁定模式且无奖励次数：拒绝
        if limit == 0:
            return False, 0

        key = self._quota_key(user_id, mode)

        try:
            current: int = await self.redis.incr(key)

            if current == 1:
                # 首次使用，设置 TTL 到次日 UTC 00:00
                ttl = self._seconds_until_utc_midnight()
                await self.redis.expire(key, ttl)

            if current > limit:
                # 超限，回滚计数
                await self.redis.decr(key)
                logger.warning(
                    "分析限流: 用户 %s (等级=%d, 模式=%s) 已达上限 %d",
                    user_id, level, mode.value, limit,
                )
                return False, 0

            remaining = limit - current
            logger.debug(
                "分析限流: 用户 %s 模式=%s 已用 %d/%d, 剩余 %d",
                user_id, mode.value, current, limit, remaining,
            )
            return True, remaining

        except Exception:
            logger.exception(
                "分析限流检查失败 user_id=%s mode=%s", user_id, mode.value,
            )
            raise

    async def get_remaining(
        self, user_id: UUID, level: int, mode: AnalysisMode,
    ) -> int:
        """查询当日某模式剩余次数。"""
        limit = await _get_analysis_daily_limit(level, mode)

        if limit == 0:
            return 0

        key = self._quota_key(user_id, mode)

        try:
            raw = await self.redis.get(key)
            current = int(raw) if raw is not None else 0
            return max(limit - current, 0)
        except Exception:
            logger.exception(
                "查询剩余次数失败 user_id=%s mode=%s", user_id, mode.value,
            )
            raise

    async def get_all_quotas(
        self, user_id: UUID, level: int,
    ) -> dict[str, QuotaInfo]:
        """查询所有模式的配额信息，包含锁定状态。奖励次数（如免费体验）计入 remaining。"""
        result: dict[str, QuotaInfo] = {}

        for mode in AnalysisMode:
            limit = await _get_analysis_daily_limit(level, mode)
            locked = level < MODE_LEVEL_REQUIREMENTS[mode]
            remaining = 0

            if not locked and limit > 0:
                remaining = await self.get_remaining(user_id, level, mode)

            # 奖励次数（如日内免费体验）计入剩余，便于前端显示并允许发起分析
            bonus = await self.get_bonus_remaining(user_id, mode)
            if bonus > 0:
                remaining += bonus

            result[mode.value] = QuotaInfo(
                mode=mode,
                remaining=remaining,
                limit=limit,
                locked=locked,
            )

        return result
