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

from app.core.database import AsyncSessionLocal
from app.core.sql_compat import now_minus_interval_literal, insert_returning

from app.agents.phase_tracker import get_current_phase
from app.agents.playbook_patterns import PLAYBOOK_PATTERNS, PlaybookPattern
from app.core.redis import get_json, get_redis_pool, set_with_ttl
from app.services.playbook_prompts import (
    llm_dealer_prediction,
    llm_defense_strategy,
    llm_judge_adoption,
)

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
            cg_oi_stablecoin = await get_json(f"cg_oi_stablecoin:{symbol}") or {}
            cg_oi_coin = await get_json(f"cg_oi_coin:{symbol}") or {}
            cg_fr = await get_json(f"cg_fr:{symbol}") or {}
            cg_cvd = await get_json(f"cg_cvd:{symbol}") or {}
            cg_netflow = await get_json(f"cg_netflow:{symbol}") or {}
            cg_orderbook = await get_json(f"cg_orderbook:{symbol}") or {}
            cg_large_orders = await get_json(f"cg_large_orders:{symbol}") or {}
            cg_option_info = await get_json(f"cg_option_info:{symbol}") or {}
            cg_option_maxpain = await get_json(f"cg_option_maxpain:{symbol}") or {}
            gecko_global = await get_json("gecko_global") or {}
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
                "coinglass": {
                    "oi": cg_oi,
                    "oi_stablecoin": cg_oi_stablecoin,
                    "oi_coin": cg_oi_coin,
                    "funding_rate": cg_fr,
                    "cvd": cg_cvd,
                    "netflow": cg_netflow,
                    "orderbook": cg_orderbook,
                    "large_orders": cg_large_orders,
                    "options": cg_option_info,
                    "option_max_pain": cg_option_maxpain,
                },
                "coingecko": {
                    "global": gecko_global if isinstance(gecko_global, dict) else {},
                },
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

    # Fallback 3: 从数据库构建最小快照（适用于 Redis/外部源未热起来的本地环境）
    try:
        async with AsyncSessionLocal() as session:
            async def _query_optional(sql: str) -> dict | None:
                try:
                    row = (
                        await session.execute(text(sql), {"symbol": symbol})
                    ).mappings().first()
                    return dict(row) if row else None
                except Exception as exc:
                    logger.warning("market_snapshot_db_optional_query_failed: %s", exc)
                    return None

            price_row = (
                await session.execute(
                    text(
                        """
                        SELECT close
                        FROM klines
                        WHERE symbol = :symbol
                          AND interval IN ('4h', '1h', '1d')
                        ORDER BY time DESC
                        LIMIT 1
                        """
                    ),
                    {"symbol": symbol},
                )
            ).mappings().first()
            if not price_row or price_row.get("close") is None:
                return None

            price = float(price_row["close"])

            indicator_row = await _query_optional(
                """
                SELECT ema7, ema25, ema99, rsi, macd, macd_signal, macd_histogram, bb_upper, bb_middle, bb_lower
                FROM indicators
                WHERE symbol = :symbol
                  AND interval IN ('4h', '1h', '1d')
                ORDER BY time DESC
                LIMIT 1
                """
            )

            onchain_row = await _query_optional(
                """
                SELECT exchange_netflow, whale_change_24h, fear_greed_index, mvrv
                FROM onchain_snapshots
                WHERE symbol = :symbol
                ORDER BY time DESC
                LIMIT 1
                """
            )

            derivatives_row = await _query_optional(
                """
                SELECT funding_rate,
                       long_short_account_ratio,
                       top_long_short_account_ratio
                FROM derivatives_snapshots
                WHERE symbol = :symbol
                ORDER BY time DESC
                LIMIT 1
                """
            )

            def _safe_float(v: object) -> float | None:
                if v is None:
                    return None
                try:
                    return float(v)
                except (ValueError, TypeError):
                    return None

            indicators = {
                k: _safe_float(v)
                for k, v in (indicator_row.items() if indicator_row else {})
            }
            onchain = {
                k: int(v) if k == "fear_greed_index" and isinstance(v, (int, float)) else _safe_float(v)
                for k, v in (onchain_row.items() if onchain_row else {})
            }
            derivatives = {}
            if derivatives_row:
                if derivatives_row.get("funding_rate") is not None:
                    derivatives["funding_rate"] = float(derivatives_row["funding_rate"])
                if derivatives_row.get("long_short_account_ratio") is not None:
                    derivatives["long_short_ratio"] = float(derivatives_row["long_short_account_ratio"])
                if derivatives_row.get("top_long_short_account_ratio") is not None:
                    derivatives["top_long_short_ratio"] = float(derivatives_row["top_long_short_account_ratio"])

            signal_descs = _build_signal_descriptions(
                price,
                indicators,
                derivatives,
                onchain,
                calendar=None,
            )

            snapshot = {
                "symbol": symbol,
                "signal": "neutral",
                "confidence": 0.0,
                "sections": [],
                "current_price": price,
                "klines_summary": {"count": 1},
                "indicators": indicators,
                "derivatives": derivatives,
                "onchain": onchain,
                "news": {},
                "coinglass": {},
                "coingecko": {},
                "calendar_events": [],
                "signal_descriptions": signal_descs,
                "db_snapshot": True,
            }
            logger.info(
                "market_snapshot_db_fallback symbol=%s price=%.2f signals=%d",
                symbol, price, len(signal_descs),
            )
            return snapshot
    except Exception as exc:
        logger.warning("market_snapshot_db_fallback 失败: %s", exc)

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
    def _build_ranking_explanation(
        *,
        feature_score: float,
        domain_score: float,
        regime_score: float,
        structure_score: float,
        booster_bonus: float,
        invalidation_penalty: float,
        stage_bonus: float,
    ) -> dict:
        drivers = [
            {"label": "特征命中", "value": feature_score},
            {"label": "数据域命中", "value": domain_score},
            {"label": "环境命中", "value": regime_score},
            {"label": "结构命中", "value": structure_score},
            {"label": "Booster 加分", "value": booster_bonus},
            {"label": "阶段加分", "value": stage_bonus},
        ]
        dominant_factors = [
            item["label"]
            for item in sorted(drivers, key=lambda item: item["value"], reverse=True)
            if item["value"] > 0
        ]
        summary = " + ".join(dominant_factors[:2]) if dominant_factors else "特征 / 环境综合命中"
        decision_sentence = f"本次上榜主因：{summary}"
        if invalidation_penalty > 0:
            decision_sentence += "，但被失效信号部分压分"
        return {
            "dominant_factors": dominant_factors,
            "ranking_reason_summary": summary,
            "decision_sentence": decision_sentence,
        }

    def _has_data(value: object) -> bool:
        if value is None:
            return False
        if isinstance(value, dict):
            return any(_has_data(v) for v in value.values())
        if isinstance(value, list):
            return any(_has_data(v) for v in value)
        return True

    def _count_feature_matches(feature: str, report_text: str) -> int:
        keywords = [w for w in feature.replace("，", ",").split(",") if len(w.strip()) > 1]
        if not keywords:
            keywords = [feature]
        for kw in keywords:
            if kw.strip().lower() in report_text:
                return 1
        return 0

    def _available_domains(snapshot: dict) -> set[str]:
        domains: set[str] = set()
        if _has_data(snapshot.get("indicators")):
            domains.add("indicators")
        if _has_data(snapshot.get("onchain")):
            domains.add("onchain")
        if _has_data(snapshot.get("derivatives")):
            domains.add("derivatives")
        if _has_data(snapshot.get("coingecko")):
            domains.add("coingecko")

        cg = snapshot.get("coinglass")
        if isinstance(cg, dict) and _has_data(cg):
            domains.add("coinglass")
            if _has_data(cg.get("oi")):
                domains.add("oi")
            if _has_data(cg.get("oi_stablecoin")) or _has_data(cg.get("oi_coin")):
                domains.add("margin_oi")
            if _has_data(cg.get("funding_rate")):
                domains.add("funding")
            if _has_data(cg.get("netflow")):
                domains.add("netflow")
            if _has_data(cg.get("options")):
                domains.add("options")
            if _has_data(cg.get("orderbook")):
                domains.add("orderbook")
            if _has_data(cg.get("large_orders")):
                domains.add("large_orders")
        return domains

    def _regime_hints(snapshot: dict, phase: str) -> set[str]:
        hints: set[str] = set()
        if phase:
            hints.add(phase)

        indicators = snapshot.get("indicators") or {}
        derivatives = snapshot.get("derivatives") or {}
        coinglass = snapshot.get("coinglass") or {}
        calendar_events = snapshot.get("calendar_events") or []

        ema7 = indicators.get("ema_7") or indicators.get("ema7")
        ema25 = indicators.get("ema_25") or indicators.get("ema25")
        ema99 = indicators.get("ema_99") or indicators.get("ema99")
        volume_ratio = indicators.get("volume_ratio")
        funding_rate = derivatives.get("funding_rate")
        liquidation_1h = derivatives.get("liquidation_1h_usd")

        try:
            if all(isinstance(v, (int, float)) for v in [ema7, ema25, ema99]):
                if float(ema7) > float(ema25) > float(ema99):
                    hints.add("trend_up")
                elif float(ema7) < float(ema25) < float(ema99):
                    hints.add("trend_down")
        except (TypeError, ValueError):
            pass

        if isinstance(volume_ratio, (int, float)) and volume_ratio < 0.8:
            hints.add("range")

        if isinstance(funding_rate, (int, float)):
            if funding_rate > 0.0003:
                hints.add("overheated")
            elif funding_rate < -0.0002:
                hints.add("slow_deleveraging")

        if isinstance(liquidation_1h, (int, float)) and liquidation_1h > 5_000_000:
            hints.add("volatile")

        if calendar_events:
            hints.add("event_driven")

        if _has_data(coinglass.get("options")):
            hints.add("expiry_window")

        return hints

    def _matched_phrases(phrases: list[str], haystack: str) -> list[str]:
        if not phrases:
            return []
        normalized = haystack.lower()
        matched: list[str] = []
        seen: set[str] = set()
        for phrase in phrases:
            token = str(phrase).strip().lower()
            if not token or token in seen:
                continue
            if token in normalized:
                matched.append(str(phrase))
                seen.add(token)
        return matched

    def _count_phrase_matches(phrases: list[str], haystack: str) -> int:
        return len(_matched_phrases(phrases, haystack))

    def _infer_market_structures(snapshot: dict, snapshot_text: str) -> set[str]:
        structures: set[str] = set()

        def _latest_change_24h(series: object) -> float | None:
            if not isinstance(series, list) or not series:
                return None
            latest = series[-1]
            if not isinstance(latest, dict):
                return None
            value = latest.get("oi_change_24h")
            if value is None:
                value = latest.get("change_24h")
            if value is None:
                value = latest.get("open_interest_change_24h")
            if isinstance(value, (int, float)):
                return float(value)
            return None

        derivatives = snapshot.get("derivatives") or {}
        onchain = snapshot.get("onchain") or {}
        coinglass = snapshot.get("coinglass") or {}
        coingecko = snapshot.get("coingecko") or {}

        funding_rate = derivatives.get("funding_rate")
        long_short_ratio = derivatives.get("long_short_ratio")
        exchange_netflow = onchain.get("exchange_netflow")
        option_info = coinglass.get("options") or {}
        put_call_ratio = option_info.get("put_call_ratio") if isinstance(option_info, dict) else None
        stablecoin_oi_change = _latest_change_24h(coinglass.get("oi_stablecoin"))
        coin_oi_change = _latest_change_24h(coinglass.get("oi_coin"))
        gecko_global = coingecko.get("global") if isinstance(coingecko, dict) else {}
        stablecoin_volume_24h = gecko_global.get("stablecoin_volume_24h") if isinstance(gecko_global, dict) else None

        if _has_data(coinglass.get("options")):
            structures.add("options_gamma_pinning")
        if isinstance(put_call_ratio, (int, float)) and put_call_ratio >= 1.1:
            structures.add("protective_put_pressure")
        if _has_data(coinglass.get("orderbook")) or _has_data(coinglass.get("large_orders")):
            structures.add("cross_venue_liquidity_fragmentation")
            structures.add("spot_absorption")
        if isinstance(funding_rate, (int, float)) and funding_rate > 0.0003:
            structures.add("perp_basis_manipulation")
        if isinstance(long_short_ratio, (int, float)) and long_short_ratio > 1.2:
            structures.add("perp_basis_manipulation")
        if isinstance(exchange_netflow, (int, float)) and exchange_netflow > 0:
            structures.add("distribution_with_derivatives_warning")
        if isinstance(exchange_netflow, (int, float)) and exchange_netflow < 0:
            structures.add("etf_flow_led")
        if (
            isinstance(stablecoin_oi_change, (int, float))
            and isinstance(coin_oi_change, (int, float))
            and abs(stablecoin_oi_change - coin_oi_change) >= 8
            and stablecoin_volume_24h is not None
        ):
            structures.add("stablecoin_liquidity_rotation")

        structure_hints: dict[str, list[str]] = {
            "false_breakout_bull_trap": ["假突破", "诱多", "突破关键阻力", "回落收割"],
            "panic_washout_reversal": ["恐慌洗盘", "价格急跌", "巨鲸反向增仓", "快速反弹"],
            "short_squeeze_reversal": ["诱空杀空", "空头持仓激增", "资金费率深度负值", "急速反弹"],
            "double_bottom_absorption": ["二次探底", "回踩前低不破", "rsi底背离", "形成w底"],
            "stair_step_markup": ["阶梯式拉升", "每次回调不破前高", "逐步抬高底部", "持续上涨趋势"],
            "parabolic_distribution": ["拉高出货", "成交量暴增", "巨鲸持仓开始下降", "交易所流入激增"],
            "liquidity_vacuum_trap": ["流动性陷阱", "低流动性", "大额挂单快速撤销", "价格短暂突破后迅速反转"],
            "wash_trading_distortion": ["对倒洗售", "成交量异常放大但价格波动极小", "买卖方向频繁交替", "量价齐跌"],
            "liquidation_wick_hunt": ["插针收割", "瞬间价格偏离", "爆仓集中", "资金费率极端偏离"],
            "twap_accumulation": ["twap拆单吸筹", "高频小额买入", "时间间隔高度均匀", "归集到同一冷钱包"],
            "iceberg_absorption": ["冰山订单吸筹", "自动补单", "成交/挂单比", "隐藏吸筹"],
            "front_run_information_leak": ["抢跑交易", "链上大额转账前", "先行交易", "精准获利"],
            "etf_flow_led": ["etf", "净流入", "现货强于永续"],
            "etf_redemption_supply": ["etf", "净流出", "基差持续收缩"],
            "options_gamma_pinning": ["gamma钉住", "关键行权价", "max pain"],
            "protective_put_pressure": ["put/call", "保护性买沽", "put保护"],
            "stablecoin_liquidity_rotation": ["稳定币保证金oi", "币本位oi", "稳定币24h成交额"],
            "basis_compression_deleveraging": ["基差快速收缩", "oi持续下降", "去杠杆"],
            "distribution_with_derivatives_warning": ["顶部派发", "巨鲸持仓下降", "情绪极度贪婪"],
            "spot_absorption": ["横盘吸筹", "现货深度被持续吸收", "稳定币回流交易所"],
            "cross_venue_liquidity_fragmentation": ["跨所价差", "多交易所", "订单簿深度同步异常"],
            "perp_basis_manipulation": ["资金费率操纵", "资金费率持续偏高", "现货-期货基差异常扩大"],
        }
        for structure_type, hints in structure_hints.items():
            matched = _count_phrase_matches(hints, snapshot_text)
            threshold = 1 if len(hints) <= 2 else 2
            if matched >= threshold:
                structures.add(structure_type)
        return structures

    # 提取报告文本用于关键词匹配
    report_text = json.dumps(report, ensure_ascii=False).lower()
    available_domains = _available_domains(report)
    regime_hints = _regime_hints(report, current_phase)
    market_structures = _infer_market_structures(report, report_text)
    inferred_market_structures = sorted(market_structures)

    results: list[dict] = []
    for pattern in PLAYBOOK_PATTERNS:
        # 特征匹配分
        matched_features = sum(_count_feature_matches(feature, report_text) for feature in pattern.features)
        feature_score = matched_features / len(pattern.features) if pattern.features else 0

        matched_domains = sum(1 for domain in pattern.required_domains if domain in available_domains)
        domain_score = matched_domains / len(pattern.required_domains) if pattern.required_domains else 0.0

        matched_regimes = sum(1 for regime in pattern.applicable_regimes if regime in regime_hints)
        regime_score = matched_regimes / len(pattern.applicable_regimes) if pattern.applicable_regimes else 0.0

        structure_score = 1.0 if pattern.market_structure_type and pattern.market_structure_type in market_structures else 0.0
        matched_booster_items = _matched_phrases(pattern.confidence_boosters, report_text)
        matched_boosters = len(matched_booster_items)
        booster_bonus = (
            min(matched_boosters / len(pattern.confidence_boosters), 1.0) * 0.08
            if pattern.confidence_boosters
            else 0.0
        )
        matched_invalidation_items = _matched_phrases(pattern.invalidation_signals, report_text)
        invalidation_hits = len(matched_invalidation_items)
        invalidation_penalty = (
            min(invalidation_hits / len(pattern.invalidation_signals), 1.0) * 0.08
            if pattern.invalidation_signals
            else 0.0
        )

        # 阶段匹配加分
        stage_bonus = 0.0
        current_stage_idx = -1
        if pattern.stages and current_phase:
            for idx, stage in enumerate(pattern.stages):
                if stage.phase == current_phase:
                    stage_bonus = 0.12
                    current_stage_idx = idx
                    break

        weighted_score = (
            feature_score * 0.45
            + domain_score * 0.14
            + regime_score * 0.12
            + structure_score * 0.14
            + booster_bonus
            + stage_bonus
            - invalidation_penalty
        )
        match_pct = min(round(weighted_score * 100, 1), 100.0)
        ranking_explanation = _build_ranking_explanation(
            feature_score=feature_score,
            domain_score=domain_score,
            regime_score=regime_score,
            structure_score=structure_score,
            booster_bonus=booster_bonus,
            invalidation_penalty=invalidation_penalty,
            stage_bonus=stage_bonus,
        )

        results.append({
            "name": pattern.name,
            "match_pct": match_pct,
            "signal": pattern.signal,
            "strategy_type": pattern.strategy_type,
            "aftermath": pattern.aftermath,
            "matched_features": matched_features,
            "total_features": len(pattern.features),
            "matched_domains": matched_domains,
            "total_domains": len(pattern.required_domains),
            "matched_regimes": matched_regimes,
            "total_regimes": len(pattern.applicable_regimes),
            "market_structure_type": pattern.market_structure_type,
            "structure_matched": structure_score > 0,
            "inferred_market_structures": inferred_market_structures,
            "matched_confidence_boosters": matched_booster_items,
            "matched_invalidation_signals": matched_invalidation_items,
            "score_breakdown": {
                "feature_score": round(feature_score, 4),
                "domain_score": round(domain_score, 4),
                "regime_score": round(regime_score, 4),
                "structure_score": round(structure_score, 4),
                "booster_bonus": round(booster_bonus, 4),
                "invalidation_penalty": round(invalidation_penalty, 4),
                "stage_bonus": round(stage_bonus, 4),
                "weighted_score": round(weighted_score, 4),
            },
            "dominant_factors": ranking_explanation["dominant_factors"],
            "ranking_reason_summary": ranking_explanation["ranking_reason_summary"],
            "decision_sentence": ranking_explanation["decision_sentence"],
            "current_stage_idx": current_stage_idx,
            "stages": [s.model_dump() for s in pattern.stages],
            "required_domains": pattern.required_domains,
            "applicable_regimes": pattern.applicable_regimes,
            "confidence_boosters": pattern.confidence_boosters,
            "invalidation_signals": pattern.invalidation_signals,
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


async def _run_adversarial_pipeline(
    symbol: str,
    report: dict,
    current_phase: str,
    all_matches: list[dict],
) -> dict:
    """共享的 3AI 对抗推演流水线（L2/L3/L4），供 simulate 和 simulate_stream 复用。

    Returns:
        包含 dealer_prediction / defense_strategy / judge_adoption 等字段的结果字典
    """
    top = all_matches[0] if all_matches else None
    dealer_prediction = None
    defense_strategy = None
    judge_adoption = None
    llm_prediction = None

    if top and top["match_pct"] > 10:
        dealer_prediction = await _run_llm_step_with_timeout(
            "dealer_prediction",
            llm_dealer_prediction(symbol, top, report, current_phase),
        )
        if dealer_prediction:
            llm_prediction = dealer_prediction
            defense_strategy = await _run_llm_step_with_timeout(
                "defense_strategy",
                llm_defense_strategy(symbol, top, dealer_prediction, report, current_phase),
            )
            if defense_strategy:
                judge_adoption = await _run_llm_step_with_timeout(
                    "judge_adoption",
                    llm_judge_adoption(
                        symbol, top, dealer_prediction, defense_strategy,
                        report, current_phase,
                    ),
                )

    return {
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
        "snapshot_price": report.get("current_price"),
    }


def _sse(data: dict) -> str:
    """将字典序列化为 SSE data 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


_LOCK_TTL = 120  # 锁超时秒数，防死锁
_LOCK_POLL_INTERVAL = 0.5  # 轮询间隔
_LOCK_POLL_MAX = 180  # 最多轮询次数 (180 * 0.5s = 90s)
_PLAYBOOK_LLM_STEP_TIMEOUT_S = 18.0


async def _run_llm_step_with_timeout(step_name: str, coro):
    """为剧本模拟 LLM 步骤增加时间预算，避免同步接口被整段拖死。"""
    try:
        return await asyncio.wait_for(coro, timeout=_PLAYBOOK_LLM_STEP_TIMEOUT_S)
    except asyncio.TimeoutError:
        logger.warning(
            "playbook_%s_timeout timeout_s=%.1f",
            step_name,
            _PLAYBOOK_LLM_STEP_TIMEOUT_S,
        )
        return {}
    except Exception as exc:
        logger.warning("playbook_%s_failed: %s", step_name, exc)
        return {}


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
        dealer_prediction = await _run_llm_step_with_timeout(
            "dealer_prediction",
            llm_dealer_prediction(symbol, top, report, current_phase),
        )
        if dealer_prediction:
            llm_prediction = dealer_prediction
            yield _sse({"type": "step_done", "step": "L2", "data": dealer_prediction})

            # L3: 防御AI反制
            yield _sse({"type": "progress", "step": "L3", "message": "防御AI反制中..."})
            defense_strategy = await _run_llm_step_with_timeout(
                "defense_strategy",
                llm_defense_strategy(symbol, top, dealer_prediction, report, current_phase),
            )
            if defense_strategy:
                yield _sse({"type": "step_done", "step": "L3", "data": defense_strategy})

                # L4: 裁判AI采纳
                yield _sse({"type": "progress", "step": "L4", "message": "裁判AI采纳中..."})
                judge_adoption = await _run_llm_step_with_timeout(
                    "judge_adoption",
                    llm_judge_adoption(
                        symbol, top, dealer_prediction, defense_strategy,
                        report, current_phase,
                    ),
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
        "snapshot_price": report.get("current_price"),
    }

    # 缓存
    try:
        await set_with_ttl(cache_key, result, _CACHE_TTL)
    except Exception as exc:
        logger.error("缓存剧本演练结果失败: %s", exc)

    # 持久化（与非流式路径保持一致）
    if not result.get("error"):
        try:
            async with AsyncSessionLocal() as persist_session:
                await save_prediction(persist_session, symbol, result)
                await persist_session.commit()
        except Exception as exc:
            logger.warning("流式路径持久化剧本预测失败: %s", exc)

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
    result = await _run_adversarial_pipeline(symbol, report, current_phase, all_matches)

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
        "error": data.get("error"),
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
    signal = top.get("signal", "neutral")
    market_structure_type = top.get("market_structure_type")
    snapshot_price = result.get("snapshot_price")
    dominant_factors_json = json.dumps(top.get("dominant_factors", []), ensure_ascii=False)
    ranking_reason_summary = top.get("ranking_reason_summary")
    decision_sentence = top.get("decision_sentence")
    inferred_market_structures_json = json.dumps(top.get("inferred_market_structures", []), ensure_ascii=False)
    matched_confidence_boosters_json = json.dumps(top.get("matched_confidence_boosters", []), ensure_ascii=False)
    matched_invalidation_signals_json = json.dumps(top.get("matched_invalidation_signals", []), ensure_ascii=False)
    structure_explanation = (
        f"命中 {market_structure_type or '该结构'}"
        if top.get("structure_matched")
        else (market_structure_type or "未形成结构命中")
    )

    try:
        result_row = await insert_returning(
            session,
            """
                INSERT INTO playbook_predictions
                    (symbol, playbook_name, match_pct, current_stage_idx,
                     stages_json, status, published, signal, market_structure_type, snapshot_price,
                     dominant_factors_json, ranking_reason_summary, decision_sentence,
                     inferred_market_structures_json, matched_confidence_boosters_json,
                     matched_invalidation_signals_json, structure_explanation)
                VALUES
                    (:symbol, :name, :match_pct, :stage_idx,
                     :stages_json, 'active', :published, :signal, :market_structure_type, :snapshot_price,
                     :dominant_factors_json, :ranking_reason_summary, :decision_sentence,
                     :inferred_market_structures_json, :matched_confidence_boosters_json,
                     :matched_invalidation_signals_json, :structure_explanation)
                RETURNING id
            """,
            {
                "symbol": symbol,
                "name": playbook_name,
                "match_pct": match_pct,
                "stage_idx": current_stage_idx,
                "stages_json": stages_json,
                "published": should_publish,
                "signal": signal,
                "market_structure_type": market_structure_type,
                "snapshot_price": snapshot_price,
                "dominant_factors_json": dominant_factors_json,
                "ranking_reason_summary": ranking_reason_summary,
                "decision_sentence": decision_sentence,
                "inferred_market_structures_json": inferred_market_structures_json,
                "matched_confidence_boosters_json": matched_confidence_boosters_json,
                "matched_invalidation_signals_json": matched_invalidation_signals_json,
                "structure_explanation": structure_explanation,
            },
            table="playbook_predictions",
        )
        await session.flush()
        row = result_row.mappings().first()
        return str(row["id"]) if row else None
    except Exception as exc:
        logger.error("持久化剧本预测失败: %s", exc)
        return None
