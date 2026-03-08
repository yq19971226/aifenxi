"""单元测试：playbook_verify_worker 中的纯函数。"""

import pytest

# 直接导入被测函数
from workers.playbook_verify_worker import (
    _parse_max_duration_hours,
    _check_hard_failure,
    _parse_miss_count,
)


# ── _parse_max_duration_hours ──────────────────────────────────


class TestParseMaxDurationHours:
    """测试 typical_duration 字符串 → 上限小时数的解析。"""

    def test_range_hours_cn(self):
        assert _parse_max_duration_hours("2-8小时") == 8.0

    def test_range_days_cn(self):
        assert _parse_max_duration_hours("1-3天") == 72.0

    def test_range_weeks_cn(self):
        assert _parse_max_duration_hours("2-4周") == 4 * 7 * 24

    def test_range_hours_en(self):
        assert _parse_max_duration_hours("2-8h") == 8.0

    def test_range_days_en(self):
        assert _parse_max_duration_hours("1-3d") == 72.0

    def test_range_weeks_en(self):
        assert _parse_max_duration_hours("1-2w") == 2 * 7 * 24

    def test_single_hours_cn(self):
        assert _parse_max_duration_hours("8小时") == 8.0

    def test_single_days_cn(self):
        assert _parse_max_duration_hours("3天") == 72.0

    def test_single_weeks_cn(self):
        assert _parse_max_duration_hours("4周") == 4 * 7 * 24

    def test_tilde_separator(self):
        assert _parse_max_duration_hours("2~6周") == 6 * 7 * 24

    def test_empty_string(self):
        assert _parse_max_duration_hours("") == 24.0

    def test_unrecognized_format(self):
        assert _parse_max_duration_hours("unknown") == 24.0

    def test_none_like(self):
        # 空字符串 fallback
        assert _parse_max_duration_hours("") == 24.0


# ── _check_hard_failure ────────────────────────────────────────


class TestCheckHardFailure:
    """测试硬失效判定逻辑。"""

    def test_not_expired_yet(self):
        """未超时 → 不失效"""
        result = _check_hard_failure("up", 100.0, 90.0, 5.0, 10.0, "吸筹")
        assert result is None

    def test_up_expected_price_dropped(self):
        """预期涨但跌超阈值 → 失效"""
        result = _check_hard_failure("up", 100.0, 90.0, 15.0, 10.0, "拉升")
        assert result is not None
        assert "下跌" in result

    def test_up_expected_price_ok(self):
        """预期涨且涨了 → 不失效"""
        result = _check_hard_failure("up", 100.0, 110.0, 15.0, 10.0, "拉升")
        assert result is None

    def test_down_expected_price_rose(self):
        """预期跌但涨超阈值 → 失效"""
        result = _check_hard_failure("down", 100.0, 110.0, 15.0, 10.0, "逃顶")
        assert result is not None
        assert "上涨" in result

    def test_down_expected_price_ok(self):
        """预期跌且跌了 → 不失效"""
        result = _check_hard_failure("down", 100.0, 90.0, 15.0, 10.0, "逃顶")
        assert result is None

    def test_sideways_exceeded(self):
        """预期横盘但涨幅过大 → 失效"""
        result = _check_hard_failure("sideways", 100.0, 112.0, 15.0, 10.0, "盘整")
        assert result is not None
        assert "上涨" in result

    def test_sideways_within_range(self):
        """预期横盘且在范围内 → 不失效"""
        result = _check_hard_failure("sideways", 100.0, 105.0, 15.0, 10.0, "盘整")
        assert result is None

    def test_none_direction(self):
        """direction=None (continuation) → 不判定"""
        result = _check_hard_failure(None, 100.0, 50.0, 999.0, 1.0, "延续")
        assert result is None

    def test_none_prices(self):
        """价格缺失 → 不判定"""
        assert _check_hard_failure("up", None, 100.0, 15.0, 10.0, "X") is None
        assert _check_hard_failure("up", 100.0, None, 15.0, 10.0, "X") is None

    def test_zero_base_price(self):
        """base_price=0 → 不判定（避免除零）"""
        assert _check_hard_failure("up", 0.0, 100.0, 15.0, 10.0, "X") is None

    def test_boundary_threshold_up(self):
        """刚好在阈值边界 → 不失效（严格 <）"""
        # up threshold = -5.0%, pct = -5.0% exactly
        result = _check_hard_failure("up", 100.0, 95.0, 15.0, 10.0, "拉升")
        # pct = -5.0, threshold = -5.0, condition is pct < threshold → -5 < -5 is False
        assert result is None

    def test_boundary_threshold_down(self):
        """刚好在阈值边界 → 不失效"""
        # down threshold = 5.0%, pct = 5.0% exactly
        result = _check_hard_failure("down", 100.0, 105.0, 15.0, 10.0, "逃顶")
        # pct = 5.0, threshold = 5.0, condition is pct > threshold → 5 > 5 is False
        assert result is None


# ── _parse_miss_count ──────────────────────────────────────────


class TestParseMissCount:
    """测试从 risk_note 解析 miss count。"""

    def test_normal(self):
        assert _parse_miss_count("miss:3") == 3

    def test_zero(self):
        assert _parse_miss_count("miss:0") == 0

    def test_empty(self):
        assert _parse_miss_count("") == 0

    def test_chinese_pattern(self):
        assert _parse_miss_count("连续3次未匹配预期阶段") == 3

    def test_chinese_full_note(self):
        assert _parse_miss_count("连续5次未匹配预期阶段(拉升/markup)，当前市场阶段: distribution") == 5

    def test_miss_with_extra(self):
        assert _parse_miss_count("miss:7 some extra text") == 7  # regex search, not exact match

    def test_no_match(self):
        assert _parse_miss_count("some random note") == 0
