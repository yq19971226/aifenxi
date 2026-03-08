import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

import app.services.analysis_orchestrator as orchestrator_module
from app.agents.base import AgentReport
from app.core.mode_contract import ExecutionPlan, RunContext, get_contract
from app.models.analysis import AnalysisMode, AnalysisReport
from app.services.analysis_orchestrator import AnalysisOrchestrator


class FakeRedis:
    def __init__(self, set_results: list[object], exists_results: list[object] | None = None) -> None:
        self._set_results = list(set_results)
        self._exists_results = list(exists_results or [])
        self.deleted_keys: list[str] = []

    async def set(self, key: str, value: str, nx: bool = False, ex: int | None = None):
        if self._set_results:
            return self._set_results.pop(0)
        return True

    async def exists(self, key: str) -> int:
        if self._exists_results:
            return int(self._exists_results.pop(0))
        return 0

    async def delete(self, key: str) -> int:
        self.deleted_keys.append(key)
        return 1


def _make_report(symbol: str = "BTCUSDT", mode: AnalysisMode = AnalysisMode.SCALPING) -> AnalysisReport:
    return AnalysisReport(
        symbol=symbol,
        mode=mode,
        timestamp=datetime.now(timezone.utc),
        signal="bullish",
        confidence=0.8,
        sections=[],
    )


async def _collect_events(generator) -> list[dict]:
    events: list[dict] = []
    async for chunk in generator:
        payload = chunk.removeprefix("data: ").strip()
        events.append(json.loads(payload))
    return events


@pytest.mark.asyncio
async def test_run_analysis_returns_cached_without_quota_when_lock_busy(monkeypatch):
    orchestrator = AnalysisOrchestrator()
    report = _make_report()
    redis = FakeRedis(set_results=[None])
    quota_mock = AsyncMock(return_value=(True, 19))
    dispatch_mock = AsyncMock(return_value=report)
    get_json_mock = AsyncMock(side_effect=[None, report.model_dump(mode="json")])
    set_with_ttl_mock = AsyncMock()

    monkeypatch.setattr(orchestrator, "_compute_cache_fingerprint", AsyncMock(return_value="fp"))
    monkeypatch.setattr(orchestrator, "_dispatch_mode", dispatch_mock)
    monkeypatch.setattr(orchestrator, "_quota_svc", SimpleNamespace(check_and_increment=quota_mock))
    monkeypatch.setattr(orchestrator_module, "get_redis_pool", lambda: redis)
    monkeypatch.setattr(orchestrator_module, "get_json", get_json_mock)
    monkeypatch.setattr(orchestrator_module, "set_with_ttl", set_with_ttl_mock)

    async def _sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(orchestrator_module.asyncio, "sleep", _sleep)

    events = await _collect_events(
        orchestrator.run_analysis(uuid4(), 2, "BTCUSDT", AnalysisMode.SCALPING)
    )

    assert [event["type"] for event in events] == ["cached"]
    assert events[0]["report"]["cached"] is True
    quota_mock.assert_not_awaited()
    dispatch_mock.assert_not_awaited()
    assert redis.deleted_keys == []


@pytest.mark.asyncio
async def test_run_analysis_retries_lock_and_executes_when_previous_executor_exits(monkeypatch):
    orchestrator = AnalysisOrchestrator()
    report = _make_report()
    redis = FakeRedis(set_results=[False, True], exists_results=[0])
    quota_mock = AsyncMock(return_value=(True, 19))
    dispatch_mock = AsyncMock(return_value=report)
    get_json_mock = AsyncMock(side_effect=[None, None])
    set_with_ttl_mock = AsyncMock()

    monkeypatch.setattr(orchestrator, "_compute_cache_fingerprint", AsyncMock(return_value="fp"))
    monkeypatch.setattr(orchestrator, "_dispatch_mode", dispatch_mock)
    monkeypatch.setattr(orchestrator, "_quota_svc", SimpleNamespace(check_and_increment=quota_mock))
    monkeypatch.setattr(orchestrator_module, "get_redis_pool", lambda: redis)
    monkeypatch.setattr(orchestrator_module, "get_json", get_json_mock)
    monkeypatch.setattr(orchestrator_module, "set_with_ttl", set_with_ttl_mock)

    async def _post_complete(*args, **kwargs) -> None:
        return None

    def _create_task(coro):
        coro.close()
        return None

    async def _sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(orchestrator_module, "run_post_complete_tasks", _post_complete)
    monkeypatch.setattr(orchestrator_module.asyncio, "create_task", _create_task)
    monkeypatch.setattr(orchestrator_module.asyncio, "sleep", _sleep)

    events = await _collect_events(
        orchestrator.run_analysis(uuid4(), 2, "BTCUSDT", AnalysisMode.SCALPING)
    )

    assert [event["type"] for event in events] == ["progress", "complete"]
    quota_mock.assert_awaited_once()
    dispatch_mock.assert_awaited_once()
    call_args = dispatch_mock.call_args
    assert call_args[0] == ("BTCUSDT", AnalysisMode.SCALPING)
    set_with_ttl_mock.assert_awaited_once()
    assert redis.deleted_keys == ["analysis:lock:BTCUSDT:scalping"]


