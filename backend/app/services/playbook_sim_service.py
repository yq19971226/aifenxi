"""剧本演练服务 — 匹配剧本 + 3AI对抗推演 + 权限控制 + 缓存。

- L1: 规则引擎遍历17剧本计算匹配度（特征匹配 + 阶段匹配）
- L2: 庄家AI推演（站庄家视角推演操盘计划）
- L3: 防御AI反制（看到L2后生成散户反制策略）
- L4: 裁判AI采纳（综合L2+L3输出最终建议）
- L5: 最终策略输出
- 根据用户会员等级返回完整数据或脱敏骨架
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import now_minus_interval_literal, insert_returning

from app.agents.phase_tracker import get_current_phase
from app.agents.playbook_patterns import PLAYBOOK_PATTERNS, PlaybookPattern
from app.core.llm_client import llm_client
from app.core.redis import get_json, get_redis_pool, set_with_ttl

logger = logging.getLogger(__name__)

_CACHE_TTL = 900  # 15min

# ── 质量门槛（防止低质量数据污染广场） ─────────────────
_MIN_PERSIST_MATCH_PCT = 15.0    # 低于此匹配度不入库
_MIN_PUBLISH_MATCH_PCT = 30.0    # 低于此匹配度入库但不发布到广场
_MIN_PUBLISH_FEATURES = 2        # 至少匹配 2 个特征才发布


def _build_signal_descriptions(
    price: float,
    indicators: dict,
    deriv: dict,
    onchain: dict,
    calendar: list | None = None,
) -> list[str]:
    """从原始指标数据生成中文信号描述，用于剧本关键词匹配。"""
    descs: list[str] = []

    # ── RSI 信号（仅 RSI 自身语义）──
    rsi = indicators.get("rsi") or indicators.get("rsi_14")
    if isinstance(rsi, (int, float)):
        if rsi > 70:
            descs.append("RSI接近超买")
        elif rsi > 60:
            descs.append("RSI偏强")
        elif rsi < 30:
            descs.append("RSI超卖")
        elif rsi < 40:
            descs.append("RSI偏弱")

    # ── EMA 排列 ──
    ema7 = indicators.get("ema_7") or indicators.get("ema7")
    ema25 = indicators.get("ema_25") or indicators.get("ema25")
    ema99 = indicators.get("ema_99") or indicators.get("ema99")
    if ema7 and ema25 and ema99:
        try:
            e7, e25, e99 = float(ema7), float(ema25), float(ema99)
            if e7 > e25 > e99:
                descs.append("EMA多头排列")
            elif e7 < e25 < e99:
                descs.append("EMA空头排列")
        except (ValueError, TypeError):
            pass

    # ── MACD 信号 ──
    macd_val = indicators.get("macd")
    macd_sig = indicators.get("macd_signal")
    macd_hist = indicators.get("macd_histogram")
    if isinstance(macd_val, (int, float)) and isinstance(macd_sig, (int, float)):
        if macd_val > macd_sig and isinstance(macd_hist, (int, float)) and macd_hist > 0:
            descs.append("MACD金叉")
        elif macd_val < macd_sig and isinstance(macd_hist, (int, float)) and macd_hist < 0:
            descs.append("MACD死叉")

    # ── 布林带信号 ──
    bb_upper = indicators.get("bb_upper")
    bb_lower = indicators.get("bb_lower")
    bb_middle = indicators.get("bb_middle")
    if isinstance(bb_upper, (int, float)) and isinstance(bb_lower, (int, float)) and price > 0:
        if price >= bb_upper:
            descs.append("价格触及布林上轨")
        elif price <= bb_lower:
            descs.append("价格触及布林下轨")
        elif isinstance(bb_middle, (int, float)) and bb_upper > bb_lower:
            bandwidth = (bb_upper - bb_lower) / bb_middle if bb_middle > 0 else 0
            if bandwidth < 0.02:
                descs.append("布林带收窄")

    # ── 成交量（每个区间仅 1 个描述）──
    vol = indicators.get("volume") or indicators.get("vol")
    vol_ma = indicators.get("volume_ma") or indicators.get("vol_ma20")
    if isinstance(vol, (int, float)) and isinstance(vol_ma, (int, float)) and vol_ma > 0:
        ratio = vol / vol_ma
        if ratio < 0.5:
            descs.append("成交量持续萎缩")
        elif ratio < 0.8:
            descs.append("成交量温和")
        elif ratio > 2.0:
            descs.append("成交量显著放大")
        elif ratio > 1.3:
            descs.append("成交量温和放大")

    # ── 资金费率（每个区间仅 1 个描述）──
    fr = deriv.get("funding_rate") or deriv.get("fundingRate")
    if isinstance(fr, (int, float)):
        if fr < -0.01:
            descs.append("资金费率深度负值")
        elif fr < 0:
            descs.append("资金费率为负")
        elif fr > 0.01:
            descs.append("资金费率偏高")

    # ── OI 变化（删除不当推导）──
    oi_change = deriv.get("oi_change_pct") or deriv.get("open_interest_change")
    if isinstance(oi_change, (int, float)):
        if oi_change > 5:
            descs.append("OI增长")
        elif oi_change < -5:
            descs.append("OI下降")

    # ── 链上数据 ──
    netflow = onchain.get("exchange_netflow") or onchain.get("netflow")
    if isinstance(netflow, (int, float)):
        if netflow > 0:
            descs.append("交易所流入激增")
        elif netflow < 0:
            descs.append("交易所持续流出")

    whale = onchain.get("whale_change_24h") or onchain.get("whale_change")
    if isinstance(whale, (int, float)):
        if whale > 0:
            descs.append("巨鲸增仓")
        elif whale < 0:
            descs.append("巨鲸持仓下降")
        # whale == 0 不生成信号

    fg = onchain.get("fear_greed_index") or onchain.get("fear_greed")
    if isinstance(fg, (int, float)):
        if fg < 25:
            descs.append("恐慌贪婪<25")
        elif fg > 75:
            descs.append("情绪极度贪婪")

    mvrv = onchain.get("mvrv") or onchain.get("mvrv_ratio")
    if isinstance(mvrv, (int, float)):
        if mvrv < 2:
            descs.append("MVRV<2")
        elif mvrv > 3.5:
            descs.append("MVRV>3.5")

    # ── 日历事件 ──
    if calendar and isinstance(calendar, list):
        _CAL_BEARISH = {"Token Unlock", "Hard Fork", "Soft Fork"}
        _CAL_BULLISH = {"Halving", "Exchange Listing", "Mainnet Launch", "Partnership", "Burn", "Airdrop"}
        for evt in calendar:
            if not isinstance(evt, dict):
                continue
            cat = evt.get("category") or evt.get("event_type") or ""
            title = evt.get("title") or evt.get("name") or ""
            if cat in _CAL_BEARISH or "unlock" in title.lower():
                descs.append("Token解锁抛压")
            elif cat in _CAL_BULLISH or "halving" in title.lower():
                descs.append("重大利好事件")

    return descs


async def _get_market_snapshot(symbol: str) -> dict | None:
    """从 Redis 缓存获取最新分析报告数据。

    优先级：
    1. analysis:latest:{symbol}（趋势分析缓存）
    2. analysis:cache:{symbol}:*（任意模式缓存）
    3. 从 Redis 实时数据（price/klines/indicators）构建最小快照
    """
    try:
        report = await get_json(f"analysis:latest:{symbol}")
        if report and isinstance(report, dict):
            return report
    except Exception as exc:
        logger.error("获取市场快照失败: %s", exc)

    # Fallback 1: 按确定性 key 逐模式尝试（避免 O(N) redis.keys 扫描）
    try:
        redis = get_redis_pool()
        for mode in ("trend", "intraday", "scalping"):
            raw = await redis.get(f"analysis:cache:{symbol}:{mode}")
            if raw:
                data = json.loads(raw)
                if isinstance(data, dict) and data.get("symbol"):
                    logger.info("market_snapshot_fallback mode=%s", mode)
                    return data
    except Exception as exc:
        logger.warning("market_snapshot_fallback 失败: %s", exc)

    # Fallback 2: 从 Redis 实时数据构建丰富快照
    try:
        redis = get_redis_pool()
        raw_price = await redis.get(f"latest_price:{symbol}")
        if raw_price:
            price = float(raw_price)
            # 读取可用的 klines 和 indicators（大周期优先）
            klines_data = (
                await get_json(f"klines:{symbol}:4h")
                or await get_json(f"klines:{symbol}:1h")
                or await get_json(f"klines:{symbol}:1d")
                or []
            )
            indicators = (
                await get_json(f"indicators:{symbol}:4h")
                or await get_json(f"indicators:{symbol}:1h")
                or await get_json(f"indicators:{symbol}:1d")
                or {}
            )
            deriv = await get_json(f"derivatives:{symbol}") or {}
            onchain = await get_json(f"onchain:{symbol}") or {}
            news = await get_json(f"news:feed:{symbol}") or {}
            cg_oi = await get_json(f"cg_oi:{symbol}") or {}
            cg_fr = await get_json(f"cg_fr:{symbol}") or {}
            cg_cvd = await get_json(f"cg_cvd:{symbol}") or {}
            cg_netflow = await get_json(f"cg_netflow:{symbol}") or {}
            calendar = await get_json(f"calendar:{symbol}") or []

            if not isinstance(indicators, dict):
                indicators = {}
            if not isinstance(deriv, dict):
                deriv = {}
            if not isinstance(onchain, dict):
                onchain = {}

            # 生成信号描述文本用于剧本关键词匹配
            signal_descs = _build_signal_descriptions(
                price, indicators, deriv, onchain,
                calendar=calendar if isinstance(calendar, list) else None,
            )

            snapshot = {
                "symbol": symbol,
                "signal": "neutral",
                "confidence": 0.0,
                "sections": [],
                "current_price": price,
                "klines_summary": {
                    "count": len(klines_data) if isinstance(klines_data, list) else 0,
                },
                "indicators": indicators,
                "derivatives": deriv,
                "onchain": onchain,
                "news": news if isinstance(news, (dict, list)) else {},
                "coinglass": {"oi": cg_oi, "funding_rate": cg_fr, "cvd": cg_cvd, "netflow": cg_netflow},
                "calendar_events": calendar if isinstance(calendar, list) else [],
                "signal_descriptions": signal_descs,
                "live_snapshot": True,
            }
            logger.info(
                "market_snapshot_live symbol=%s price=%.2f signals=%d",
                symbol, price, len(signal_descs),
            )
            return snapshot
    except Exception as exc:
        logger.warning("market_snapshot_live 构建失败: %s", exc)

    return None


def _calculate_match_scores(
    report: dict,
    current_phase: str,
) -> list[dict]:
    """遍历所有剧本，计算匹配度。

    匹配算法：
    1. 特征关键词匹配（在分析报告文本中搜索）
    2. 阶段匹配加分（剧本阶段与当前 phase 匹配时加分）
    """
    # 提取报告文本用于关键词匹配
    report_text = json.dumps(report, ensure_ascii=False).lower()

    results: list[dict] = []
    for pattern in PLAYBOOK_PATTERNS:
        # 特征匹配分
        matched_features = 0
        for feature in pattern.features:
            # 对特征关键词做简单匹配
            keywords = [w for w in feature.replace("，", ",").split(",") if len(w.strip()) > 1]
            if not keywords:
                keywords = [feature]
            for kw in keywords:
                if kw.strip().lower() in report_text:
                    matched_features += 1
                    break

        feature_score = matched_features / len(pattern.features) if pattern.features else 0

        # 阶段匹配加分
        stage_bonus = 0.0
        current_stage_idx = -1
        if pattern.stages and current_phase:
            for idx, stage in enumerate(pattern.stages):
                if stage.phase == current_phase:
                    stage_bonus = 0.15
                    current_stage_idx = idx
                    break

        match_pct = min(round((feature_score * 0.85 + stage_bonus) * 100, 1), 100.0)

        results.append({
            "name": pattern.name,
            "match_pct": match_pct,
            "signal": pattern.signal,
            "strategy_type": pattern.strategy_type,
            "aftermath": pattern.aftermath,
            "matched_features": matched_features,
            "total_features": len(pattern.features),
            "current_stage_idx": current_stage_idx,
            "stages": [s.model_dump() for s in pattern.stages],
            "counter_strategy": {
                "action": pattern.counter_strategy.action,
                "entry_logic": pattern.counter_strategy.entry_logic,
                "stop_loss_logic": pattern.counter_strategy.stop_loss_logic,
                "target_logic": pattern.counter_strategy.target_logic,
                "risk_level": pattern.counter_strategy.risk_level,
                "wait_signal": pattern.counter_strategy.wait_signal,
                "risk_warning": pattern.counter_strategy.risk_warning,
            },
        })

    # 按匹配度排序
    results.sort(key=lambda x: x["match_pct"], reverse=True)
    return results


def _build_stages_text(pattern: dict) -> str:
    """构建剧本阶段描述文本。"""
    if not pattern.get("stages"):
        return "无阶段信息"
    lines = []
    for idx, s in enumerate(pattern["stages"]):
        marker = " ← 当前" if idx == pattern.get("current_stage_idx", -1) else ""
        lines.append(f"  阶段{idx+1}: {s['name']} ({s['phase']}) — {s['typical_duration']}{marker}")
    return "\n".join(lines)


def _build_market_summary(report: dict) -> str:
    """从报告/快照中提取关键市场数据摘要。"""
    parts = []
    price = report.get("current_price")
    if price:
        parts.append(f"当前价格: {price}")
    indicators = report.get("indicators", {})
    if isinstance(indicators, dict):
        for k in ("rsi", "rsi_14", "ema_7", "ema_25", "ema_99", "atr"):
            v = indicators.get(k)
            if v is not None:
                parts.append(f"{k}: {v}")
    deriv = report.get("derivatives", {})
    if isinstance(deriv, dict):
        for k in ("funding_rate", "fundingRate", "open_interest", "long_short_ratio"):
            v = deriv.get(k)
            if v is not None:
                parts.append(f"{k}: {v}")
    descs = report.get("signal_descriptions", [])
    if descs:
        parts.append(f"信号描述: {', '.join(descs[:10])}")
    return "\n".join(parts) if parts else "市场数据有限"


def _normalize_str_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None and str(item).strip()]


def _normalize_dealer_prediction(result: dict) -> dict:
    normalized = dict(result) if isinstance(result, dict) else {}
    normalized["tactics"] = _normalize_str_list(normalized.get("tactics"))
    normalized["key_observations"] = _normalize_str_list(
        normalized.get("key_observations")
    )
    target_range = normalized.get("target_price_range")
    if not isinstance(target_range, dict):
        normalized["target_price_range"] = {"low": 0, "high": 0}
    return normalized


async def _llm_dealer_prediction(
    symbol: str,
    pattern: dict,
    report: dict,
    current_phase: str,
) -> dict:
    """L2 庄家AI推演 — 站庄家视角推演下一步操盘计划。"""
    stages_text = _build_stages_text(pattern)
    market_summary = _build_market_summary(report)

    prompt = f"""你是一位资深庄家操盘手。当前交易对 {symbol}，市场阶段: {current_phase}。

