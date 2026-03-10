"""剧本库 2026 升级回归测试。"""

from datetime import datetime, timezone

from app.agents.playbook import _build_system_prompt, _build_user_prompt
from app.agents.playbook_patterns import PLAYBOOK_PATTERNS
from app.models.coingecko import CoinGeckoData, GlobalMarketData
from app.models.market_data import (
    CoinGlassData,
    DerivativesData,
    IndicatorResult,
    KlineData,
    MarketData,
    OnchainSnapshot,
)
from app.services.playbook_sim_service import _calculate_match_scores


def _sample_kline() -> KlineData:
    now = datetime.now(timezone.utc)
    return KlineData(
        symbol="BTCUSDT",
        interval="1d",
        open_time=now,
        open=65000,
        high=66000,
        low=64500,
        close=65500,
        volume=12345,
        close_time=now,
        is_closed=True,
    )


def test_playbook_2026_patterns_registered():
    names = {pattern.name for pattern in PLAYBOOK_PATTERNS}
    assert "ETF申购驱动上行" in names
    assert "ETF赎回驱动回撤" in names
    assert "Gamma钉住" in names
    assert "Put保护挤压下跌" in names
    assert "稳定币流动性迁移" in names
    assert "Basis压缩去杠杆" in names


def test_playbook_system_prompt_contains_new_metadata():
    prompt = _build_system_prompt("zh-CN")

    assert "Gamma钉住" in prompt
    assert "ETF申购驱动上行" in prompt
    assert "适用市场结构:" in prompt
    assert "关键数据域:" in prompt
    assert "失效条件:" in prompt


def test_playbook_user_prompt_contains_coinglass_options_context():
    data = MarketData(
        symbol="BTCUSDT",
        current_price=65500,
        klines_1d=[_sample_kline()],
        indicators=IndicatorResult(
            symbol="BTCUSDT",
            interval="1d",
            time=datetime.now(timezone.utc),
            ema7=65400,
            ema25=65000,
            ema99=63000,
            volume_ratio=0.7,
        ),
        onchain=OnchainSnapshot(
            time=datetime.now(timezone.utc),
            symbol="BTCUSDT",
            exchange_netflow=-1234.5,
        ),
        derivatives=DerivativesData(
            funding_rate=0.0001,
            long_short_ratio=1.02,
        ),
        coinglass=CoinGlassData(
            oi_snapshots=[{"open_interest": 123456789, "open_interest_change_pct": 2.1}],
            stablecoin_margin_oi_snapshots=[{"open_interest": 88000000, "oi_change_24h": 12.5}],
            coin_margin_oi_snapshots=[{"open_interest": 41000000, "oi_change_24h": -3.2}],
            option_max_pain={"max_pain_price": 65000},
            option_info={"put_call_ratio": 1.18, "total_oi": 987654321, "iv": 52.3},
            orderbook_levels=[{"price": 65000, "size": 100}],
            large_orders=[{"price": 64950, "size": 25}],
        ),
        coingecko=CoinGeckoData(
            global_data=GlobalMarketData(stablecoin_volume_24h=1_250_000_000_000)
        ),
    )

    prompt = _build_user_prompt(data)

    assert "CoinGlass / 微结构补充" in prompt
    assert "期权Max Pain: 65000" in prompt
    assert "期权Put/Call比: 1.18" in prompt
    assert "稳定币保证金OI: 88000000" in prompt
    assert "币本位保证金OI: 41000000" in prompt
    assert "订单簿聚合层级数: 1" in prompt
    assert "大单挂单数: 1" in prompt
    assert "稳定币24h成交额: 1250000000000.0" in prompt


def test_calculate_match_scores_uses_structure_for_gamma_pattern():
    report = {
        "symbol": "BTCUSDT",
        "current_price": 65200,
        "indicators": {
            "ema7": 65100,
            "ema25": 65000,
            "ema99": 64900,
            "volume_ratio": 0.65,
        },
        "derivatives": {
            "funding_rate": 0.0001,
            "long_short_ratio": 1.0,
            "liquidation_1h_usd": 800000,
        },
        "onchain": {"exchange_netflow": -100.0},
        "coinglass": {
            "oi": [{"open_interest": 1000000}],
            "funding_rate": [{"rate": 0.0001}],
            "netflow": [{"value": 50000}],
            "options": {"put_call_ratio": 1.2, "total_oi": 999999, "iv": 49.0},
            "option_max_pain": {"max_pain_price": 65000},
            "orderbook": [{"price": 65000, "size": 100}],
            "large_orders": [{"price": 64980, "size": 8}],
        },
        "calendar_events": [{"title": "BTC options expiry"}],
        "signal_descriptions": [
            "临近期权大到期日",
            "价格围绕关键行权价反复震荡",
            "短端隐含波动率偏高",
            "已实现波动率下降",
            "方向突破经常被拉回区间中心",
        ],
        "reasoning": "临近期权大到期日，价格围绕关键行权价反复震荡，短端隐含波动率偏高，已实现波动率下降，方向突破经常被拉回区间中心。",
    }

    results = _calculate_match_scores(report, current_phase="distribution")
    top = results[0]

    assert top["name"] == "Gamma钉住"
    assert top["market_structure_type"] == "options_gamma_pinning"
    assert top["structure_matched"] is True
    assert top["matched_domains"] >= 2


