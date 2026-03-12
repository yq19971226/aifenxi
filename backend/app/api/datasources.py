"""数据源管理 API 路由。

公开端点（无需管理员权限）:
  GET /api/datasources/status

管理员端点:
  GET    /api/admin/datasources
  GET    /api/admin/datasources/{source_id}
  PUT    /api/admin/datasources/combo/toggle
  PUT    /api/admin/datasources/combo/exchanges/{source_id}/toggle
  PUT    /api/admin/datasources/coinglass/toggle
  PUT    /api/admin/datasources/coingecko/toggle
  GET    /api/admin/datasources/health
  POST   /api/admin/datasources/{source_id}/test
  GET    /api/admin/datasources/{source_id}/metrics
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.deps import require_admin
from app.models.datasource import (
    DataSourceStatusSnapshot,
    HealthSummary,
    OperationResult,
)
from app.services.datasource_manager import get_datasource_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["datasources"])


# ── 请求体模型 ─────────────────────────────────────────────────


class ToggleRequest(BaseModel):
    enabled: bool


# ── CoinGlass 双通道运行态（内部辅助）────────────────────────────


async def _build_cg_channel_state() -> dict:
    """构建 CoinGlass 双通道运行态字典。

    Redis 读取与 DB/symbol_registry 预算风险计算彼此独立 fail-soft。
    """
    result: dict = {
        "active_channel": "unknown",
        "switch_reason": "",
        "switched_at": "",
        "locked": "",
        "proxy_daily_usage": 0,
        "proxy_quota_remaining": "",
        "proxy_failures": 0,
        "official_failures": 0,
        "budget_risk": False,
        "budget_risk_reason": "",
        "quota_warning": False,
        "quota_exceeded": False,
        "lock_risk_warning": "",
    }

    # ── 1. Redis 读取（fail-soft：异常只影响 Redis 字段）────────
    try:
        from app.core.redis import get_redis_pool as _get_redis

        redis = _get_redis()
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        pipe = redis.pipeline()
        pipe.get("cg_channel:active")
        pipe.get("cg_channel:switch_reason")
        pipe.get("cg_channel:switched_at")
        pipe.get("cg_channel:locked")
        pipe.get(f"cg_proxy_daily:{date_str}")
        pipe.get("cg_proxy_quota_remaining")
        pipe.get("cg_channel:failures:proxy")
        pipe.get("cg_channel:failures:official")
        values = await pipe.execute()

        result["active_channel"] = values[0] or "unknown"
        result["switch_reason"] = values[1] or ""
        result["switched_at"] = values[2] or ""
        result["locked"] = values[3] or ""
        result["proxy_daily_usage"] = int(values[4] or 0)
        result["proxy_quota_remaining"] = values[5] or ""
        result["proxy_failures"] = int(values[6] or 0)
        result["official_failures"] = int(values[7] or 0)
    except Exception as exc:
        logger.error("coinglass_channel_state_redis_error", extra={"error": str(exc)})
        result["_redis_error"] = str(exc)
        # 不提前 return — 继续计算 budget_risk

    # ── 2. 锁定风险提示（T7.4：proxy 与 official 风险不对称）──
    locked = result.get("locked", "")
    if locked == "proxy":
        result["lock_risk_warning"] = (
            "警告：锁定 proxy 时，proxy 故障将导致持续失败，"
            "系统不会自动降级到 official，直到手动解锁或切换。"
        )
    elif locked == "official":
        result["lock_risk_warning"] = (
            "锁定 official：系统不会自动恢复到 proxy，直到手动解锁。"
        )

    # ── 3. 配额状态（语义分离：quota_warning ≠ quota_exceeded）──
    try:
        from app.data.coinglass_client import (
            _PROXY_DAILY_BUDGET,
            _PROXY_QUOTA_WARNING_THRESHOLD,
        )
    except ImportError:
        _PROXY_DAILY_BUDGET = 30000
        _PROXY_QUOTA_WARNING_THRESHOLD = 24000

    daily = result["proxy_daily_usage"]
    result["quota_exceeded"] = daily >= _PROXY_DAILY_BUDGET
    result["quota_warning"] = (
        daily >= _PROXY_QUOTA_WARNING_THRESHOLD and not result["quota_exceeded"]
    )

    # ── 3. 预算风险（已启用且 has_derivatives=true 的币种 > 3）──
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.symbol_registry import SymbolRegistry

        async with AsyncSessionLocal() as session:
            reg = SymbolRegistry(session)
            symbols = await reg.list_symbols(enabled_only=True)
            derivatives_count = sum(1 for s in symbols if s.has_derivatives)
            if derivatives_count > 3:
                result["budget_risk"] = True
                result["budget_risk_reason"] = (
                    f"已启用 {derivatives_count} 个衍生品币种，"
                    f"超过 proxy 安全预算范围（≤3）"
                )
    except Exception as exc:
        logger.warning("coinglass_budget_risk_check_error", extra={"error": str(exc)})

    return result


async def _build_coinglass_rest_health_entry(
    cg_runtime: dict,
    existing: dict | None = None,
) -> dict:
    mgr = get_datasource_manager()
    rest_src = await mgr._registry.get_source("coinglass_rest")

    ch = cg_runtime.get("active_channel", "unknown")
    if "_redis_error" in cg_runtime:
        status = rest_src.status.value if rest_src else "disabled"
    elif ch == "unknown":
        status = "disabled"
    elif cg_runtime.get("quota_exceeded", False):
        status = "stale"
    elif (
        cg_runtime.get("proxy_failures", 0) >= 3
        and cg_runtime.get("official_failures", 0) >= 3
    ):
        status = "error"
    else:
        status = "enabled"

    previous = existing or {}
    connected = ch != "unknown" and status != "error"

    return {
        "source_id": "coinglass_rest",
        "connected": connected,
        "status": status,
        "last_message_at": previous.get("last_message_at"),
        "message_rate": previous.get("message_rate", 0.0),
        "reconnect_count": previous.get("reconnect_count", 0),
        "error_count": (
            cg_runtime.get("proxy_failures", 0)
            + cg_runtime.get("official_failures", 0)
        ),
        "circuit_breaker_state": previous.get("circuit_breaker_state", "closed"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "channel_runtime": cg_runtime,
    }


# ── 公开端点 ──────────────────────────────────────────────────


@router.get(
    "/api/datasources/status",
    response_model=DataSourceStatusSnapshot,
    summary="获取数据源状态（公开）",
    description="返回当前数据源启用状态和信号完整度评分，无需管理员权限。从 Redis 缓存读取，响应时间 < 100ms。",
)
async def get_datasource_status() -> DataSourceStatusSnapshot:
    manager = get_datasource_manager()
    return await manager.get_status_snapshot()


# ── 管理员端点 ─────────────────────────────────────────────────


@router.get(
    "/api/admin/datasources",
    summary="获取所有数据源组（管理员）",
    description="返回所有数据源组列表，含健康指标。",
    dependencies=[Depends(require_admin)],
)
async def list_datasource_groups() -> dict:
    manager = get_datasource_manager()
    groups = await manager._registry.get_all_groups()
    score = await manager.get_completeness_score()
    return {
        "groups": [g.model_dump() for g in groups],
        "completeness_score": score,
    }


@router.get(
    "/api/admin/datasources/health",
    summary="获取所有数据源健康状态（管理员）",
    description=(
        "返回所有数据源的实时健康指标汇总，包含消息速率、熔断器状态等。"
        "CoinGlass REST 双通道运行态会写入 sources['coinglass_rest'].channel_runtime，"
        "顶层 coinglass_channel_runtime 保留为兼容别名。"
    ),
    dependencies=[Depends(require_admin)],
)
async def get_datasource_health(request: "Request") -> dict:
    monitor = getattr(request.app.state, "health_monitor", None)
    if monitor is None:
        from app.services.health_monitor import HealthMonitor
        monitor = HealthMonitor()
        manager = get_datasource_manager()
        monitor.set_manager(manager)
    summary = await monitor.get_health_summary()

    payload = summary.model_dump(mode="json")
    cg_runtime = await _build_cg_channel_state()

    # ── coinglass_rest 条目合成 ────────────────────────────────
    # REST 数据源无持久连接器，不在 HealthMonitor._connectors 中，
    # 因此 check_all() 不会产生 coinglass_rest 条目。
    # 此处基于注册表元数据 + Redis 通道状态保守合成。
    sources = payload.setdefault("sources", {})
    sources["coinglass_rest"] = await _build_coinglass_rest_health_entry(
        cg_runtime,
        existing=sources.get("coinglass_rest"),
    )

    # 顶层兼容别名（向后兼容，不删除）
    payload["coinglass_channel_runtime"] = cg_runtime
    return payload


@router.get(
    "/api/admin/datasources/coinglass/channel",
    summary="获取 CoinGlass 双通道运行态（管理员）",
    description="返回 CoinGlass REST 双通道的当前活跃通道、切换原因、锁定状态、proxy 日用量等运行态元数据。",
    dependencies=[Depends(require_admin)],
)
async def get_coinglass_channel_state() -> dict:
    return await _build_cg_channel_state()


@router.get(
    "/api/admin/datasources/{source_id}",
    summary="获取单个数据源详情（管理员）",
    description="返回指定数据源的频道列表、连接参数、健康指标等详情。",
    dependencies=[Depends(require_admin)],
)
async def get_datasource_detail(source_id: str) -> dict:
    manager = get_datasource_manager()
    src = await manager._registry.get_source(source_id)
    if src is None:
        raise HTTPException(status_code=404, detail=f"数据源 '{source_id}' 未找到")

    # 读取健康状态
    from app.core.redis import get_json
    health = await get_json(f"ds:health:{source_id}")

    # 获取连接器订阅频道（若已运行）
    connector = manager._connectors.get(source_id)
    subscribed: list[str] = []
    if connector is not None and hasattr(connector, "_channels"):
        subscribed = list(connector._channels)  # type: ignore[attr-defined]

    return {
        "source_id": src.source_id,
        "name": src.name,
        "source_type": src.source_type.value,
        "base_url": src.base_url,
        "channels": src.channels,
        "subscribed_channels": subscribed,
        "auth_method": src.auth_method,
        "status": src.status.value,
        "enabled": src.enabled,
        "weight": src.weight,
        "health": health,
    }


@router.put(
    "/api/admin/datasources/combo/toggle",
    response_model=OperationResult,
    summary="组合级开关（管理员）",
    description="启用或关闭整个 Exchange_Direct_Combo 组合。关闭后所有四个交易所停止采集并清理 Redis 缓存。",
    dependencies=[Depends(require_admin)],
)
async def toggle_combo(body: ToggleRequest) -> OperationResult:
    manager = get_datasource_manager()
    result = await manager.set_combo_enabled(body.enabled)
    if not result.success:
        raise HTTPException(status_code=500, detail=result.message)
    return result


@router.put(
    "/api/admin/datasources/combo/exchanges/{source_id}/toggle",
    response_model=OperationResult,
    summary="交易所级开关（管理员）",
    description=(
        "启用或关闭 Exchange_Direct_Combo 内单个交易所。"
        "关闭时自动清理该交易所的 Redis 缓存并重新计算信号完整度评分。"
        "组合级开关处于 disabled 时，无法启用单个交易所。"
    ),
    dependencies=[Depends(require_admin)],
)
async def toggle_exchange(source_id: str, body: ToggleRequest) -> OperationResult:
    valid_ids = {"binance_futures"}
    if source_id not in valid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 source_id '{source_id}'，可选: {sorted(valid_ids)}",
        )
    manager = get_datasource_manager()
    result = await manager.set_exchange_enabled(source_id, body.enabled)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result


@router.put(
    "/api/admin/datasources/coinglass/toggle",
    response_model=OperationResult,
    summary="CoinGlass 开关（管理员）",
    description="启用或关闭 CoinGlass 付费数据源。保留 TierManager 套餐分层逻辑。",
    dependencies=[Depends(require_admin)],
)
async def toggle_coinglass(body: ToggleRequest) -> OperationResult:
    manager = get_datasource_manager()
    result = await manager.set_coinglass_enabled(body.enabled)
    if not result.success:
        raise HTTPException(status_code=500, detail=result.message)
    return result


@router.put(
    "/api/admin/datasources/coingecko/toggle",
    response_model=OperationResult,
    summary="CoinGecko 开关（管理员）",
    description="启用或关闭 CoinGecko 数据源。保留 TierManager 套餐分层逻辑。",
    dependencies=[Depends(require_admin)],
)
async def toggle_coingecko(body: ToggleRequest) -> OperationResult:
    manager = get_datasource_manager()
    registry = manager._registry
    gecko_group = await registry.get_group("coingecko_source")
    if gecko_group is None:
        return OperationResult(success=False, message="CoinGecko 数据源组未注册")

    await registry.set_group_enabled("coingecko_source", body.enabled)
    # 同步子源开关
    gecko_src = await registry.get_source("coingecko")
    if gecko_src:
        gecko_src.enabled = body.enabled

    logger.info("coingecko_toggled", extra={"enabled": body.enabled})
    return OperationResult(
        success=True,
        message=f"CoinGecko 已{'开启' if body.enabled else '关闭'}",
    )


@router.post(
    "/api/admin/datasources/{source_id}/test",
    response_model=OperationResult,
    summary="测试数据源连接（管理员）",
    description="对指定数据源发起实际 HTTP/WebSocket 连接测试，验证网络可达性和 API Key 有效性。",
    dependencies=[Depends(require_admin)],
)
async def test_datasource_connection(source_id: str) -> OperationResult:
    import httpx
    from app.services.config_service import get_config_value

    # 定义各数据源的测试配置
    test_configs: dict[str, dict] = {
        "binance_futures": {
            "url": "https://fapi.binance.com/fapi/v1/ping",
            "headers": {},
            "key_config": None,
            "label": "Binance Futures REST",
        },
        "coinglass_ws": {
            "url": "https://open-api-v4.coinglass.com/api/futures/supported-coins",
            "headers": {},
            "key_config": "coinglass_api_key",
            "key_header": "CG-API-KEY",
            "label": "CoinGlass API",
        },
        "coinglass_rest": {
            "url": "https://open-api-v4.coinglass.com/api/futures/supported-coins",
            "headers": {},
            "key_config": "coinglass_api_key",
            "key_header": "CG-API-KEY",
            "label": "CoinGlass Official API",
        },
        "alphanode_proxy": {
            "url": "https://api.alphanode.work/open-api-v4.coinglass.com/api/futures/supported-coins",
            "headers": {},
            "key_config": "alphanode_api_key",
            "key_header": "x-key",
            "label": "AlphaNode Proxy",
        },
        "cryptoquant": {
            "url": "https://api.cryptoquant.com/v1/btc/market-indicator/mvrv?window=day&limit=1",
            "headers": {},
            "key_config": "cryptoquant_api_key",
            "key_param": "api_key",
            "label": "CryptoQuant API",
        },
        "fred": {
            "url": "https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&file_type=json&sort_order=desc&limit=1",
            "headers": {},
            "key_config": "fred_api_key",
            "key_param": "api_key",
            "label": "FRED API",
        },
        "coingecko": {
            "url": "https://api.coingecko.com/api/v3/ping",
            "headers": {},
            "key_config": "coingecko_api_key",
            "key_header": "x-cg-demo-api-key",
            "label": "CoinGecko API",
        },
        "finnhub": {
            "url": "https://finnhub.io/api/v1/news?category=crypto",
            "headers": {},
            "key_config": "finnhub_api_key",
            "key_param": "token",
            "label": "Finnhub API",
        },
        "finnhub_news": {  # 前端别名
            "url": "https://finnhub.io/api/v1/news?category=crypto",
            "headers": {},
            "key_config": "finnhub_api_key",
            "key_param": "token",
            "label": "Finnhub News API",
        },
        "blockbeats": {
            "url": "https://api.theblockbeats.news/v1/open-api/open-flash?size=1&page=1&type=push",
            "headers": {},
            "key_config": None,
            "label": "BlockBeats API",
        },
        "alternative_me": {
            "url": "https://api.alternative.me/fng/?limit=1",
            "headers": {},
            "key_config": None,
            "label": "Alternative.me API",
        },
        "glassnode": {
            "url": "https://api.glassnode.com/v1/metrics/market/price_usd_close?a=BTC&i=24h",
            "headers": {},
            "key_config": "glassnode_api_key",
            "key_param": "api_key",
            "label": "GlassNode API",
        },
    }

    config = test_configs.get(source_id)
    if config is None:
        raise HTTPException(status_code=400, detail=f"不支持测试 '{source_id}'")

    label = config["label"]
    url = config["url"]
    headers = dict(config.get("headers", {}))
    headers["accept"] = "application/json"

    # 如果需要 API Key，从配置中读取
    key_config = config.get("key_config")
    if key_config:
        api_key = await get_config_value(key_config, "")
        if not api_key:
            return OperationResult(
                success=False,
                message=f"{label} 未配置 API Key（{key_config}），请先在密钥管理中填写",
            )
        # API Key 放 header 或 query param
        if "key_header" in config:
            headers[config["key_header"]] = api_key
        elif "key_param" in config:
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}{config['key_param']}={api_key}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code < 400:
                return OperationResult(
                    success=True,
                    message=f"{label} 连接成功（HTTP {resp.status_code}）",
                )
            else:
                body_preview = resp.text[:200] if resp.text else ""
                return OperationResult(
                    success=False,
                    message=f"{label} 返回错误（HTTP {resp.status_code}）：{body_preview}",
                )
    except httpx.TimeoutException:
        return OperationResult(success=False, message=f"{label} 连接超时（15s）")
    except Exception as exc:
        return OperationResult(success=False, message=f"{label} 连接失败：{str(exc)[:200]}")


@router.get(
    "/api/admin/datasources/{source_id}/metrics",
    summary="获取数据源消息速率趋势（管理员）",
    description="返回指定数据源最近 1 小时的消息速率趋势（从 Redis 健康缓存读取）。",
    dependencies=[Depends(require_admin)],
)
async def get_source_metrics(source_id: str) -> dict:
    manager = get_datasource_manager()
    src = await manager._registry.get_source(source_id)
    if src is None:
        raise HTTPException(status_code=404, detail=f"数据源 '{source_id}' 未找到")

    from app.core.redis import get_json
    health = await get_json(f"ds:health:{source_id}")

    # 从连接器读取速率历史（最近 1 小时）
    rate_history: list[dict] = []
    connector = manager._connectors.get(source_id)
    if connector is not None and hasattr(connector, "get_rate_history"):
        rate_history = connector.get_rate_history()  # type: ignore[attr-defined]

    return {
        "source_id": source_id,
        "current_message_rate": health.get("message_rate", 0.0) if health else 0.0,
        "last_message_at": health.get("last_message_at") if health else None,
        "reconnect_count": health.get("reconnect_count", 0) if health else 0,
        "error_count": health.get("error_count", 0) if health else 0,
        "circuit_breaker_state": health.get("circuit_breaker_state", "closed") if health else "closed",
        "rate_history": rate_history,
    }


# ── 通用数据源组开关 ─────────────────────────────────────────────


_VALID_GROUPS = {"onchain_sources", "coingecko_source"}


@router.put(
    "/api/admin/datasources/group/{group_id}/toggle",
    response_model=OperationResult,
    summary="通用组级开关（管理员）",
    description="启用或关闭指定数据源组（新闻/链上/情绪）。关闭组后该组内所有采集器停止采集。",
    dependencies=[Depends(require_admin)],
)
async def toggle_group(group_id: str, body: ToggleRequest) -> OperationResult:
    if group_id not in _VALID_GROUPS:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 group_id '{group_id}'，可选: {sorted(_VALID_GROUPS)}",
        )
    manager = get_datasource_manager()
    registry = manager._registry
    group = await registry.get_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail=f"数据源组 '{group_id}' 未找到")

    await registry.set_group_enabled(group_id, body.enabled)
    logger.info("group_toggled", extra={"group_id": group_id, "enabled": body.enabled})
    return OperationResult(
        success=True,
        message=f"{group.name} 已{'开启' if body.enabled else '关闭'}",
    )


@router.put(
    "/api/admin/datasources/group/{group_id}/{source_id}/toggle",
    response_model=OperationResult,
    summary="通用子数据源级开关（管理员）",
    description="启用或关闭指定组内的单个数据源采集器。组级开关关闭时无法启用子数据源。",
    dependencies=[Depends(require_admin)],
)
async def toggle_collector(group_id: str, source_id: str, body: ToggleRequest) -> OperationResult:
    if group_id not in _VALID_GROUPS:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 group_id '{group_id}'，可选: {sorted(_VALID_GROUPS)}",
        )
    manager = get_datasource_manager()
    registry = manager._registry
    group = await registry.get_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail=f"数据源组 '{group_id}' 未找到")

    # 组关闭时不允许开启子数据源
    if body.enabled and not group.enabled:
        raise HTTPException(
            status_code=400,
            detail=f"组 '{group.name}' 已关闭，请先开启组级开关",
        )

    src = await registry.get_source(source_id)
    if src is None:
        raise HTTPException(status_code=404, detail=f"数据源 '{source_id}' 未找到")

    # 验证 source_id 属于该组
    valid_ids = {s.source_id for s in group.sources}
    if source_id not in valid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"数据源 '{source_id}' 不属于组 '{group_id}'",
        )

    await registry.set_collector_enabled(group_id, source_id, body.enabled)
    logger.info(
        "collector_toggled",
        extra={"group_id": group_id, "source_id": source_id, "enabled": body.enabled},
    )
    return OperationResult(
        success=True,
        message=f"{src.name} 已{'开启' if body.enabled else '关闭'}",
        source_id=source_id,
    )
