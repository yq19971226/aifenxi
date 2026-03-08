"""庄家看板 API 路由 — 剧本推演结果 + 阶段历史查询。

端点：
- GET /api/playbook/latest/{symbol}        — 最新剧本推演结果
- GET /api/playbook/phase-history/{symbol}  — 操盘阶段转换历史
- GET /api/playbook/counter-strategy/{symbol} — 最新反庄策略
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import UserInfo, get_current_user
from app.core.redis import get_json
from app.services.playbook_sim_service import simulate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/playbook", tags=["playbook"])


@router.get("/latest/{symbol}")
async def get_playbook_latest(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取最新剧本推演结果（从分析报告缓存提取）。

    返回匹配剧本、概率、阶段、反制策略等信息。
    """
    try:
        user_level = 2 if user.is_admin else user.membership_level

        # 免费用户不直读 analysis:latest，避免绕过 playbook-sim 脱敏逻辑
        if user_level >= 1:
            report = await get_json(f"analysis:latest:{symbol.upper()}")
            if report and isinstance(report, dict):
                sections = report.get("sections", [])
                for section in sections:
                    if section.get("title") == "剧本推演" and section.get("data"):
                        section_data = section.get("data") or {}
                        # AgentReport 被封装在 section.data.raw_data 中
                        raw = section_data.get("raw_data", section_data)
                        matched_playbook = raw.get("matched_playbook", "")
                        probability = raw.get("probability", 0)
                        counter_strategy = raw.get("counter_strategy", {}) or {}

                        # 无有效剧本字段时继续走 fallback（避免返回空壳 200）
                        if matched_playbook or probability or counter_strategy:
                            return {
                                "symbol": symbol.upper(),
                                "matched_playbook": matched_playbook,
                                "probability": probability,
                                "stage_description": raw.get("stage_description", ""),
                                "next_move": raw.get("next_move", ""),
                                "counter_strategy": counter_strategy,
                                "all_probabilities": raw.get("all_probabilities", {}),
                                "signal": section_data.get("signal", "neutral"),
                                "confidence": section_data.get("confidence", probability),
                                "reasoning": section_data.get("reasoning", ""),
                            }

        # 回退：从 playbook-sim 结果构造 latest（兼容 scalping/intraday 报告）
        sim = await simulate(symbol.upper(), user_level=user_level)
        if isinstance(sim, dict) and not sim.get("error"):
            top_matches = sim.get("top_matches") or []
            if top_matches:
                top = top_matches[0]
                llm_pred = sim.get("llm_prediction") or {}
                all_probs = {
                    m.get("name", ""): round(float(m.get("match_pct", 0)) / 100, 4)
                    for m in top_matches
                    if m.get("name")
                }

                stage_desc = ""
                stages = top.get("stages") or []
                stage_idx = top.get("current_stage_idx", -1)
                if isinstance(stage_idx, int) and isinstance(stages, list) and 0 <= stage_idx < len(stages):
                    stage_desc = stages[stage_idx].get("name", "")

                reasoning_parts = llm_pred.get("key_observations") or []
                reasoning = "；".join(str(x) for x in reasoning_parts if x) if isinstance(reasoning_parts, list) else ""

                probability = round(float(top.get("match_pct", 0)) / 100, 4)
                return {
                    "symbol": symbol.upper(),
                    "matched_playbook": top.get("name", ""),
                    "probability": probability,
                    "stage_description": stage_desc,
                    "next_move": llm_pred.get("estimated_transition", ""),
                    "counter_strategy": top.get("counter_strategy", {}) or {},
                    "all_probabilities": all_probs,
                    "signal": top.get("signal", "neutral"),
                    "confidence": probability,
                    "reasoning": reasoning,
                }

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="暂无该交易对的剧本推演数据",
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("获取剧本推演结果失败 symbol=%s", symbol)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取剧本推演结果失败",
        )


@router.get("/phase-history/{symbol}")
async def get_phase_history(
    symbol: str,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取操盘阶段转换历史。

    从 Redis Hash phase:{symbol} 读取当前阶段和转换记录。
    """
    try:
        from app.agents.phase_tracker import _PHASE_LABELS, MarketPhase

        from app.core.redis import get_redis_pool
        redis = get_redis_pool()
        key = f"phase:{symbol.upper()}"
        data = await redis.hgetall(key)

        if not data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="暂无该交易对的阶段历史数据",
            )

        import json
        transitions_raw = data.get("transitions", "[]")
        transitions = json.loads(transitions_raw) if transitions_raw else []
        if isinstance(transitions, list):
            normalized: list[dict] = []
            for item in transitions:
                if not isinstance(item, dict):
                    continue
                ts = item.get("ts") or item.get("at")
                fixed = dict(item)
                if ts:
                    fixed["ts"] = ts
                normalized.append(fixed)
            transitions = normalized

        current_phase = data.get("phase", "accumulation")
        phase_label = _PHASE_LABELS.get(
            MarketPhase(current_phase), current_phase
        )

        return {
            "symbol": symbol.upper(),
            "current_phase": current_phase,
            "current_phase_label": phase_label,
            "entered_at": data.get("entered_at", ""),
            "transitions": transitions,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("获取阶段历史失败 symbol=%s", symbol)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取阶段历史失败",
        )


@router.get("/counter-strategy/{symbol}")
async def get_counter_strategy(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取最新反庄策略（含进场/止损/止盈点位）。"""
    try:
        user_level = 2 if user.is_admin else user.membership_level

        # 免费用户不直读 analysis:latest，避免绕过 playbook-sim 脱敏逻辑
        if user_level >= 1:
            report = await get_json(f"analysis:latest:{symbol.upper()}")
            if report and isinstance(report, dict):
                sections = report.get("sections", [])
                for section in sections:
                    if section.get("title") == "剧本推演" and section.get("data"):
                        section_data = section.get("data") or {}
                        raw = section_data.get("raw_data", section_data)
                        counter = raw.get("counter_strategy", {})
                        if counter:
                            return {
                                "symbol": symbol.upper(),
                                "matched_playbook": raw.get("matched_playbook", ""),
                                "probability": raw.get("probability", 0),
                                "counter_strategy": counter,
                            }

        # 回退：从 playbook-sim 结果提取反制策略
        sim = await simulate(symbol.upper(), user_level=user_level)
        if isinstance(sim, dict) and not sim.get("error"):
            top_matches = sim.get("top_matches") or []
            if top_matches:
                top = top_matches[0]
                counter = top.get("counter_strategy") or {}
                if counter:
                    return {
                        "symbol": symbol.upper(),
                        "matched_playbook": top.get("name", ""),
                        "probability": round(float(top.get("match_pct", 0)) / 100, 4),
                        "counter_strategy": counter,
                    }

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="暂无该交易对的反庄策略数据",
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("获取反庄策略失败 symbol=%s", symbol)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取反庄策略失败",
        )