@pytest.mark.asyncio
async def test_run_analysis_releases_lock_when_quota_denied(monkeypatch):
    orchestrator = AnalysisOrchestrator()
    redis = FakeRedis(set_results=[True])
    quota_mock = AsyncMock(return_value=(False, 0))
    dispatch_mock = AsyncMock()
    get_json_mock = AsyncMock(return_value=None)

    monkeypatch.setattr(orchestrator, "_compute_cache_fingerprint", AsyncMock(return_value="fp"))
    monkeypatch.setattr(orchestrator, "_dispatch_mode", dispatch_mock)
    monkeypatch.setattr(orchestrator, "_quota_svc", SimpleNamespace(check_and_increment=quota_mock))
    monkeypatch.setattr(orchestrator_module, "get_redis_pool", lambda: redis)
    monkeypatch.setattr(orchestrator_module, "get_json", get_json_mock)

    events = await _collect_events(
        orchestrator.run_analysis(uuid4(), 2, "BTCUSDT", AnalysisMode.SCALPING)
    )

    assert [event["type"] for event in events] == ["error"]
    assert events[0]["code"] == "quota_exceeded"
    quota_mock.assert_awaited_once()
    dispatch_mock.assert_not_awaited()
    assert redis.deleted_keys == ["analysis:lock:BTCUSDT:scalping"]


@pytest.mark.asyncio
async def test_run_intraday_uses_resolved_agents_only(monkeypatch):
    orchestrator = AnalysisOrchestrator()
    contract = get_contract("intraday")
    ctx = RunContext(
        execution_plan=ExecutionPlan(
            contract=contract,
            resolved_agents=["technical", "risk"],
            available_intervals=["15m", "1h", "4h"],
            missing_intervals=[],
            engine_type=contract.engine_type,
            timeout_seconds=contract.timeout_seconds,
        ),
        market_data=SimpleNamespace(
            klines_15m=[],
            klines_1h=[],
            klines_4h=[],
            current_price=100.0,
            indicators=None,
            derivatives=None,
            coinglass=None,
        ),
        dq_snapshot=None,
    )
    called: list[str] = []

    async def _safe_call_agent(agent, _market_data, timeout=60.0):
        del _market_data, timeout
        agent_id = {"TechnicalAgent": "technical", "RiskAgent": "risk"}[agent.__class__.__name__]
        called.append(agent_id)
        return AgentReport(
            agent_id=agent_id,
            symbol="BTCUSDT",
            signal="bullish",
            confidence=0.8,
            reasoning=agent_id,
            key_findings=[agent_id],
            raw_data={},
        )

    async def _snap(strategy, symbol):
        del symbol
        return strategy

    monkeypatch.setattr(orchestrator, "_safe_call_agent", _safe_call_agent)
    monkeypatch.setattr(orchestrator._post_validator, "validate_levels", lambda report, _klines: report)
    monkeypatch.setattr(orchestrator, "_load_news_items", AsyncMock(return_value=[]))
    monkeypatch.setattr(orchestrator._strategy_svc, "generate_from_report", lambda report, current_price: type("S", (), {"model_dump": lambda self, mode="json": {"side": "buy"}})())
    monkeypatch.setattr(orchestrator._point_snapper, "snap", _snap)
    monkeypatch.setattr(orchestrator_module.CandlestickPatternDetector, "detect", lambda _klines: [])
    monkeypatch.setattr(orchestrator_module, "get_current_phase", AsyncMock(return_value=None))
    monkeypatch.setattr(orchestrator_module, "detect_transition", AsyncMock(return_value=None))
    monkeypatch.setattr(orchestrator_module, "validate_news_with_capital", lambda *_a, **_k: None)
    monkeypatch.setattr(orchestrator_module, "detect_macro_events", lambda *_a, **_k: SimpleNamespace(events=[], warning=None, confidence_modifier=1.0))
    monkeypatch.setattr(orchestrator_module, "set_with_ttl", AsyncMock())
    monkeypatch.setattr(orchestrator_module, "_intraday_aggregate", lambda reports, agent_ids: ("bullish", 0.8))

    import app.services.funding_rate_guard as funding_rate_guard_module

    monkeypatch.setattr(funding_rate_guard_module, "evaluate_funding_rate", lambda *_a, **_k: SimpleNamespace(is_extreme=False, confidence_modifier=1.0, funding_rate=0.0, warning="", mean_reversion_direction=None))

    report = await orchestrator._run_intraday("BTCUSDT", ctx)

    assert called == ["technical", "risk"]
    titles = [section.title for section in report.sections]
    assert "技术分析" in titles
    assert "风险评估" in titles
    assert "链上数据" not in titles
    assert "订单流" not in titles


