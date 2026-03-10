"""合约数据采集器 — Binance Futures API。

采集永续合约资金费率、多空比和爆仓数据：
- collect_snapshot: 资金费率 + 多空比（每5分钟）
- collect_liquidations: 强制平仓事件（每1分钟）

所有 API 调用带 30s 超时，失败记录日志并抛出异常。
结果写入 TimescaleDB 时序表并缓存到 Redis。
"""

import asyncio
import logging
from datetime import datetime, timezone

import aiohttp
import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import set_with_ttl, publish_stream
from app.models.market_data import DerivativesSnapshot, LiquidationEvent

logger = logging.getLogger(__name__)

BINANCE_FUTURES_BASE = "https://fapi.binance.com"
_API_TIMEOUT = 30  # seconds
_MAX_CONSECUTIVE_FAILURES = 3

# Redis 缓存键模式和 TTL
_SNAPSHOT_CACHE_KEY = "derivatives:{symbol}"
_SNAPSHOT_CACHE_TTL = 1800  # 30 minutes (6x collection interval, 容错更强)
_LIQUIDATION_CACHE_KEY = "deriv_liquidations:{symbol}"
_LIQUIDATION_CACHE_TTL = 60  # 1 minute


class DerivativesCollector:
    """合约数据采集器 — 从 Binance Futures API 采集资金费率、多空比和爆仓数据。

    Args:
        session: SQLAlchemy AsyncSession，用于写入 TimescaleDB。
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._failure_counts: dict[str, int] = {}

    # ── 公开接口 ─────────────────────────────────────────────

    async def collect_snapshot(self, symbol: str) -> DerivativesSnapshot:
        """采集资金费率 + 多空比（每5分钟调用）。

        并行请求5个 Binance Futures 端点，组装为 DerivativesSnapshot，
        写入 TimescaleDB 并缓存到 Redis。

        Args:
            symbol: 交易对，如 "BTCUSDT"

        Returns:
            DerivativesSnapshot 实例

        Raises:
            Exception: 当 API 调用失败时抛出，由调用方处理重试逻辑。
        """
        try:
            async with aiohttp.ClientSession() as http_session:
                (
                    funding,
                    ls_account,
                    ls_position,
                    top_account,
                    top_position,
                ) = await asyncio.gather(
                    self._fetch(http_session, "/fapi/v1/premiumIndex", {"symbol": symbol}),
                    self._fetch(
                        http_session,
                        "/futures/data/globalLongShortAccountRatio",
                        {"symbol": symbol, "period": "5m", "limit": 1},
                    ),
                    self._fetch(
                        http_session,
                        "/futures/data/topLongShortPositionRatio",
                        {"symbol": symbol, "period": "5m", "limit": 1},
                    ),
                    self._fetch(
                        http_session,
                        "/futures/data/topLongShortAccountRatio",
                        {"symbol": symbol, "period": "5m", "limit": 1},
                    ),
                    self._fetch(
                        http_session,
                        "/futures/data/topLongShortPositionRatio",
                        {"symbol": symbol, "period": "5m", "limit": 1},
                    ),
                )

            snapshot = DerivativesSnapshot(
                time=datetime.now(timezone.utc),
                symbol=symbol,
                funding_rate=_safe_float(funding.get("lastFundingRate")),
                predicted_funding_rate=_safe_float(funding.get("nextFundingRate")),
                long_short_account_ratio=_safe_ratio(ls_account),
                long_short_position_ratio=_safe_ratio(ls_position),
                top_long_short_account_ratio=_safe_ratio(top_account),
                top_long_short_position_ratio=_safe_ratio(top_position),
            )

            # 写入 TimescaleDB
            try:
                await self._write_snapshot_to_db(snapshot)
            except Exception as db_exc:
                logger.warning(
                    "Derivatives DB write failed, continue with Redis cache",
                    extra={"symbol": symbol, "error": str(db_exc)},
                )

            # 缓存到 Redis
            await set_with_ttl(
                _SNAPSHOT_CACHE_KEY.format(symbol=symbol),
                snapshot.model_dump(mode="json"),
                ttl_seconds=_SNAPSHOT_CACHE_TTL,
            )

            # 发布到 Redis Streams 供预警评估 Worker 消费
            await publish_stream(
                "indicator_updates",
                {
                    "symbol": symbol,
                    "metric_type": "funding_rate",
                    "current_value": snapshot.funding_rate,
                },
            )

            # 重置失败计数
            self._failure_counts[symbol] = 0

            logger.info(
                "Derivatives snapshot collected",
                extra={
                    "symbol": symbol,
                    "funding_rate": snapshot.funding_rate,
                    "ls_account_ratio": snapshot.long_short_account_ratio,
                },
            )
            return snapshot

        except Exception as exc:
            self._record_failure(symbol, exc)
            raise

    async def collect_liquidations(self, symbol: str) -> list[LiquidationEvent]:
        """采集最近的爆仓事件（每1分钟调用）。

        请求 Binance Futures 强制平仓订单接口，解析为 LiquidationEvent 列表，
        写入 TimescaleDB 并缓存到 Redis。

        Args:
            symbol: 交易对，如 "BTCUSDT"

        Returns:
            LiquidationEvent 列表

        Raises:
            Exception: 当 API 调用失败时抛出，由调用方处理重试逻辑。
        """
        try:
            async with aiohttp.ClientSession() as http_session:
                data = await self._fetch(
                    http_session,
                    "/fapi/v1/allForceOrders",
                    {"symbol": symbol, "limit": 50},
                )

            events: list[LiquidationEvent] = []
            for item in data:
                try:
                    qty = float(item["origQty"])
                    price = float(item["price"])
                    events.append(
                        LiquidationEvent(
                            time=datetime.fromtimestamp(
                                item["time"] / 1000, tz=timezone.utc
                            ),
                            symbol=item["symbol"],
                            side=item["side"],
                            quantity=qty,
                            price=price,
                            usd_value=qty * price,
                        )
                    )
                except (KeyError, ValueError, TypeError) as parse_exc:
                    logger.warning(
                        "Failed to parse liquidation event",
                        extra={"error": str(parse_exc), "item": item},
                    )

            # 写入 TimescaleDB
            if events:
                try:
                    await self._write_liquidations_to_db(events)
                except Exception as db_exc:
                    logger.warning(
                        "Liquidation DB write failed, continue with Redis cache",
                        extra={"symbol": symbol, "error": str(db_exc)},
                    )

            # 缓存到 Redis
            await set_with_ttl(
                _LIQUIDATION_CACHE_KEY.format(symbol=symbol),
                [e.model_dump(mode="json") for e in events],
                ttl_seconds=_LIQUIDATION_CACHE_TTL,
            )

            # 重置失败计数
            self._failure_counts[symbol] = 0

            logger.info(
                "Liquidation events collected",
                extra={"symbol": symbol, "count": len(events)},
            )
            return events

        except Exception as exc:
            self._record_failure(symbol, exc)
            raise

    # ── 内部方法 ─────────────────────────────────────────────

    async def _fetch(
        self,
        session: aiohttp.ClientSession,
        path: str,
        params: dict[str, str | int],
    ) -> dict | list:
        """带 30s 超时和错误处理的 HTTP GET。

        Args:
            session: aiohttp 客户端会话
            path: API 路径（如 "/fapi/v1/premiumIndex"）
            params: 查询参数

        Returns:
            解析后的 JSON（dict 或 list）

        Raises:
            aiohttp.ClientError: HTTP 请求失败
            asyncio.TimeoutError: 超过 30s 超时
        """
        url = f"{BINANCE_FUTURES_BASE}{path}"
        try:
            async with asyncio.timeout(_API_TIMEOUT):
                async with session.get(url, params=params) as resp:
                    resp.raise_for_status()
                    return await resp.json()
        except asyncio.TimeoutError:
            logger.error(
                "Binance Futures API timeout",
                extra={"path": path, "params": params, "timeout": _API_TIMEOUT},
            )
            raise
        except aiohttp.ClientResponseError as exc:
            logger.error(
                "Binance Futures API HTTP error",
                extra={"path": path, "status": exc.status, "detail": exc.message},
            )
            raise
        except Exception as exc:
            logger.error(
                "Binance Futures API unexpected error",
                extra={"path": path, "error": str(exc)},
            )
            raise

    async def _write_snapshot_to_db(self, snapshot: DerivativesSnapshot) -> None:
        """将合约快照写入 TimescaleDB derivatives_snapshots 表。"""
        sql = """
            INSERT INTO derivatives_snapshots (
                time, symbol, funding_rate, predicted_funding_rate,
                long_short_account_ratio, long_short_position_ratio,
                top_long_short_account_ratio, top_long_short_position_ratio
            ) VALUES (
                :time, :symbol, :funding_rate, :predicted_funding_rate,
                :ls_account, :ls_position, :top_account, :top_position
            )
        """
        await self._session.execute(
            sqlalchemy.text(sql),
            {
                "time": snapshot.time,
                "symbol": snapshot.symbol,
                "funding_rate": snapshot.funding_rate,
                "predicted_funding_rate": snapshot.predicted_funding_rate,
                "ls_account": snapshot.long_short_account_ratio,
                "ls_position": snapshot.long_short_position_ratio,
                "top_account": snapshot.top_long_short_account_ratio,
                "top_position": snapshot.top_long_short_position_ratio,
            },
        )
        await self._session.commit()

    async def _write_liquidations_to_db(
        self, events: list[LiquidationEvent]
    ) -> None:
        """将爆仓事件批量写入 TimescaleDB liquidation_events 表。"""
        sql = """
            INSERT INTO liquidation_events (time, symbol, side, quantity, price, usd_value)
            VALUES (:time, :symbol, :side, :quantity, :price, :usd_value)
        """
        params = [
            {
                "time": e.time,
                "symbol": e.symbol,
                "side": e.side,
                "quantity": e.quantity,
                "price": e.price,
                "usd_value": e.usd_value,
            }
            for e in events
        ]
        for p in params:
            await self._session.execute(sqlalchemy.text(sql), p)
        await self._session.commit()

    def _record_failure(self, symbol: str, exc: Exception) -> None:
        """记录采集失败，连续 3 次失败时记录告警级别日志。"""
        count = self._failure_counts.get(symbol, 0) + 1
        self._failure_counts[symbol] = count
        logger.error(
            "Derivatives collection failed",
            extra={
                "symbol": symbol,
                "consecutive_failures": count,
                "error": str(exc),
            },
        )
        if count >= _MAX_CONSECUTIVE_FAILURES:
            logger.critical(
                "Derivatives collection consecutive failure alert: "
                f"{symbol} failed {count} times in a row",
                extra={"symbol": symbol, "failure_count": count},
            )


# ── 辅助函数 ─────────────────────────────────────────────────


def _safe_float(value: object) -> float | None:
    """安全转换为 float，失败返回 None。"""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _safe_ratio(data: list | dict | None) -> float | None:
    """从 Binance 多空比 API 响应中提取 longShortRatio，失败返回 None。"""
    if not data:
        return None
    try:
        if isinstance(data, list) and len(data) > 0:
            return float(data[0]["longShortRatio"])
        return None
    except (KeyError, ValueError, TypeError, IndexError):
        return None