最匹配的操盘剧本: {pattern['name']}（匹配度 {pattern['match_pct']}%）
剧本信号: {pattern['signal']}

剧本阶段:
{stages_text}

当前市场数据:
{market_summary}

请站在庄家的视角分析：
1. 当前处于剧本的哪个阶段（序号，从1开始）
2. 你（庄家）下一步的操盘计划是什么
3. 目标价位区间（具体数字）
4. 预计执行时间窗口
5. 你会利用哪些手段（如假突破、洗盘、诱多/诱空等）
6. 下一阶段转换概率（0~1）

以 JSON 格式回复:
{{"current_stage": 1, "next_stage_probability": 0.7, "estimated_transition": "4-8小时", "dealer_plan": "描述庄家操盘计划", "target_price_range": {{"low": 0, "high": 0}}, "tactics": ["手段1", "手段2"], "key_observations": ["观察点1", "观察点2"]}}"""

    try:
        from app.core.model_router import get_model_for_agent
        model_key = await get_model_for_agent("playbook_dealer")
        result = await llm_client.call_model(
            model_key=model_key,
            system_prompt="你是庄家操盘推演专家。你的任务是站在庄家/主力的视角，推演他们的操盘意图和下一步计划。输出严格 JSON 格式。",
            user_prompt=prompt,
            timeout_s=60.0,
        )
        if isinstance(result, dict):
            normalized = _normalize_dealer_prediction(result)
            dp = normalized.get("dealer_plan")
            if isinstance(dp, str) and dp.strip():
                return normalized
        return {}
    except Exception as exc:
        logger.error("L2 庄家推演失败: %s", exc)
        return {}


async def _llm_defense_strategy(
    symbol: str,
    pattern: dict,
    dealer_prediction: dict,
    report: dict,
    current_phase: str,
) -> dict:
    """L3 防御AI反制 — 看到庄家推演后生成散户反制策略。"""
    market_summary = _build_market_summary(report)
    dealer_plan = dealer_prediction.get("dealer_plan", "未知")
    tactics = ", ".join(dealer_prediction.get("tactics", []))
    target_range = dealer_prediction.get("target_price_range", {})
    transition_time = dealer_prediction.get("estimated_transition", "未知")

    counter = pattern.get("counter_strategy", {})

    prompt = f"""你是散户防御策略专家。当前交易对 {symbol}，市场阶段: {current_phase}。