def test_calculate_match_scores_detects_put_protection_pattern():
    report = {
        "symbol": "BTCUSDT",
        "current_price": 61800,
        "indicators": {
            "ema7": 62000,
            "ema25": 62500,
            "ema99": 64000,
            "volume_ratio": 1.1,
        },
        "derivatives": {
            "funding_rate": -0.0001,
            "long_short_ratio": 0.92,
            "liquidation_1h_usd": 1200000,
        },
        "onchain": {"exchange_netflow": 450.0},
        "coinglass": {
            "oi": [{"open_interest": 1800000}],
            "funding_rate": [{"rate": -0.0001}],
            "netflow": [{"value": -25000}],
            "options": {"put_call_ratio": 1.24, "total_oi": 1200000, "iv": 58.0},
        },
        "calendar_events": [{"title": "macro risk event"}],
        "signal_descriptions": [
            "期权Put/Call比显著抬升",
            "市场保护性买沽需求增强",
            "短端波动率偏高",
            "下跌时现货承接偏弱",
            "反弹难以持续",
        ],
        "reasoning": "期权Put/Call比显著抬升，市场保护性买沽需求增强，短端波动率偏高，下跌时现货承接偏弱，反弹难以持续。",
    }

    results = _calculate_match_scores(report, current_phase="distribution")
    top = results[0]

    assert top["name"] == "Put保护挤压下跌"
    assert top["market_structure_type"] == "protective_put_pressure"
    assert top["structure_matched"] is True


def test_calculate_match_scores_detects_stablecoin_liquidity_rotation():
    report = {
        "symbol": "BTCUSDT",
        "current_price": 64500,
        "indicators": {
            "ema7": 64520,
            "ema25": 64490,
            "ema99": 64450,
            "volume_ratio": 0.88,
        },
        "derivatives": {
            "funding_rate": 0.00005,
            "long_short_ratio": 1.01,
            "liquidation_1h_usd": 950000,
        },
        "onchain": {"exchange_netflow": 20.0},
        "coinglass": {
            "oi": [{"open_interest": 1100000}],
            "oi_stablecoin": [{"open_interest": 980000, "oi_change_24h": 14.2}],
            "oi_coin": [{"open_interest": 420000, "oi_change_24h": -2.4}],
            "orderbook": [{"price": 64490, "size": 120}],
            "large_orders": [{"price": 64510, "size": 10}],
        },
        "coingecko": {
            "global": {"stablecoin_volume_24h": 1_180_000_000_000}
        },
        "calendar_events": [{"title": "liquidity regime shift"}],
        "signal_descriptions": [
            "稳定币保证金OI与币本位OI出现明显分化",
            "稳定币24h成交额放大但价格弹性下降",
            "同样成交量下市场深度恢复不均衡",
            "局部交易所流动性改善而整体趋势不强",
            "传统量价关系开始失真",
        ],
        "reasoning": "稳定币保证金OI与币本位OI出现明显分化，稳定币24h成交额放大但价格弹性下降，同样成交量下市场深度恢复不均衡，传统量价关系开始失真。",
    }

    results = _calculate_match_scores(report, current_phase="distribution")
    top = results[0]

    assert top["name"] == "稳定币流动性迁移"
    assert top["market_structure_type"] == "stablecoin_liquidity_rotation"
    assert top["structure_matched"] is True


def test_calculate_match_scores_uses_legacy_structure_metadata_for_false_breakout():
    report = {
        "symbol": "BTCUSDT",
        "current_price": 70200,
        "indicators": {
            "ema7": 70180,
            "ema25": 69850,
            "ema99": 69000,
            "volume_ratio": 0.72,
        },
        "derivatives": {
            "funding_rate": 0.00035,
            "long_short_ratio": 1.28,
            "liquidation_1h_usd": 1_800_000,
        },
        "onchain": {"exchange_netflow": 320.0},
        "coinglass": {
            "orderbook": [{"price": 70150, "size": 120}],
            "large_orders": [{"price": 70220, "size": 18}],
        },
        "signal_descriptions": [
            "价格突破关键阻力",
            "成交量温和",
            "散户追多进场",
            "资金费率上升",
            "假突破后快速回落",
        ],
        "reasoning": (
            "价格突破关键阻力但成交量温和，散户追多进场，"
            "资金费率上升，形成假突破并出现诱多迹象，随后快速回落收割。"
        ),
    }

    results = _calculate_match_scores(report, current_phase="distribution")
    top = results[0]

    assert top["name"] == "假突破诱多"
    assert top["market_structure_type"] == "false_breakout_bull_trap"
    assert top["structure_matched"] is True
    assert "false_breakout_bull_trap" in (top.get("inferred_market_structures") or [])
    assert len(top.get("score_breakdown") or {}) > 0
