"""修改 AnalysisOrchestrator 以支持动态智能体启用/禁用

在分析执行前，从数据库读取启用的智能体列表，只调用启用的智能体。
"""

import logging
from typing import Type

from app.agents.base import BaseAgent
from app.agents.technical import TechnicalAgent
from app.agents.onchain import OnchainAgent
from app.agents.risk import RiskAgent
from app.agents.orderbook import OrderBookAgent
from app.agents.sentiment import SentimentAgent
from app.agents.news_analyst import NewsAnalystAgent
from app.agents.calendar import CalendarAgent
from app.agents.adversarial import AdversarialAgent
from app.agents.collusion_detector import CollusionDetector

logger = logging.getLogger(__name__)

# 智能体类映射
AGENT_CLASS_MAP: dict[str, Type[BaseAgent]] = {
    "technical": TechnicalAgent,
    "onchain": OnchainAgent,
    "risk": RiskAgent,
    "orderbook": OrderBookAgent,
    "sentiment": SentimentAgent,
    "news_analyst": NewsAnalystAgent,
    "calendar": CalendarAgent,
    "adversarial": AdversarialAgent,
    "collusion_detector": CollusionDetector,
}


async def get_enabled_agent_instances(mode: str) -> list[BaseAgent]:
    """根据模式和数据库配置，返回启用的智能体实例列表

    Args:
        mode: 分析模式（scalping/intraday/trend）

    Returns:
        启用的智能体实例列表
    """
    from app.core.database import AsyncSessionLocal
    from app.services.agent_management import AgentManagementService

    # 1. 从数据库获取启用的智能体
    async with AsyncSessionLocal() as session:
        service = AgentManagementService(session)
        enabled_agent_ids = await service.get_enabled_agents()

    if not enabled_agent_ids:
        logger.warning("No agents enabled, using default set")
        # 降级：使用默认智能体
        enabled_agent_ids = ["technical", "onchain", "risk", "orderbook"]

    # 2. 根据模式过滤智能体（从 mode_contract 派生，不再硬编码）
    from app.core.mode_contract import derive_mode_agents, MODE_CONTRACTS
    if mode in MODE_CONTRACTS:
        allowed_agents = derive_mode_agents(mode)
    else:
        logger.warning(f"Unknown mode: {mode}, using all enabled agents")
        allowed_agents = list(AGENT_CLASS_MAP.keys())

    # 3. 取交集：启用的 AND 模式允许的
    final_agent_ids = [
        agent_id
        for agent_id in enabled_agent_ids
        if agent_id in allowed_agents and agent_id in AGENT_CLASS_MAP
    ]

    # 4. 实例化智能体
    agent_instances = []
    for agent_id in final_agent_ids:
        try:
            agent_class = AGENT_CLASS_MAP[agent_id]
            agent_instances.append(agent_class())
        except Exception as exc:
            logger.error(
                "Failed to instantiate agent",
                extra={"agent_id": agent_id, "error": str(exc)},
            )

    logger.info(
        "Enabled agents loaded",
        extra={
            "mode": mode,
            "enabled_count": len(agent_instances),
            "agent_ids": final_agent_ids,
        },
    )

    return agent_instances


# 在 AnalysisOrchestrator 中使用示例：
# 
# async def _run_intraday(self, data: MarketData) -> AnalysisReport:
#     # 获取启用的智能体
#     agents = await get_enabled_agent_instances("intraday")
#     
#     # 并行调用智能体
#     reports = await asyncio.gather(*[
#         self._safe_call_agent(agent, data)
#         for agent in agents
#     ])
#     
#     # ... 后续处理
