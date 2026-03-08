"""历史 K 线回填脚本 — 一键拉取 12 个月历史数据写入 TimescaleDB。

用法:
    python -m workers.kline_backfill                    # 回填所有币种、所有周期、12个月
    python -m workers.kline_backfill --symbols BTCUSDT ETHUSDT
    python -m workers.kline_backfill --intervals 1h 4h 1d
    python -m workers.kline_backfill --months 6

v4.0: 支持 10 币种 × 6 周期（5m/15m/1h/4h/1d/1w）自动回填。
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone

import sqlalchemy

from app.core.mode_contract import ALL_MODE_KLINE_INTERVALS
from app.data.binance_rest import BinanceRestClient
from app.models.market_data import KlineData
from app.services.symbol_registry import DEFAULT_SYMBOLS, get_active_symbols_sync
from workers.db import worker_session

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

_client = BinanceRestClient(timeout=60.0)

DEFAULT_INTERVALS = list(ALL_MODE_KLINE_INTERVALS)

_UPSERT_SQL = sqlalchemy.text("""
    INSERT INTO klines (time, symbol, interval, open, high, low, close, volume)
    VALUES (:time, :symbol, :interval, :open, :high, :low, :close, :volume)
    ON CONFLICT (time, symbol, interval) DO UPDATE
        SET open   = EXCLUDED.open,
            high   = EXCLUDED.high,
            low    = EXCLUDED.low,
            close  = EXCLUDED.close,
            volume = EXCLUDED.volume
""")


async def _upsert_batch(session, klines: list[KlineData]) -> None:
    """批量 upsert K 线数据。"""
    async with session.begin():
        for k in klines:
            await session.execute(
                _UPSERT_SQL,
                {
                    "time": k.open_time,
                    "symbol": k.symbol,
                    "interval": k.interval,
                    "open": k.open,
                    "high": k.high,
                    "low": k.low,
                    "close": k.close,
                    "volume": k.volume,
                },
            )


async def backfill_symbol_interval(
    session,
    symbol: str,
    interval: str,
    start_ms: int,
    end_ms: int,
) -> int:
    """回填单个币种单个周期的历史 K 线，返回总写入条数。"""
    total = 0
    current_start = start_ms

    while current_start < end_ms:
        try:
            klines = await _client.fetch_klines(
                symbol=symbol,
                interval=interval,
                limit=1000,
                start_time=current_start,
                end_time=end_ms,
            )
        except Exception as exc:
            logger.error(
                f"Failed to fetch {symbol} {interval} from {current_start}: {exc}"
            )
            break

        if not klines:
            break

        await _upsert_batch(session, klines)
        total += len(klines)

        last_time_ms = int(klines[-1].open_time.timestamp() * 1000)
        current_start = last_time_ms + 1

        logger.info(
            f"  {symbol} {interval}: +{len(klines)} candles "
            f"(total: {total}, latest: {klines[-1].open_time.isoformat()})"
        )

        # Binance API 限速：每分钟 1200 权重，klines 每次 10 权重
        await asyncio.sleep(0.5)

    return total


async def run_backfill(
    symbols: list[str],
    intervals: list[str],
    months: int,
) -> None:
    """执行完整回填。"""
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=months * 30)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    logger.info(f"=== K 线历史回填 ===")
    logger.info(f"币种: {', '.join(symbols)} ({len(symbols)} 个)")
    logger.info(f"周期: {', '.join(intervals)} ({len(intervals)} 个)")
    logger.info(f"时间范围: {start.date()} → {now.date()} ({months} 个月)")
    logger.info(f"总任务: {len(symbols) * len(intervals)} 个币种×周期组合")
    logger.info("")

    grand_total = 0

    async with worker_session() as session:
        for i, symbol in enumerate(symbols, 1):
            for j, interval in enumerate(intervals, 1):
                task_num = (i - 1) * len(intervals) + j
                task_total = len(symbols) * len(intervals)
                logger.info(
                    f"[{task_num}/{task_total}] 回填 {symbol} {interval}..."
                )
                count = await backfill_symbol_interval(
                    session, symbol, interval, start_ms, end_ms
                )
                grand_total += count
                logger.info(
                    f"[{task_num}/{task_total}] {symbol} {interval} 完成: {count} 条"
                )

    logger.info("")
    logger.info(f"=== 回填完成 ===")
    logger.info(f"总写入: {grand_total:,} 条 K 线数据")


def main() -> None:
    parser = argparse.ArgumentParser(description="历史 K 线回填脚本")
    parser.add_argument(
        "--symbols",
        nargs="+",
        default=None,
        help=f"币种列表（默认: {', '.join(DEFAULT_SYMBOLS)}）",
    )
    parser.add_argument(
        "--intervals",
        nargs="+",
        default=DEFAULT_INTERVALS,
        help=f"K 线周期列表（默认: {', '.join(DEFAULT_INTERVALS)}）",
    )
    parser.add_argument(
        "--months",
        type=int,
        default=12,
        help="回填月数（默认: 12）",
    )
    args = parser.parse_args()

    symbols = args.symbols or get_active_symbols_sync()

    asyncio.run(run_backfill(symbols, args.intervals, args.months))


if __name__ == "__main__":
    main()
