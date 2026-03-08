from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.mode_contract import ALL_MODE_KLINE_INTERVALS
from app.core.sql_compat import serial_pk, varchar, timestamptz_default

from app.api.auth import router as auth_router
from app.api.cases import router as cases_router
from app.api.coinglass import router as coinglass_router
from app.api.coingecko import router as coingecko_router
from app.api.consensus import router as consensus_router
from app.api.derivatives import router as derivatives_router
from app.api.market import router as market_router
from app.api.onchain import router as onchain_router
from app.api.operators import router as operators_router
from app.api.payment import router as payment_router
from app.api.sentiment import router as sentiment_router
from app.api.strategy import router as strategy_router
from app.api.calendar import router as calendar_router
from app.api.agents import router as agents_router
from app.api.admin_configs import router as admin_configs_router
from app.api.admin_dashboard import router as admin_dashboard_router
from app.api.admin_notifications import router as admin_notifications_router
from app.api.admin_orders import router as admin_orders_router
from app.api.admin_users import router as admin_users_router
from app.api.alerts import router as alerts_router
from app.api.analysis import router as analysis_router
from app.api.performance import router as performance_router
from app.api.push import router as push_router
from app.api.symbols import router as symbols_router
from app.api.ws import router as ws_router, start_stream_consumers, stop_stream_consumers
from app.api.datasources import router as datasources_router
from app.api.playbook import router as playbook_router
from app.api.reflection import router as reflection_router
from app.api.defense import router as defense_router
from app.api.admin_models import router as admin_models_router
from app.api.learning import router as learning_router
from app.api.membership import router as membership_router
from app.api.playbook_sim import router as playbook_sim_router, admin_router as playbook_sim_admin_router
from app.api.backtest import router as backtest_router
from app.api.partner import user_router as partner_user_router, admin_router as partner_admin_router, withdrawal_admin_router
from app.api.tasks import user_router as tasks_user_router, admin_router as tasks_admin_router
from app.api.announcements import user_router as announcements_user_router, admin_router as announcements_admin_router
from app.api.dashboard_overview import router as dashboard_overview_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.redis import init_redis, close_redis
from app.core.sentry import init_sentry