# ── P2 统一输出协议字段覆盖 ────────────────────────────────────


def test_report_model_includes_p2_fields():
    """AnalysisReport 实例化后默认带全部 P2 字段。"""
    report = _make_report()
    assert report.status == "actionable"
    assert report.blocked_reason is None
    assert report.data_quality_snapshot is None
    assert report.engine_type is None
    assert report.mode_contract_version is None


def test_report_model_p2_fields_set_explicitly():
    """P2 字段可被显式设置。"""
    from app.models.analysis import DataQualitySnapshot
    dqs = DataQualitySnapshot(
        interval_completeness=0.8,
        freshness=0.9,
        capability_state={"calendar": "UNAVAILABLE"},
        missing_inputs=["1w"],
        required_domains=["market", "derivatives"],
        domain_status={"market": "AVAILABLE", "derivatives": "DEGRADED"},
        missing_domains=[],
        domain_completeness=0.75,
    )
    report = AnalysisReport(
        symbol="BTCUSDT",
        mode=AnalysisMode.TREND,
        timestamp=datetime.now(timezone.utc),
        signal="bullish",
        confidence=0.7,
        sections=[],
        status="degraded",
        blocked_reason="data_incomplete",
        data_quality_snapshot=dqs,
        engine_type="multi_agent_consensus",
        mode_contract_version="1.0.0",
    )
    assert report.status == "degraded"
    assert report.blocked_reason == "data_incomplete"
    assert report.data_quality_snapshot.interval_completeness == 0.8
    assert report.data_quality_snapshot.required_domains == ["market", "derivatives"]
    assert report.data_quality_snapshot.domain_status["derivatives"] == "DEGRADED"
    assert report.data_quality_snapshot.domain_completeness == 0.75
    assert report.engine_type == "multi_agent_consensus"
    assert report.mode_contract_version == "1.0.0"


def test_evaluate_status_blocked_on_zero_interval():
    """interval_completeness == 0 → blocked."""
    from app.models.analysis import DataQualitySnapshot
    dqs = DataQualitySnapshot(interval_completeness=0.0, freshness=1.0)
    status, reason = AnalysisOrchestrator._evaluate_status(dqs)
    assert status == "blocked"
    assert reason == "data_incomplete"


def test_evaluate_status_blocked_on_zero_freshness():
    """freshness == 0 → blocked."""
    from app.models.analysis import DataQualitySnapshot
    dqs = DataQualitySnapshot(interval_completeness=1.0, freshness=0.0)
    status, reason = AnalysisOrchestrator._evaluate_status(dqs)
    assert status == "blocked"
    assert reason == "data_incomplete"


def test_evaluate_status_degraded_on_low_interval():
    """interval_completeness < 0.5 → degraded."""
    from app.models.analysis import DataQualitySnapshot
    dqs = DataQualitySnapshot(interval_completeness=0.3, freshness=1.0)
    status, reason = AnalysisOrchestrator._evaluate_status(dqs)
    assert status == "degraded"
    assert reason == "data_incomplete"


def test_evaluate_status_degraded_on_capability_missing():
    """必需主域缺失 → degraded."""
    from app.models.analysis import DataQualitySnapshot
    dqs = DataQualitySnapshot(
        interval_completeness=1.0,
        freshness=1.0,
        required_domains=["market", "derivatives", "onchain"],
        domain_status={"market": "AVAILABLE", "derivatives": "UNAVAILABLE", "onchain": "AVAILABLE"},
        missing_domains=["derivatives"],
        domain_completeness=0.6667,
    )
    status, reason = AnalysisOrchestrator._evaluate_status(dqs)
    assert status == "degraded"
    assert reason == "capability_missing"


