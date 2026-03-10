"""市场数据采集器 — 从 Redis 缓存并行读取并构建 MarketData。

从 analysis_orchestrator.py 提取，各数据源独立降级，
使用命名字典替代脆弱的位置索引算术。
"""

import asyncio
import logging

from app.core.redis import get_json, get_redis_pool
from app.models.analysis import AnalysisMode, MODE_KLINE_INTERVALS
from app.models.market_data import (
    CoinGlassData,
    DerivativesData,
    IndicatorResult,
    KlineData,
    MarketData,
    OnchainSnapshot,
)
from app.models.coingecko import (
    CoinGeckoData,
    CoinMarketData,
    CommunitySentiment,
    DeveloperActivity,
    GlobalMarketData,
    TrendingCoin,
)

logger = logging.getLogger(__name__)

_DATA_COLLECT_TIMEOUT = 30.0


async def _safe_get(coro, timeout: float = _DATA_COLLECT_TIMEOUT):
    """带超时的安全异步读取，失败返回 None。"""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except Exception:
        return None


async def collect_market_data(
    symbol: str,
    mode: AnalysisMode,
) -> MarketData:
    """从 Redis 缓存采集市场数据，构建 MarketData。

    各数据源独立降级：不可用时对应字段为空/None。
    所有 Redis 读取并行执行以最小化延迟。
    使用命名字典存储结果，避免脆弱的位置索引。
    """
    redis = get_redis_pool()
    intervals = MODE_KLINE_INTERVALS[mode]
    primary_interval = intervals[0]

    # ── 构建命名任务字典 ──────────────────────────────────────
    named_tasks: dict[str, object] = {
        "price": _safe_get(redis.get(f"latest_price:{symbol}")),
        "indicators": _safe_get(get_json(f"indicators:{symbol}:{primary_interval}")),
        "onchain": _safe_get(get_json(f"onchain:{symbol}")),
        "derivatives": _safe_get(get_json(f"derivatives:{symbol}")),
        # CoinGlass（9 个 key）
        "cg_oi": _safe_get(get_json(f"cg_oi:{symbol}")),
        "cg_oi_stablecoin": _safe_get(get_json(f"cg_oi_stablecoin:{symbol}")),
        "cg_oi_coin": _safe_get(get_json(f"cg_oi_coin:{symbol}")),
        "cg_cvd": _safe_get(get_json(f"cg_cvd:{symbol}")),
        "cg_netflow": _safe_get(get_json(f"cg_netflow:{symbol}")),
        "cg_orderbook": _safe_get(get_json(f"cg_orderbook:{symbol}")),
        "cg_large_orders": _safe_get(get_json(f"cg_large_orders:{symbol}")),
        "cg_fr": _safe_get(get_json(f"cg_fr:{symbol}")),
        "cg_option_maxpain": _safe_get(get_json(f"cg_option_maxpain:{symbol}")),
        "cg_option_info": _safe_get(get_json(f"cg_option_info:{symbol}")),
        "cg_liquidation": _safe_get(get_json(f"cg_liquidation:{symbol}")),
        # CoinGecko（5 个 key）
        "gecko_market": _safe_get(get_json(f"gecko_market:{symbol}")),
        "gecko_community": _safe_get(get_json(f"gecko_community:{symbol}")),
        "gecko_developer": _safe_get(get_json(f"gecko_developer:{symbol}")),
        "gecko_global": _safe_get(get_json("gecko_global")),
        "gecko_trending": _safe_get(get_json("gecko_trending")),
    }
    # K 线按周期动态添加
    for itv in intervals:
        named_tasks[f"klines:{itv}"] = _safe_get(get_json(f"klines:{symbol}:{itv}"))

    # ── 并行执行 ──────────────────────────────────────────────
    keys = list(named_tasks.keys())
    values = await asyncio.gather(*named_tasks.values())
    r: dict = dict(zip(keys, values))

    # ── 解析：价格 ────────────────────────────────────────────
    current_price = 0.0
    if r["price"] is not None:
        try:
            current_price = float(r["price"])
        except (ValueError, TypeError):
            logger.warning("解析当前价格失败")

    # ── 解析：K 线 ────────────────────────────────────────────
    klines_map: dict[str, list] = {}
    for itv in intervals:
        cached = r.get(f"klines:{itv}")
        if cached and isinstance(cached, list):
            klines_map[itv] = [KlineData.model_validate(k) for k in cached]
        else:
            klines_map[itv] = []

    # ── 解析：技术指标 ────────────────────────────────────────
    indicators = None
    if r["indicators"] is not None:
        try:
            indicators = IndicatorResult.model_validate(r["indicators"])
        except Exception as exc:
            logger.warning("解析技术指标失败: %s", exc)

    # ── 解析：链上数据 ────────────────────────────────────────
    onchain = None
    if r["onchain"] is not None:
        try:
            onchain = OnchainSnapshot.model_validate(r["onchain"])
        except Exception as exc:
            logger.warning("解析链上数据失败: %s", exc)

    # ── 解析：合约数据 ────────────────────────────────────────
    derivatives = _parse_derivatives(r)

    # ── 解析：CoinGlass ──────────────────────────────────────
    coinglass = _parse_coinglass(r)

    # ── 解析：CoinGecko ──────────────────────────────────────
    coingecko = _parse_coingecko(r)

    return MarketData(
        symbol=symbol,
        current_price=current_price,
        klines_5m=klines_map.get("5m", []),
        klines_15m=klines_map.get("15m", []),
        klines_30m=klines_map.get("30m", []),
        klines_1h=klines_map.get("1h", []),
        klines_4h=klines_map.get("4h", []),
        klines_1d=klines_map.get("1d", []),
        klines_1w=klines_map.get("1w", []),
        indicators=indicators,
        onchain=onchain,
        derivatives=derivatives,
        coinglass=coinglass,
        coingecko=coingecko,
    )


