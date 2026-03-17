"""智能体管理服务 — 动态启用/关闭智能体

功能：
1. 获取所有可用智能体列表
2. 启用/关闭指定智能体
3. 获取当前启用的智能体
4. 智能体配置持久化到数据库

数据库表：agent_configs
- agent_id: 智能体 ID
- agent_name: 智能体名称
- enabled: 是否启用
- description: 描述
- category: 分类（technical/onchain/market/risk）
- priority: 优先级
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_json, set_with_ttl
from app.core.sql_compat import now_func, timestamptz_default

logger = logging.getLogger(__name__)

# ── 智能体元数据 ──────────────────────────────────────────────

AGENT_METADATA = {
    "technical": {
        "name": "技术分析智能体",
        "description": "分析技术指标、趋势、支撑阻力位",
        "category": "technical",
        "priority": 10,
        "default_enabled": True,
    },
    "onchain": {
        "name": "链上数据智能体",
        "description": "分析链上数据、巨鲸动向、交易所流动",
        "category": "onchain",
        "priority": 9,
        "default_enabled": True,
    },

    "risk": {
        "name": "风险预警智能体",
        "description": "监控风险指标，触发预警",
        "category": "risk",
        "priority": 7,
        "default_enabled": True,
    },
    "orderbook": {
        "name": "订单簿分析智能体",
        "description": "分析订单簿微观结构，识别操纵行为",
        "category": "market",
        "priority": 6,
        "default_enabled": True,
    },
    "sentiment": {
        "name": "舆情分析智能体",
        "description": "监控社交媒体情绪，识别 FUD/FOMO",
        "category": "market",
        "priority": 5,
        "default_enabled": False,  # 需要配置 API Key
    },
    "news_analyst": {
        "name": "新闻分析智能体",
        "description": "分析新闻事件，评估市场影响",
        "category": "market",
        "priority": 4,
        "default_enabled": True,
    },
    "calendar": {
        "name": "日历事件智能体",
        "description": "分析即将到来的事件，评估价格影响",
        "category": "market",
        "priority": 3,
        "default_enabled": True,
    },
    "adversarial": {
        "name": "对抗推演智能体",
        "description": "从对手角度推演，发现盲点",
        "category": "risk",
        "priority": 2,
        "default_enabled": False,  # 仅 Trend 模式
    },
    "collusion_detector": {
        "name": "合谋检测智能体",
        "description": "检测多方合谋操纵行为",
        "category": "risk",
        "priority": 1,
        "default_enabled": False,  # 仅 Trend 模式
    },
}

# 智能体分类
AGENT_CATEGORIES = {
    "technical": "技术分析",
    "onchain": "链上数据",
    "market": "市场分析",
    "risk": "风险管理",
}


class AgentManagementService:
    """智能体管理服务"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def ensure_agent_configs_table(self) -> None:
        """确保 agent_configs 表存在"""
        try:
            await self.session.execute(
                text(f"""
                    CREATE TABLE IF NOT EXISTS agent_configs (
                        agent_id VARCHAR(50) PRIMARY KEY,
                        agent_name VARCHAR(100) NOT NULL,
                        description TEXT,
                        category VARCHAR(50),
                        priority INTEGER DEFAULT 0,
                        enabled BOOLEAN DEFAULT TRUE,
                        created_at {timestamptz_default()},
                        updated_at {timestamptz_default()}
                    )
                """)
            )
            await self.session.execute(
                text("""
                    CREATE INDEX IF NOT EXISTS idx_agent_configs_enabled
                    ON agent_configs(enabled)
                """)
            )
            await self.session.execute(
                text("""
                    CREATE INDEX IF NOT EXISTS idx_agent_configs_category
                    ON agent_configs(category)
                """)
            )
            await self.session.commit()
        except Exception as exc:
            logger.error("Failed to create agent_configs table", extra={"error": str(exc)})
            await self.session.rollback()

    async def initialize_default_agents(self) -> None:
        """初始化默认智能体配置"""
        await self.ensure_agent_configs_table()

        for agent_id, metadata in AGENT_METADATA.items():
            try:
                await self.session.execute(
                    text("""
                        INSERT INTO agent_configs (
                            agent_id, agent_name, description, category,
                            priority, enabled
                        )
                        VALUES (
                            :agent_id, :agent_name, :description, :category,
                            :priority, :enabled
                        )
                        ON CONFLICT (agent_id) DO NOTHING
                    """),
                    {
                        "agent_id": agent_id,
                        "agent_name": metadata["name"],
                        "description": metadata["description"],
                        "category": metadata["category"],
                        "priority": metadata["priority"],
                        "enabled": metadata["default_enabled"],
                    },
                )
            except Exception as exc:
                logger.error(
                    "Failed to initialize agent config",
                    extra={"agent_id": agent_id, "error": str(exc)},
                )

        await self.session.commit()
        logger.info("Default agent configs initialized")

    async def get_all_agents(self) -> list[dict]:
        """获取所有智能体配置"""
        result = await self.session.execute(
            text("""
                SELECT agent_id, agent_name, description, category,
                       priority, enabled, created_at, updated_at
                FROM agent_configs
                ORDER BY priority DESC, agent_id
            """)
        )

        agents = []
        for row in result.fetchall():
            agents.append({
                "agent_id": row[0],
                "agent_name": row[1],
                "description": row[2],
                "category": row[3],
                "category_name": AGENT_CATEGORIES.get(row[3], "其他"),
                "priority": row[4],
                "enabled": row[5],
                "created_at": row[6].isoformat() if row[6] else None,
                "updated_at": row[7].isoformat() if row[7] else None,
            })

        return agents

    async def get_enabled_agents(self) -> list[str]:
        """获取当前启用的智能体 ID 列表"""
        # 优先从 Redis 缓存读取
        try:
            from app.core.redis import get_json

            cached = await get_json("agent_configs:enabled")
            if cached and isinstance(cached, list):
                return cached
        except Exception:
            pass

        # 从数据库读取
        result = await self.session.execute(
            text("""
                SELECT agent_id
                FROM agent_configs
                WHERE enabled = TRUE
                ORDER BY priority DESC
            """)
        )

        enabled_agents = [row[0] for row in result.fetchall()]

        # 写入缓存（TTL 5 分钟）
        try:
            await set_with_ttl("agent_configs:enabled", enabled_agents, ttl_seconds=300)
        except Exception:
            pass

        return enabled_agents

    async def get_agents_by_category(self, category: str) -> list[dict]:
        """按分类获取智能体"""
        result = await self.session.execute(
            text("""
                SELECT agent_id, agent_name, description, priority, enabled
                FROM agent_configs
                WHERE category = :category
                ORDER BY priority DESC
            """),
            {"category": category},
        )

        agents = []
        for row in result.fetchall():
            agents.append({
                "agent_id": row[0],
                "agent_name": row[1],
                "description": row[2],
                "priority": row[3],
                "enabled": row[4],
            })

        return agents

    async def update_agent_status(
        self, agent_id: str, enabled: bool, updated_by: str = "admin"
    ) -> bool:
        """更新智能体启用状态"""
        try:
            result = await self.session.execute(
                text(f"""
                    UPDATE agent_configs
                    SET enabled = :enabled,
                        updated_at = {now_func()}
                    WHERE agent_id = :agent_id
                """),
                {"agent_id": agent_id, "enabled": enabled},
            )

            if result.rowcount == 0:
                logger.warning("Agent not found", extra={"agent_id": agent_id})
                return False

            await self.session.commit()

            # 清除缓存
            try:
                from app.core.redis import get_redis_pool

                redis = get_redis_pool()
                await redis.delete("agent_configs:enabled")
            except Exception:
                pass

            logger.info(
                "Agent status updated",
                extra={
                    "agent_id": agent_id,
                    "enabled": enabled,
                    "updated_by": updated_by,
                },
            )

            return True

        except Exception as exc:
            logger.error(
                "Failed to update agent status",
                extra={"agent_id": agent_id, "error": str(exc)},
            )
            await self.session.rollback()
            return False

    async def batch_update_agents(
        self, updates: list[dict], updated_by: str = "admin"
    ) -> dict:
        """批量更新智能体状态

        Args:
            updates: [{"agent_id": "technical", "enabled": True}, ...]
            updated_by: 操作人

        Returns:
            {"success": 3, "failed": 0, "errors": []}
        """
        success_count = 0
        failed_count = 0
        errors = []

        for update in updates:
            agent_id = update.get("agent_id")
            enabled = update.get("enabled")

            if not agent_id or enabled is None:
                errors.append(f"Invalid update: {update}")
                failed_count += 1
                continue

            result = await self.update_agent_status(agent_id, enabled, updated_by)
            if result:
                success_count += 1
            else:
                failed_count += 1
                errors.append(f"Failed to update {agent_id}")

        return {
            "success": success_count,
            "failed": failed_count,
            "errors": errors,
        }

    async def get_agent_stats(self) -> dict:
        """获取智能体统计信息"""
        result = await self.session.execute(
            text("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN enabled THEN 1 ELSE 0 END) as enabled_count,
                    COUNT(DISTINCT category) as category_count
                FROM agent_configs
            """)
        )

        row = result.fetchone()

        return {
            "total_agents": row[0] if row else 0,
            "enabled_agents": row[1] if row else 0,
            "disabled_agents": (row[0] - row[1]) if row else 0,
            "categories": len(AGENT_CATEGORIES),
        }
