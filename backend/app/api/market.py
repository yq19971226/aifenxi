"""市场数据 API 路由 — 只做参数校验和响应格式化。

数据查询通过 MarketService 完成，路由层不直接调用数据库。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.core.mode_contract import ALL_MODE_KLINE_INTERVALS
from app.core.database import get_db
from app.data.binance_rest import BinanceRestClient
from app.data.indicators import IndicatorCalculator
from app.services.market import KlineRecord, IndicatorRecord, MarketService
from app.services.market_regime import MarketRegime, detect_market_regime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["market"])
_binance = BinanceRestClient()
_indicator_calc = IndicatorCalculator()

_market_service = MarketService()
_DEFAULT_WARMUP_INTERVALS = ",".join(ALL_MODE_KLINE_INTERVALS)


@router.get("/klines", response_model=list[KlineRecord])
async def get_klines(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对，如 BTCUSDT"),
    interval: str = Query("1h", pattern=r"^(1m|5m|15m|1h|4h|1d|1w)$", description="K线周期"),
    limit: int = Query(100, ge=1, le=1000, description="返回条数"),
    session: AsyncSession = Depends(get_db),
) -> list[KlineRecord]:
    """查询 K 线数据（时间升序）。"""
    try:
        return await _market_service.get_klines(session, symbol, interval, limit)
    except Exception as exc:
        logger.error("get_klines failed", extra={"symbol": symbol, "error": str(exc)})
        raise HTTPException(status_code=500, detail="查询K线数据失败")


@router.get("/indicators", response_model=IndicatorRecord | None)
async def get_indicators(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对，如 BTCUSDT"),
    interval: str = Query("1h", pattern=r"^(1m|5m|15m|1h|4h|1d|1w)$", description="K线周期"),
    session: AsyncSession = Depends(get_db),
) -> IndicatorRecord | None:
    """查询最新技术指标。"""
    try:
        return await _market_service.get_latest_indicators(session, symbol, interval)
    except Exception as exc:
        logger.error("get_indicators failed", extra={"symbol": symbol, "error": str(exc)})
        raise HTTPException(status_code=500, detail="查询指标数据失败")


@router.get("/market/regime", response_model=MarketRegime)
async def get_market_regime(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对，如 BTCUSDT"),
    interval: str = Query("1h", pattern=r"^(5m|15m|1h|4h|1d|1w)$", description="K线周期"),
) -> MarketRegime:
    """快速检测当前市场状态（震荡/趋势/高波动）。

    使用 Binance REST 实时拉取 K 线，无需登录。
    """
    try:
        klines = await _binance.fetch_klines(symbol.upper(), interval, limit=100)
        return detect_market_regime(klines, symbol.upper())
    except Exception as exc:
        logger.error("market regime detection failed", extra={"symbol": symbol, "error": str(exc)})
        raise HTTPException(status_code=500, detail="市场状态检测失败")


@router.post("/market/warmup", tags=["market"])
async def warmup_market_data(
    symbol: str = Query("BTCUSDT", description="交易对"),
    intervals: str = Query(_DEFAULT_WARMUP_INTERVALS, description="逗号分隔的周期列表"),
) -> dict:
    """手动预热：从 Binance REST 拉取 K 线并缓存到 Redis，供分析引擎使用。"""
    from app.core.redis import set_with_ttl

    results: dict[str, int] = {}
    itv_list = [s.strip() for s in intervals.split(",") if s.strip()]

    for itv in itv_list:
        try:
            klines = await _binance.fetch_klines(symbol.upper(), itv, limit=200)
            cache_key = f"klines:{symbol.upper()}:{itv}"
            data = [k.model_dump(mode="json") for k in klines]
            await set_with_ttl(cache_key, data, ttl_seconds=600)

            # 同步计算并缓存指标，避免 warmup 后分析阶段出现指标缺失
            if klines:
                indicators = _indicator_calc.calculate_all(klines)
                await set_with_ttl(
                    f"indicators:{symbol.upper()}:{itv}",
                    indicators.model_dump(mode="json"),
                    ttl_seconds=600,
                )

            results[itv] = len(klines)

            if klines:
                await set_with_ttl(f"latest_price:{symbol.upper()}", klines[-1].close, ttl_seconds=300)
        except Exception as exc:
            logger.error("warmup failed", extra={"symbol": symbol, "interval": itv, "error": str(exc)})
            results[itv] = -1

    return {"symbol": symbol.upper(), "cached": results}


@router.get("/market/test-analysis", tags=["market"])
async def test_analysis(
    symbol: str = Query("ETHUSDT"),
    mode: str = Query("intraday"),
) -> StreamingResponse:
    """调试用：无需认证的分析 SSE 测试。"""
    from uuid import UUID
    from app.models.analysis import AnalysisMode
    from app.services.analysis_orchestrator import AnalysisOrchestrator

    mode_enum = AnalysisMode(mode)
    orch = AnalysisOrchestrator()
    return StreamingResponse(
        orch.run_analysis(
            user_id=UUID("00000000-0000-0000-0000-000000000001"),
            level=2,
            symbol=symbol.upper(),
            mode=mode_enum,
            force_refresh=True,
        ),
        media_type="text/event-stream",
    )


@router.get("/indicators/list", response_model=list[IndicatorRecord])
async def get_indicators_list(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对，如 BTCUSDT"),
    interval: str = Query("1h", pattern=r"^(1m|5m|15m|1h|4h|1d|1w)$", description="K线周期"),
    limit: int = Query(200, ge=1, le=1000, description="返回条数"),
    session: AsyncSession = Depends(get_db),
) -> list[IndicatorRecord]:
    """查询指标时间序列（时间升序），用于 EMA 均线叠加。"""
    try:
        return await _market_service.get_indicators_list(session, symbol, interval, limit)
    except Exception as exc:
        logger.error("get_indicators_list failed", extra={"symbol": symbol, "error": str(exc)})
        raise HTTPException(status_code=500, detail="查询指标序列失败")
