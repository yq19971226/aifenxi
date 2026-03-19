"""一键综合分析面板 — 数据模型定义。

包含分析模式枚举、常量映射、请求/响应模型、SMC 指标结果模型、
报告模型和 SSE 事件模型。
"""

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.core.mode_contract import (
    MODE_CONTRACT_VERSION,
    derive_cache_ttl,
    derive_kline_intervals,
    derive_level_requirements,
    derive_total_timeout,
)


# ---------------------------------------------------------------------------
# 枚举
# ---------------------------------------------------------------------------

class AnalysisMode(str, Enum):
    """分析模式枚举。"""

    SCALPING = "scalping"    # 实时短线
    INTRADAY = "intraday"    # 日内博弈
    TREND = "trend"          # 趋势布局


# ---------------------------------------------------------------------------
# 常量映射（从 mode_contract 单一真相源派生，不再各自硬编码）
# ---------------------------------------------------------------------------

def _enum_keyed(raw: dict[str, int | list]) -> dict:  # type: ignore[type-arg]
    """将 mode_id str key 转为 AnalysisMode enum key，保持现有消费方兼容。"""
    return {AnalysisMode(k): v for k, v in raw.items()}

MODE_LEVEL_REQUIREMENTS: dict[AnalysisMode, int] = _enum_keyed(derive_level_requirements())
MODE_CACHE_TTL: dict[AnalysisMode, int] = _enum_keyed(derive_cache_ttl())
MODE_TOTAL_TIMEOUT: dict[AnalysisMode, int] = _enum_keyed(derive_total_timeout())
MODE_KLINE_INTERVALS: dict[AnalysisMode, list[str]] = _enum_keyed(derive_kline_intervals())


# ---------------------------------------------------------------------------
# 请求 / 响应模型
# ---------------------------------------------------------------------------

class AnalysisRequest(BaseModel):
    """分析请求。"""

    symbol: str
    mode: AnalysisMode
    force_refresh: bool = False
    locale: str = "zh-CN"


class QuotaInfo(BaseModel):
    """单个模式的配额信息。"""

    mode: AnalysisMode
    remaining: int
    limit: int
    locked: bool


class AnalysisQuotaResponse(BaseModel):
    """配额查询响应。"""

    quotas: dict[str, QuotaInfo]
    level: int
    maintenance: bool = False


# ---------------------------------------------------------------------------
# SMC 结果模型
# ---------------------------------------------------------------------------

class CandlestickPattern(BaseModel):
    """K线形态识别结果。"""

    pattern_name: str
    display_name: str
    direction: Literal["bullish", "bearish"]
    strength: float = Field(ge=0.0, le=1.0)
    candle_index: int


class FVGResult(BaseModel):
    """FVG 检测结果。"""

    direction: Literal["bullish", "bearish"]
    gap_high: float
    gap_low: float
    gap_size: float
    candle_index: int
    interval: str
    mitigated: bool = False
    mitigation_type: Optional[Literal["partial", "full"]] = None
    mitigation_time: Optional[datetime] = None
    distance_pct: float
    filter_mode: int = 1
    atr_fallback: bool = False


class OrderBlockResult(BaseModel):
    """订单块检测结果。"""

    ob_type: Literal["demand", "supply"]
    trigger: Literal["main_choch", "sub_choch", "bos"]
    ob_high: float
    ob_low: float
    candle_index: int
    interval: str
    distance_pct: float
    phase_context: Optional[str] = None
    phase_confidence: float = 0.0
    whale_confirmed: bool = False


# ---------------------------------------------------------------------------
# 报告模型
# ---------------------------------------------------------------------------

class ReportSection(BaseModel):
    """报告分段。"""

    title: str
    status: Literal["completed", "failed", "timeout", "missing"] = "completed"
    data: dict
    summary: Optional[str] = None
    note: Optional[str] = None


class DataQualitySnapshot(BaseModel):
    """数据质量快照 V1 — 最小字段集。"""

    interval_completeness: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="周期完整度：实际可用周期数 / 合同要求周期数",
    )
    freshness: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="数据新鲜度：最近数据时间距当前的衰减因子",
    )
    capability_state: dict[str, str] = Field(
        default_factory=dict,
        description="能力可用度：agent_id → AVAILABLE/DEGRADED/UNAVAILABLE",
    )
    missing_inputs: list[str] = Field(
        default_factory=list,
        description="缺失的关键输入列表",
    )
    required_domains: list[str] = Field(
        default_factory=list,
        description="当前模式要求的主数据域列表",
    )
    domain_status: dict[str, str] = Field(
        default_factory=dict,
        description="四主域状态：market/derivatives/onchain/macro → AVAILABLE/DEGRADED/UNAVAILABLE",
    )
    missing_domains: list[str] = Field(
        default_factory=list,
        description="缺失的主数据域列表",
    )
    domain_completeness: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="主数据域完整度：基于 required_domains 的域级评分",
    )


