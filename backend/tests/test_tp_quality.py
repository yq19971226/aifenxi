"""TP 候选池质量和间距测试。

覆盖：
1. _space_targets：入场感知（TP1 过近时推开）
2. build_tp_candidates：模式感知距离过滤
3. generate_from_consensus：R:R 安全网
"""

import pytest
from app.services.strategy import StrategyService, _MODE_TP_MIN_GAP


# ── 1. _space_targets 入场感知 ───────────────────────────────────


class TestSpaceTargets:
    """_space_targets 测试套件。"""

    def test_tp1_pushed_away_from_entry_long(self):
        """做多：TP1 距入场 < min_gap 时，应被推开到至少 min_gap。"""
        price = 2000.0
        tp1_too_close = 2001.0  # 仅 0.05%
        targets = [tp1_too_close, 2100.0, 2200.0]
        result = StrategyService._space_targets(targets, mode="trend", entry_price=price)
        # 趋势模式 min_gap = 3%，TP1 应被推到 2000 * 1.03 = 2060
        assert result[0] == pytest.approx(2060.0, rel=1e-4)
        # TP2 和 TP3 应至少间隔 3%
        assert result[1] > result[0] * 1.029
        assert result[2] > result[1] * 1.029

    def test_tp1_pushed_away_from_entry_short(self):
        """做空：TP1 距入场 < min_gap 时，应被推开到至少 min_gap。"""
        price = 2000.0
        tp1_too_close = 1999.0  # 仅 0.05%
        targets = [tp1_too_close, 1900.0, 1800.0]
        result = StrategyService._space_targets(targets, mode="trend", entry_price=price)
        # TP1 应被推到 2000 * 0.97 = 1940
        assert result[0] == pytest.approx(1940.0, rel=1e-4)

    def test_tp1_already_far_enough(self):
        """TP1 已足够远时不应被修改。"""
        price = 2000.0
        tp1_ok = 2100.0  # 5% > 3%
        targets = [tp1_ok, 2200.0, 2300.0]
        result = StrategyService._space_targets(targets, mode="trend", entry_price=price)
        assert result[0] == tp1_ok

    def test_no_entry_price_backward_compatible(self):
        """不传 entry_price 时，行为与旧版一致。"""
        targets = [100.0, 100.5, 101.0]
        result = StrategyService._space_targets(targets, mode="scalping")
        assert len(result) == 3
        assert result[0] == 100.0

    def test_empty_targets(self):
        """空列表不崩溃。"""
        assert StrategyService._space_targets([], mode="trend", entry_price=100.0) == []

    def test_intraday_min_gap(self):
        """日内模式使用 0.8% 间距。"""
        price = 100.0
        targets = [100.2, 100.3, 100.4]
        result = StrategyService._space_targets(targets, mode="intraday", entry_price=price)
        # TP1 应被推到 100 * 1.008 = 100.8
        assert result[0] == pytest.approx(100.8, rel=1e-4)


# ── 2. build_tp_candidates 模式感知 ──────────────────────────────


