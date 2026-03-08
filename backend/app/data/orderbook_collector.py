"""订单簿快照采集器 — 通过 Binance REST API 定时采集深度数据写入 Redis。

采集方式：REST 轮询（每 10 秒），而非 WebSocket 长连接。
  - 优点：简单可靠，无需维护连接状态
  - 缺点：延迟略高（对 OrderBookAgent 的分析频率足够）

Redis 缓存键：orderbook:{symbol}（TTL=15s）
数据格式：与 OrderBookAgent 期望的格式一致。
"""

import asyncio
import logging

import httpx

from app.core.redis import init_redis, set_with_ttl

logger = logging.getLogger(__name__)

_BINANCE_DEPTH_URL = "https://fapi.binance.com/fapi/v1/depth"
_REQUEST_TIMEOUT = 10.0
_CACHE_TTL = 60  # seconds
_DEPTH_LIMIT = 20  # 档位数量


async def collect_orderbook_snapshot(symbol: str) -> dict | None:
    """从 Binance Futures 获取订单簿快照并缓存到 Redis。

    Args:
        symbol: 交易对，如 "BTCUSDT"

    Returns:
        缓存的订单簿数据字典，或 None（失败时）
    """
    from app.data.source_gate import is_enabled
    if not await is_enabled("binance_futures"):
        return None

    symbol = symbol.upper()

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.get(
                _BINANCE_DEPTH_URL,
                params={"symbol": symbol, "limit": str(_DEPTH_LIMIT)},
            )
            resp.raise_for_status()
            data = resp.json()

        bids = data.get("bids", [])
        asks = data.get("asks", [])

        if not bids or not asks:
            logger.warning("Empty orderbook", extra={"symbol": symbol})
            return None

        # 计算关键统计指标（供 OrderBookAgent 使用）
        bid_prices = [float(b[0]) for b in bids]
        ask_prices = [float(a[0]) for a in asks]
        bid_qtys = [float(b[1]) for b in bids]
        ask_qtys = [float(a[1]) for a in asks]

        best_bid = bid_prices[0]
        best_ask = ask_prices[0]
        spread = best_ask - best_bid
        spread_pct = (spread / best_ask * 100) if best_ask > 0 else 0
        total_bid_qty = sum(bid_qtys)
        total_ask_qty = sum(ask_qtys)
        bid_ask_ratio = (total_bid_qty / total_ask_qty) if total_ask_qty > 0 else 1.0

        # 检测大单（超过平均量 5 倍）
        avg_qty = (total_bid_qty + total_ask_qty) / (len(bid_qtys) + len(ask_qtys)) if (bid_qtys or ask_qtys) else 0
        large_bids = [
            {"price": bid_prices[i], "qty": bid_qtys[i]}
            for i in range(len(bid_qtys))
            if avg_qty > 0 and bid_qtys[i] > avg_qty * 5
        ]
        large_asks = [
            {"price": ask_prices[i], "qty": ask_qtys[i]}
            for i in range(len(ask_qtys))
            if avg_qty > 0 and ask_qtys[i] > avg_qty * 5
        ]

        snapshot = {
            "symbol": symbol,
            "best_bid": best_bid,
            "best_ask": best_ask,
            "spread": round(spread, 8),
            "spread_pct": round(spread_pct, 6),
            "bid_ask_ratio": round(bid_ask_ratio, 4),
            "total_bid_qty": round(total_bid_qty, 4),
            "total_ask_qty": round(total_ask_qty, 4),
            "bids": [[float(b[0]), float(b[1])] for b in bids],
            "asks": [[float(a[0]), float(a[1])] for a in asks],
            "large_bids": large_bids,
            "large_asks": large_asks,
            "depth_levels": _DEPTH_LIMIT,
            "timestamp": data.get("T", data.get("E", 0)),
        }

        # 写入 Redis
        await init_redis()
        cache_key = f"orderbook:{symbol}"
        await set_with_ttl(cache_key, snapshot, _CACHE_TTL)

        logger.debug(
            "Orderbook snapshot cached",
            extra={
                "symbol": symbol,
                "spread_pct": spread_pct,
                "bid_ask_ratio": bid_ask_ratio,
                "large_bids": len(large_bids),
                "large_asks": len(large_asks),
            },
        )
        return snapshot

    except Exception as exc:
        logger.warning(
            "Orderbook snapshot failed",
            extra={"symbol": symbol, "error": str(exc)},
        )
        return None


async def collect_all_orderbooks(symbols: list[str]) -> dict[str, str]:
    """为所有交易对采集订单簿快照。

    Args:
        symbols: 交易对列表，如 ["BTCUSDT", "ETHUSDT"]

    Returns:
        {"success": N, "errors": M, "total": N+M}
    """
    success = 0
    errors = 0
    for sym in symbols:
        result = await collect_orderbook_snapshot(sym)
        if result is not None:
            success += 1
        else:
            errors += 1
        # Binance API 限速：每秒约 10 请求
        await asyncio.sleep(0.15)

    logger.info(
        "Orderbook collection complete",
        extra={"success": success, "errors": errors, "total": len(symbols)},
    )
    return {"success": success, "errors": errors, "total": len(symbols)}