庄家AI的推演结果（L2输出）:
- 识别剧本: {pattern['name']}
- 庄家计划: {dealer_plan}
- 庄家手段: {tactics}
- 目标价位: {target_range.get('low', '?')} ~ {target_range.get('high', '?')}
- 预计时间: {transition_time}

剧本模板反制策略（参考）:
- 反制动作: {counter.get('action', '无')}
- 进场逻辑: {counter.get('entry_logic', '无')}
- 确认信号: {counter.get('wait_signal', '无')}

当前市场数据:
{market_summary}

请站在散户/交易者的角度，针对庄家的操盘计划生成防御策略：
1. 核心反制思路（一句话总结）
2. 具体进场点位和条件
3. 止损设置（具体价位或逻辑）
4. 止盈目标（分批）
5. 必须等待的确认信号（防止被二次骗线）
6. 风险等级和警告
7. 防御置信度（0~1）

以 JSON 格式回复:
{{"defense_summary": "一句话反制思路", "entry": {{"price": 0, "condition": "入场条件"}}, "stop_loss": {{"price": 0, "logic": "止损逻辑"}}, "take_profit": [{{"price": 0, "ratio": "20%"}}], "confirmation_signals": ["确认信号1"], "risk_level": "moderate", "risk_warning": "风险警告", "confidence": 0.7}}"""

    try:
        from app.core.model_router import get_model_for_agent
        model_key = await get_model_for_agent("playbook_defense")
        result = await llm_client.call_model(
            model_key=model_key,
            system_prompt="你是散户防御策略专家。你已经看到了庄家AI的操盘推演，现在需要生成针对性的反制策略来保护交易者。输出严格 JSON 格式。",
            user_prompt=prompt,
            timeout_s=60.0,
        )
        if isinstance(result, dict) and not result.get("is_fallback"):
            return result
        return {}
    except Exception as exc:
        logger.error("L3 防御反制失败: %s", exc)
        return {}


async def _llm_judge_adoption(
    symbol: str,
    pattern: dict,
    dealer_prediction: dict,
    defense_strategy: dict,
    report: dict,
    current_phase: str,
) -> dict:
    """L4 裁判AI采纳 — 综合庄家推演和防御策略，输出最终建议。"""
    market_summary = _build_market_summary(report)
    dealer_plan = dealer_prediction.get("dealer_plan", "未知")
    dealer_prob = dealer_prediction.get("next_stage_probability", 0)
    defense_summary = defense_strategy.get("defense_summary", "未知")
    defense_conf = defense_strategy.get("confidence", 0)
    risk_level = defense_strategy.get("risk_level", "未知")

    prompt = f"""你是独立裁判分析师。当前交易对 {symbol}，市场阶段: {current_phase}。
