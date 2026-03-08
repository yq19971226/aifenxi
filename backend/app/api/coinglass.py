"""CoinGlass 数据 API 路由。

- GET /api/coinglass/tier-capabilities     — 当前套餐能力矩阵
- GET /api/coinglass/oi/{symbol}           — OI 快照数据
- GET /api/coinglass/net-position/{symbol} — 净持仓数据（Startup+）
- GET /api/coinglass/taker/{symbol}        — Taker Volume 数据（Standard+）
- GET /api/coinglass/heatmap/{symbol}      — 爆仓热力图数据
- GET /api/coinglass/kill-alerts/{symbol}  — 点杀预警历史
- GET /api/coinglass/kill-alerts/latest    — 最新点杀预警
- GET /api/coinglass/cvd/{symbol}          — CVD 累计成交量差
- GET /api/coinglass/netflow/{symbol}      — 期货净流入/流出
- GET /api/coinglass/orderbook/{symbol}    — 订单簿 Bid/Ask 分布
- GET /api/coinglass/large-orders/{symbol} — 大单挂单
- GET /api/coinglass/funding-rate/{symbol} — 资金费率历史
- GET /api/coinglass/options/{symbol}      — 期权数据
"""

from datetime import datetime, timezone
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user, require_level
from app.core.redis import get_json
from app.data.coinglass_tier import TierManager
from app.models.coinglass import TierCapabilities

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/coinglass", tags=["coinglass"])

_tier_manager = TierManager()


def _format_json_timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


async def _load_oi_snapshots_from_db(
    session: AsyncSession,
    symbol: str,
) -> list[dict[str, Any]] | None:
    result = await session.execute(
        text(
            """
            SELECT ts, symbol, exchange, open_interest,
                   oi_change_1h, oi_change_4h, oi_change_24h, source
            FROM oi_snapshots
            WHERE symbol = :symbol
            ORDER BY ts DESC
            """
        ),
        {"symbol": symbol},
    )
    rows = result.mappings().all()
    if not rows:
        return None
    return [
        {
            "ts": _format_json_timestamp(row["ts"]),
            "symbol": row["symbol"],
            "exchange": row["exchange"],
            "open_interest": float(row["open_interest"]),
            "oi_change_1h": float(row["oi_change_1h"]) if row["oi_change_1h"] is not None else None,
            "oi_change_4h": float(row["oi_change_4h"]) if row["oi_change_4h"] is not None else None,
            "oi_change_24h": float(row["oi_change_24h"]) if row["oi_change_24h"] is not None else None,
            "source": row["source"],
        }
        for row in rows
    ]


async def _load_taker_snapshots_from_db(
    session: AsyncSession,
    symbol: str,
) -> list[dict[str, Any]] | None:
    result = await session.execute(
        text(
            """
            SELECT ts, symbol, buy_volume, sell_volume, buy_sell_ratio, source
            FROM taker_volume_snapshots
            WHERE symbol = :symbol
            ORDER BY ts DESC
            """
        ),
        {"symbol": symbol},
    )
    rows = result.mappings().all()
    if not rows:
        return None
    return [
        {
            "ts": _format_json_timestamp(row["ts"]),
            "symbol": row["symbol"],
            "buy_volume": float(row["buy_volume"]),
            "sell_volume": float(row["sell_volume"]),
            "buy_sell_ratio": float(row["buy_sell_ratio"]) if row["buy_sell_ratio"] is not None else None,
            "source": row["source"],
        }
        for row in rows
    ]


@router.get("/tier-capabilities")
async def get_tier_capabilities(
    user: UserInfo = Depends(get_current_user),
) -> TierCapabilities:
    """返回当前 CoinGlass 套餐的能力矩阵。"""
    try:
        tier = await _tier_manager.get_current_tier()
        return _tier_manager.get_capabilities(tier)
    except Exception as exc:
        logger.error("获取套餐能力矩阵失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取套餐能力矩阵失败",
        )


@router.get("/oi/{symbol}")
async def get_oi_snapshot(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """获取最新 OI 快照数据（从 Redis 缓存读取）。"""
    symbol = symbol.upper()
    try:
        data = await get_json(f"cg_oi:{symbol}")
    except Exception as exc:
        logger.error("读取 OI 缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取 OI 数据失败",
        )

    if data is None:
        try:
            data = await _load_oi_snapshots_from_db(session, symbol)
        except Exception as exc:
            logger.error("查询 OI 快照失败: symbol=%s, %s", symbol, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="读取 OI 数据失败",
            )

    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的 OI 数据",
        )
    return data


@router.get("/net-position/{symbol}")
async def get_net_position(
    symbol: str,
    user: UserInfo = Depends(require_level(1)),
) -> list[dict[str, Any]]:
    """获取净持仓数据（Startup+ 套餐）。从 Redis 缓存读取。"""
    symbol = symbol.upper()

    # 检查 CoinGlass 套餐是否支持 net_position 功能
    try:
        tier = await _tier_manager.get_current_tier()
    except Exception as exc:
        logger.error("读取套餐信息失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取套餐信息失败",
        )

    if not _tier_manager.is_feature_enabled(tier, "net_position"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="当前 CoinGlass 套餐不支持净持仓功能",
        )

    try:
        data = await get_json(f"cg_net_position:{symbol}")
    except Exception as exc:
        logger.error("读取净持仓缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取净持仓数据失败",
        )

    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的净持仓数据",
        )
    return data


