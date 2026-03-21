"""系统机器人 — 定期后台执行分析，填充排行榜基础数据。

设计原则：
  - 100% 真实 AI 分析，不伪造任何数据
  - 使用固定系统账号 UUID，在排行榜显示为匿名 Trader
  - 可通过 system_bot_enabled 配置开关控制
  - 每小时最多执行一轮，不争抢用户资源
  - 任何错误静默跳过，不影响系统稳定性
"""

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from app.models.analysis import AnalysisMode

logger = logging.getLogger("system_bot")

# 系统 bot 固定 UUID — 哈希后在排行榜显示为匿名编号
SYSTEM_BOT_USER_ID = UUID("00000000-0000-0000-0000-000000000001")

# 要分析的币种和模式
BOT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
BOT_MODES = [AnalysisMode.SCALPING]

# 每轮各 (symbol, mode) 之间的间隔秒数，避免同时占满资源
_INTER_ANALYSIS_DELAY = 15.0

# 单次分析超时（秒）
_SINGLE_TIMEOUT = 180.0


async def _is_enabled() -> bool:
    """检查系统机器人是否启用。"""
    try:
        from app.services.config_service import get_config_value
        val = await get_config_value("system_bot_enabled", default="true")
        return val.strip().lower() in ("true", "1", "yes", "on")
    except Exception:
        return True  # 默认启用，保证冷启动有数据


async def run_bot_once() -> dict:
    """执行一轮系统分析。

    Returns:
        {"analyzed": int, "published": int, "errors": int, "skipped": int}
    """
    from app.services.analysis_orchestrator import AnalysisOrchestrator
    from app.core.database import AsyncSessionLocal
    from app.services.strategy import StrategyResult, StrategyService

    stats = {"analyzed": 0, "published": 0, "errors": 0, "skipped": 0}

    if not await _is_enabled():
        logger.info("system_bot disabled, skipping")
        return stats

    orchestrator = AnalysisOrchestrator()
    svc = StrategyService()

    for symbol in BOT_SYMBOLS:
        for mode in BOT_MODES:
            try:
                # 调用编排器核心方法（跳过 SSE / 配额 / 缓存锁）
                report = await asyncio.wait_for(
                    orchestrator._dispatch_mode(symbol, mode),
                    timeout=_SINGLE_TIMEOUT,
                )

                if not report.strategy:
                    stats["skipped"] += 1
                    logger.debug(
                        "bot: %s/%s no strategy generated", symbol, mode.value
                    )
                    await asyncio.sleep(_INTER_ANALYSIS_DELAY)
                    continue

                strategy_data = report.strategy
                # 跳过 fallback / neutral 策略（兼容 dict 和 model 两种类型）
                _get = (lambda obj, key, default=None:
                        obj.get(key, default) if isinstance(obj, dict)
                        else getattr(obj, key, default))
                if _get(strategy_data, "is_fallback") or _get(strategy_data, "direction") == "neutral":
                    stats["skipped"] += 1
                    await asyncio.sleep(_INTER_ANALYSIS_DELAY)
                    continue

                stats["analyzed"] += 1

                # 持久化策略 + 创建快照 + 发布判断
                try:
                    strategy = StrategyResult.model_validate(strategy_data)
                    async with AsyncSessionLocal() as session:
                        await svc.save_strategy(
                            session=session,
                            strategy=strategy,
                            user_id=SYSTEM_BOT_USER_ID,
                            analysis_mode=mode.value,
                            skip_cache=True,
                        )
                        await session.commit()
                    stats["published"] += 1
                    logger.info(
                        "bot: %s/%s strategy saved & published attempt",
                        symbol, mode.value,
                    )
                except Exception as exc:
                    logger.warning(
                        "bot: %s/%s persist failed: %s",
                        symbol, mode.value, exc,
                    )

            except asyncio.TimeoutError:
                logger.warning(
                    "bot: %s/%s analysis timeout (%.0fs)",
                    symbol, mode.value, _SINGLE_TIMEOUT,
                )
                stats["errors"] += 1
            except Exception as exc:
                logger.warning(
                    "bot: %s/%s analysis error: %s",
                    symbol, mode.value, exc,
                )
                stats["errors"] += 1

            # 间隔，避免资源争抢
            await asyncio.sleep(_INTER_ANALYSIS_DELAY)

    logger.info(
        "system_bot round complete: analyzed=%d published=%d errors=%d skipped=%d",
        stats["analyzed"], stats["published"], stats["errors"], stats["skipped"],
    )
    return stats


async def system_bot_loop():
    """系统机器人主循环 — 每小时执行一轮。"""
    # 启动后等 5 分钟再开始第一轮，让其他服务初始化完成
    await asyncio.sleep(300)

    while True:
        try:
            await run_bot_once()
        except asyncio.CancelledError:
            logger.info("system_bot loop cancelled")
            break
        except Exception as exc:
            logger.error("system_bot loop error: %s", exc)

        # 每小时执行一次
        await asyncio.sleep(3600)
