"""智能体基础框架 — 所有 Agent 继承 BaseAgent。

AgentReport 为统一输出格式，BaseAgent 定义 analyze 抽象方法。
"""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.models.market_data import MarketData


class AgentReport(BaseModel):
    """智能体分析报告 — 统一输出格式。"""

    agent_id: str
    symbol: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    key_findings: list[str] = Field(default_factory=list)
    raw_data: dict = Field(default_factory=dict)


class BaseAgent(ABC):
    """智能体抽象基类 — 子类必须实现 analyze 方法。"""

    @staticmethod
    async def _enrich_prompt(system_prompt: str, symbol: str) -> str:
        """将反思洞察注入系统提示词（如有缓存）。

        ReflectionAgent 的复盘结论会被追加到系统提示末尾，
        帮助智能体避免重复历史错误。无缓存时返回原 prompt。
        """
        try:
            from app.agents.reflection import get_reflection_context
            ctx = await get_reflection_context(symbol)
            return system_prompt + ctx if ctx else system_prompt
        except Exception:
            return system_prompt

    @abstractmethod
    async def analyze(self, data: MarketData) -> AgentReport:
        """分析市场数据，返回 AgentReport。"""
        ...