识别剧本: {pattern['name']}（匹配度 {pattern['match_pct']}%）

你需要审阅两方 AI 的输出，做出最终采纳决定。

【庄家AI (L2)】
- 操盘计划: {dealer_plan}
- 阶段转换概率: {dealer_prob}
- 庄家手段: {', '.join(dealer_prediction.get('tactics', []))}

【防御AI (L3)】
- 反制思路: {defense_summary}
- 风险等级: {risk_level}
- 防御置信度: {defense_conf}
- 止损逻辑: {defense_strategy.get('stop_loss', {}).get('logic', '未知')}

当前市场数据:
{market_summary}

请作为裁判：
1. 评估庄家推演的可信度（0~1）
2. 评估防御策略的可行性（0~1）
3. 做出最终采纳决定：采纳防御策略 / 部分采纳 / 建议观望
4. 最终操作建议（一句话）
5. 关键风险提醒

以 JSON 格式回复:
{{"dealer_credibility": 0.7, "defense_feasibility": 0.8, "adoption": "adopt|partial|wait", "final_recommendation": "最终一句话建议", "next_move": "具体下一步操作", "risk_alerts": ["风险提醒1"], "reasoning": "裁判推理过程"}}"""

    try:
        from app.core.model_router import get_model_for_agent
        model_key = await get_model_for_agent("playbook_judge")
        result = await llm_client.call_model(
            model_key=model_key,
            system_prompt="你是独立裁判分析师，负责综合庄家AI和防御AI的输出，做出最终采纳决定。你必须客观公正，不偏向任何一方。输出严格 JSON 格式。",
            user_prompt=prompt,
            timeout_s=60.0,
        )
        if isinstance(result, dict) and not result.get("is_fallback"):
            return result
        return {}
    except Exception as exc:
        logger.error("L4 裁判采纳失败: %s", exc)
        return {}


def _sse(data: dict) -> str:
    """将字典序列化为 SSE data 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


