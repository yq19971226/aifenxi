"""模式合同 — 三种分析模式的单一真相源。

所有模式相关常量、agent 列表、周期合同、引擎类型、预算限制
必须从本模块派生，不允许在 orchestrator / agent_loader / 前端各自硬编码。

V1: 静态 dict，不引入重型 registry service 或数据库驱动配置平台。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# ── 合同版本 ─────────────────────────────────────────────────

MODE_CONTRACT_VERSION = "1.0.0"

# ── 类型定义 ─────────────────────────────────────────────────

EngineType = Literal["rule_engine", "multi_agent_hybrid", "multi_agent_consensus"]
AnalysisStatus = Literal["actionable", "degraded", "blocked"]


@dataclass(frozen=True)
class ModeContract:
    """单个分析模式的冻结合同。"""

    mode_id: str
    engine_type: EngineType

    # 周期合同（trigger / context / bias）
    trigger_interval: str
    context_interval: str
    bias_interval: str

    # agent 列表
    core_agents: tuple[str, ...]
    optional_agents: tuple[str, ...] = ()

    # 共识与防御层
    consensus_layer: str | None = None
    defense_layer: tuple[str, ...] = ()

    # 预算
    timeout_seconds: int = 180
    cache_ttl_seconds: int = 900

    # 等级要求（0=免费，1=专业，2=旗舰）
    min_level: int = 0

    # K线周期列表（按 trigger / context / bias 顺序）
    @property
    def kline_intervals(self) -> list[str]:
        return [self.trigger_interval, self.context_interval, self.bias_interval]


# ── 三模式合同冻结 ───────────────────────────────────────────

SCALPING_CONTRACT = ModeContract(
    mode_id="scalping",
    engine_type="rule_engine",
    trigger_interval="5m",
    context_interval="15m",
    bias_interval="1h",
    core_agents=("technical",),
    optional_agents=(),
    consensus_layer=None,
    defense_layer=(),
    timeout_seconds=90,
    cache_ttl_seconds=480,      # 8 分钟（等 ≈2 根 5m K 线收盘）
    min_level=0,
)

INTRADAY_CONTRACT = ModeContract(
    mode_id="intraday",
    engine_type="multi_agent_hybrid",
    trigger_interval="15m",
    context_interval="1h",
    bias_interval="4h",
    core_agents=("technical", "onchain", "risk", "orderbook"),
    optional_agents=("news_analyst", "calendar"),
    consensus_layer=None,
    defense_layer=(),
    timeout_seconds=180,
    cache_ttl_seconds=2700,     # 45 分钟（等 ≈3 根 15m K 线收盘）
    min_level=1,
)

TREND_CONTRACT = ModeContract(
    mode_id="trend",
    engine_type="multi_agent_consensus",
    trigger_interval="4h",
    context_interval="1d",
    bias_interval="1w",
    core_agents=(
        "technical", "onchain", "risk", "orderbook",
        "sentiment", "news_analyst", "calendar",
    ),
    optional_agents=(),
    consensus_layer="nsed",
    defense_layer=("adversarial", "collusion_detector"),
    timeout_seconds=300,
    cache_ttl_seconds=14400,    # 4 小时（等 ≈1 根 4h K 线收盘）
    min_level=2,
)

# ── 注册表（唯一查询入口）─────────────────────────────────────

MODE_CONTRACTS: dict[str, ModeContract] = {
    "scalping": SCALPING_CONTRACT,
    "intraday": INTRADAY_CONTRACT,
    "trend": TREND_CONTRACT,
}


def get_contract(mode_id: str) -> ModeContract:
    """获取指定模式的合同，不存在时抛出 ValueError。"""
    contract = MODE_CONTRACTS.get(mode_id)
    if contract is None:
        raise ValueError(f"Unknown mode: {mode_id}. Valid modes: {list(MODE_CONTRACTS.keys())}")
    return contract


# ── 执行计划与运行上下文 ─────────────────────────────────────────


@dataclass
class GateResult:
    """闸门评估结果 — pre-execution 或 post-agent gate 的显式返回值。"""

    passed: bool
    status: str = "actionable"          # actionable / degraded / blocked
    reason: str | None = None           # blocked_reason code
    confidence_modifier: float = 1.0    # 闸门对置信度的乘数
    detail: dict = field(default_factory=dict)


@dataclass
class ExecutionPlan:
    """执行计划 — 从 contract + capability_snapshot 派生的本次运行计划。

    这是 mode_contract → capability_snapshot → execution_plan 链的输出。
    """

    contract: ModeContract
    resolved_agents: list[str]          # 本次实际执行的 agent_id 列表
    available_intervals: list[str]      # 本次实际可用的 K 线周期
    missing_intervals: list[str]        # 合同要求但缺失的周期
    engine_type: str                    # 从 contract 复制，方便消费方
    timeout_seconds: int                # 从 contract 复制
    pre_gate_results: list[GateResult] = field(default_factory=list)

    @property
    def has_blocking_gate(self) -> bool:
        return any(g.status == "blocked" for g in self.pre_gate_results)

    @property
    def worst_gate_status(self) -> str:
        severity = {"actionable": 0, "degraded": 1, "blocked": 2}
        worst = "actionable"
        for g in self.pre_gate_results:
            if severity.get(g.status, 0) > severity.get(worst, 0):
                worst = g.status
        return worst

    @property
    def worst_gate_reason(self) -> str | None:
        severity = {"actionable": 0, "degraded": 1, "blocked": 2}
        worst_reason = None
        worst_sev = 0
        for g in self.pre_gate_results:
            s = severity.get(g.status, 0)
            if s > worst_sev:
                worst_sev = s
                worst_reason = g.reason
        return worst_reason

    @property
    def combined_confidence_modifier(self) -> float:
        mod = 1.0
        for g in self.pre_gate_results:
            mod *= g.confidence_modifier
        return mod


@dataclass
class RunContext:
    """运行本地上下文 — 与 latest_cache_context 严格分离。

    run_local_context (本对象):
      本次运行采集的 market_data + 生成的 execution_plan + dq_snapshot。
      _run_scalping / _run_intraday / _run_trend 统一接收此对象。

    latest_cache_context (不在此对象):
      analysis:latest:{symbol} 缓存，供 playbook 等下游读取。
      仅在 run_analysis() 成功完成后由调用方写入，
      _dispatch_mode 和 _run_* 不触碰 latest_cache_context。
    """

    execution_plan: ExecutionPlan
    market_data: object      # MarketData 实例（用 object 避免循环导入）
    dq_snapshot: object      # DataQualitySnapshot 实例


# ── 缓存键语义常量 ──────────────────────────────────────────────

CACHE_KEY_RUN = "analysis:cache:{symbol}:{mode}:{fingerprint}"
CACHE_KEY_LATEST = "analysis:latest:{symbol}"


# ── 派生常量（供 analysis.py 等模块向后兼容使用）────────────────

def derive_kline_intervals() -> dict[str, list[str]]:
    """从合同派生 MODE_KLINE_INTERVALS。"""
    return {m: c.kline_intervals for m, c in MODE_CONTRACTS.items()}


def derive_supported_kline_intervals() -> list[str]:
    """从全部模式合同派生去重后的 K 线周期全集。"""
    ordered: list[str] = []
    seen: set[str] = set()
    for contract in MODE_CONTRACTS.values():
        for interval in contract.kline_intervals:
            if interval not in seen:
                seen.add(interval)
                ordered.append(interval)
    return ordered


ALL_MODE_KLINE_INTERVALS = derive_supported_kline_intervals()


def derive_cache_ttl() -> dict[str, int]:
    """从合同派生 MODE_CACHE_TTL。"""
    return {m: c.cache_ttl_seconds for m, c in MODE_CONTRACTS.items()}


def derive_total_timeout() -> dict[str, int]:
    """从合同派生 MODE_TOTAL_TIMEOUT。"""
    return {m: c.timeout_seconds for m, c in MODE_CONTRACTS.items()}


def derive_level_requirements() -> dict[str, int]:
    """从合同派生 MODE_LEVEL_REQUIREMENTS。"""
    return {m: c.min_level for m, c in MODE_CONTRACTS.items()}


def derive_mode_agents(mode_id: str) -> list[str]:
    """从合同派生指定模式的全部 agent id 列表（core + optional + defense）。"""
    c = get_contract(mode_id)
    return list(c.core_agents) + list(c.optional_agents) + list(c.defense_layer)