class TestBuildTpCandidates:
    """build_tp_candidates 模式感知过滤测试。"""

    def test_trend_mode_filters_near_candidates(self):
        """趋势模式应过滤距价格 < 1.5% 的候选。"""
        from app.services.formalized_sr import build_tp_candidates

        price = 2000.0
        # 构造 Pivot R1 = 2010 (0.5%, < 1.5%), R2 = 2080 (4%)
        klines = [
            {"high": 2050.0, "low": 1950.0, "close": 2000.0},  # prev-prev
            {"high": 2020.0, "low": 1990.0, "close": 2010.0},  # prev
        ]
        # R1 = 2*P - L, P = (2020+1990+2010)/3 = 2006.67, R1 = 2*2006.67 - 1990 = 2023.33 (1.17% < 1.5%)
        # R2 = P + (H-L) = 2006.67 + 30 = 2036.67 (1.83% > 1.5%) → 应保留

        result = build_tp_candidates("long", price, klines, None, mode="trend")

        # R1 (2023.33) 距价格仅 1.17% < 1.5% → 应被过滤
        for lvl in result:
            pct_from_price = (lvl - price) / price
            assert pct_from_price >= 0.015, f"候选 {lvl} 距价格 {pct_from_price:.2%} < 1.5%"

    def test_scalping_mode_allows_near_candidates(self):
        """短线模式应保留距价格 > 0.3% 的候选。"""
        from app.services.formalized_sr import build_tp_candidates

        price = 2000.0
        klines = [
            {"high": 2050.0, "low": 1950.0, "close": 2000.0},
            {"high": 2020.0, "low": 1990.0, "close": 2010.0},
        ]

        result = build_tp_candidates("long", price, klines, None, mode="scalping")
        # Scalping min_pct = 0.3%, so candidates ≥ 2006 are allowed.
        # Pivot and swing candidates > 0.3% from price should be retained.
        assert len(result) > 0, f"短线模式应产生候选, 但结果为空"
        for lvl in result:
            pct = (lvl - price) / price
            assert pct >= 0.003, f"候选 {lvl} 距价格 {pct:.4%} < 0.3%"


# ── 3. R:R 安全网 ────────────────────────────────────────────────


class TestRRSafetyNet:
    """generate_from_consensus R:R 安全网测试。"""

    def _make_consensus_report(self, symbol="ETHUSDT", signal="bullish"):
        """构造最小 ConsensusReport。"""
        from app.consensus.engine import ConsensusReport, ModelVote

        return ConsensusReport(
            symbol=symbol,
            consensus_signal=signal,
            consensus_confidence=0.7,
            divergence=10.0,
            model_votes=[
                ModelVote(model_key="m1", signal=signal, confidence=0.8, reasoning="test"),
                ModelVote(model_key="m2", signal=signal, confidence=0.7, reasoning="test"),
                ModelVote(model_key="m3", signal=signal, confidence=0.6, reasoning="test"),
            ],
            weights={"m1": 0.34, "m2": 0.33, "m3": 0.33},
            minority_warnings=[],
        )

    def test_long_bad_structural_tp_falls_back_to_atr(self, monkeypatch):
        """做多：结构性 TP R:R < 1.0 时应回退到 ATR。"""
        svc = StrategyService()
        report = self._make_consensus_report(signal="bullish")

        # 构造结构性 TP 距入场极近的情况
        # 让 build_tp_candidates 返回非常近的候选
        near_tp = [2005.0]  # 对 price=2000, 仅 0.25%
        monkeypatch.setattr(
            "app.services.strategy.build_tp_candidates",
            lambda *a, **kw: near_tp,
            raising=False,
        )

        # 使用比较大的 ATR 确保 ATR 目标远于结构性极近 TP
        result = svc.generate_from_consensus(
            report, current_price=2000.0, atr=40.0,
            mode="trend",
        )

        # R:R 安全网应触发，TP1 应远离入场（ATR 目标 ≥ 2000 + 2.5*40 = 2100）
        assert result.targets[0] > 2050.0, \
            f"ATR 回退应产生远目标, 但 TP1={result.targets[0]}"
        assert result.risk_reward_ratio >= 1.0

    def test_long_good_structural_tp_kept(self, monkeypatch):
        """做多：结构性 TP R:R >= 1.0 时应保留。"""
        svc = StrategyService()
        report = self._make_consensus_report(signal="bullish")

        # 结构性 TP 距入场足够远
        good_tp = [2200.0, 2400.0, 2600.0]
        monkeypatch.setattr(
            "app.services.strategy.build_tp_candidates",
            lambda *a, **kw: good_tp,
            raising=False,
        )

        result = svc.generate_from_consensus(
            report, current_price=2000.0, atr=40.0,
            mode="trend",
        )

        # 结构性 TP 应被保留（经过 _space_targets 处理后仍应 > 2100）
        assert result.targets[0] > 2050.0
        assert result.risk_reward_ratio >= 1.0

    def test_short_bad_structural_tp_falls_back_to_atr(self, monkeypatch):
        """做空：结构性 TP R:R < 1.0 时应回退到 ATR。"""
        svc = StrategyService()
        report = self._make_consensus_report(signal="bearish")

        # 极近的结构性 TP
        near_tp = [1998.0]
        monkeypatch.setattr(
            "app.services.strategy.build_tp_candidates",
            lambda *a, **kw: near_tp,
            raising=False,
        )

        result = svc.generate_from_consensus(
            report, current_price=2000.0, atr=40.0,
            mode="trend",
        )

        # ATR 回退目标应 ≤ 2000 - 2.5*40 = 1900
        assert result.targets[0] < 1950.0, \
            f"ATR 回退应产生远目标, 但 TP1={result.targets[0]}"
        assert result.risk_reward_ratio >= 1.0