_LOCK_TTL = 120  # 锁超时秒数，防死锁
_LOCK_POLL_INTERVAL = 0.5  # 轮询间隔
_LOCK_POLL_MAX = 180  # 最多轮询次数 (180 * 0.5s = 90s)


async def simulate_stream(
    symbol: str,
    user_level: int = 0,
):
    """剧本演练 SSE 流式入口 — 逐步推送 L1~L5 事件。

    Yields:
        SSE 格式字符串，每完成一步推送一个事件
    """
    symbol = symbol.upper()

    # 检查缓存
    cache_key = f"playbook_sim:{symbol}"
    cached = await get_json(cache_key)
    if cached and isinstance(cached, dict):
        result = _apply_permission(cached, user_level)
        yield _sse({"type": "cached", "result": result})
        return

    # 尝试获取分布式锁
    lock_key = f"playbook_sim:lock:{symbol}"
    redis = get_redis_pool()
    lock_acquired: bool | None = None

    try:
        lock_acquired = await redis.set(lock_key, "1", nx=True, ex=_LOCK_TTL)
    except Exception as exc:
        logger.warning("剧本演练获取锁失败: %s", exc)

    if lock_acquired is False:
        # 其他请求正在执行，轮询缓存等待结果
        yield _sse({"type": "progress", "step": "data", "message": "其他用户正在分析中，等待结果..."})
        for _ in range(_LOCK_POLL_MAX):
            await asyncio.sleep(_LOCK_POLL_INTERVAL)
            try:
                cached = await get_json(cache_key)
                if cached and isinstance(cached, dict):
                    result = _apply_permission(cached, user_level)
                    yield _sse({"type": "cached", "result": result})
                    return
            except Exception:
                pass
        yield _sse({"type": "error", "message": "等待超时，请稍后重试"})
        return

    # lock_acquired is True 或 None (fail-open) — 执行完整流程
    try:
        async for chunk in _simulate_stream_impl(symbol, user_level, cache_key):
            yield chunk
    finally:
        if lock_acquired:
            try:
                await redis.delete(lock_key)
            except Exception:
                logger.warning("剧本演练释放锁失败", exc_info=True)