_DEFAULT_KLINE_INTERVALS_CSV = ",".join(ALL_MODE_KLINE_INTERVALS)

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await init_redis()
    start_stream_consumers()
    # 加载配置缓存
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.config_service import ConfigService
        async with AsyncSessionLocal() as session:
            svc = ConfigService(session)
            await svc.load_all_to_cache()
            # Sentry 初始化：从配置读取 DSN 和采样率
            sentry_dsn = await svc.get_config("sentry_dsn_backend")
            sentry_rate_str = await svc.get_config("sentry_traces_sample_rate", "0.2")
            try:
                sentry_rate = float(sentry_rate_str)
            except (ValueError, TypeError):
                sentry_rate = 0.2
            init_sentry(dsn=sentry_dsn, traces_rate=sentry_rate)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("配置缓存加载失败: %s", exc)
    # 确保 params_changelog 表存在（B6）
    try:
        from app.services.learning_service import LearningService
        async with AsyncSessionLocal() as session:
            ls = LearningService(session)
            await ls.ensure_changelog_table()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("params_changelog 表初始化失败: %s", exc)
    # 确保 playbook_predictions 表存在（D5）
    try:
        async with AsyncSessionLocal() as session:
            _spk = serial_pk()
            _v20 = varchar(20)
            _v100 = varchar(100)
            _ts = timestamptz_default()
            await session.execute(text(f"""
                CREATE TABLE IF NOT EXISTS playbook_predictions (
                    id {_spk},
                    symbol {_v20} NOT NULL,
                    playbook_name {_v100} NOT NULL,
                    match_pct FLOAT DEFAULT 0,
                    current_stage_idx INT DEFAULT -1,
                    stages_json TEXT DEFAULT '[]',
                    created_at {_ts},
                    verified_stages INT DEFAULT 0,
                    status {_v20} DEFAULT 'active',
                    final_accuracy FLOAT DEFAULT NULL,
                    published BOOLEAN DEFAULT FALSE
                )
            """))
            await session.commit()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("playbook_predictions 建表失败: %s", exc)
    # 确保 push_templates 表存在（F1）
    try:
        async with AsyncSessionLocal() as session:
            _spk = serial_pk()
            _v50 = varchar(50)
            _v20 = varchar(20)
            _ts = timestamptz_default()
            await session.execute(text(f"""
                CREATE TABLE IF NOT EXISTS push_templates (
                    id {_spk},
                    event_type {_v50} NOT NULL,
                    channel {_v20} NOT NULL,
                    template_content TEXT NOT NULL,
                    enabled BOOLEAN DEFAULT TRUE,
                    created_at {_ts},
                    updated_at {_ts},
                    UNIQUE(event_type, channel)
                )
            """))
            await session.commit()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("push_templates 建表失败: %s", exc)
    # 确保 params_changelog 表和索引存在（B6）
    try:
        async with AsyncSessionLocal() as session:
            _spk = serial_pk()
            _v50 = varchar(50)
            _v100 = varchar(100)
            _ts = timestamptz_default()
            await session.execute(text(f"""
                CREATE TABLE IF NOT EXISTS params_changelog (
                    id {_spk},
                    param_type {_v50} NOT NULL,
                    param_key {_v100} NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    changed_by {_v100} DEFAULT 'system',
                    note TEXT DEFAULT '',
                    changed_at {_ts}
                )
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_params_changelog_at
                ON params_changelog (changed_at DESC)
            """))
            await session.commit()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("params_changelog 建表失败: %s", exc)
    # 初始化数据源管理器和健康监控
    try:
        from app.services.datasource_manager import get_datasource_manager
        from app.services.health_monitor import HealthMonitor
        ds_manager = get_datasource_manager()
        await ds_manager.initialize()
        health_monitor = HealthMonitor()
        health_monitor.set_manager(ds_manager)
        await health_monitor.start()
        app.state.health_monitor = health_monitor
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("数据源管理器/健康监控启动失败: %s", exc)
    # K 线自动采集调度器
    try:
        from app.services.kline_scheduler import KlineScheduler
        kline_scheduler = KlineScheduler()
        await kline_scheduler.start()
        app.state.kline_scheduler = kline_scheduler
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("KlineScheduler 启动失败: %s", exc)
    yield
    # shutdown
    if hasattr(app.state, "kline_scheduler"):
        await app.state.kline_scheduler.stop()
    if hasattr(app.state, "health_monitor"):
        await app.state.health_monitor.stop()
    try:
        from app.services.datasource_manager import get_datasource_manager
        await get_datasource_manager().shutdown()
    except Exception:
        pass
    await stop_stream_consumers()
    await close_redis()