def test_evaluate_status_actionable():
    """正常情况 → actionable."""
    from app.models.analysis import DataQualitySnapshot
    dqs = DataQualitySnapshot(interval_completeness=1.0, freshness=1.0)
    status, reason = AnalysisOrchestrator._evaluate_status(dqs)
    assert status == "actionable"
    assert reason is None


@pytest.mark.asyncio
async def test_build_data_quality_snapshot_uses_kline_close_time_without_timestamp(monkeypatch):
    from app.core import capability_state as capability_state_module
    from app.models.market_data import KlineData

    now = datetime.now(timezone.utc)
    kline = KlineData(
        symbol="BTCUSDT",
        interval="15m",
        open_time=now - timedelta(minutes=60),
        open=100.0,
        high=110.0,
        low=95.0,
        close=105.0,
        volume=1234.0,
        close_time=now - timedelta(minutes=45),
        is_closed=True,
    )
    market_data = SimpleNamespace(
        klines_5m=[],
        klines_15m=[kline],
        klines_1h=[],
        klines_4h=[],
        klines_1d=[],
        klines_1w=[],
        current_price=100.0,
        indicators={"ema7": 101.0},
        derivatives={"funding_rate": 0.01},
        onchain=None,
        coinglass=None,
        coingecko=None,
    )
    contract = SimpleNamespace(kline_intervals=["15m"], trigger_interval="15m", mode_id="scalping")

    monkeypatch.setattr(capability_state_module, "get_all_capabilities", AsyncMock(return_value={}))

    snapshot = await AnalysisOrchestrator._build_data_quality_snapshot(market_data, contract)

    assert not hasattr(kline, "timestamp")
    assert snapshot.interval_completeness == 1.0
    assert snapshot.freshness == 0.8
    assert snapshot.required_domains == ["market"]
    assert snapshot.domain_status["market"] == "DEGRADED"
    assert snapshot.missing_domains == []
    assert snapshot.domain_completeness == 0.5


@pytest.mark.asyncio
async def test_run_analysis_complete_event_includes_p2_fields(monkeypatch):
    """正常 complete 事件的 report 包含 P2 字段。"""
    from app.core.mode_contract import MODE_CONTRACT_VERSION

    orchestrator = AnalysisOrchestrator()
    report = _make_report()
    # 模拟 _dispatch_mode 返回带 P2 字段的 report
    report = report.model_copy(update={
        "status": "actionable",
        "engine_type": "rule_engine",
        "mode_contract_version": MODE_CONTRACT_VERSION,
    })
    redis = FakeRedis(set_results=[True])
    quota_mock = AsyncMock(return_value=(True, 19))
    dispatch_mock = AsyncMock(return_value=report)
    get_json_mock = AsyncMock(return_value=None)
    set_with_ttl_mock = AsyncMock()

    monkeypatch.setattr(orchestrator, "_compute_cache_fingerprint", AsyncMock(return_value="fp"))
    monkeypatch.setattr(orchestrator, "_dispatch_mode", dispatch_mock)
    monkeypatch.setattr(orchestrator, "_quota_svc", SimpleNamespace(check_and_increment=quota_mock))
    monkeypatch.setattr(orchestrator_module, "get_redis_pool", lambda: redis)
    monkeypatch.setattr(orchestrator_module, "get_json", get_json_mock)
    monkeypatch.setattr(orchestrator_module, "set_with_ttl", set_with_ttl_mock)

    async def _post_complete(*args, **kwargs):
        return None

    def _create_task(coro):
        coro.close()
        return None

    monkeypatch.setattr(orchestrator_module, "run_post_complete_tasks", _post_complete)
    monkeypatch.setattr(orchestrator_module.asyncio, "create_task", _create_task)

    events = await _collect_events(
        orchestrator.run_analysis(uuid4(), 2, "BTCUSDT", AnalysisMode.SCALPING)
    )

    complete_events = [e for e in events if e["type"] == "complete"]
    assert len(complete_events) == 1
    r = complete_events[0]["report"]
    assert r["status"] == "actionable"
    assert r["engine_type"] == "rule_engine"
    assert r["mode_contract_version"] == MODE_CONTRACT_VERSION