# ── 4. 趋势共识门槛 ──────────────────────────────────────────────


class TestTrendConsensusGate:
    """趋势模式共识参数收紧测试。"""

    def test_trend_needs_3_agree(self):
        """趋势模式 2/4 模型一致 → 应输出 neutral。"""
        from app.consensus.engine import _weighted_aggregate, ModelVote

        votes = [
            ModelVote(model_key="m1", signal="bullish", confidence=0.8, reasoning="up"),
            ModelVote(model_key="m2", signal="bullish", confidence=0.7, reasoning="up"),
            ModelVote(model_key="m3", signal="bearish", confidence=0.8, reasoning="down"),
            ModelVote(model_key="m4", signal="bearish", confidence=0.7, reasoning="down"),
        ]
        weights = {"m1": 0.25, "m2": 0.25, "m3": 0.25, "m4": 0.25}

        # 使用趋势默认: min_agreement=3, signal_threshold=0.40, min_confidence=0.55
        signal, conf = _weighted_aggregate(
            votes, weights,
            signal_threshold=0.40,
            min_agreement=3,
            min_confidence=0.55,
        )
        assert signal == "neutral", f"2-2 分裂应输出 neutral，但得到 {signal}"

    def test_trend_3_agree_passes(self):
        """趋势模式 3/4 模型一致 → 应输出方向信号。"""
        from app.consensus.engine import _weighted_aggregate, ModelVote

        votes = [
            ModelVote(model_key="m1", signal="bullish", confidence=0.8, reasoning="up"),
            ModelVote(model_key="m2", signal="bullish", confidence=0.7, reasoning="up"),
            ModelVote(model_key="m3", signal="bullish", confidence=0.7, reasoning="up"),
            ModelVote(model_key="m4", signal="bearish", confidence=0.5, reasoning="down"),
        ]
        weights = {"m1": 0.25, "m2": 0.25, "m3": 0.25, "m4": 0.25}

        signal, conf = _weighted_aggregate(
            votes, weights,
            signal_threshold=0.40,
            min_agreement=3,
            min_confidence=0.55,
        )
        assert signal == "bullish", f"3/4 一致应输出 bullish，但得到 {signal}"

    def test_trend_flip_ratio_high(self):
        """趋势模式迟滞：弱反转不够翻转 → neutral（既不维持也不翻转）。"""
        from app.consensus.engine import _weighted_aggregate, ModelVote

        # 之前 bullish，现在 3/4 bearish 但分数不够强翻转
        votes = [
            ModelVote(model_key="m1", signal="bearish", confidence=0.60, reasoning="down"),
            ModelVote(model_key="m2", signal="bearish", confidence=0.60, reasoning="down"),
            ModelVote(model_key="m3", signal="bearish", confidence=0.60, reasoning="down"),
            ModelVote(model_key="m4", signal="bullish", confidence=0.60, reasoning="up"),
        ]
        weights = {"m1": 0.25, "m2": 0.25, "m3": 0.25, "m4": 0.25}

        # score = -0.30, flip_threshold = 0.34
        # |-0.30| < 0.34 → 翻不了; score < 0 → 也维持不了 bullish → neutral
        signal, _ = _weighted_aggregate(
            votes, weights,
            signal_threshold=0.40, min_agreement=3, min_confidence=0.55,
            flip_ratio=0.85, prev_signal="bullish",
        )
        assert signal == "neutral", \
            f"弱反转信号既不该翻转也不该维持，应输出 neutral，但得到 {signal}"

    def test_trend_hysteresis_maintains(self):
        """趋势模式迟滞：弱 bullish 信号应维持原方向（不需达到完整阈值）。"""
        from app.consensus.engine import _weighted_aggregate, ModelVote

        # 之前 bullish，现在仍有微弱 bullish 倾向
        votes = [
            ModelVote(model_key="m1", signal="bullish", confidence=0.60, reasoning="up"),
            ModelVote(model_key="m2", signal="bullish", confidence=0.60, reasoning="up"),
            ModelVote(model_key="m3", signal="neutral", confidence=0.60, reasoning="flat"),
            ModelVote(model_key="m4", signal="neutral", confidence=0.60, reasoning="flat"),
        ]
        weights = {"m1": 0.25, "m2": 0.25, "m3": 0.25, "m4": 0.25}

        # score = 2*(1)*0.60*0.25 + 2*(0)*0.60*0.25 = 0.30
        # 常规模式下 0.30 < signal_threshold(0.40) → neutral
        # 但有 prev_signal=bullish，维持只需 score > 0 && bullish_count >= 1 → bullish
        signal, _ = _weighted_aggregate(
            votes, weights,
            signal_threshold=0.40, min_agreement=3, min_confidence=0.55,
            flip_ratio=0.85, prev_signal="bullish",
        )
        assert signal == "bullish", \
            f"迟滞应维持原方向（score=0.30>0 + prev=bullish），但得到 {signal}"

    def test_trend_strong_reversal_flips(self):
        """趋势模式强反转信号应能翻转方向。"""
        from app.consensus.engine import _weighted_aggregate, ModelVote

        # 之前 bullish，现在 4/4 高置信度说 bearish
        votes = [
            ModelVote(model_key="m1", signal="bearish", confidence=0.85, reasoning="down"),
            ModelVote(model_key="m2", signal="bearish", confidence=0.80, reasoning="down"),
            ModelVote(model_key="m3", signal="bearish", confidence=0.75, reasoning="down"),
            ModelVote(model_key="m4", signal="bearish", confidence=0.70, reasoning="down"),
        ]
        weights = {"m1": 0.25, "m2": 0.25, "m3": 0.25, "m4": 0.25}

        # 加权分 = (-1)*(0.85+0.80+0.75+0.70)*0.25 = -0.775
        # flip_threshold = 0.40 * 0.85 = 0.34
        # |-0.775| > 0.34 + bearish_count=4 >= 3 → 应翻转
        signal, _ = _weighted_aggregate(
            votes, weights,
            signal_threshold=0.40,
            min_agreement=3,
            min_confidence=0.55,
            flip_ratio=0.85,
            prev_signal="bullish",
        )
        assert signal == "bearish", \
            f"强反转信号应翻转方向，但得到 {signal}"

    def test_trend_mode_defaults_correct(self):
        """验证 _MODE_CONSENSUS_DEFAULTS 趋势模式参数正确。"""
        from app.consensus.engine import _MODE_CONSENSUS_DEFAULTS

        trend = _MODE_CONSENSUS_DEFAULTS["trend"]
        assert trend["min_agreement"] == 3
        assert trend["signal_threshold"] == 0.40
        assert trend["min_confidence"] == 0.55
        assert trend["flip_ratio"] == 0.85