async def _simulate_stream_impl(
    symbol: str,
    user_level: int,
    cache_key: str,
):
    """实际执行 3AI 推演流程（已持有锁）。"""

    # 采集市场数据
    yield _sse({"type": "progress", "step": "data", "message": "采集市场数据..."})
    report = await _get_market_snapshot(symbol)
    if not report:
        yield _sse({"type": "error", "message": "暂无该交易对的分析数据"})
        return

    # 获取当前阶段
    try:
        phase = await get_current_phase(symbol)
        current_phase = phase.value if phase is not None else "accumulation"
    except Exception:
        current_phase = "accumulation"

    # L1: 剧本匹配
    yield _sse({"type": "progress", "step": "L1", "message": "剧本匹配中..."})
    all_matches = _calculate_match_scores(report, current_phase)
    top = all_matches[0] if all_matches else None

    yield _sse({
        "type": "step_done", "step": "L1",
        "data": {"top_matches": all_matches[:5], "total_playbooks": len(PLAYBOOK_PATTERNS)},
    })

    dealer_prediction = None
    defense_strategy = None
    judge_adoption = None
    llm_prediction = None

    if top and top["match_pct"] > 10:
        # L2: 庄家AI推演
        yield _sse({"type": "progress", "step": "L2", "message": "庄家AI推演中..."})
        dealer_prediction = await _llm_dealer_prediction(
            symbol, top, report, current_phase,
        )
        if dealer_prediction:
            llm_prediction = dealer_prediction
            yield _sse({"type": "step_done", "step": "L2", "data": dealer_prediction})

            # L3: 防御AI反制
            yield _sse({"type": "progress", "step": "L3", "message": "防御AI反制中..."})
            defense_strategy = await _llm_defense_strategy(
                symbol, top, dealer_prediction, report, current_phase,
            )
            if defense_strategy:
                yield _sse({"type": "step_done", "step": "L3", "data": defense_strategy})

                # L4: 裁判AI采纳
                yield _sse({"type": "progress", "step": "L4", "message": "裁判AI采纳中..."})
                judge_adoption = await _llm_judge_adoption(
                    symbol, top, dealer_prediction, defense_strategy,
                    report, current_phase,
                )
                if judge_adoption:
                    yield _sse({"type": "step_done", "step": "L4", "data": judge_adoption})
                else:
                    yield _sse({"type": "step_fail", "step": "L4", "message": "裁判AI调用失败"})
            else:
                yield _sse({"type": "step_fail", "step": "L3", "message": "防御AI调用失败"})
        else:
            yield _sse({"type": "step_fail", "step": "L2", "message": "庄家AI调用失败"})

    result = {
        "symbol": symbol,
        "current_phase": current_phase,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "top_matches": all_matches[:5],
        "llm_prediction": llm_prediction,
        "dealer_prediction": dealer_prediction,
        "defense_strategy": defense_strategy,
        "judge_adoption": judge_adoption,
        "adversarial_complete": all(
            [dealer_prediction, defense_strategy, judge_adoption]
        ),
        "total_playbooks": len(PLAYBOOK_PATTERNS),
    }

    # 缓存
    try:
        await set_with_ttl(cache_key, result, _CACHE_TTL)
    except Exception as exc:
        logger.error("缓存剧本演练结果失败: %s", exc)

    # 推送最终结果
    yield _sse({"type": "complete", "result": _apply_permission(result, user_level)})


