"""对抗防御 API — AdversarialAgent + CollusionDetector 独立查询。

端点：
- GET  /api/defense/latest      获取最新对抗推演 + 合谋检测摘要
- POST /api/defense/scan        手动触发一次防御扫描
- GET  /api/defense/alert-level 获取当前防御警戒等级（供 Dashboard 轮询）
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.redis import get_json, set_with_ttl

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/defense", tags=["defense"])

_CACHE_KEY_PREFIX = "defense:summary"
_CACHE_TTL = 300  # 5 min


# ── 响应模型 ─────────────────────────────────────────────────


class DefenseAlertLevel(BaseModel):
    """防御警戒等级摘要 — 供 Dashboard 卡片轮询。"""

    symbol: str
    alert_level: str = "none"  # none / low / medium / high / critical
    dealer_intent: str = ""
    collusion_detected: bool = False
    collusion_risk: str = "none"
    danger_zones: list[str] = []
    defense_tips: list[str] = []
    top_threat: str = ""


class DefenseSummary(BaseModel):
    """完整防御摘要。"""

    symbol: str
    adversarial: Optional[dict[str, Any]] = None
    collusion: Optional[dict[str, Any]] = None
    alert_level: str = "none"


# ── 端点 ─────────────────────────────────────────────────────


@router.get("/latest", response_model=Optional[DefenseSummary])
async def get_latest_defense(
    symbol: str = Query(default="BTCUSDT", description="交易对"),
):
    """获取最新对抗推演 + 合谋检测摘要。

    从最近一次趋势分析报告中提取 adversarial 和 collusion 分段数据。
    """
    symbol = symbol.upper()
    try:
        # 尝试缓存
        cached = await get_json(f"{_CACHE_KEY_PREFIX}:{symbol}")
        if cached:
            return DefenseSummary(**cached)

        # 从最新分析报告中提取
        report_data = await get_json(f"analysis:{symbol}:trend:latest")
        if not report_data:
            return None

        adversarial = None
        collusion = None

        for section in report_data.get("sections", []):
            title = section.get("title", "")
            data = section.get("data")
            if title == "对抗推演" and data:
                adversarial = data
            elif title == "合谋检测" and data:
                collusion = data

        alert_level = _compute_alert_level(adversarial, collusion)

        summary = DefenseSummary(
            symbol=symbol,
            adversarial=adversarial,
            collusion=collusion,
            alert_level=alert_level,
        )

        # 缓存摘要
        await set_with_ttl(
            f"{_CACHE_KEY_PREFIX}:{symbol}",
            summary.model_dump(mode="json"),
            _CACHE_TTL,
        )

        return summary

    except Exception as exc:
        logger.error("Get defense summary failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"获取防御摘要失败: {exc}")


@router.get("/alert-level", response_model=DefenseAlertLevel)
async def get_alert_level(
    symbol: str = Query(default="BTCUSDT", description="交易对"),
):
    """获取当前防御警戒等级 — 轻量接口供 Dashboard 轮询。"""
    symbol = symbol.upper()
    try:
        # 快速读取缓存
        cached = await get_json(f"{_CACHE_KEY_PREFIX}:{symbol}")

        if not cached:
            # 尝试从分析报告提取
            report_data = await get_json(f"analysis:{symbol}:trend:latest")
            if not report_data:
                return DefenseAlertLevel(symbol=symbol)

            adversarial = None
            collusion = None
            for section in report_data.get("sections", []):
                title = section.get("title", "")
                data = section.get("data")
                if title == "对抗推演" and data:
                    adversarial = data
                elif title == "合谋检测" and data:
                    collusion = data

            alert_level = _compute_alert_level(adversarial, collusion)

            return DefenseAlertLevel(
                symbol=symbol,
                alert_level=alert_level,
                dealer_intent=adversarial.get("dealer_intent", "") if adversarial else "",
                collusion_detected=collusion.get("collusion_detected", False) if collusion else False,
                collusion_risk=collusion.get("risk_level", "none") if collusion else "none",
                danger_zones=adversarial.get("danger_zones", []) if adversarial else [],
                defense_tips=(adversarial.get("defense_plan", []) if adversarial else [])[:3],
                top_threat=_get_top_threat(adversarial, collusion),
            )

        # 从缓存提取轻量信息
        adv = cached.get("adversarial") or {}
        col = cached.get("collusion") or {}

        return DefenseAlertLevel(
            symbol=symbol,
            alert_level=cached.get("alert_level", "none"),
            dealer_intent=adv.get("dealer_intent", ""),
            collusion_detected=col.get("collusion_detected", False),
            collusion_risk=col.get("risk_level", "none"),
            danger_zones=adv.get("danger_zones", []),
            defense_tips=adv.get("defense_plan", [])[:3],
            top_threat=_get_top_threat(adv, col),
        )

    except Exception as exc:
        logger.error("Get alert level failed", extra={"error": str(exc)})
        return DefenseAlertLevel(symbol=symbol)


@router.post("/scan")
async def trigger_defense_scan(
    symbol: str = Query(default="BTCUSDT", description="交易对"),
):
    """手动触发一次防御扫描。

    使用编排器采集市场数据，单独运行 AdversarialAgent + CollusionDetector 并缓存结果。
    """
    import asyncio

    from app.agents.adversarial import AdversarialAgent
    from app.agents.collusion_detector import CollusionDetector
    from app.models.analysis import AnalysisMode
    from app.services.analysis_orchestrator import AnalysisOrchestrator

    symbol = symbol.upper()
    try:
        orchestrator = AnalysisOrchestrator()
        market_data = await orchestrator._collect_market_data(symbol, AnalysisMode.TREND)

        adv_agent = AdversarialAgent()
        col_agent = CollusionDetector()

        adv_report, col_report = await asyncio.gather(
            adv_agent.analyze(market_data),
            col_agent.analyze(market_data),
        )

        adversarial = adv_report.raw_data if adv_report else {}
        collusion = col_report.raw_data if col_report else {}
        alert_level = _compute_alert_level(adversarial, collusion)

        summary = DefenseSummary(
            symbol=symbol,
            adversarial=adversarial,
            collusion=collusion,
            alert_level=alert_level,
        )

        await set_with_ttl(
            f"{_CACHE_KEY_PREFIX}:{symbol}",
            summary.model_dump(mode="json"),
            _CACHE_TTL,
        )

        return summary

    except Exception as exc:
        logger.error("Defense scan failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"防御扫描失败: {exc}")


# ── 辅助函数 ─────────────────────────────────────────────────


def _compute_alert_level(
    adversarial: dict | None,
    collusion: dict | None,
) -> str:
    """综合计算防御警戒等级。"""
    level = 0  # 0=none, 1=low, 2=medium, 3=high, 4=critical

    if collusion:
        risk = collusion.get("risk_level", "none")
        risk_map = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
        level = max(level, risk_map.get(risk, 0))

        if collusion.get("collusion_detected"):
            level = max(level, 2)

    if adversarial:
        moves = adversarial.get("predicted_moves", [])
        for move in moves:
            prob = move.get("probability", 0)
            trap = move.get("trap_type", "none")
            if prob >= 0.8 and trap != "none":
                level = max(level, 3)
            elif prob >= 0.6 and trap != "none":
                level = max(level, 2)

        danger = adversarial.get("danger_zones", [])
        if len(danger) >= 3:
            level = max(level, 2)

    level_map = {0: "none", 1: "low", 2: "medium", 3: "high", 4: "critical"}
    return level_map.get(level, "none")


def _get_top_threat(
    adversarial: dict | None,
    collusion: dict | None,
) -> str:
    """获取最高优先级的威胁描述。"""
    if collusion and collusion.get("collusion_detected"):
        patterns = collusion.get("patterns", [])
        if patterns:
            p = patterns[0]
            return f"{p.get('pattern_type', '未知')} ({p.get('severity', '?')})"

    if adversarial:
        moves = adversarial.get("predicted_moves", [])
        if moves:
            top = max(moves, key=lambda m: m.get("probability", 0))
            return top.get("action", "")

    return ""