app = FastAPI(
    title="Axiom API",
    version="3.0.0",
    description="加密货币多智能体分析系统",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(admin_configs_router)
app.include_router(admin_dashboard_router)
app.include_router(admin_notifications_router)
app.include_router(admin_orders_router)
app.include_router(admin_users_router)
app.include_router(alerts_router)
app.include_router(analysis_router)
app.include_router(auth_router)
app.include_router(derivatives_router)
app.include_router(market_router)
app.include_router(onchain_router)
app.include_router(operators_router)
app.include_router(performance_router)
app.include_router(push_router)
app.include_router(sentiment_router)
app.include_router(strategy_router)
app.include_router(calendar_router)
app.include_router(agents_router)
app.include_router(cases_router)
app.include_router(coinglass_router)
app.include_router(coingecko_router)
app.include_router(consensus_router)
app.include_router(payment_router)
app.include_router(symbols_router)
app.include_router(playbook_router)
app.include_router(reflection_router)
app.include_router(defense_router)
app.include_router(ws_router)
app.include_router(datasources_router)
app.include_router(admin_models_router)
app.include_router(partner_user_router)
app.include_router(partner_admin_router)
app.include_router(withdrawal_admin_router)
app.include_router(learning_router)
app.include_router(membership_router)
app.include_router(playbook_sim_router)
app.include_router(playbook_sim_admin_router)
app.include_router(backtest_router)
app.include_router(tasks_user_router)
app.include_router(tasks_admin_router)
app.include_router(announcements_user_router)
app.include_router(announcements_admin_router)
app.include_router(dashboard_overview_router)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


@app.get("/api/system/market-data-debug", tags=["system"])
async def market_data_debug(symbol: str = "ETHUSDT", mode: str = "scalping") -> dict:
    """调试：运行 _collect_market_data 查看实际采集到的数据。"""
    from app.models.analysis import AnalysisMode
    from app.services.analysis_orchestrator import AnalysisOrchestrator
    orch = AnalysisOrchestrator()
    mode_enum = AnalysisMode(mode)
    md = await orch._collect_market_data(symbol, mode_enum)
    return {
        "symbol": md.symbol,
        "current_price": md.current_price,
        "klines_5m": len(md.klines_5m),
        "klines_15m": len(md.klines_15m),
        "klines_1h": len(md.klines_1h),
        "klines_4h": len(md.klines_4h),
        "klines_1d": len(md.klines_1d),
        "klines_1w": len(md.klines_1w),
        "indicators": md.indicators.model_dump() if md.indicators else None,
        "onchain": "EXISTS" if md.onchain else "MISSING",
        "derivatives": "EXISTS" if md.derivatives else "MISSING",
        "coinglass": "EXISTS" if md.coinglass else "MISSING",
        "coingecko": "EXISTS" if md.coingecko else "MISSING",
    }


@app.get("/api/system/market-data-debug/trace", tags=["system"])
async def market_data_debug_trace(symbol: str = "ETHUSDT") -> dict:
    """调试：逐步读取 Redis 检查数据链路。"""
    import asyncio, time
    from app.core.redis import get_json, get_redis_pool
    from app.models.market_data import KlineData, IndicatorResult
    r = get_redis_pool()
    result: dict = {"symbol": symbol, "steps": {}}
    # 1. 直接读 raw
    for itv in ALL_MODE_KLINE_INTERVALS:
        key = f"klines:{symbol}:{itv}"
        t0 = time.time()
        raw = await get_json(key)
        dt = round(time.time() - t0, 3)
        count = len(raw) if raw and isinstance(raw, list) else 0
        result["steps"][f"get_json_{itv}"] = {"count": count, "time_s": dt}
        # 2. 尝试 model_validate
        if raw and isinstance(raw, list) and count > 0:
            try:
                KlineData.model_validate(raw[0])
                result["steps"][f"validate_{itv}"] = "OK"
            except Exception as e:
                result["steps"][f"validate_{itv}"] = f"FAIL: {e}"
    # 3. 读指标
    for itv in ALL_MODE_KLINE_INTERVALS:
        ind_raw = await get_json(f"indicators:{symbol}:{itv}")
        if ind_raw:
            try:
                IndicatorResult.model_validate(ind_raw)
                result["steps"][f"indicators_{itv}"] = "OK"
            except Exception as e:
                result["steps"][f"indicators_{itv}"] = f"FAIL: {e}"
        else:
            result["steps"][f"indicators_{itv}"] = "MISSING"
    # 4. _safe_get 模拟
    async def _safe_get(coro):
        try:
            return await asyncio.wait_for(coro, timeout=30)
        except Exception as e:
            return f"ERROR: {type(e).__name__}: {e}"
    sg = await _safe_get(get_json(f"klines:{symbol}:5m"))
    if isinstance(sg, str):
        result["steps"]["safe_get_5m"] = sg
    elif sg and isinstance(sg, list):
        result["steps"]["safe_get_5m"] = f"OK: {len(sg)} items"
    else:
        result["steps"]["safe_get_5m"] = f"NULL_OR_EMPTY: type={type(sg)}"
    return result


@app.get("/api/system/data-check", tags=["system"])
async def data_check(symbol: str = "ETHUSDT") -> dict:
    """检查 Redis 中某币种的数据可用性。"""
    from app.core.redis import get_json, get_redis_pool
    result: dict = {"symbol": symbol}
    r = get_redis_pool()
    # klines
    for itv in ALL_MODE_KLINE_INTERVALS:
        key = f"klines:{symbol}:{itv}"
        data = await get_json(key)
        result[f"klines_{itv}"] = len(data) if data and isinstance(data, list) else 0
    # indicators
    for itv in ALL_MODE_KLINE_INTERVALS:
        key = f"indicators:{symbol}:{itv}"
        ind = await get_json(key)
        result[f"indicators_{itv}"] = "EXISTS" if ind else "MISSING"
    # price
    price = await r.get(f"latest_price:{symbol}")
    result["latest_price"] = price
    # onchain / derivatives
    result["onchain"] = "EXISTS" if await get_json(f"onchain:{symbol}") else "MISSING"
    result["derivatives"] = "EXISTS" if await get_json(f"derivatives:{symbol}") else "MISSING"
    return result


@app.get("/api/system/kline-progress", tags=["system"])
async def kline_progress(
    symbols: str = "BTCUSDT,ETHUSDT",
    intervals: str = _DEFAULT_KLINE_INTERVALS_CSV,
) -> dict:
    """查看指定币种 K 线采集与指标联动进度（按周期）。"""
    from app.core.redis import get_json, get_redis_pool

    def _interval_seconds(interval: str) -> int:
        if not interval:
            return 0
        unit = interval[-1].lower()
        try:
            value = int(interval[:-1])
        except Exception:
            return 0

        if unit == "m":
            return value * 60
        if unit == "h":
            return value * 3600
        if unit == "d":
            return value * 86400
        if unit == "w":
            return value * 604800
        return 0

    def _parse_timestamp(value: object) -> int | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            ts = float(value)
            if ts > 1_000_000_000_000:
                ts = ts / 1000
            return int(ts)
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return None
            if raw.isdigit():
                ts = float(raw)
                if ts > 1_000_000_000_000:
                    ts = ts / 1000
                return int(ts)
            try:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return int(dt.timestamp())
            except Exception:
                return None
        return None

    def _extract_latest_epoch(data: object) -> int | None:
        if isinstance(data, list):
            for row in reversed(data):
                if not isinstance(row, dict):
                    continue
                for key in ("close_time", "time", "open_time", "timestamp", "ts"):
                    ts = _parse_timestamp(row.get(key))
                    if ts is not None:
                        return ts
            return None
        if isinstance(data, dict):
            for key in ("time", "close_time", "open_time", "timestamp", "ts"):
                ts = _parse_timestamp(data.get(key))
                if ts is not None:
                    return ts
        return None

    selected_symbols = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    selected_symbols = list(dict.fromkeys(selected_symbols))
    selected_intervals = [i.strip() for i in intervals.split(",") if i.strip()]
    selected_intervals = list(dict.fromkeys(selected_intervals))

    if not selected_symbols:
        from app.services.symbol_registry import get_active_symbols
        selected_symbols = await get_active_symbols()
    if not selected_intervals:
        selected_intervals = list(ALL_MODE_KLINE_INTERVALS)

    sched = getattr(app.state, "kline_scheduler", None)
    redis = get_redis_pool()

    symbols_report: list[dict] = []
    total_slots = len(selected_symbols) * len(selected_intervals)
    ready_slots = 0
    now_ts = int(datetime.now(timezone.utc).timestamp())

    for symbol in selected_symbols:
        interval_rows: list[dict] = []
        symbol_ready = 0

        for interval in selected_intervals:
            kline_key = f"klines:{symbol}:{interval}"
            indicator_key = f"indicators:{symbol}:{interval}"

            kline_data = await get_json(kline_key)
            kline_count = len(kline_data) if isinstance(kline_data, list) else 0
            indicator_data = await get_json(indicator_key)
            indicator_ready = indicator_data is not None

            kline_ttl = await redis.ttl(kline_key)
            indicator_ttl = await redis.ttl(indicator_key)

            interval_sec = _interval_seconds(interval)
            stale_threshold_sec = interval_sec * 2 if interval_sec > 0 else 600

            kline_epoch = _extract_latest_epoch(kline_data)
            indicator_epoch = _extract_latest_epoch(indicator_data)

            kline_age_sec = max(0, now_ts - kline_epoch) if kline_epoch is not None else None
            indicator_age_sec = max(0, now_ts - indicator_epoch) if indicator_epoch is not None else None

            kline_fresh = (
                kline_age_sec is not None and kline_age_sec <= stale_threshold_sec
            )
            indicator_fresh = (
                indicator_age_sec is not None and indicator_age_sec <= stale_threshold_sec
            )

            linked_ready = kline_count > 0 and indicator_ready
            if linked_ready:
                symbol_ready += 1
                ready_slots += 1

            missing_kline = kline_count <= 0
            missing_indicator = not indicator_ready
            stale_kline = (not missing_kline) and (not kline_fresh)
            stale_indicator = (not missing_indicator) and (not indicator_fresh)

            expired_reasons: list[str] = []
            if missing_kline:
                expired_reasons.append("missing_kline")
            if missing_indicator:
                expired_reasons.append("missing_indicator")
            if stale_kline:
                expired_reasons.append("stale_kline")
            if stale_indicator:
                expired_reasons.append("stale_indicator")

            expired = (not linked_ready) or (not kline_fresh) or (not indicator_fresh)

            interval_rows.append({
                "interval": interval,
                "kline_count": kline_count,
                "kline_ttl": kline_ttl,
                "kline_age_sec": kline_age_sec,
                "kline_fresh": kline_fresh,
                "indicator": "EXISTS" if indicator_ready else "MISSING",
                "indicator_ttl": indicator_ttl,
                "indicator_age_sec": indicator_age_sec,
                "indicator_fresh": indicator_fresh,
                "stale_threshold_sec": stale_threshold_sec,
                "linked_ready": linked_ready,
                "missing_kline": missing_kline,
                "missing_indicator": missing_indicator,
                "stale_kline": stale_kline,
                "stale_indicator": stale_indicator,
                "expired": expired,
                "expired_reasons": expired_reasons,
            })

        latest_price = await redis.get(f"latest_price:{symbol}")
        symbol_progress_pct = round((symbol_ready / len(selected_intervals)) * 100, 1)
        symbols_report.append({
            "symbol": symbol,
            "latest_price": latest_price,
            "ready_intervals": symbol_ready,
            "total_intervals": len(selected_intervals),
            "progress_pct": symbol_progress_pct,
            "intervals": interval_rows,
        })

    overall_progress_pct = round((ready_slots / total_slots) * 100, 1) if total_slots else 0.0

    return {
        "running": bool(sched and sched._running),
        "scheduler": {
            "last_collect_at": getattr(sched, "last_collect_at", None),
            "rounds_completed": getattr(sched, "rounds_completed", 0),
            "last_total": getattr(sched, "last_total", 0),
            "last_failed": getattr(sched, "last_failed", 0),
            "last_elapsed_s": getattr(sched, "last_elapsed_s", 0),
        },
        "requested_symbols": selected_symbols,
        "requested_intervals": selected_intervals,
        "progress_pct": overall_progress_pct,
        "ready_slots": ready_slots,
        "total_slots": total_slots,
        "symbols": symbols_report,
    }


@app.get("/api/system/kline-scheduler", tags=["system"])
async def kline_scheduler_status() -> dict:
    """查看 K 线自动采集调度器状态。"""
    from app.services.kline_scheduler import INTERVALS, COLLECT_CYCLE_SEC
    from app.services.symbol_registry import get_active_symbols
    sched = getattr(app.state, "kline_scheduler", None)
    if sched is None:
        return {"running": False, "message": "KlineScheduler 未启动"}
    symbols = await get_active_symbols()
    return {
        "running": sched._running,
        "symbols": symbols,
        "intervals": INTERVALS,
        "cycle_seconds": COLLECT_CYCLE_SEC,
        "rounds_completed": sched.rounds_completed,
        "last_collect_at": sched.last_collect_at,
        "last_total": sched.last_total,
        "last_failed": sched.last_failed,
        "last_elapsed_s": sched.last_elapsed_s,
    }


@app.get("/api/feature-flags", tags=["system"])
async def feature_flags() -> dict[str, bool]:
    """返回功能开关状态。"""
    from app.services.config_service import get_config_value
    task_enabled = (await get_config_value("task_feature_enabled", "true")).lower() == "true"
    partner_enabled = (await get_config_value("partner_feature_enabled", "true")).lower() == "true"
    return {"task": task_enabled, "partner": partner_enabled}