async def simulate(
    symbol: str,
    user_level: int = 0,
) -> dict:
    """剧本演练主入口（非流式，兼容旧接口）。"""
    symbol = symbol.upper()

    cache_key = f"playbook_sim:{symbol}"
    cached = await get_json(cache_key)
    if cached and isinstance(cached, dict):
        return _apply_permission(cached, user_level)

    # 尝试获取分布式锁
    lock_key = f"playbook_sim:lock:{symbol}"
    redis = get_redis_pool()
    lock_acquired: bool | None = None

    try:
        lock_acquired = await redis.set(lock_key, "1", nx=True, ex=_LOCK_TTL)
    except Exception as exc:
        logger.warning("剧本演练获取锁失败: %s", exc)

    if lock_acquired is False:
        # 其他请求正在执行，轮询缓存等待结果
        for _ in range(_LOCK_POLL_MAX):
            await asyncio.sleep(_LOCK_POLL_INTERVAL)
            try:
                cached = await get_json(cache_key)
                if cached and isinstance(cached, dict):
                    return _apply_permission(cached, user_level)
            except Exception:
                pass
        return {"error": "分析等待超时，请稍后重试", "symbol": symbol}

    # lock_acquired is True 或 None (fail-open) — 执行完整流程
    try:
        return await _simulate_impl(symbol, user_level, cache_key)
    finally:
        if lock_acquired:
            try:
                await redis.delete(lock_key)
            except Exception:
                logger.warning("剧本演练释放锁失败", exc_info=True)


async def _simulate_impl(
    symbol: str,
    user_level: int,
    cache_key: str,
) -> dict:
    """实际执行 3AI 推演流程（已持有锁，非流式）。"""
    report = await _get_market_snapshot(symbol)
    if not report:
        return {"error": "暂无该交易对的分析数据", "symbol": symbol}

    try:
        phase = await get_current_phase(symbol)
        current_phase = phase.value if phase is not None else "accumulation"
    except Exception:
        current_phase = "accumulation"

    all_matches = _calculate_match_scores(report, current_phase)

    top = all_matches[0] if all_matches else None
    dealer_prediction = None
    defense_strategy = None
    judge_adoption = None
    llm_prediction = None

    if top and top["match_pct"] > 10:
        dealer_prediction = await _llm_dealer_prediction(
            symbol, top, report, current_phase,
        )
        if dealer_prediction:
            llm_prediction = dealer_prediction
            defense_strategy = await _llm_defense_strategy(
                symbol, top, dealer_prediction, report, current_phase,
            )
            if defense_strategy:
                judge_adoption = await _llm_judge_adoption(
                    symbol, top, dealer_prediction, defense_strategy,
                    report, current_phase,
                )

    result = {
        "symbol": symbol,
        "current_phase": current_phase,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "top_matches": all_matches[:5],
        "llm_prediction": llm_prediction,
        "dealer_prediction": dealer_prediction,
        "defense_strategy": defense_strategy,
        "judge_adoption": judge_adoption,
        "adversarial_complete": all(
            [dealer_prediction, defense_strategy, judge_adoption]
        ),
        "total_playbooks": len(PLAYBOOK_PATTERNS),
    }

    try:
        await set_with_ttl(cache_key, result, _CACHE_TTL)
    except Exception as exc:
        logger.error("缓存剧本演练结果失败: %s", exc)

    return _apply_permission(result, user_level)


