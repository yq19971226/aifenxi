"""分析编排器 — 根据模式协调智能体和 SMC 检测器执行。

- run_analysis(): SSE 事件 async generator，主入口
- _run_scalping / _run_intraday / _run_trend: 三种模式流程
- _safe_call_agent(): 60s 超时安全调用
- 缓存检查/写入、配额检查/扣减、SSE 事件推送
"""

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.agents.ai_detector import AIDetector, AIDetectorResult
from app.agents.base import AgentReport, BaseAgent
from app.services.anti_ai_adjuster import AntiAIAdjuster
from app.agents.phase_tracker import AccelerationWarning, detect_acceleration, detect_transition, get_current_phase
from app.agents.technical import TechnicalAgent
from app.agents.onchain import OnchainAgent
from app.agents.risk import RiskAgent
from app.agents.orderbook import OrderBookAgent
from app.agents.sentiment import SentimentAgent
from app.agents.news_analyst import NewsAnalystAgent
from app.agents.adversarial import AdversarialAgent
from app.agents.collusion_detector import CollusionDetector
from app.agents.calendar import CalendarAgent
from app.consensus.engine import ConsensusReport, run_nsed
from app.services.market_regime import detect_market_regime
from app.services.push_dispatcher import dispatch_fire_and_forget
from app.core.circuit_breaker import CircuitBreaker
from app.core.redis import get_json, get_redis_pool, publish_stream, set_with_ttl
from app.data.smc_indicators import (
    CandlestickPatternDetector,
    FVGDetector,
    OrderBlockDetector,
)
from app.models.analysis import (
    AnalysisMode,
    AnalysisReport,
    CachedEvent,
    CompleteEvent,
    ErrorEvent,
    MODE_CACHE_TTL,
    MODE_KLINE_INTERVALS,
    MODE_LEVEL_REQUIREMENTS,
    MODE_TOTAL_TIMEOUT,
    PartialEvent,
    ProgressEvent,
    ReportSection,
)
from app.models.market_data import KlineData, MarketData
from app.services.analysis_quota import AnalysisQuotaService
from app.services.fingerprint import MODE_KLINE_COUNT, compute_fingerprint
from app.services.news_capital_validator import validate_news_with_capital
from app.services.point_snapper import PointSnapper
from app.services.post_validator import PostValidator
from app.services.strategy import StrategyResult, StrategyService
from app.services.macro_event_detector import detect_macro_events
from app.services.trial_trading_detector import detect_trial_trading
from app.services.volume_profile import get_institutional_levels

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

_AGENT_TIMEOUT = 60.0  # 单智能体超时（秒）
_DATA_COLLECT_TIMEOUT = 30.0  # 数据采集超时（秒）

# agent_id → (AgentClass, section_title, safe_call_kwargs)
# 被 exec_plan.resolved_agents 消费，不允许在 _run_trend 内部手工硬编码 agent 列表
_TREND_AGENT_REGISTRY: dict[str, tuple[type, str, dict]] = {
    "technical":          (TechnicalAgent,   "技术分析",       {}),
    "onchain":            (OnchainAgent,     "链上深度解读",   {}),
    "risk":               (RiskAgent,        "风险评估",       {}),
    "orderbook":          (OrderBookAgent,   "订单簿微观结构", {}),
    "sentiment":          (SentimentAgent,   "舆情分析",       {}),
    "news_analyst":       (NewsAnalystAgent, "新闻分析",       {}),
    "adversarial":        (AdversarialAgent, "对抗推演",       {"timeout": 120.0}),
    "collusion_detector": (CollusionDetector,"合谋检测",       {}),
    "calendar":           (CalendarAgent,    "日历事件",       {}),
}

_INTRADAY_AGENT_REGISTRY: dict[str, tuple[type, str, dict]] = {
    "technical":    (TechnicalAgent,   "技术分析", {}),
    "onchain":      (OnchainAgent,     "链上数据", {}),
    "risk":         (RiskAgent,        "风险评估", {}),
    "orderbook":    (OrderBookAgent,   "订单流",   {}),
    "news_analyst": (NewsAnalystAgent, "新闻分析", {}),
    "calendar":     (CalendarAgent,    "日历事件", {}),
}

# 各模式报告分段标题（文档用途，实际 section 由各 _run_* 函数动态构建）
_SCALPING_SECTIONS = ["技术指标摘要", "K线形态信号", "FVG区域", "策略建议"]
_INTRADAY_SECTIONS = [
    "技术分析", "链上数据", "订单流", "风险评估", "新闻分析", "日历事件",
    "操盘阶段", "K线形态", "FVG区域", "订单块",
    "试盘检测", "主力成本区", "消息验证", "宏观事件", "资金费率预警", "策略建议",
]
_TREND_SECTIONS = [
    "技术分析", "链上深度解读", "订单簿微观结构", "舆情分析",
    "风险评估", "新闻分析", "对抗推演", "合谋检测", "日历事件",
    "操盘阶段", "K线形态", "FVG区域", "订单块",
    "试盘检测", "主力成本区", "消息验证", "宏观事件", "资金费率预警",
    "共识报告", "AI操盘检测", "策略建议",
]


# ---------------------------------------------------------------------------
# 信号聚合与闸门函数（从 analysis_aggregation.py 导入）
# ---------------------------------------------------------------------------

from app.services.analysis_aggregation import (  # noqa: E402
    _INTRADAY_AGENT_WEIGHTS,
    _sse,
    _weighted_average_fallback,
    _intraday_aggregate,
    _extract_weekly_bias,
    _evaluate_defense_risk,
    _is_comprehensive_mode,
    get_regime_weights,
)
from app.services.analysis_helpers import (  # noqa: E402
    build_agent_section,
    compute_atr,
    aggregate_signal,
    extract_whale_data,
    run_post_complete_tasks,
)


# ---------------------------------------------------------------------------
# AnalysisOrchestrator
# ---------------------------------------------------------------------------