@pytest.mark.asyncio
async def test_run_analysis_timeout_early_reports_null_dqs(monkeypatch):
    """超时发生在 dq_snapshot 构建前 → dqs 为 None，其余 P2 字段仍齐全。"""
    from app.core.mode_contract import MODE_CONTRACT_VERSION

    orchestrator = AnalysisOrchestrator()
    redis = FakeRedis(set_results=[True])
    quota_mock = AsyncMock(return_value=(True, 19))
    get_json_mock = AsyncMock(return_value=None)
    set_with_ttl_mock = AsyncMock()

    async def _dispatch_timeout(*_a, **_k):
        import asyncio as _aio
        await _aio.sleep(999)

    monkeypatch.setattr(orchestrator, "_compute_cache_fingerprint", AsyncMock(return_value="fp"))
    monkeypatch.setattr(orchestrator, "_dispatch_mode", _dispatch_timeout)
    monkeypatch.setattr(orchestrator, "_quota_svc", SimpleNamespace(check_and_increment=quota_mock))
    monkeypatch.setattr(orchestrator_module, "get_redis_pool", lambda: redis)
    monkeypatch.setattr(orchestrator_module, "get_json", get_json_mock)
    monkeypatch.setattr(orchestrator_module, "set_with_ttl", set_with_ttl_mock)
    monkeypatch.setitem(
        orchestrator_module.MODE_TOTAL_TIMEOUT,
        AnalysisMode.SCALPING,
        0.01,
    )

    async def _post_complete(*args, **kwargs):
        return None

    def _create_task(coro):
        coro.close()
        return None

    monkeypatch.setattr(orchestrator_module, "run_post_complete_tasks", _post_complete)
    monkeypatch.setattr(orchestrator_module.asyncio, "create_task", _create_task)

    events = await _collect_events(
        orchestrator.run_analysis(uuid4(), 2, "BTCUSDT", AnalysisMode.SCALPING)
    )

    complete_events = [e for e in events if e["type"] == "complete"]
    assert len(complete_events) == 1
    r = complete_events[0]["report"]
    assert r["status"] == "degraded"
    assert r["blocked_reason"] == "timeout"
    assert r["engine_type"] == "rule_engine"
    assert r["mode_contract_version"] == MODE_CONTRACT_VERSION
    assert r["is_partial"] is True
    # 早期超时: _dispatch_mode 被完全 mock 掉, _partial_ctx 未被写入
    assert r["data_quality_snapshot"] is None


@pytest.mark.asyncio
async def test_run_analysis_timeout_includes_dqs_when_available(monkeypatch):
    """超时发生在 mode runner 阶段 → dq_snapshot 已构建，timeout 报告应包含它。"""
    from app.core.mode_contract import MODE_CONTRACT_VERSION
    from app.models.analysis import DataQualitySnapshot

    orchestrator = AnalysisOrchestrator()
    redis = FakeRedis(set_results=[True])
    quota_mock = AsyncMock(return_value=(True, 19))
    get_json_mock = AsyncMock(return_value=None)
    set_with_ttl_mock = AsyncMock()

    dqs_fixture = DataQualitySnapshot(
        interval_completeness=0.9, freshness=0.85,
        capability_state={"calendar": "AVAILABLE"},
        missing_inputs=[],
    )

    # 模拟真实 _dispatch_mode: 写入 _partial_ctx 后在 mode runner 阶段超时
    async def _dispatch_writes_then_hangs(self_inner, symbol, mode, _partial_ctx=None):
        import asyncio as _aio
        if _partial_ctx is not None:
            _partial_ctx["dq_snapshot"] = dqs_fixture
            from app.core.mode_contract import get_contract
            _partial_ctx["contract"] = get_contract(mode.value)
        await _aio.sleep(999)  # 模拟 mode runner 超时

    monkeypatch.setattr(orchestrator, "_compute_cache_fingerprint", AsyncMock(return_value="fp"))
    monkeypatch.setattr(AnalysisOrchestrator, "_dispatch_mode", _dispatch_writes_then_hangs)
    monkeypatch.setattr(orchestrator, "_quota_svc", SimpleNamespace(check_and_increment=quota_mock))
    monkeypatch.setattr(orchestrator_module, "get_redis_pool", lambda: redis)
    monkeypatch.setattr(orchestrator_module, "get_json", get_json_mock)
    monkeypatch.setattr(orchestrator_module, "set_with_ttl", set_with_ttl_mock)
    monkeypatch.setitem(
        orchestrator_module.MODE_TOTAL_TIMEOUT,
        AnalysisMode.SCALPING,
        0.05,
    )

    async def _post_complete(*args, **kwargs):
        return None

    def _create_task(coro):
        coro.close()
        return None

    monkeypatch.setattr(orchestrator_module, "run_post_complete_tasks", _post_complete)
    monkeypatch.setattr(orchestrator_module.asyncio, "create_task", _create_task)

    events = await _collect_events(
        orchestrator.run_analysis(uuid4(), 2, "BTCUSDT", AnalysisMode.SCALPING)
    )

    complete_events = [e for e in events if e["type"] == "complete"]
    assert len(complete_events) == 1
    r = complete_events[0]["report"]
    assert r["status"] == "degraded"
    assert r["blocked_reason"] == "timeout"
    assert r["engine_type"] == "rule_engine"
    assert r["mode_contract_version"] == MODE_CONTRACT_VERSION
    # dq_snapshot 应该被保留
    assert r["data_quality_snapshot"] is not None
    assert r["data_quality_snapshot"]["interval_completeness"] == 0.9
    assert r["data_quality_snapshot"]["freshness"] == 0.85