def _apply_permission(data: dict, user_level: int) -> dict:
    """根据用户等级脱敏。免费用户只能看 top-3 标题+匹配度，详情为 null。"""
    if user_level >= 1:
        return data

    # 免费用户脱敏
    masked = {
        "symbol": data.get("symbol"),
        "current_phase": data.get("current_phase"),
        "timestamp": data.get("timestamp"),
        "total_playbooks": data.get("total_playbooks"),
        "is_masked": True,
        "top_matches": [],
        "llm_prediction": None,
        "dealer_prediction": None,
        "defense_strategy": None,
        "judge_adoption": None,
        "adversarial_complete": False,
    }

    for m in (data.get("top_matches") or [])[:3]:
        masked["top_matches"].append({
            "name": m["name"],
            "match_pct": m["match_pct"],
            "signal": m["signal"],
            # 以下字段脱敏
            "strategy_type": None,
            "aftermath": None,
            "stages": None,
            "counter_strategy": None,
            "current_stage_idx": None,
        })

    return masked


# ── 持久化（D5） ─────────────────────────────────────────────


async def save_prediction(
    session: AsyncSession,
    symbol: str,
    result: dict,
) -> str | None:
    """将剧本推演结果持久化到 playbook_predictions 表。

    质量门槛:
    1. match_pct < _MIN_PERSIST_MATCH_PCT → 不入库
    2. match_pct < _MIN_PUBLISH_MATCH_PCT 或 matched_features < 2 → 入库但 published=false
    3. 满足条件 → 入库且 published=true（广场可见）

    去重逻辑: 同一币种+同一剧本+4小时窗口内不重复创建。
    """
    top = (result.get("top_matches") or [None])[0]
    if not top:
        return None

    playbook_name = top["name"]
    match_pct = top["match_pct"]
    matched_features = top.get("matched_features", 0)

    # 防线1: 匹配度太低直接丢弃
    if match_pct < _MIN_PERSIST_MATCH_PCT:
        logger.info(
            "剧本匹配度过低，不入库: %s %s %.1f%%",
            symbol, playbook_name, match_pct,
        )
        return None

    # 防线2: 判断是否达到发布标准
    should_publish = (
        match_pct >= _MIN_PUBLISH_MATCH_PCT
        and matched_features >= _MIN_PUBLISH_FEATURES
    )

    # 去重检查
    try:
        dup = await session.execute(
            text(f"""
                SELECT id FROM playbook_predictions
                WHERE symbol = :symbol
                  AND playbook_name = :name
                  AND created_at > {now_minus_interval_literal(4, 'hours')}
                LIMIT 1
            """),
            {"symbol": symbol, "name": playbook_name},
        )
        if dup.first():
            return None
    except Exception:
        pass  # 表可能不存在

    stages_json = json.dumps(top.get("stages", []), ensure_ascii=False)
    current_stage_idx = top.get("current_stage_idx", -1)

    try:
        result_row = await insert_returning(
            session,
            """
                INSERT INTO playbook_predictions
                    (symbol, playbook_name, match_pct, current_stage_idx,
                     stages_json, status, published)
                VALUES
                    (:symbol, :name, :match_pct, :stage_idx,
                     :stages_json, 'active', :published)
                RETURNING id
            """,
            {
                "symbol": symbol,
                "name": playbook_name,
                "match_pct": match_pct,
                "stage_idx": current_stage_idx,
                "stages_json": stages_json,
                "published": should_publish,
            },
            table="playbook_predictions",
        )
        await session.flush()
        row = result_row.mappings().first()
        return str(row["id"]) if row else None
    except Exception as exc:
        logger.error("持久化剧本预测失败: %s", exc)
        return None