class AnalysisOrchestrator:
    """分析编排服务 — 根据模式协调智能体和 SMC 检测器执行。"""

    # Agent class name → breaker key mapping
    _AGENT_BREAKER_MAP: dict[str, str] = {
        "TechnicalAgent": "technical",
        "OnchainAgent": "onchain",
        "RiskAgent": "risk",
        "OrderBookAgent": "orderbook",
        "SentimentAgent": "sentiment",
        "NewsAnalystAgent": "news_analyst",
        "AdversarialAgent": "adversarial",
        "CollusionDetector": "collusion_detector",
        "CalendarAgent": "calendar",
    }

    def __init__(self) -> None:
        self._quota_svc = AnalysisQuotaService()
        self._strategy_svc = StrategyService()
        self._post_validator = PostValidator()
        self._point_snapper = PointSnapper()
        self._breakers: dict[str, CircuitBreaker] = {
            "technical": CircuitBreaker("technical"),
            "onchain": CircuitBreaker("onchain"),
            "risk": CircuitBreaker("risk"),
            "orderbook": CircuitBreaker("orderbook"),
            "sentiment": CircuitBreaker("sentiment"),
            "news_analyst": CircuitBreaker("news_analyst"),
            "adversarial": CircuitBreaker("adversarial"),
            "collusion_detector": CircuitBreaker("collusion_detector"),
            "calendar": CircuitBreaker("calendar"),
        }

    # ===================================================================
    # 主入口
    # ===================================================================

    async def _compute_cache_fingerprint(
        self,
        symbol: str,
        mode: AnalysisMode,
    ) -> str | None:
        """从 Redis 轻量读取价格和 K 线，计算数据指纹。

        仅读取当前价格和主周期的少量 K 线（由 MODE_KLINE_COUNT 决定），
        开销极低。失败时返回 None，调用方回退到不含指纹的缓存 key。
        """
        redis = get_redis_pool()

        # 读取当前价格
        raw_price = await asyncio.wait_for(
            redis.get(f"latest_price:{symbol}"),
            timeout=_DATA_COLLECT_TIMEOUT,
        )
        price = float(raw_price) if raw_price is not None else 0.0

        # 确定主周期（各模式的第一个 interval）
        primary_interval = MODE_KLINE_INTERVALS[mode][0]
        n = MODE_KLINE_COUNT[mode]

        # 读取主周期 K 线
        cached_klines = await asyncio.wait_for(
            get_json(f"klines:{symbol}:{primary_interval}"),
            timeout=_DATA_COLLECT_TIMEOUT,
        )
        klines: list[KlineData] = []
        if cached_klines and isinstance(cached_klines, list):
            klines = [KlineData.model_validate(k) for k in cached_klines[-n:]]

        return compute_fingerprint(price, klines, mode)

    async def run_analysis(
        self,
        user_id: UUID,
        level: int,
        symbol: str,
        mode: AnalysisMode,
        force_refresh: bool = False,
        locale: str = "zh-CN",
    ) -> AsyncGenerator[str, None]:
        """执行分析流程，yield SSE 事件字符串。"""

        # 1. 权限检查
        required_level = MODE_LEVEL_REQUIREMENTS[mode]
        if level < required_level:
            yield _sse(ErrorEvent(
                code="permission_denied",
                message=f"该模式需要等级 {required_level}，当前等级 {level}",
            ))
            return

        # 2. 计算数据指纹并构建缓存 key
        #    指纹计算失败时回退到不含指纹的旧格式
        fingerprint: str | None = None
        try:
            fingerprint = await self._compute_cache_fingerprint(symbol, mode)
        except Exception as exc:
            logger.warning("指纹计算失败，回退到无指纹缓存 key: %s", exc)

        if fingerprint is not None:
            cache_key = f"analysis:cache:{symbol}:{mode.value}:{fingerprint}"
        else:
            cache_key = f"analysis:cache:{symbol}:{mode.value}"

        # 3. 缓存检查（除非 force_refresh）
        if not force_refresh:
            try:
                cached = await get_json(cache_key)
                if cached is not None:
                    report = AnalysisReport.model_validate(cached)
                    report.cached = True
                    report.cached_at = report.timestamp
                    if _is_comprehensive_mode(mode):
                        try:
                            ttl = MODE_CACHE_TTL[mode]
                            payload = report.model_dump(mode="json")
                            await set_with_ttl(f"analysis:latest:{symbol.upper()}", payload, ttl)
                        except Exception as exc:
                            logger.warning("刷新 latest 缓存失败: %s", exc)
                    yield _sse(CachedEvent(report=report))
                    return
            except Exception as exc:
                logger.warning("缓存读取失败，继续执行分析: %s", exc)

        # 4.5 尝试获取分布式缓存锁
        lock_key: str = f"analysis:lock:{symbol}:{mode.value}"
        redis = get_redis_pool()
        lock_acquired: bool | None = None

        try:
            lock_acquired = True if await redis.set(lock_key, "1", nx=True, ex=120) else False
        except Exception as exc:
            logger.warning("获取缓存锁失败: %s", exc)
            # Fail-open: proceed without lock

        # 获取锁失败 — 其他请求正在执行分析，轮询缓存等待结果
        wait_deadline = time.monotonic() + 90.0
        while lock_acquired is False and time.monotonic() < wait_deadline:
            await asyncio.sleep(0.5)
            try:
                cached = await get_json(cache_key)
                if cached is not None:
                    report = AnalysisReport.model_validate(cached)
                    report.cached = True
                    report.cached_at = report.timestamp
                    if _is_comprehensive_mode(mode):
                        try:
                            ttl = MODE_CACHE_TTL[mode]
                            payload = report.model_dump(mode="json")
                            await set_with_ttl(f"analysis:latest:{symbol.upper()}", payload, ttl)
                        except Exception as exc:
                            logger.warning("刷新 latest 缓存失败: %s", exc)
                    yield _sse(CachedEvent(report=report))
                    return
            except Exception:
                pass

            try:
                if await redis.exists(lock_key):
                    continue
            except Exception as exc:
                logger.warning("检查缓存锁失败: %s", exc)
                lock_acquired = None
                break

            try:
                lock_acquired = True if await redis.set(lock_key, "1", nx=True, ex=120) else False
            except Exception as exc:
                logger.warning("获取缓存锁失败: %s", exc)
                lock_acquired = None
                break

        if lock_acquired is False:
            # 轮询超时
            yield _sse(ErrorEvent(
                code="analysis_busy",
                message="分析正在进行中，请稍后重试",
            ))
            return

        try:
            # 4. 配额检查
            try:
                allowed, remaining = await self._quota_svc.check_and_increment(
                    user_id, level, mode,
                )
            except Exception as exc:
                logger.error("配额检查异常: %s", exc)
                yield _sse(ErrorEvent(code="internal", message="配额服务异常"))
                return

            if not allowed:
                tomorrow_utc = "明日 UTC 00:00"
                yield _sse(ErrorEvent(
                    code="quota_exceeded",
                    message="今日配额已用完",
                    reset_time=tomorrow_utc,
                ))
                return

            # 5. 执行模式流程（总超时控制）
            total_timeout = MODE_TOTAL_TIMEOUT[mode]
            start_ts = time.monotonic()

            yield _sse(ProgressEvent(
                step="初始化专家组",
                status="running",
                message=f"正在拉起全能智能体专家组 ({mode.value})...",
            ))
            await asyncio.sleep(0.4)
            yield _sse(ProgressEvent(
                step="环境对齐",
                status="running",
                message="正在同步跨链数据中心与高性能计算环境...",
            ))
            await asyncio.sleep(0.3)
            yield _sse(ProgressEvent(
                step="开始分析",
                status="running",
                message=f"正在采集 {symbol} 市场实时数据...",
            ))

            _partial_ctx: dict = {}
            try:
                report = await asyncio.wait_for(
                    self._dispatch_mode(symbol, mode, _partial_ctx=_partial_ctx, locale=locale),
                    timeout=total_timeout,
                )
            except asyncio.TimeoutError:
                elapsed_ms = int((time.monotonic() - start_ts) * 1000)
                logger.warning(
                    "分析总超时: symbol=%s mode=%s elapsed=%dms",
                    symbol, mode.value, elapsed_ms,
                )
                from app.core.mode_contract import MODE_CONTRACT_VERSION as _MCV, get_contract as _gc
                _timeout_contract = _partial_ctx.get("contract") or _gc(mode.value)
                report = AnalysisReport(
                    symbol=symbol,
                    mode=mode,
                    timestamp=datetime.now(timezone.utc),
                    signal="neutral",
                    confidence=0.0,
                    sections=[],
                    is_partial=True,
                    execution_time_ms=elapsed_ms,
                    status="degraded",
                    blocked_reason="timeout",
                    data_quality_snapshot=_partial_ctx.get("dq_snapshot"),
                    engine_type=_timeout_contract.engine_type,
                    mode_contract_version=_MCV,
                )
                yield _sse(ProgressEvent(
                    step="总超时",
                    status="timeout",
                    message="分析未完全完成，部分数据缺失",
                ))
            except Exception as exc:
                logger.error("分析执行异常: %s", exc)
                yield _sse(ErrorEvent(code="internal", message=f"分析执行异常: {exc}"))
                return
            else:
                elapsed_ms = int((time.monotonic() - start_ts) * 1000)
                report.execution_time_ms = elapsed_ms

            # 6. 缓存结果（使用含指纹的 cache_key，TTL 作为兜底过期）
            try:
                ttl = MODE_CACHE_TTL[mode]
                payload = report.model_dump(mode="json")
                await set_with_ttl(cache_key, payload, ttl)
                # 趋势模式刷新 analysis:latest 缓存供 playbook_sim 使用
                # 避免 scalping/intraday 覆盖 trend 产生的全面数据。
                if _is_comprehensive_mode(mode):
                    await set_with_ttl(f"analysis:latest:{symbol.upper()}", payload, ttl)
            except Exception as exc:
                logger.warning("缓存写入失败: %s", exc)

            # 7. 推送完成事件
            yield _sse(CompleteEvent(report=report))

            # 8-9. 后置任务改为后台执行，避免阻塞 SSE 结束
            def _post_task_done(t: asyncio.Task) -> None:
                if t.cancelled():
                    return
                exc = t.exception()
                if exc:
                    logger.error(
                        "run_post_complete_tasks failed: %s",
                        exc,
                        exc_info=exc,
                    )

            _bg = asyncio.create_task(
                run_post_complete_tasks(user_id, symbol, mode, report)
            )
            _bg.add_done_callback(_post_task_done)
        finally:
            if lock_acquired:
                # 释放锁
                try:
                    await redis.delete(lock_key)
                except Exception:
                    logger.warning("释放缓存锁失败", exc_info=True)

    # ===================================================================
    # 模式分发
    # ===================================================================

    async def _dispatch_mode(
        self, symbol: str, mode: AnalysisMode,
        _partial_ctx: dict | None = None,
        locale: str = "zh-CN",
    ) -> AnalysisReport:
        """模式分发 — 完整执行链。

        run_local_context 流程:
          mode_contract → collect_market_data → build_dq_snapshot
          → build_execution_plan (含 pre-execution gates)
          → blocked? 快返 : executor → post-agent gates → report_assembler

        latest_cache_context 写入:
          由调用方 run_analysis() 在成功完成后写入 analysis:latest:{symbol}，
          本函数不触碰 latest_cache_context。
        """
        from app.core.mode_contract import (
            get_contract, MODE_CONTRACT_VERSION,
            ExecutionPlan, GateResult, RunContext,
        )

        contract = get_contract(mode.value)

        # ── 1. 采集 run_local_context ────────────────────────────
        market_data = await self._collect_market_data(symbol, mode)
        market_data.locale = locale

        # ── 2. 数据质量快照 ──────────────────────────────────────
        dq_snapshot = await self._build_data_quality_snapshot(market_data, contract)
        dq_status, dq_reason = self._evaluate_status(dq_snapshot)

        # 写入可变容器，供 run_analysis timeout 路径读取
        if _partial_ctx is not None:
            _partial_ctx["dq_snapshot"] = dq_snapshot
            _partial_ctx["contract"] = contract

        # ── 3. 构建 ExecutionPlan ────────────────────────────────
        interval_map = {
            "5m": market_data.klines_5m, "15m": market_data.klines_15m,
            "1h": market_data.klines_1h, "4h": market_data.klines_4h,
            "1d": market_data.klines_1d, "1w": market_data.klines_1w,
        }
        available_intervals = [
            itv for itv in contract.kline_intervals if interval_map.get(itv)
        ]
        missing_intervals = [
            itv for itv in contract.kline_intervals if not interval_map.get(itv)
        ]
        resolved_agents = list(contract.core_agents) + list(contract.optional_agents) + list(contract.defense_layer)

        pre_gates: list[GateResult] = []

        # ── 3a. pre-execution gate: 数据质量 ────────────────────
        if dq_status == "blocked":
            pre_gates.append(GateResult(
                passed=False, status="blocked",
                reason=dq_reason, confidence_modifier=1.0,
                detail={"source": "data_quality"},
            ))
        elif dq_status == "degraded":
            pre_gates.append(GateResult(
                passed=True, status="degraded",
                reason=dq_reason, confidence_modifier=0.8,
                detail={"source": "data_quality"},
            ))

        # ── 3b. pre-execution gate: 1w bias（仅 trend）───────────
        if mode == AnalysisMode.TREND:
            weekly_bias = _extract_weekly_bias(market_data.klines_1w)
            pre_gates.append(GateResult(
                passed=True,
                status="actionable",
                reason=None,
                confidence_modifier=1.0,
                detail={"source": "weekly_bias", "bias_direction": weekly_bias},
            ))

        exec_plan = ExecutionPlan(
            contract=contract,
            resolved_agents=resolved_agents,
            available_intervals=available_intervals,
            missing_intervals=missing_intervals,
            engine_type=contract.engine_type,
            timeout_seconds=contract.timeout_seconds,
            pre_gate_results=pre_gates,
        )

        # ── 4. 构建 RunContext（run_local_context 的完整容器）──────
        ctx = RunContext(
            execution_plan=exec_plan,
            market_data=market_data,
            dq_snapshot=dq_snapshot,
        )

        # ── 5. 若 pre-gate blocked → 跳过 agent 执行 ──────────
        if exec_plan.has_blocking_gate:
            return AnalysisReport(
                symbol=symbol,
                mode=mode,
                timestamp=datetime.now(timezone.utc),
                signal="neutral",
                confidence=0.0,
                sections=[],
                status="blocked",
                blocked_reason=exec_plan.worst_gate_reason,
                data_quality_snapshot=dq_snapshot,
                engine_type=contract.engine_type,
                mode_contract_version=MODE_CONTRACT_VERSION,
            )

        # ── 6. 执行模式流程（统一传递 RunContext）───────────────
        if mode == AnalysisMode.SCALPING:
            report = await self._run_scalping(symbol, ctx)
        elif mode == AnalysisMode.INTRADAY:
            report = await self._run_intraday(symbol, ctx)
        else:
            report = await self._run_trend(symbol, ctx)

        # ── 6. 合并所有 gate status（取最严格的）─────────────────
        _severity = {"actionable": 0, "degraded": 1, "blocked": 2}
        final_status = exec_plan.worst_gate_status
        final_reason = exec_plan.worst_gate_reason

        # trend 的 post-agent gates 已写入 report.status/blocked_reason
        if mode == AnalysisMode.TREND:
            report_sev = _severity.get(report.status, 0)
            plan_sev = _severity.get(final_status, 0)
            if report_sev > plan_sev:
                final_status = report.status
                final_reason = report.blocked_reason

        # ── 7. 注入合同元数据 + 数据质量 + 最终 status ──────────
        report = report.model_copy(update={
            "status": final_status,
            "blocked_reason": final_reason,
            "data_quality_snapshot": dq_snapshot,
            "engine_type": contract.engine_type,
            "mode_contract_version": MODE_CONTRACT_VERSION,
        })

        # ── 8. 旧路径兼容：信号完整度降级 ────────────────────────
        try:
            report = await self._apply_completeness_degradation(report)
        except Exception as exc:
            logger.warning("completeness_degradation_failed: %s", exc)

        return report

    # ===================================================================
    # 数据质量快照与状态评估（P1/P2）
    # ===================================================================

    @staticmethod
    async def _build_data_quality_snapshot(
        market_data: "MarketData",
        contract: "ModeContract",
    ) -> "DataQualitySnapshot":
        """从 market_data + mode_contract + capability runtime 构建 DataQualitySnapshot。

        三层数据源:
        1. interval_completeness — 合同要求的 K 线周期是否有数据
        2. freshness — 价格 + 最新 K 线时效性
        3. capability_state — 从 capability_state.py 读取运行时状态，
           与 market_data presence 合并得到实际运行状态
        """
        from app.models.analysis import DataQualitySnapshot

        # ── interval_completeness: 合同要求的周期中有多少有数据 ──
        interval_map = {
            "5m": market_data.klines_5m,
            "15m": market_data.klines_15m,
            "1h": market_data.klines_1h,
            "4h": market_data.klines_4h,
            "1d": market_data.klines_1d,
            "1w": market_data.klines_1w,
        }
        required = contract.kline_intervals
        available_count = sum(
            1 for itv in required if interval_map.get(itv)
        )
        interval_completeness = available_count / len(required) if required else 1.0
  
        # ── freshness: 价格可用性 + K 线时效性 ──
        freshness = 1.0 if market_data.current_price > 0 else 0.0
        if freshness > 0 and required:
            trigger_klines = interval_map.get(contract.trigger_interval, [])
            if trigger_klines:
                from datetime import datetime, timezone
                last_kline = trigger_klines[-1]
                last_dt = getattr(last_kline, "close_time", None) or getattr(last_kline, "open_time", None)
                if isinstance(last_dt, datetime):
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=timezone.utc)
                    age_minutes = (datetime.now(timezone.utc) - last_dt).total_seconds() / 60
                else:
                    age_minutes = 0
                # 超过 30 分钟衰减
                if age_minutes > 120:
                    freshness = 0.5
                elif age_minutes > 30:
                    freshness = 0.8
 
        mode_id = str(getattr(contract, "mode_id", "") or "").lower()
        required_domains = ["market"]
        if mode_id in {"intraday", "trend"}:
            required_domains.extend(["derivatives", "onchain"])
        if mode_id == "trend":
            required_domains.append("macro")

        # ── capability_state: 运行时权威状态 ──
        #
        # 每个字段有且仅有一个权威来源，不混用 presence + runtime。
        #
        # ┌──────────────────────┬────────────┬───────────────────────────────┐
        # │ snapshot 字段         │ 权威来源    │ 说明                          │
        # ├──────────────────────┼────────────┼───────────────────────────────┤
        # │ indicators           │ presence   │ 本地 ta-lib 计算，无 registry │
        # │ derivatives          │ presence   │ Binance REST，无 registry     │
        # ├──────────────────────┼────────────┼───────────────────────────────┤
        # │ onchain              │ runtime    │ GlassNode T3(主) / CQ(备)    │
        # │ calendar             │ runtime    │ CoinMarketCal API + DB       │
        # │ orderbook            │ runtime    │ Binance REST 深度快照         │
        # │ news:feed            │ runtime    │ Finnhub + BlockBeats         │
        # │ sentiment:fear_greed │ runtime    │ Alternative.me               │
        # ├──────────────────────┼────────────┼───────────────────────────────┤
        # │ cg_orderbook         │ runtime    │ CoinGlass REST（独立于上方    │
        # │ cg_cvd               │ runtime    │  Binance orderbook）          │
        # │ cg_netflow           │ runtime    │                               │
        # │ cg_large_orders      │ runtime    │                               │
        # │ cg_option_maxpain    │ runtime    │                               │
        # │ cg_net_position      │ runtime    │                               │
        # │ cg_weighted_fr       │ runtime    │                               │
        # │ cg_fr_arb            │ runtime    │                               │
        # │ cg_oi                │ runtime    │ V4 已移除，默认 UNAVAILABLE   │
        # │ cg_fr                │ runtime    │ V4 已移除，默认 UNAVAILABLE   │
        # ├──────────────────────┼────────────┼───────────────────────────────┤
        # │ coinglass (聚合)     │ 派生       │ 纯由 cg_* 子能力 runtime 推导 │
        # └──────────────────────┴────────────┴───────────────────────────────┘

        capability_state: dict[str, str] = {}

        try:
            from app.core.capability_state import get_all_capabilities
            runtime_caps = await get_all_capabilities()
        except Exception:
            runtime_caps = {}

        def _rt(key: str) -> str:
            """从 runtime 读取能力状态，统一为大写。"""
            raw = runtime_caps.get(key, {}).get("status", "unavailable")
            return str(raw).upper() if raw else "UNAVAILABLE"

        # (A) presence-only — 不在 _CAPABILITY_REGISTRY，本地计算/采集
        capability_state["indicators"] = (
            "AVAILABLE" if market_data.indicators else "UNAVAILABLE"
        )
        capability_state["derivatives"] = (
            "AVAILABLE" if market_data.derivatives else "UNAVAILABLE"
        )

        # (B) runtime-only — 在 _CAPABILITY_REGISTRY，纯读 runtime，无 presence 覆盖
        _RUNTIME_ONLY_CAPS = [
            "onchain", "calendar", "orderbook",
            "news:feed", "sentiment:fear_greed",
        ]
        for cap_key in _RUNTIME_ONLY_CAPS:
            capability_state[cap_key] = _rt(cap_key)

        # (C) CoinGlass 子能力 — 逐个读 runtime
        _CG_CAPS = [
            "cg_orderbook", "cg_cvd", "cg_netflow", "cg_large_orders",
            "cg_option_maxpain", "cg_net_position", "cg_weighted_fr",
            "cg_fr_arb", "cg_oi", "cg_fr",
        ]
        for cg_key in _CG_CAPS:
            capability_state[cg_key] = _rt(cg_key)

        # (D) coinglass 聚合 — 纯由子能力 runtime 推导，不读 market_data.coinglass
        _cg_avail = sum(1 for k in _CG_CAPS if capability_state[k] == "AVAILABLE")
        capability_state["coinglass"] = (
            "AVAILABLE" if _cg_avail == len(_CG_CAPS)
            else "DEGRADED" if _cg_avail > 0
            else "UNAVAILABLE"
        )

        coinglass_data = getattr(market_data, "coinglass", None)
        coingecko_data = getattr(market_data, "coingecko", None)
        coinglass_ready = any(
            bool(getattr(coinglass_data, field, None))
            for field in (
                "cvd_snapshots",
                "netflow_snapshots",
                "orderbook_levels",
                "large_orders",
                "option_max_pain",
                "option_info",
                "liquidation",
            )
        )
        _has_gecko_global = bool(getattr(coingecko_data, "global_data", None))
        _has_calendar = capability_state.get("calendar") == "AVAILABLE"
        _has_news = capability_state.get("news:feed") == "AVAILABLE"
        _macro_sources = sum([_has_gecko_global, _has_calendar, _has_news])
        domain_status = {
            "market": "UNAVAILABLE" if market_data.current_price <= 0 or available_count == 0 else "DEGRADED" if interval_completeness < 1.0 or freshness < 1.0 else "AVAILABLE",
            "derivatives": "AVAILABLE" if coinglass_ready else "DEGRADED" if market_data.derivatives else "UNAVAILABLE",
            "onchain": "AVAILABLE" if market_data.onchain else "DEGRADED" if capability_state.get("sentiment:fear_greed") == "AVAILABLE" else "UNAVAILABLE",
            "macro": "AVAILABLE" if _macro_sources >= 2 else "DEGRADED" if _macro_sources >= 1 else "UNAVAILABLE",
        }
        missing_domains = [domain for domain in required_domains if domain_status.get(domain) == "UNAVAILABLE"]
        domain_score = {"AVAILABLE": 1.0, "DEGRADED": 0.5, "UNAVAILABLE": 0.0}
        domain_completeness = (
            sum(domain_score.get(domain_status.get(domain, "UNAVAILABLE"), 0.0) for domain in required_domains) / len(required_domains)
            if required_domains
            else 1.0
        )

        # ── missing_inputs ──
        missing_inputs: list[str] = []
        for itv in required:
            if not interval_map.get(itv):
                missing_inputs.append(f"klines_{itv}")
        if market_data.current_price <= 0:
            missing_inputs.append("current_price")
        if not market_data.indicators:
            missing_inputs.append("indicators")
        _local_only = {"indicators", "derivatives"}
        for cap_name, cap_status in capability_state.items():
            if cap_status == "UNAVAILABLE" and cap_name not in _local_only:
                missing_inputs.append(f"cap:{cap_name}")

        return DataQualitySnapshot(
            interval_completeness=round(interval_completeness, 4),
            freshness=round(freshness, 4),
            capability_state=capability_state,
            missing_inputs=missing_inputs,
            required_domains=required_domains,
            domain_status=domain_status,
            missing_domains=missing_domains,
            domain_completeness=round(domain_completeness, 4),
        )

    @staticmethod
    def _evaluate_status(
        dq: "DataQualitySnapshot",
    ) -> tuple[str, str | None]:
        """根据 data_quality_snapshot 决定 status 和 blocked_reason。"""
        market_status = dq.domain_status.get("market")

        if dq.interval_completeness == 0 or dq.freshness == 0 or market_status == "UNAVAILABLE":
            return "blocked", "data_incomplete"

        if dq.interval_completeness < 0.5:
            return "degraded", "data_incomplete"

        if dq.missing_domains:
            return "degraded", "capability_missing"

        if any(
            domain != "market" and dq.domain_status.get(domain) == "DEGRADED"
            for domain in dq.required_domains
        ):
            return "degraded", "capability_missing"

        return "actionable", None

    async def _apply_completeness_degradation(
        self, report: AnalysisReport,
    ) -> AnalysisReport:
        """读取信号完整度，降低置信度并附加缺失数据标注。"""
        dqs = report.data_quality_snapshot
        if dqs and dqs.required_domains:
            data_completeness = round(dqs.domain_completeness, 4)
            if data_completeness >= 1.0:
                return report

            missing_sources = dqs.missing_domains or [
                domain
                for domain in dqs.required_domains
                if dqs.domain_status.get(domain) in {"UNAVAILABLE", "DEGRADED"}
            ]
            adjusted_confidence = round(report.confidence * data_completeness, 4)
            warning = (
                f"⚠️ 主数据域不完整（完整度 {round(data_completeness * 100)}%）："
                f"{'、'.join(missing_sources)} 暂不可用或仅有降级替代。"
            )

            logger.info(
                "analysis_completeness_degraded",
                extra={
                    "symbol": report.symbol,
                    "original_confidence": report.confidence,
                    "adjusted_confidence": adjusted_confidence,
                    "data_completeness": data_completeness,
                    "missing_sources": missing_sources,
                },
            )

            return report.model_copy(update={
                "confidence": adjusted_confidence,
                "data_completeness": data_completeness,
                "missing_sources": missing_sources,
                "completeness_warning": warning,
            })

        from app.services.datasource_manager import get_datasource_manager
        from app.models.datasource import DataSourceStatus

        manager = get_datasource_manager()
        if not manager._initialized:
            return report

        data_completeness = round(await manager.get_completeness_score(), 4)
        if data_completeness >= 1.0:
            return report

        snapshot = await manager.get_status_snapshot()
        missing_sources = [
            e.name for e in snapshot.exchanges
            if not e.enabled or e.status in (DataSourceStatus.ERROR, DataSourceStatus.STALE)
        ]
        adjusted_confidence = round(report.confidence * data_completeness, 4)
        warning = (
            f"⚠️ 部分数据源离线（完整度 {round(data_completeness * 100)}%）："
            f"{'、'.join(missing_sources)} 暂不可用。"
        )

        logger.info(
            "analysis_completeness_degraded",
            extra={
                "symbol": report.symbol,
                "original_confidence": report.confidence,
                "adjusted_confidence": adjusted_confidence,
                "data_completeness": data_completeness,
                "missing_sources": missing_sources,
            },
        )

        return report.model_copy(update={
            "confidence": adjusted_confidence,
            "data_completeness": data_completeness,
            "missing_sources": missing_sources,
            "completeness_warning": warning,
        })

    # ===================================================================
    # 实时短线模式
    # ===================================================================

    async def _run_scalping(
        self, symbol: str, ctx: "RunContext",
    ) -> AnalysisReport:
        """超短线：规则引擎评分 + Volume Profile 点位融合，无 LLM 调用。"""
        from app.services.scalping_engine import (
            compute_scalping_signal,
            compute_scalping_levels,
        )
        from app.services.volume_profile import compute_volume_profile

        market_data: MarketData = ctx.market_data  # type: ignore[assignment]
        sections: list[ReportSection] = []

        # --- SMC 检测（纯计算，< 5ms）---
        all_klines = market_data.klines_5m + market_data.klines_15m
        patterns = CandlestickPatternDetector.detect(all_klines)
        fvg_results: list[object] = []
        for interval_key, klines in [
            ("5m", market_data.klines_5m),
            ("15m", market_data.klines_15m),
        ]:
            if klines:
                fvg_results.extend(
                    FVGDetector.detect(klines, market_data.current_price, interval=interval_key)
                )

        # --- 规则引擎信号（< 10ms，替代 LLM 调用）---
        signal_result = compute_scalping_signal(
            price=market_data.current_price,
            indicators=market_data.indicators,
            klines_5m=market_data.klines_5m,
            klines_15m=market_data.klines_15m,
            klines_1h=market_data.klines_1h,
            patterns=patterns,
        )

        # 技术指标摘要（规则引擎结果）
        sections.append(ReportSection(
            title="技术指标摘要",
            data={
                "signal": signal_result.direction,
                "confidence": signal_result.confidence,
                "reasoning": signal_result.reasoning,
                "key_findings": signal_result.key_findings,
                "raw_data": {
                    "engine": "rule_based",
                    "raw_score": signal_result.raw_score,
                    "score_breakdown": signal_result.score_breakdown,
                },
            },
        ))

        # K线形态信号
        sections.append(ReportSection(
            title="K线形态信号",
            data={"patterns": [p.model_dump() for p in patterns]},
        ))

        # FVG 区域
        sections.append(ReportSection(
            title="FVG区域",
            data={"fvg_list": [f.model_dump() for f in fvg_results]},
        ))

        # --- Volume Profile 计算 ---
        vp = compute_volume_profile(market_data.klines_15m) if market_data.klines_15m else None

        if vp:
            sections.append(ReportSection(
                title="主力成本区",
                data={
                    "vpoc": vp.vpoc,
                    "vah": vp.vah,
                    "val": vp.val,
                    "hvn_levels": vp.hvn_levels,
                    "lvn_levels": vp.lvn_levels,
                },
            ))

        # --- 精准点位策略（< 20ms）---
        strategy_data: dict | None = None
        if signal_result.direction != "neutral":
            atr = compute_atr(market_data.klines_15m)
            if atr and atr > 0:
                levels = compute_scalping_levels(
                    direction=signal_result.direction,
                    price=market_data.current_price,
                    atr=atr,
                    vp=vp,
                    fvg_list=fvg_results,
                    symbol=symbol,
                )

                direction_map = {"bullish": "long", "bearish": "short"}
                mapped_dir = direction_map.get(signal_result.direction, "neutral")
                rr, worth = StrategyService._calc_risk_reward(
                    mapped_dir, levels["entry_low"], levels["entry_high"],
                    levels["stop_loss"], levels["targets"],
                )
                worth = worth and signal_result.confidence >= 0.4
                strategy = StrategyResult(
                    symbol=symbol,
                    direction=mapped_dir,
                    entry_low=levels["entry_low"],
                    entry_high=levels["entry_high"],
                    stop_loss=levels["stop_loss"],
                    targets=levels["targets"],
                    confidence=signal_result.confidence,
                    valid_until=datetime.now(timezone.utc) + timedelta(minutes=15),
                    reasoning=signal_result.reasoning,
                    risk_reward_ratio=rr,
                    is_worth_taking=worth,
                )

                # 点位吸附 + 策略缓存
                try:
                    strategy = await self._point_snapper.snap(strategy, symbol)
                    await set_with_ttl(
                        f"strategy:latest:{symbol.upper()}",
                        strategy.model_dump(mode="json"),
                        600,  # 10 分钟
                    )
                except Exception as snap_exc:
                    logger.warning("点位吸附或策略缓存失败: %s", snap_exc)
                strategy_data = strategy.model_dump(mode="json")

        # 回退策略
        if strategy_data is None and market_data.current_price > 0:
            try:
                fallback = self._strategy_svc.generate_fallback(
                    symbol, market_data.current_price,
                    signal=signal_result.direction,
                )
                strategy_data = fallback.model_dump(mode="json")
            except Exception as fb_exc:
                logger.warning("回退策略生成失败: %s", fb_exc)

        sections.append(ReportSection(
            title="策略建议",
            data={"strategy": strategy_data} if strategy_data else {},
            note=None if strategy_data else "信号不足，未生成策略",
            status="completed" if strategy_data else "failed",
        ))

        # --- 市场状态检测 ---
        regime_info = None
        try:
            regime_klines = market_data.klines_15m or market_data.klines_5m
            if regime_klines and len(regime_klines) >= 30:
                regime_info = detect_market_regime(regime_klines, symbol)
        except Exception as exc:
            logger.warning("市场状态检测失败: %s", exc)

        # --- 量价背离检测 V2（多因子）---
        final_signal = signal_result.direction
        final_confidence = signal_result.confidence
        try:
            from app.services.volume_price_divergence_v2 import detect_volume_price_divergence_v2
            vpd_klines = market_data.klines_15m or market_data.klines_5m
            if vpd_klines and len(vpd_klines) >= 25:
                vpd = await detect_volume_price_divergence_v2(
                    vpd_klines, final_signal,
                    indicators=market_data.indicators,
                    derivatives=market_data.derivatives,
                    coinglass=market_data.coinglass,
                )
                if vpd.confidence_modifier != 1.0:
                    final_confidence *= vpd.confidence_modifier
                vpd_data = {
                    "评分": f"{vpd.score:+.3f}",
                    "等级": vpd.grade,
                    "置信度修正": f"×{vpd.confidence_modifier}",
                    "位置": vpd.position,
                    "数据完整度": f"{vpd.data_completeness:.0%}",
                }
                for f in vpd.factors:
                    if abs(f.score) > 0.1 and f.available:
                        vpd_data[f.factor_name] = f.detail
                sections.append(ReportSection(
                    title="量价验证",
                    data=vpd_data,
                    summary=vpd.description,
                ))
        except Exception as exc:
            logger.warning("量价背离V2检测失败: %s", exc)

        return AnalysisReport(
            symbol=symbol,
            mode=AnalysisMode.SCALPING,
            timestamp=datetime.now(timezone.utc),
            signal=final_signal,
            confidence=min(final_confidence, 1.0),
            sections=sections,
            strategy=strategy_data,
            market_regime=regime_info.regime.value if regime_info else None,
            regime_suggestion=regime_info.suggestion if regime_info else None,
            regime_support=regime_info.support if regime_info else None,
            regime_resistance=regime_info.resistance if regime_info else None,
        )

    # ===================================================================
    # 日内博弈模式
    # ===================================================================

    async def _run_intraday(
        self, symbol: str, ctx: "RunContext",
    ) -> AnalysisReport:
        """日内博弈：四智能体并行 + SMC(含OB) + PhaseTracker → 策略。"""
        market_data: MarketData = ctx.market_data  # type: ignore[assignment]
        exec_plan = ctx.execution_plan
        sections: list[ReportSection] = []

        # --- 并行调用智能体 ---
        agent_tasks: list = []
        agent_ids: list[str] = []
        for agent_id in exec_plan.resolved_agents:
            entry = _INTRADAY_AGENT_REGISTRY.get(agent_id)
            if entry is None:
                continue
            cls, _section_title, kwargs = entry
            timeout = kwargs.get("timeout")
            if timeout:
                agent_tasks.append(self._safe_call_agent(cls(), market_data, timeout=timeout))
            else:
                agent_tasks.append(self._safe_call_agent(cls(), market_data))
            agent_ids.append(agent_id)

        results = await asyncio.gather(*agent_tasks)
        agent_results: dict[str, AgentReport | None] = dict(zip(agent_ids, results))

        tech_report = agent_results.get("technical")
        onchain_report = agent_results.get("onchain")
        risk_report = agent_results.get("risk")
        ob_report = agent_results.get("orderbook")
        news_report = agent_results.get("news_analyst")
        calendar_report = agent_results.get("calendar")

        # --- SMC 检测 ---
        all_klines = market_data.klines_15m + market_data.klines_1h + market_data.klines_4h

        # --- 后验校验：支撑阻力位 ---
        if tech_report is not None:
            try:
                tech_report = self._post_validator.validate_levels(tech_report, all_klines)
            except Exception as exc:
                logger.warning("后验校验失败，使用原始 report: %s", exc)

        patterns = CandlestickPatternDetector.detect(all_klines)
        fvg_results: list[object] = []
        for interval_key, klines in [
            ("15m", market_data.klines_15m),
            ("1h", market_data.klines_1h),
            ("4h", market_data.klines_4h),
        ]:
            if klines:
                fvg_results.extend(
                    FVGDetector.detect(klines, market_data.current_price, interval=interval_key)
                )

        # OB 检测（1h/4h）
        phase = await get_current_phase(symbol)
        phase_str = phase.value if phase else None
        ob_results: list[object] = []
        for interval_key, klines in [("1h", market_data.klines_1h), ("4h", market_data.klines_4h)]:
            if klines:
                ob_results.extend(
                    OrderBlockDetector.detect(
                        klines, market_data.current_price,
                        interval=interval_key, phase=phase_str,
                    )
                )

        # --- PhaseTracker ---
        phase_transition = None
        try:
            phase_transition = await detect_transition(symbol, market_data)
            # detect_transition 可能更新阶段，重新读取
            phase = await get_current_phase(symbol)
        except Exception as exc:
            logger.warning("阶段检测失败: %s", exc)
        current_phase = phase  # 复用上方已读取的 phase，避免重复 Redis 调用

        # --- 构建分段 ---
        deriv_data = market_data.derivatives.model_dump() if market_data.derivatives else {}
        deriv_section = ReportSection(
            title="合约数据",
            data=deriv_data,
            status="completed" if market_data.derivatives else "missing",
            note=None if market_data.derivatives else "合约数据不可用",
        )
        deriv_inserted = False
        for _aid in agent_ids:
            _entry = _INTRADAY_AGENT_REGISTRY.get(_aid)
            if _entry is None:
                continue
            _, _stitle, _ = _entry
            sections.append(build_agent_section(_stitle, agent_results.get(_aid)))
            if _aid == "onchain":
                sections.append(deriv_section)
                deriv_inserted = True
        if not deriv_inserted:
            sections.append(deriv_section)
        # 操盘阶段
        sections.append(ReportSection(
            title="操盘阶段",
            data={
                "current_phase": current_phase.value if current_phase else None,
                "transition": phase_transition.model_dump(mode="json") if phase_transition else None,
            },
        ))
        # K线形态
        sections.append(ReportSection(
            title="K线形态",
            data={"patterns": [p.model_dump() for p in patterns]},
        ))
        # FVG 区域
        sections.append(ReportSection(
            title="FVG区域",
            data={"fvg_list": [f.model_dump() for f in fvg_results]},
        ))
        # 订单块
        sections.append(ReportSection(
            title="订单块",
            data={"order_blocks": [ob.model_dump() for ob in ob_results]},
        ))

        # --- 试盘检测 ---
        trial_result = None
        try:
            trial_klines = market_data.klines_1h or market_data.klines_15m
            rsi_val = market_data.indicators.rsi if market_data.indicators else None
            if trial_klines:
                trial_result = detect_trial_trading(
                    trial_klines, rsi=rsi_val,
                    coinglass=market_data.coinglass,
                    current_price=market_data.current_price,
                )
                if trial_result.signals:
                    sections.append(ReportSection(
                        title="试盘检测",
                        data=trial_result.model_dump(),
                        summary=(
                            f"试盘概率: {trial_result.probability:.0%}, "
                            f"类型: {trial_result.trial_type}"
                        ) if trial_result.is_trial else "未检测到明显试盘行为",
                    ))
        except Exception as exc:
            logger.warning("试盘检测失败，跳过: %s", exc)

        # --- Volume Profile 主力成本区 ---
        vp_data = None
        try:
            vp_klines_short = market_data.klines_1h
            vp_klines_long = market_data.klines_4h
            if vp_klines_short or vp_klines_long:
                vp_data = get_institutional_levels(
                    vp_klines_short or [], vp_klines_long or [],
                )
                if vp_data.get("short_term") or vp_data.get("long_term"):
                    sections.append(ReportSection(
                        title="主力成本区",
                        data=vp_data,
                        summary="基于成交密集区计算的机构支撑/阻力位",
                    ))
        except Exception as exc:
            logger.warning("Volume Profile 计算失败，跳过: %s", exc)

        # --- 消息-资金交叉验证 ---
        news_validation = None
        try:
            news_validation = validate_news_with_capital(
                news_report, market_data.coinglass, market_data.current_price,
            )
            if news_validation.warning:
                sections.append(ReportSection(
                    title="消息验证",
                    data=news_validation.model_dump(),
                    summary=news_validation.warning,
                ))
        except Exception as exc:
            logger.warning("消息-资金交叉验证失败，跳过: %s", exc)

        # --- 宏观事件感知 ---
        macro_result = None
        try:
            news_items = await self._load_news_items(symbol)
            news_findings = news_report.key_findings if news_report else []
            macro_result = detect_macro_events(news_items, news_findings)
            if macro_result.events:
                sections.append(ReportSection(
                    title="宏观事件",
                    data=macro_result.model_dump(),
                    summary=macro_result.warning or None,
                ))
        except Exception as exc:
            logger.warning("宏观事件检测失败，跳过: %s", exc)

        # --- 策略 ---
        # 注意：Intraday 策略生成已移到信号聚合之后，以使用聚合信号
        # 先占位，下方聚合信号后再生成
        strategy_data: dict | None = None

        sections.append(ReportSection(
            title="策略建议",
            data={},  # 占位，下方聚合信号后更新
            status="missing",
        ))
        strategy_section_idx = len(sections) - 1

        # --- 市场状态检测（移到信号聚合前，供权重矩阵使用）---
        regime_info = None
        try:
            regime_klines = market_data.klines_1h or market_data.klines_4h or market_data.klines_15m
            if regime_klines and len(regime_klines) >= 30:
                regime_info = detect_market_regime(regime_klines, symbol)
        except Exception as exc:
            logger.warning("市场状态检测失败，跳过: %s", exc)

        regime_val = regime_info.regime.value if regime_info else None

        # --- 汇总信号 ---
        # 消息-资金验证：调整新闻信号置信度
        adjusted_news_report = news_report
        if news_validation and news_report and news_validation.confidence_modifier != 1.0:
            try:
                adjusted_news_report = news_report.model_copy(update={
                    "confidence": min(news_report.confidence * news_validation.confidence_modifier, 1.0),
                })
            except Exception:
                pass

        # 试盘检测：试盘期间降低整体置信度
        trial_penalty = 1.0
        if trial_result and trial_result.is_trial:
            trial_penalty = max(1.0 - trial_result.probability * 0.3, 0.5)

        intraday_agg_ids = [
            aid for aid in agent_ids
            if aid in _INTRADAY_AGENT_WEIGHTS
        ]
        intraday_agg_reports = [
            adjusted_news_report if aid == "news_analyst" else agent_results.get(aid)
            for aid in intraday_agg_ids
        ]

        signal, confidence = _intraday_aggregate(
            intraday_agg_reports,
            intraday_agg_ids,
            regime=regime_val,  # ← 传入 regime 以使用动态权重
        )
        confidence = confidence * trial_penalty

        # 宏观事件：高紧急度事件降低整体置信度
        if macro_result and macro_result.confidence_modifier < 1.0:
            confidence = confidence * macro_result.confidence_modifier

        # 资金费率极值守卫
        from app.services.funding_rate_guard import evaluate_funding_rate
        fr_value = market_data.derivatives.funding_rate if market_data.derivatives else None
        fr_result = evaluate_funding_rate(fr_value, signal)
        if fr_result.is_extreme:
            confidence *= fr_result.confidence_modifier
            sections.append(ReportSection(
                title="资金费率预警",
                data={
                    "funding_rate": f"{fr_result.funding_rate*100:.4f}%",
                    "warning": fr_result.warning,
                    "mean_reversion": fr_result.mean_reversion_direction,
                },
                status="completed",
            ))

        # --- 量价背离检测 V2（多因子）---
        try:
            from app.services.volume_price_divergence_v2 import detect_volume_price_divergence_v2
            vpd_klines = market_data.klines_1h or market_data.klines_4h or market_data.klines_15m
            if vpd_klines and len(vpd_klines) >= 25:
                vpd = await detect_volume_price_divergence_v2(
                    vpd_klines, signal,
                    indicators=market_data.indicators,
                    derivatives=market_data.derivatives,
                    coinglass=market_data.coinglass,
                )
                if vpd.confidence_modifier != 1.0:
                    confidence *= vpd.confidence_modifier
                vpd_data = {
                    "评分": f"{vpd.score:+.3f}",
                    "等级": vpd.grade,
                    "置信度修正": f"×{vpd.confidence_modifier}",
                    "位置": vpd.position,
                    "数据完整度": f"{vpd.data_completeness:.0%}",
                }
                for f in vpd.factors:
                    if abs(f.score) > 0.1 and f.available:
                        vpd_data[f.factor_name] = f.detail
                sections.append(ReportSection(
                    title="量价验证",
                    data=vpd_data,
                    summary=vpd.description,
                ))
        except Exception as exc:
            logger.warning("量价背离V2检测失败: %s", exc)

        # --- 策略生成（使用聚合信号而非单一 agent）---
        try:
            _atr = (
                market_data.indicators.atr
                if market_data.indicators is not None
                else None
            )
            # 构造 ConsensusReport-like 输入以使用 generate_from_consensus
            from app.consensus.engine import ConsensusReport, ModelVote
            # 收集所有有效 agent 的投票
            model_votes = []
            for aid in intraday_agg_ids:
                r = agent_results.get(aid)
                if r is not None:
                    model_votes.append(ModelVote(
                        model_key=aid,
                        signal=r.signal,
                        confidence=r.confidence,
                        reasoning=r.reasoning[:200] if r.reasoning else "",
                    ))
            if model_votes:
                # 构造权重字典供 ConsensusReport
                _regime_weights = get_regime_weights(regime_val, mode="intraday")
                _vote_weights = {aid: _regime_weights.get(aid, 0.10) for aid in intraday_agg_ids}
                pseudo_consensus = ConsensusReport(
                    symbol=symbol,
                    consensus_signal=signal,
                    consensus_confidence=confidence,
                    divergence=0.0,  # intraday 不使用 divergence gate
                    model_votes=model_votes,
                    weights=_vote_weights,
                    minority_warnings=[],
                )
                strategy = self._strategy_svc.generate_from_consensus(
                    pseudo_consensus, market_data.current_price, atr=_atr,
                    market_regime=regime_val,
                    regime_support=regime_info.support if regime_info else None,
                    regime_resistance=regime_info.resistance if regime_info else None,
                )
                try:
                    strategy = await self._point_snapper.snap(strategy, symbol)
                    await set_with_ttl(
                        f"strategy:latest:{symbol.upper()}",
                        strategy.model_dump(mode="json"),
                        900,
                    )
                except Exception as snap_exc:
                    logger.warning("点位吸附或策略缓存失败，使用原始策略: %s", snap_exc)
                strategy_data = strategy.model_dump(mode="json")
        except Exception as exc:
            logger.warning("策略生成失败: %s", exc)

        # 回退策略：确保策略卡片始终显示
        if strategy_data is None and market_data.current_price > 0:
            try:
                fallback = self._strategy_svc.generate_fallback(
                    symbol, market_data.current_price, signal=signal,
                )
                strategy_data = fallback.model_dump(mode="json")
            except Exception as fb_exc:
                logger.warning("回退策略生成失败: %s", fb_exc)

        # 更新策略占位 section
        sections[strategy_section_idx] = ReportSection(
            title="策略建议",
            data={"strategy": strategy_data} if strategy_data else {},
            status="completed" if strategy_data else "failed",
            note=None if strategy_data else "策略生成失败",
        )

        return AnalysisReport(
            symbol=symbol,
            mode=AnalysisMode.INTRADAY,
            timestamp=datetime.now(timezone.utc),
            signal=signal,
            confidence=min(confidence, 1.0),
            sections=sections,
            strategy=strategy_data,
            market_regime=regime_val,
            regime_suggestion=regime_info.suggestion if regime_info else None,
            regime_support=regime_info.support if regime_info else None,
            regime_resistance=regime_info.resistance if regime_info else None,
        )

    # ===================================================================
    # 趋势布局模式
    # ===================================================================

    async def _run_trend(
        self, symbol: str, ctx: "RunContext",
    ) -> AnalysisReport:
        """趋势布局 — exec_plan 驱动。

        执行顺序:
          1. agent execution (由 exec_plan.resolved_agents 驱动)
          2. post-validation / SMC / OB / Phase / Trial / VP / etc
          3. POST-AGENT GATES (defense / divergence / weekly bias)
          4. blocked → return (无信号聚合、无策略)
          5. signal aggregation
          6. adjustment factors
          7. strategy generation (仅 gates 通过后)
        """
        from app.core.mode_contract import ExecutionPlan

        market_data: MarketData = ctx.market_data  # type: ignore[assignment]
        exec_plan: ExecutionPlan = ctx.execution_plan
        sections: list[ReportSection] = []

        # --- 基于 exec_plan.resolved_agents 并行调用智能体 ---
        async def _safe_nsed() -> ConsensusReport | None:
            try:
                return await asyncio.wait_for(
                    run_nsed(market_data), timeout=_AGENT_TIMEOUT * 2,
                )
            except asyncio.TimeoutError:
                logger.warning("NSED 引擎超时")
                return None
            except Exception as exc:
                logger.error("NSED 引擎失败: %s", exc)
                return None

        agent_tasks: list = []
        agent_ids: list[str] = []
        for agent_id in exec_plan.resolved_agents:
            entry = _TREND_AGENT_REGISTRY.get(agent_id)
            if entry is None:
                continue
            cls, _section_title, kwargs = entry
            timeout = kwargs.get("timeout")
            if timeout:
                agent_tasks.append(self._safe_call_agent(cls(), market_data, timeout=timeout))
            else:
                agent_tasks.append(self._safe_call_agent(cls(), market_data))
            agent_ids.append(agent_id)

        # NSED 共识引擎（如果合同要求）
        if exec_plan.contract.consensus_layer == "nsed":
            agent_tasks.append(_safe_nsed())
            agent_ids.append("nsed")

        results = await asyncio.gather(*agent_tasks)
        agent_results: dict[str, object] = dict(zip(agent_ids, results))

        # 便捷别名 — 下游特殊处理使用
        tech_report = agent_results.get("technical")
        onchain_report = agent_results.get("onchain")
        risk_report = agent_results.get("risk")
        orderbook_report = agent_results.get("orderbook")
        sentiment_report = agent_results.get("sentiment")
        news_report = agent_results.get("news_analyst")
        adversarial_report = agent_results.get("adversarial")
        collusion_report = agent_results.get("collusion_detector")
        calendar_report = agent_results.get("calendar")
        consensus_report = agent_results.get("nsed")
        nsed_fallback = consensus_report is None and exec_plan.contract.consensus_layer == "nsed"

        # --- SMC 检测 ---
        all_klines = market_data.klines_4h + market_data.klines_1d

        # --- 后验校验：支撑阻力位 ---
        if tech_report is not None:
            try:
                tech_report = self._post_validator.validate_levels(tech_report, all_klines)
            except Exception as exc:
                logger.warning("后验校验失败，使用原始 report: %s", exc)

        patterns = CandlestickPatternDetector.detect(all_klines)
        fvg_results: list[object] = []
        for interval_key, klines in [("4h", market_data.klines_4h), ("1d", market_data.klines_1d)]:
            if klines:
                fvg_results.extend(
                    FVGDetector.detect(klines, market_data.current_price, interval=interval_key)
                )

        # OB 检测（4h/1d）+ 阶段感知
        phase = await get_current_phase(symbol)
        phase_str = phase.value if phase else None

        # 构建巨鲸数据用于交叉验证
        whale_data = extract_whale_data(onchain_report)

        ob_results: list[object] = []
        for interval_key, klines in [("4h", market_data.klines_4h), ("1d", market_data.klines_1d)]:
            if klines:
                ob_results.extend(
                    OrderBlockDetector.detect(
                        klines, market_data.current_price,
                        interval=interval_key, phase=phase_str,
                        whale_data=whale_data,
                    )
                )

        # --- PhaseTracker ---
        phase_transition = None
        try:
            phase_transition = await detect_transition(symbol, market_data)
            # detect_transition 可能更新阶段，重新读取
            phase = await get_current_phase(symbol)
        except Exception as exc:
            logger.warning("阶段检测失败: %s", exc)
        current_phase = phase  # 复用上方已读取的 phase，避免重复 Redis 调用

        # --- 构建分段（基于 resolved_agents 顺序）---
        for _aid in agent_ids:
            if _aid == "nsed":
                continue  # 共识报告单独处理
            _entry = _TREND_AGENT_REGISTRY.get(_aid)
            if _entry:
                _, _stitle, _ = _entry
                sections.append(build_agent_section(_stitle, agent_results.get(_aid)))

        # --- 防御预警推送 ---
        await self._push_defense_alert(symbol, adversarial_report, collusion_report)

        # 操盘阶段 + AI 加速检测
        accel_warning: AccelerationWarning | None = None
        try:
            accel_warning = await detect_acceleration(symbol)
        except Exception as exc:
            logger.warning("AI加速检测失败: %s", exc)

        phase_section_data: dict = {
            "current_phase": current_phase.value if current_phase else None,
            "transition": phase_transition.model_dump(mode="json") if phase_transition else None,
        }
        if accel_warning and accel_warning.is_accelerated:
            phase_section_data["acceleration"] = accel_warning.model_dump()
            logger.info(
                "ai_acceleration_detected",
                extra={
                    "symbol": symbol,
                    "transitions": accel_warning.transitions_in_window,
                    "avg_duration_hours": accel_warning.avg_phase_duration_hours,
                },
            )
            # 推送 AI 加速操盘告警
            try:
                await publish_stream("alerts", {
                    "alert_type": "ai_acceleration_warning",
                    "symbol": symbol.upper(),
                    "message": accel_warning.warning,
                    "transitions_count": accel_warning.transitions_in_window,
                })
            except Exception:
                pass

        sections.append(ReportSection(
            title="操盘阶段",
            data=phase_section_data,
            summary=accel_warning.warning if (accel_warning and accel_warning.is_accelerated) else None,
        ))
        # K线形态
        sections.append(ReportSection(
            title="K线形态",
            data={"patterns": [p.model_dump() for p in patterns]},
        ))
        # FVG 区域
        sections.append(ReportSection(
            title="FVG区域",
            data={"fvg_list": [f.model_dump() for f in fvg_results]},
        ))
        # 订单块
        sections.append(ReportSection(
            title="订单块",
            data={"order_blocks": [ob.model_dump() for ob in ob_results]},
        ))

        # --- 试盘检测 ---
        trial_result = None
        try:
            trial_klines = market_data.klines_4h or market_data.klines_1h
            rsi_val = market_data.indicators.rsi if market_data.indicators else None
            if trial_klines:
                trial_result = detect_trial_trading(
                    trial_klines, rsi=rsi_val,
                    coinglass=market_data.coinglass,
                    current_price=market_data.current_price,
                )
                if trial_result.signals:
                    sections.append(ReportSection(
                        title="试盘检测",
                        data=trial_result.model_dump(),
                        summary=(
                            f"试盘概率: {trial_result.probability:.0%}, "
                            f"类型: {trial_result.trial_type}"
                        ) if trial_result.is_trial else "未检测到明显试盘行为",
                    ))
        except Exception as exc:
            logger.warning("试盘检测失败，跳过: %s", exc)

        # --- Volume Profile 主力成本区 ---
        vp_data = None
        try:
            vp_klines_short = market_data.klines_4h
            vp_klines_long = market_data.klines_1d
            if vp_klines_short or vp_klines_long:
                vp_data = get_institutional_levels(
                    vp_klines_short or [], vp_klines_long or [],
                )
                if vp_data.get("short_term") or vp_data.get("long_term"):
                    sections.append(ReportSection(
                        title="主力成本区",
                        data=vp_data,
                        summary="基于成交密集区计算的机构支撑/阻力位",
                    ))
        except Exception as exc:
            logger.warning("Volume Profile 计算失败，跳过: %s", exc)

        # --- 消息-资金交叉验证 ---
        news_validation = None
        try:
            news_validation = validate_news_with_capital(
                news_report, market_data.coinglass, market_data.current_price,
            )
            if news_validation.warning:
                sections.append(ReportSection(
                    title="消息验证",
                    data=news_validation.model_dump(),
                    summary=news_validation.warning,
                ))
        except Exception as exc:
            logger.warning("消息-资金交叉验证失败，跳过: %s", exc)

        # --- 宏观事件感知 ---
        macro_result = None
        try:
            news_items = await self._load_news_items(symbol)
            news_findings = news_report.key_findings if news_report else []
            macro_result = detect_macro_events(news_items, news_findings)
            if macro_result.events:
                sections.append(ReportSection(
                    title="宏观事件",
                    data=macro_result.model_dump(),
                    summary=macro_result.warning or None,
                ))
        except Exception as exc:
            logger.warning("宏观事件检测失败，跳过: %s", exc)

        # 共识报告
        if consensus_report is not None:
            sections.append(ReportSection(
                title="共识报告",
                data=consensus_report.model_dump(mode="json"),
            ))
        elif nsed_fallback:
            # 加权平均回退（仅使用核心智能体，与报告顶层信号一致）
            valid_reports = [
                r for r in [tech_report, onchain_report, risk_report,
                            orderbook_report, sentiment_report]
                if r is not None
            ]
            fallback_signal, fallback_conf = _weighted_average_fallback(valid_reports)
            sections.append(ReportSection(
                title="共识报告",
                status="failed",
                data={
                    "fallback": True,
                    "signal": fallback_signal,
                    "confidence": fallback_conf,
                    "agent_reports": [r.model_dump(mode="json") for r in valid_reports],
                },
                note="共识引擎不可用，使用智能体加权结果",
            ))

        # --- AI 操盘检测 ---
        ai_result: AIDetectorResult | None = None
        try:
            ai_detector = AIDetector()
            ai_result = await asyncio.wait_for(
                ai_detector.detect(symbol, market_data),
                timeout=15.0,
            )
            sections.append(ReportSection(
                title="AI操盘检测",
                data=ai_result.model_dump(mode="json"),
                summary=(
                    f"AI操盘概率: {ai_result.ai_probability}%, "
                    f"模式: {ai_result.operation_mode}"
                ),
            ))
            # 缓存 AI 检测结果供前端轮询
            try:
                await set_with_ttl(
                    f"ai_detect:{symbol.upper()}",
                    ai_result.model_dump(mode="json"),
                    900,
                )
            except Exception:
                pass
            # AI 概率高时推送预警到 WebSocket alerts 频道
            if ai_result.ai_probability >= 60:
                try:
                    await publish_stream("alerts", {
                        "alert_type": "ai_manipulation_warning",
                        "symbol": symbol.upper(),
                        "ai_probability": ai_result.ai_probability,
                        "operation_mode": ai_result.operation_mode,
                        "tactics": ",".join(ai_result.tactics_detected[:3]),
                        "message": (
                            f"⚠️ {symbol.upper()} 检测到AI操盘"
                            f"（概率{ai_result.ai_probability}%，"
                            f"模式: {ai_result.operation_mode}）"
                        ),
                    })
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("AI操盘检测失败，跳过: %s", exc)
            sections.append(ReportSection(
                title="AI操盘检测",
                status="failed",
                data={},
                note="AI操盘检测不可用",
            ))

        # --- 市场状态检测 ---
        regime_info = None
        try:
            # 使用最长周期的 K 线检测市场状态
            regime_klines = (
                market_data.klines_4h or market_data.klines_1h
                or market_data.klines_1d or market_data.klines_15m
            )
            if regime_klines and len(regime_klines) >= 30:
                regime_info = detect_market_regime(regime_klines, symbol)
                logger.info(
                    "Market regime detected",
                    extra={"symbol": symbol, "regime": regime_info.regime.value,
                           "adx": regime_info.adx, "confidence": regime_info.confidence},
                )
        except Exception as exc:
            logger.warning("市场状态检测失败，跳过: %s", exc)

        # =================================================================
        # POST-AGENT GATES — agent 执行后、信号聚合前
        # 可阻断信号聚合和策略生成
        # =================================================================
        trend_status: str = "actionable"
        trend_blocked_reason: str | None = None
        gate_confidence_mod: float = 1.0

        # (1) defense gate — 评估防御风险
        defense_level = _evaluate_defense_risk(adversarial_report, collusion_report)
        if defense_level >= 4:
            trend_status = "blocked"
            trend_blocked_reason = "defense_risk_high"
            logger.warning(
                "trend_defense_gate_blocked",
                extra={"symbol": symbol, "defense_level": defense_level},
            )
        elif defense_level >= 3:
            gate_confidence_mod *= 0.7
            trend_status = "degraded"
            trend_blocked_reason = "defense_risk_high"
            logger.info(
                "trend_defense_gate_degraded",
                extra={"symbol": symbol, "defense_level": defense_level},
            )
        elif defense_level >= 2:
            gate_confidence_mod *= 0.85
            trend_status = "degraded"
            trend_blocked_reason = "defense_risk_high"

        # (2) NSED divergence gate
        if consensus_report is not None and trend_status != "blocked":
            if consensus_report.divergence > 90:
                trend_status = "blocked"
                trend_blocked_reason = "consensus_divergence_high"
                logger.warning(
                    "trend_divergence_gate_blocked",
                    extra={"symbol": symbol,
                           "divergence": consensus_report.divergence},
                )
            elif consensus_report.divergence > 80:
                gate_confidence_mod *= 0.8
                if trend_status == "actionable":
                    trend_status = "degraded"
                    trend_blocked_reason = "consensus_divergence_high"
                logger.info(
                    "trend_divergence_gate_degraded",
                    extra={"symbol": symbol,
                           "divergence": consensus_report.divergence},
                )

        # (3) 1w bias — 从 exec_plan 读取 pre-gate 结果
        weekly_bias: str | None = None
        for g in exec_plan.pre_gate_results:
            if g.detail.get("source") == "weekly_bias":
                weekly_bias = g.detail.get("bias_direction")
                break

        # ── blocked → 跳过信号聚合、策略生成，不写 strategy:latest ──
        if trend_status == "blocked":
            sections.append(ReportSection(
                title="闸门阻断",
                data={
                    "gate_status": trend_status,
                    "blocked_reason": trend_blocked_reason,
                    "defense_level": defense_level,
                    "divergence": consensus_report.divergence if consensus_report else None,
                },
                summary=f"趋势闸门阻断: {trend_blocked_reason}",
            ))
            return AnalysisReport(
                symbol=symbol,
                mode=AnalysisMode.TREND,
                timestamp=datetime.now(timezone.utc),
                signal="neutral",
                confidence=0.0,
                sections=sections,
                strategy=None,
                status="blocked",
                blocked_reason=trend_blocked_reason,
                market_regime=regime_info.regime.value if regime_info else None,
                regime_suggestion=regime_info.suggestion if regime_info else None,
                regime_support=regime_info.support if regime_info else None,
                regime_resistance=regime_info.resistance if regime_info else None,
            )

        # =================================================================
        # 信号聚合 — 仅在 gates 通过后执行
        # =================================================================
        if consensus_report is not None:
            signal = consensus_report.consensus_signal
            confidence = consensus_report.consensus_confidence
        elif nsed_fallback:
            valid_reports = [
                r for r in [tech_report, onchain_report, risk_report,
                            orderbook_report, sentiment_report, calendar_report]
                if r is not None
            ]
            signal, confidence = _weighted_average_fallback(valid_reports)
        else:
            signal = "neutral"
            confidence = 0.0

        # (3 续) 1w bias vs consensus signal — 信号已知后才能比对
        if weekly_bias is not None and signal != "neutral" and weekly_bias != signal:
            gate_confidence_mod *= 0.75
            if trend_status == "actionable":
                trend_status = "degraded"
                trend_blocked_reason = "weekly_bias_conflict"
            logger.info(
                "trend_weekly_bias_conflict",
                extra={"symbol": symbol, "signal": signal,
                       "weekly_bias": weekly_bias},
            )
            sections.append(ReportSection(
                title="周线偏差预警",
                data={"weekly_bias": weekly_bias, "consensus_signal": signal},
                summary=f"周线趋势 {weekly_bias} 与共识信号 {signal} 冲突，置信度已降权",
            ))

        # 应用闸门置信度修正
        confidence = confidence * gate_confidence_mod

        # ── 原有调节因子 ─────────────────────────────────────────

        # 消息-资金验证
        if news_validation and news_validation.validation_type == "contradicted":
            confidence = confidence * 0.85
            logger.info(
                "trend_confidence_adjusted_by_news_validation",
                extra={"symbol": symbol, "validation_type": news_validation.validation_type},
            )

        # 试盘检测
        if trial_result and trial_result.is_trial:
            trial_penalty = max(1.0 - trial_result.probability * 0.3, 0.5)
            confidence = confidence * trial_penalty
            logger.info(
                "trend_confidence_adjusted_by_trial_detection",
                extra={"symbol": symbol, "trial_probability": trial_result.probability},
            )

        # 宏观事件
        if macro_result and macro_result.confidence_modifier < 1.0:
            confidence = confidence * macro_result.confidence_modifier

        # AI 加速操盘
        if accel_warning and accel_warning.is_accelerated:
            confidence = confidence * 0.8
            logger.info(
                "trend_confidence_adjusted_by_ai_acceleration",
                extra={
                    "symbol": symbol,
                    "transitions": accel_warning.transitions_in_window,
                },
            )

        # 资金费率极值守卫
        from app.services.funding_rate_guard import evaluate_funding_rate
        fr_value = market_data.derivatives.funding_rate if market_data.derivatives else None
        fr_result = evaluate_funding_rate(fr_value, signal)
        if fr_result.is_extreme:
            confidence *= fr_result.confidence_modifier
            sections.append(ReportSection(
                title="资金费率预警",
                data={
                    "funding_rate": f"{fr_result.funding_rate*100:.4f}%",
                    "warning": fr_result.warning,
                    "mean_reversion": fr_result.mean_reversion_direction,
                },
                status="completed",
            ))

        # --- 量价背离检测 V2（多因子）---
        try:
            from app.services.volume_price_divergence_v2 import detect_volume_price_divergence_v2
            vpd_klines = market_data.klines_4h or market_data.klines_1d or market_data.klines_1h
            if vpd_klines and len(vpd_klines) >= 25:
                vpd = await detect_volume_price_divergence_v2(
                    vpd_klines, signal,
                    indicators=market_data.indicators,
                    derivatives=market_data.derivatives,
                    coinglass=market_data.coinglass,
                )
                if vpd.confidence_modifier != 1.0:
                    confidence *= vpd.confidence_modifier
                vpd_data = {
                    "评分": f"{vpd.score:+.3f}",
                    "等级": vpd.grade,
                    "置信度修正": f"×{vpd.confidence_modifier}",
                    "位置": vpd.position,
                    "数据完整度": f"{vpd.data_completeness:.0%}",
                }
                for f in vpd.factors:
                    if abs(f.score) > 0.1 and f.available:
                        vpd_data[f.factor_name] = f.detail
                sections.append(ReportSection(
                    title="量价验证",
                    data=vpd_data,
                    summary=vpd.description,
                ))
        except Exception as exc:
            logger.warning("量价背离V2检测失败: %s", exc)

        # =================================================================
        # 策略生成 — 仅在 gates 通过 + 信号聚合完成后执行
        # blocked 分支已在上方 return，此处保证不会被 blocked 触达
        # =================================================================
        strategy_data: dict | None = None
        if consensus_report is not None:
            try:
                _atr = (
                    market_data.indicators.atr
                    if market_data.indicators is not None
                    else None
                )
                strategy = self._strategy_svc.generate_from_consensus(
                    consensus_report, market_data.current_price, atr=_atr,
                    market_regime=regime_info.regime.value if regime_info else None,
                    regime_support=regime_info.support if regime_info else None,
                    regime_resistance=regime_info.resistance if regime_info else None,
                )
                try:
                    strategy = await self._point_snapper.snap(strategy, symbol)
                    await set_with_ttl(
                        f"strategy:latest:{symbol.upper()}",
                        strategy.model_dump(mode="json"),
                        900,
                    )
                except Exception as snap_exc:
                    logger.warning("点位吸附或策略缓存失败，使用原始策略: %s", snap_exc)
                strategy_data = strategy.model_dump(mode="json")
            except Exception as exc:
                logger.warning("策略生成失败: %s", exc)
        else:
            primary_report = tech_report or onchain_report or risk_report
            if primary_report is not None:
                try:
                    strategy = self._strategy_svc.generate_from_report(primary_report, current_price=market_data.current_price)
                    try:
                        strategy = await self._point_snapper.snap(strategy, symbol)
                        await set_with_ttl(
                            f"strategy:latest:{symbol.upper()}",
                            strategy.model_dump(mode="json"),
                            900,
                        )
                    except Exception as snap_exc:
                        logger.warning("点位吸附或策略缓存失败，使用原始策略: %s", snap_exc)
                    strategy_data = strategy.model_dump(mode="json")
                except Exception as exc:
                    logger.warning("策略生成失败: %s", exc)

        # 回退策略
        if strategy_data is None and market_data.current_price > 0:
            try:
                _fb_signal = signal  # 使用已聚合的信号
                fallback = self._strategy_svc.generate_fallback(
                    symbol, market_data.current_price, signal=_fb_signal,
                )
                strategy_data = fallback.model_dump(mode="json")
            except Exception as fb_exc:
                logger.warning("回退策略生成失败: %s", fb_exc)

        # 反AI策略调整
        if strategy_data and ai_result and ai_result.ai_probability >= 60:
            try:
                _atr_val = (
                    market_data.indicators.atr
                    if market_data.indicators and market_data.indicators.atr
                    else market_data.current_price * 0.02
                )
                from app.services.strategy import StrategyResult as _SR
                _strategy_obj = _SR.model_validate(strategy_data)
                _adjuster = AntiAIAdjuster()
                _adjusted = _adjuster.adjust(
                    _strategy_obj, ai_result, market_data.current_price, _atr_val,
                )
                strategy_data = _adjusted.model_dump(mode="json")
            except Exception as adj_exc:
                logger.warning("反AI策略调整失败，使用原始策略: %s", adj_exc)

        sections.append(ReportSection(
            title="策略建议",
            data={"strategy": strategy_data} if strategy_data else {},
            status="completed" if strategy_data else "failed",
            note=None if strategy_data else "策略生成失败",
        ))

        return AnalysisReport(
            symbol=symbol,
            mode=AnalysisMode.TREND,
            timestamp=datetime.now(timezone.utc),
            signal=signal,
            confidence=min(confidence, 1.0),
            sections=sections,
            strategy=strategy_data,
            status=trend_status,
            blocked_reason=trend_blocked_reason,
            market_regime=regime_info.regime.value if regime_info else None,
            regime_suggestion=regime_info.suggestion if regime_info else None,
            regime_support=regime_info.support if regime_info else None,
            regime_resistance=regime_info.resistance if regime_info else None,
        )

    # ===================================================================
    # 新闻数据加载（供宏观事件检测使用）
    # ===================================================================

    @staticmethod
    async def _load_news_items(symbol: str) -> list[dict]:
        """Load raw news items from Redis for macro event scanning."""
        items: list[dict] = []
        try:
            from app.core.redis import get_json
            for key in (f"news:feed:{symbol}", f"news:feed:{symbol.upper()}"):
                cached = await get_json(key)
                if cached and isinstance(cached, list):
                    items.extend(cached)
                    break
        except Exception as exc:
            logger.debug("_load_news_items failed: %s", exc)
        return items

    # ===================================================================
    # 智能体安全调用
    # ===================================================================

    async def _safe_call_agent(
        self, agent: BaseAgent, data: MarketData, timeout: float = _AGENT_TIMEOUT,
    ) -> AgentReport | None:
        """安全调用智能体，超时或异常返回 None。熔断器打开时直接跳过。"""
        agent_cls = agent.__class__.__name__
        breaker_key = self._AGENT_BREAKER_MAP.get(agent_cls)
        breaker = self._breakers.get(breaker_key) if breaker_key else None

        if breaker and not await breaker.can_execute():
            logger.warning(
                "Circuit breaker open, skipping agent",
                extra={"agent": agent_cls},
            )
            return None

        try:
            result = await asyncio.wait_for(agent.analyze(data), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(
                "Agent timeout",
                extra={"agent": agent_cls},
            )
            if breaker:
                await breaker.record_failure()
            return None
        except Exception as exc:
            logger.error(
                "Agent failed",
                extra={"agent": agent_cls, "error": str(exc)},
            )
            if breaker:
                await breaker.record_failure()
            return None

        if breaker and result is not None:
            await breaker.record_success()
        return result

    # ===================================================================
    # 防御预警推送
    # ===================================================================

    @staticmethod
    async def _push_defense_alert(
        symbol: str,
        adversarial_report: AgentReport | None,
        collusion_report: AgentReport | None,
    ) -> None:
        """当防御等级达到 medium+ 时推送 WebSocket 预警。"""
        try:
            level = 0  # 0=none, 1=low, 2=medium, 3=high

            # 合谋检测
            if collusion_report and collusion_report.raw_data:
                raw = collusion_report.raw_data
                if raw.get("collusion_detected"):
                    level = max(level, 2)
                risk = raw.get("risk_level", "none")
                risk_map = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
                level = max(level, risk_map.get(risk, 0))

            # 对抗推演
            if adversarial_report and adversarial_report.raw_data:
                raw = adversarial_report.raw_data
                for move in raw.get("predicted_moves", []):
                    prob = move.get("probability", 0)
                    trap = move.get("trap_type", "none")
                    if prob >= 0.7 and trap != "none":
                        level = max(level, 3)
                    elif prob >= 0.5 and trap != "none":
                        level = max(level, 2)

            if level < 2:
                return  # 低风险不推送

            level_labels = {2: "MEDIUM", 3: "HIGH", 4: "CRITICAL"}
            level_label = level_labels.get(level, "HIGH")

            # 构建推送消息
            parts: list[str] = [f"🛡️ {symbol.upper()} 防御预警 [{level_label}]"]

            if adversarial_report and adversarial_report.raw_data:
                intent = adversarial_report.raw_data.get("dealer_intent", "")
                if intent:
                    parts.append(f"庄家意图: {intent}")

            if collusion_report and collusion_report.raw_data:
                if collusion_report.raw_data.get("collusion_detected"):
                    patterns = collusion_report.raw_data.get("patterns", [])
                    if patterns:
                        p_type = patterns[0].get("pattern_type", "unknown")
                        parts.append(f"合谋模式: {p_type}")

            await publish_stream("alerts", {
                "alert_type": "defense_warning",
                "symbol": symbol.upper(),
                "level": level_label,
                "message": " | ".join(parts),
            })

        except Exception as exc:
            logger.debug("Defense alert push failed (non-critical): %s", exc)

    # ===================================================================
    # 数据采集
    # ===================================================================

    async def _collect_market_data(
        self, symbol: str, mode: AnalysisMode,
    ) -> MarketData:
        """从 Redis 缓存采集市场数据，构建 MarketData。

        委托给 market_data_collector.collect_market_data() 执行。
        """
        from app.services.market_data_collector import collect_market_data
        return await collect_market_data(symbol, mode)

    # ===================================================================
    # 辅助方法（委托给 analysis_helpers 模块）
    # ===================================================================

    _build_agent_section = staticmethod(build_agent_section)
    _compute_atr = staticmethod(compute_atr)
    _aggregate_signal = staticmethod(aggregate_signal)
    _extract_whale_data = staticmethod(extract_whale_data)