@router.get("/taker/{symbol}")
async def get_taker_volume(
    symbol: str,
    user: UserInfo = Depends(require_level(1)),
    session: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """获取 Taker Volume 数据（Standard+ 套餐）。从 Redis 缓存读取。"""
    symbol = symbol.upper()

    # 检查 CoinGlass 套餐是否支持 taker_volume 功能
    try:
        tier = await _tier_manager.get_current_tier()
    except Exception as exc:
        logger.error("读取套餐信息失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取套餐信息失败",
        )

    if not _tier_manager.is_feature_enabled(tier, "taker_volume"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="当前 CoinGlass 套餐不支持 Taker Volume 功能",
        )

    try:
        data = await get_json(f"cg_taker:{symbol}")
    except Exception as exc:
        logger.error("读取 Taker 缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取 Taker Volume 数据失败",
        )

    if data is None:
        try:
            data = await _load_taker_snapshots_from_db(session, symbol)
        except Exception as exc:
            logger.error("查询 Taker 快照失败: symbol=%s, %s", symbol, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="读取 Taker Volume 数据失败",
            )

    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的 Taker Volume 数据",
        )
    return data


@router.get("/heatmap/{symbol}")
async def get_heatmap(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """获取爆仓热力图数据（从 Redis 缓存读取）。"""
    symbol = symbol.upper()
    try:
        data = await get_json(f"cg_liquidation:{symbol}")
    except Exception as exc:
        logger.error("读取热力图缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取热力图数据失败",
        )

    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的热力图数据",
        )
    return data



@router.get("/kill-alerts/latest")
async def get_latest_kill_alerts(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """获取最新点杀预警（跨所有币种，最多 10 条）。"""
    try:
        result = await session.execute(
            text(
                "SELECT ts, symbol, direction, risk_score, version, "
                "oi_change_pct, taker_ratio, ls_ratio, nearest_liq_usd, details "
                "FROM kill_zone_alerts ORDER BY ts DESC LIMIT 10"
            ),
        )
        rows = result.mappings().all()
    except Exception as exc:
        logger.error("查询最新点杀预警失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="查询点杀预警失败",
        )

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="暂无点杀预警数据",
        )
    return [dict(r) for r in rows]


@router.get("/kill-alerts/{symbol}")
async def get_kill_alerts_by_symbol(
    symbol: str,
    limit: int = Query(default=20, ge=1, le=100),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """获取指定币种的点杀预警历史。"""
    symbol = symbol.upper()
    try:
        result = await session.execute(
            text(
                "SELECT ts, symbol, direction, risk_score, version, "
                "oi_change_pct, taker_ratio, ls_ratio, nearest_liq_usd, details "
                "FROM kill_zone_alerts WHERE symbol = :symbol "
                "ORDER BY ts DESC LIMIT :limit"
            ),
            {"symbol": symbol, "limit": limit},
        )
        rows = result.mappings().all()
    except Exception as exc:
        logger.error("查询点杀预警失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="查询点杀预警失败",
        )

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的点杀预警数据",
        )
    return [dict(r) for r in rows]


# ── 新增端点：CVD / NetFlow / OrderBook / LargeOrders / FundingRate / Options ──


@router.get("/cvd/{symbol}")
async def get_cvd(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """获取 CVD 累计成交量差数据（从 Redis 缓存读取）。"""
    symbol = symbol.upper()
    try:
        data = await get_json(f"cg_cvd:{symbol}")
    except Exception as exc:
        logger.error("读取 CVD 缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取 CVD 数据失败",
        )
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的 CVD 数据",
        )
    return data


@router.get("/netflow/{symbol}")
async def get_netflow(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """获取期货净流入/流出数据（从 Redis 缓存读取）。"""
    symbol = symbol.upper()
    try:
        data = await get_json(f"cg_netflow:{symbol}")
    except Exception as exc:
        logger.error("读取 NetFlow 缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取净流入数据失败",
        )
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的净流入数据",
        )
    return data


@router.get("/orderbook/{symbol}")
async def get_orderbook(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """获取订单簿 Bid/Ask 分布数据（从 Redis 缓存读取）。"""
    symbol = symbol.upper()
    try:
        data = await get_json(f"cg_orderbook:{symbol}")
    except Exception as exc:
        logger.error("读取订单簿缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取订单簿数据失败",
        )
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的订单簿数据",
        )
    return data


@router.get("/large-orders/{symbol}")
async def get_large_orders(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """获取大单挂单数据（从 Redis 缓存读取）。"""
    symbol = symbol.upper()
    try:
        data = await get_json(f"cg_large_orders:{symbol}")
    except Exception as exc:
        logger.error("读取大单缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取大单数据失败",
        )
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的大单数据",
        )
    return data


@router.get("/funding-rate/{symbol}")
async def get_funding_rate(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """获取资金费率历史数据（从 Redis 缓存读取）。"""
    symbol = symbol.upper()
    try:
        data = await get_json(f"cg_fr:{symbol}")
    except Exception as exc:
        logger.error("读取资金费率缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取资金费率数据失败",
        )
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的资金费率数据",
        )
    return data


@router.get("/options/{symbol}")
async def get_options(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> dict[str, Any]:
    """获取期权数据（Max Pain + 概览，从 Redis 缓存读取）。"""
    symbol = symbol.upper()
    max_pain = None
    info = None
    try:
        max_pain = await get_json(f"cg_option_maxpain:{symbol}")
        info = await get_json(f"cg_option_info:{symbol}")
    except Exception as exc:
        logger.error("读取期权缓存失败: symbol=%s, %s", symbol, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取期权数据失败",
        )
    if max_pain is None and info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的期权数据",
        )
    return {"max_pain": max_pain, "info": info}
