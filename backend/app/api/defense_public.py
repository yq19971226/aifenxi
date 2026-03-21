"""对抗推演公开 API — 供 SSR 页面使用，无需认证。

端点：
- GET /api/public/defense/latest  公开获取最新对抗推演摘要
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.redis import get_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public/defense", tags=["defense-public"])

_CACHE_KEY_PREFIX = "defense:summary"


class PublicDefenseSummary(BaseModel):
    """公开防御摘要 — 不含合谋检测内部细节。"""

    symbol: str
    adversarial: Optional[dict[str, Any]] = None
    alert_level: str = "none"
    consensus_ref: Optional[dict[str, Any]] = None


def _compute_alert_level(adversarial: dict | None) -> str:
    """简化版警戒等级（仅 adversarial 部分）。"""
    level = 0
    if adversarial:
        strategy_type = adversarial.get("strategy_type", "defend")
        moves = adversarial.get("predicted_moves", [])
        for move in moves:
            prob = move.get("probability", 0)
            trap = move.get("trap_type", "none")
            if prob >= 0.8 and trap != "none":
                trap_level = 3
            elif prob >= 0.6 and trap != "none":
                trap_level = 2
            else:
                trap_level = 0
            if strategy_type in ("follow", "contra") and trap_level > 0:
                trap_level = max(trap_level - 2, 0)
            level = max(level, trap_level)

        danger = adversarial.get("danger_zones", [])
        if len(danger) >= 3:
            level = max(level, 2)

    level_map = {0: "none", 1: "low", 2: "medium", 3: "high", 4: "critical"}
    return level_map.get(level, "none")


@router.get("/latest", response_model=Optional[PublicDefenseSummary])
async def get_public_defense(
    symbol: str = Query(default="BTCUSDT", description="交易对"),
):
    """获取最新对抗推演摘要 — 公开接口，无需认证。"""
    symbol = symbol.upper()
    try:
        # 优先读缓存
        cached = await get_json(f"{_CACHE_KEY_PREFIX}:{symbol}")
        if cached:
            return PublicDefenseSummary(
                symbol=cached.get("symbol", symbol),
                adversarial=cached.get("adversarial"),
                alert_level=cached.get("alert_level", "none"),
                consensus_ref=cached.get("consensus_ref"),
            )

        # 从最新分析报告提取
        report_data = await get_json(f"analysis:latest:{symbol}")
        if not report_data:
            return None

        adversarial = None
        for section in report_data.get("sections", []):
            title = section.get("title", "")
            data = section.get("data")
            if title == "对抗推演" and data:
                adversarial = data
                break

        alert_level = _compute_alert_level(adversarial)

        # 读取共识信号
        consensus_ref = None
        try:
            consensus_raw = await get_json(f"consensus:latest:{symbol}")
            if consensus_raw and isinstance(consensus_raw, dict):
                consensus_ref = {
                    "signal": consensus_raw.get("consensus_signal", "neutral"),
                    "confidence": consensus_raw.get("consensus_confidence", 0),
                }
        except Exception:
            pass

        return PublicDefenseSummary(
            symbol=symbol,
            adversarial=adversarial,
            alert_level=alert_level,
            consensus_ref=consensus_ref,
        )

    except Exception as exc:
        logger.error("Public defense summary failed", extra={"error": str(exc)})
        return None