@pytest.mark.asyncio
async def test_run_analysis_cached_event_includes_p2_fields(monkeypatch):
    """缓存命中时 cached 事件的 report 包含 P2 字段。"""
    from app.core.mode_contract import MODE_CONTRACT_VERSION
    from app.models.analysis import DataQualitySnapshot

    orchestrator = AnalysisOrchestrator()

    # 构造一个带完整 P2 字段的缓存 report
    dqs = DataQualitySnapshot(interval_completeness=1.0, freshness=1.0)
    cached_report = _make_report()
    cached_report = cached_report.model_copy(update={
        "status": "actionable",
        "blocked_reason": None,
        "data_quality_snapshot": dqs,
        "engine_type": "rule_engine",
        "mode_contract_version": MODE_CONTRACT_VERSION,
    })
    cached_payload = cached_report.model_dump(mode="json")

    redis = FakeRedis(set_results=[True])
    get_json_mock = AsyncMock(return_value=cached_payload)
    set_with_ttl_mock = AsyncMock()

    monkeypatch.setattr(orchestrator, "_compute_cache_fingerprint", AsyncMock(return_value="fp"))
    monkeypatch.setattr(orchestrator_module, "get_redis_pool", lambda: redis)
    monkeypatch.setattr(orchestrator_module, "get_json", get_json_mock)
    monkeypatch.setattr(orchestrator_module, "set_with_ttl", set_with_ttl_mock)

    events = await _collect_events(
        orchestrator.run_analysis(uuid4(), 2, "BTCUSDT", AnalysisMode.SCALPING)
    )

    cached_events = [e for e in events if e["type"] == "cached"]
    assert len(cached_events) == 1
    r = cached_events[0]["report"]
    assert r["cached"] is True
    assert r["status"] == "actionable"
    assert r["engine_type"] == "rule_engine"
    assert r["mode_contract_version"] == MODE_CONTRACT_VERSION
    assert r["data_quality_snapshot"] is not None
    assert r["data_quality_snapshot"]["interval_completeness"] == 1.0


@pytest.mark.asyncio
async def test_dispatch_mode_pre_gate_blocked_includes_p2_fields(monkeypatch):
    """pre-gate blocked 路径返回的 report 包含全部 P2 字段。"""
    from app.core.mode_contract import MODE_CONTRACT_VERSION
    from app.models.analysis import DataQualitySnapshot

    orchestrator = AnalysisOrchestrator()

    # 让 dq_snapshot 返回 blocked 状态
    dqs = DataQualitySnapshot(
        interval_completeness=0.0,
        freshness=0.0,
        capability_state={},
        missing_inputs=["5m", "15m", "1h"],
    )

    monkeypatch.setattr(
        orchestrator, "_collect_market_data",
        AsyncMock(return_value=SimpleNamespace(
            klines_5m=[], klines_15m=[], klines_1h=[],
            klines_4h=[], klines_1d=[], klines_1w=[],
            current_price=100.0, indicators=None,
            derivatives=None, coinglass=None,
        )),
    )
    monkeypatch.setattr(
        orchestrator, "_build_data_quality_snapshot",
        AsyncMock(return_value=dqs),
    )

    report = await orchestrator._dispatch_mode("BTCUSDT", AnalysisMode.SCALPING)

    assert report.status == "blocked"
    assert report.blocked_reason == "data_incomplete"
    assert report.data_quality_snapshot is not None
    assert report.data_quality_snapshot.interval_completeness == 0.0
    assert report.engine_type == "rule_engine"
    assert report.mode_contract_version == MODE_CONTRACT_VERSION
