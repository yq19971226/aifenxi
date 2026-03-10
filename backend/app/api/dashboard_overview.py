"""看板概览 API — 一次性返回所有币种的概览数据。

v4.0: 多币种概览表（方案C），前端 dashboard 一次请求获取全部数据。
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.deps import UserInfo, get_current_user
from app.core.redis import get_json, init_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class SymbolOverview(BaseModel):
    """单个币种的概览数据。"""

    symbol: str
    display_name: str = ""
    latest_price: Optional[float] = None
    direction: str = "neutral"  # long / short / neutral
    confidence: float = 0.0
    alert_level: str = "none"  # none / low / medium / high / critical
    dealer_intent: str = ""
    collusion_detected: bool = False
    entry_low: Optional[float] = None
    entry_high: Optional[float] = None
    stop_loss: Optional[float] = None
    reasoning: str = ""
    targets: list[float] = Field(default_factory=list)
    risk_reward_ratio: float = 0.0
    is_worth_taking: bool = False
    strategy_updated_at: Optional[str] = None


class DashboardOverviewResponse(BaseModel):
    """看板概览响应。"""

    symbols: list[SymbolOverview] = Field(default_factory=list)
    total: int = 0


async def _get_symbol_overview(symbol: str) -> SymbolOverview:
    """从 Redis 聚合单个币种的概览数据。"""
    overview = SymbolOverview(symbol=symbol)

    # 并行读取 3 个 Redis key
    price_task = get_json(f"latest_price:{symbol}")
    strategy_task = get_json(f"strategy:latest:{symbol}")
    defense_task = get_json(f"defense:summary:{symbol}")

    price_raw, strategy, defense = await asyncio.gather(
        price_task, strategy_task, defense_task,
        return_exceptions=True,
    )

    # 最新价
    if isinstance(price_raw, (int, float)):
        overview.latest_price = float(price_raw)

    # 策略数据
    if isinstance(strategy, dict):
        overview.direction = strategy.get("direction", "neutral")
        overview.confidence = strategy.get("confidence", 0.0)
        overview.entry_low = strategy.get("entry_low")
        overview.entry_high = strategy.get("entry_high")
        overview.stop_loss = strategy.get("stop_loss")
        overview.reasoning = strategy.get("reasoning", "")
        overview.targets = strategy.get("targets", [])
        overview.risk_reward_ratio = strategy.get("risk_reward_ratio", 0.0)
        overview.is_worth_taking = strategy.get("is_worth_taking", False)
        overview.strategy_updated_at = strategy.get("valid_until")

    # 防御数据
    if isinstance(defense, dict):
        overview.alert_level = defense.get("alert_level", "none")
        overview.dealer_intent = (defense.get("adversarial") or {}).get("dealer_intent", "")
        overview.collusion_detected = (defense.get("collusion") or {}).get("collusion_detected", False)
    else:
        # Fallback: 从分析报告中提取防御数据
        try:
            report = await get_json(f"analysis:latest:{symbol}")
            if isinstance(report, dict):
                for section in report.get("sections", []):
                    title = section.get("title", "")
                    data = section.get("data")
                    if title == "对抗推演" and isinstance(data, dict):
                        overview.dealer_intent = data.get("dealer_intent", "")
                    elif title == "合谋检测" and isinstance(data, dict):
                        overview.collusion_detected = data.get("collusion_detected", False)
        except Exception:
            pass

    return overview


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    _user: UserInfo = Depends(get_current_user),
) -> DashboardOverviewResponse:
    """获取所有已启用币种的概览数据 — 供看板页面使用。"""
    await init_redis()

    # 从数据库读取已启用币种
    from app.core.database import AsyncSessionLocal
    from app.services.symbol_registry import DEFAULT_SYMBOLS, SymbolRegistry

    symbols_list: list[dict] = []
    try:
        async with AsyncSessionLocal() as session:
            registry = SymbolRegistry(session)
            configs = await registry.list_symbols(enabled_only=True)
            symbols_list = [{"symbol": c.symbol, "display_name": c.display_name} for c in configs]
    except Exception as exc:
        logger.warning("Failed to read symbols from DB, using defaults", extra={"error": str(exc)})
        symbols_list = [{"symbol": s, "display_name": s.replace("USDT", "")} for s in DEFAULT_SYMBOLS]

    if not symbols_list:
        symbols_list = [{"symbol": s, "display_name": s.replace("USDT", "")} for s in DEFAULT_SYMBOLS]

    # 并行获取所有币种概览
    tasks = [_get_symbol_overview(item["symbol"]) for item in symbols_list]
    overviews = await asyncio.gather(*tasks, return_exceptions=True)

    result = []
    for i, ov in enumerate(overviews):
        if isinstance(ov, SymbolOverview):
            ov.display_name = symbols_list[i]["display_name"]
            result.append(ov)
        else:
            logger.warning(f"Failed to get overview for {symbols_list[i]['symbol']}: {ov}")
            result.append(SymbolOverview(
                symbol=symbols_list[i]["symbol"],
                display_name=symbols_list[i]["display_name"],
            ))

    return DashboardOverviewResponse(symbols=result, total=len(result))


# ── 综合信号 API ──────────────────────────────────────────

class SignalEvent(BaseModel):
    """单条信号事件。"""
    symbol: str
    type: str  # direction_change / confidence_drop / confidence_rise / opportunity / risk_alert
    message: str
    detail: str = ""
    timestamp: str  # ISO 8601


class DashboardSignalsResponse(BaseModel):
    """综合信号响应。"""
    signals: list[SignalEvent] = Field(default_factory=list)
    total: int = 0


_DIRECTION_LABELS = {"long": "看涨", "short": "看跌", "neutral": "中性"}


@router.get("/signals", response_model=DashboardSignalsResponse)
async def get_dashboard_signals(
    limit: int = 20,
    _user: UserInfo = Depends(get_current_user),
) -> DashboardSignalsResponse:
    """从 strategies 表生成近期综合信号（方向变化、置信度变化、新机会等）。"""
    import json as _json
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    signals: list[SignalEvent] = []

    try:
        async with AsyncSessionLocal() as session:
            # 查询每个币种最近 N 条策略记录，用于检测变化
            sql = text("""
                SELECT symbol, direction, confidence, entry_low, entry_high,
                       stop_loss, targets, created_at
                FROM strategies
                WHERE created_at > NOW() - INTERVAL '6 hours'
                ORDER BY created_at DESC
                LIMIT 200
            """)
            result = await session.execute(sql)
            rows = result.mappings().all()

        # 按币种分组
        by_symbol: dict[str, list[dict]] = {}
        for row in rows:
            s = row["symbol"]
            by_symbol.setdefault(s, []).append(dict(row))

        for symbol, records in by_symbol.items():
            # records 已按 created_at DESC 排列
            for i, rec in enumerate(records):
                prev = records[i + 1] if i + 1 < len(records) else None
                ts = rec["created_at"].isoformat() if rec["created_at"] else ""
                direction = rec["direction"]
                confidence = float(rec["confidence"]) if rec["confidence"] else 0.0
                conf_pct = round(confidence * 100)

                targets_raw = rec["targets"]
                targets = _json.loads(targets_raw) if isinstance(targets_raw, str) else (targets_raw or [])
                rr = 0.0
                if rec["entry_low"] and rec["entry_high"] and rec["stop_loss"] and targets:
                    mid = (float(rec["entry_low"]) + float(rec["entry_high"])) / 2
                    sl_dist = abs(mid - float(rec["stop_loss"]))
                    if sl_dist > 0:
                        rr = round(abs(float(targets[0]) - mid) / sl_dist, 1)

                if prev:
                    prev_dir = prev["direction"]
                    prev_conf = float(prev["confidence"]) if prev["confidence"] else 0.0
                    prev_conf_pct = round(prev_conf * 100)

                    # 方向变化
                    if direction != prev_dir:
                        label = _DIRECTION_LABELS.get(direction, direction)
                        signals.append(SignalEvent(
                            symbol=symbol,
                            type="direction_change",
                            message=f"{symbol} 方向变为{label}",
                            timestamp=ts,
                        ))

                    # 置信度显著变化（>=10%）
                    conf_delta = conf_pct - prev_conf_pct
                    if abs(conf_delta) >= 10:
                        if conf_delta < 0:
                            signals.append(SignalEvent(
                                symbol=symbol,
                                type="confidence_drop",
                                message=f"{symbol} 置信度下降 {abs(conf_delta)}%",
                                detail=f"{prev_conf_pct}% → {conf_pct}%",
                                timestamp=ts,
                            ))
                        else:
                            signals.append(SignalEvent(
                                symbol=symbol,
                                type="confidence_rise",
                                message=f"{symbol} 置信度上升 {abs(conf_delta)}%",
                                detail=f"{prev_conf_pct}% → {conf_pct}%",
                                timestamp=ts,
                            ))

                # 可操作机会（RR >= 1.5 且 direction != neutral）
                if rr >= 1.5 and direction != "neutral":
                    signals.append(SignalEvent(
                        symbol=symbol,
                        type="opportunity",
                        message=f"{symbol} 出现可操作机会 (RR 1:{rr})",
                        timestamp=ts,
                    ))

        # 按时间排序（最新在前）
        signals.sort(key=lambda s: s.timestamp, reverse=True)
        signals = signals[:limit]

    except Exception as exc:
        logger.warning("Failed to generate signals", extra={"error": str(exc)})

    return DashboardSignalsResponse(signals=signals, total=len(signals))