# blocked_reason V1 约定值（文档约定，非模型级强校验）
BLOCKED_REASONS = (
    "data_incomplete",
    "capability_missing",
    "consensus_divergence_high",
    "weekly_bias_conflict",
    "defense_risk_high",
    "risk_guardrail_triggered",
    "timeout",
)


class AnalysisReport(BaseModel):
    """完整分析报告。"""

    symbol: str
    mode: AnalysisMode
    timestamp: datetime
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float = Field(ge=0.0, le=1.0)
    sections: list[ReportSection]
    strategy: Optional[dict] = None
    is_partial: bool = False
    cached: bool = False
    cached_at: Optional[datetime] = None
    execution_time_ms: int = 0
    # ── 统一输出协议新增字段（P2）────────────────────────────
    status: Literal["actionable", "degraded", "blocked"] = Field(
        default="actionable",
        description="可执行性状态：actionable / degraded / blocked",
    )
    blocked_reason: Optional[str] = Field(
        default=None,
        description="blocked 或 degraded 时的原因码",
    )
    data_quality_snapshot: Optional[DataQualitySnapshot] = Field(
        default=None,
        description="数据质量快照 V1",
    )
    engine_type: Optional[str] = Field(
        default=None,
        description="引擎类型：rule_engine / multi_agent_hybrid / multi_agent_consensus",
    )
    mode_contract_version: Optional[str] = Field(
        default=None,
        description="模式合同版本号",
    )
    # ── 向后兼容旧字段 ────────────────────────────────────────
    data_completeness: float = Field(default=1.0, ge=0.0, le=1.0, description="信号完整度（0~1），来自 Exchange_Direct_Combo")
    missing_sources: list[str] = Field(default_factory=list, description="当前离线的交易所列表")
    completeness_warning: Optional[str] = Field(default=None, description="数据不足时的警告文本")
    market_regime: Optional[str] = Field(default=None, description="市场状态: ranging/trending/volatile")
    regime_suggestion: Optional[str] = Field(default=None, description="市场状态建议文案")
    regime_support: Optional[float] = Field(default=None, description="震荡区间支撑位")
    regime_resistance: Optional[float] = Field(default=None, description="震荡区间阻力位")
    # ── 跨周期共振 + 巨鲸陷阱过滤字段（Phase 1/2/3）─────────
    confluence_tags: list[str] = Field(
        default_factory=list,
        description="共振 + 风险标签列表，如 trend:resonant / whale:funding_rate_extreme",
    )
    confluence_original_confidence: Optional[float] = Field(
        default=None,
        description="共振调整前的原始 NSED 置信度（调整后此字段保留原始值，confidence 为调整后值）",
    )
    confluence_trend_tag: Optional[str] = Field(
        default=None,
        description="趋势共振标签: resonant/counter/neutral/stale/disabled",
    )
    confluence_whale_risks: list[str] = Field(
        default_factory=list,
        description="巨鲸陷阱风险标签列表",
    )
    # ── 低置信度信号不足标识 ──────────────────────────────────
    signal_insufficient: bool = Field(
        default=False,
        description="True 表示有方向倾向但置信度未达阈值，方向被降级为 neutral",
    )
    confidence_threshold: Optional[float] = Field(
        default=None,
        description="当前生效的置信度阈值（后台动态配置 consensus_min_confidence）",
    )


# ---------------------------------------------------------------------------
# SSE 事件模型
# ---------------------------------------------------------------------------

class SSEEvent(BaseModel):
    """SSE 事件基类。"""

    type: Literal["progress", "partial", "complete", "cached", "error"]


class ProgressEvent(SSEEvent):
    """进度事件。"""

    type: Literal["progress"] = "progress"
    step: str
    status: Literal["running", "completed", "failed", "timeout"]
    message: str


class PartialEvent(SSEEvent):
    """部分结果事件 — 某个分段完成时推送。"""

    type: Literal["partial"] = "partial"
    section: ReportSection


class CompleteEvent(SSEEvent):
    """完成事件 — 包含完整报告。"""

    type: Literal["complete"] = "complete"
    report: AnalysisReport


class CachedEvent(SSEEvent):
    """缓存命中事件。"""

    type: Literal["cached"] = "cached"
    report: AnalysisReport


class ErrorEvent(SSEEvent):
    """错误事件。"""

    type: Literal["error"] = "error"
    code: str
    message: str
    reset_time: Optional[str] = None