def _parse_derivatives(r: dict) -> DerivativesData | None:
    """解析合约数据 + CoinGlass 资金费率回退补位。"""
    derivatives = None
    if r["derivatives"] is not None:
        try:
            derivatives = DerivativesData.model_validate(r["derivatives"])
        except Exception as exc:
            logger.warning("解析合约数据失败: %s", exc)

    # CoinGlass 资金费率 → DerivativesData 回退补充
    cg_fr_raw = r.get("cg_fr")
    if cg_fr_raw and isinstance(cg_fr_raw, list) and len(cg_fr_raw) > 0:
        latest_fr = cg_fr_raw[-1]
        if derivatives is None:
            try:
                fr_val = float(latest_fr.get("rate", 0))
                derivatives = DerivativesData(funding_rate=fr_val)
            except (ValueError, TypeError):
                pass
        elif derivatives.funding_rate is None:
            try:
                derivatives.funding_rate = float(latest_fr.get("rate", 0))
            except (ValueError, TypeError):
                pass

    return derivatives


def _parse_coinglass(r: dict) -> CoinGlassData | None:
    """解析 CoinGlass 9 域数据。"""
    try:
        cg_oi = r.get("cg_oi")
        cg_oi_stablecoin = r.get("cg_oi_stablecoin")
        cg_oi_coin = r.get("cg_oi_coin")
        cg_cvd = r.get("cg_cvd")
        cg_netflow = r.get("cg_netflow")
        cg_ob = r.get("cg_orderbook")
        cg_lo = r.get("cg_large_orders")
        cg_fr = r.get("cg_fr")
        cg_mp = r.get("cg_option_maxpain")
        cg_info = r.get("cg_option_info")
        cg_liq = r.get("cg_liquidation")

        has_any = any(x is not None for x in [
            cg_oi, cg_oi_stablecoin, cg_oi_coin, cg_cvd, cg_netflow, cg_ob, cg_lo, cg_fr, cg_mp, cg_info, cg_liq,
        ])
        if not has_any:
            return None

        return CoinGlassData(
            oi_snapshots=cg_oi if isinstance(cg_oi, list) else [],
            stablecoin_margin_oi_snapshots=cg_oi_stablecoin if isinstance(cg_oi_stablecoin, list) else [],
            coin_margin_oi_snapshots=cg_oi_coin if isinstance(cg_oi_coin, list) else [],
            cvd_snapshots=cg_cvd if isinstance(cg_cvd, list) else [],
            netflow_snapshots=cg_netflow if isinstance(cg_netflow, list) else [],
            orderbook_levels=cg_ob if isinstance(cg_ob, list) else [],
            large_orders=cg_lo if isinstance(cg_lo, list) else [],
            funding_rate_history=cg_fr if isinstance(cg_fr, list) else [],
            option_max_pain=cg_mp if isinstance(cg_mp, dict) else None,
            option_info=cg_info if isinstance(cg_info, dict) else None,
            liquidation=cg_liq if isinstance(cg_liq, dict) else None,
        )
    except Exception as exc:
        logger.warning("解析 CoinGlass 数据失败: %s", exc)
        return None


def _parse_coingecko(r: dict) -> CoinGeckoData | None:
    """解析 CoinGecko 5 域数据。"""
    try:
        gk_market = r.get("gecko_market")
        gk_community = r.get("gecko_community")
        gk_developer = r.get("gecko_developer")
        gk_global = r.get("gecko_global")
        gk_trending = r.get("gecko_trending")

        has_any = any(x is not None for x in [
            gk_market, gk_community, gk_developer, gk_global, gk_trending,
        ])
        if not has_any:
            return None

        return CoinGeckoData(
            market=CoinMarketData.model_validate(gk_market) if isinstance(gk_market, dict) else None,
            community=CommunitySentiment.model_validate(gk_community) if isinstance(gk_community, dict) else None,
            developer=DeveloperActivity.model_validate(gk_developer) if isinstance(gk_developer, dict) else None,
            global_data=GlobalMarketData.model_validate(gk_global) if isinstance(gk_global, dict) else None,
            trending=[TrendingCoin.model_validate(t) for t in gk_trending] if isinstance(gk_trending, list) else [],
        )
    except Exception as exc:
        logger.warning("解析 CoinGecko 数据失败: %s", exc)
        return None
