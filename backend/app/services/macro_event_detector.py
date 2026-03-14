"""Macro Event Detector — 宏观事件解释层（非数据源）。

定位：本模块是 macro 域的**解释层**，不是数据源。
- 主宏观事实源：FRED（FredClient / FredCollector / fred_worker）
- 本模块职责：从新闻缓存中扫描宏观关键词，分类事件并输出风险调整分数
- 不直接拉取任何外部 API 数据

覆盖的事件类型（CalendarAgent 不处理的宏观事件）：
1. FOMC / Fed rate decisions
2. CPI / PPI inflation data
3. Non-Farm Payrolls (NFP)
4. SEC / CFTC regulatory actions
5. Geopolitical risk events
6. Stablecoin de-peg / bank run events
7. ETF approval / rejection
8. Government crypto policy changes

Data flow:
- NewsAnalystAgent already ingests Finnhub + BlockBeats news
- This module scans those news items for macro keywords,
  classifies them, and outputs a risk-adjusted impact score.
- The orchestrator uses this to inject a "macro_events" section
  and optionally adjust overall confidence.
- 未来增强：可消费 fred_snapshot 缓存中的实际宏观数值来校准 impact_score
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# -- Macro event categories and their base impact scores --------

class MacroEvent(BaseModel):
    """A detected macro event."""

    category: str          # e.g. "fomc", "cpi", "sec_action"
    title: str             # human-readable title
    impact_score: float    # -10 to +10
    direction: str = "neutral"  # bullish / bearish / neutral
    urgency: str = "low"   # low / medium / high
    evidence: str = ""     # the matched text snippet


class MacroEventResult(BaseModel):
    """Aggregated macro event detection result."""

    events: list[MacroEvent] = Field(default_factory=list)
    total_impact: float = 0.0
    net_direction: str = "neutral"
    confidence_modifier: float = Field(default=1.0, ge=0.0, le=1.5)
    warning: str = ""


# -- Keyword patterns for macro event detection -----------------

_MACRO_PATTERNS: list[dict] = [
    # FOMC / Federal Reserve
    {
        "category": "fomc",
        "patterns": [
            r"(?i)\b(FOMC|federal\s+reserve|fed\s+(rate|cut|hike|pause|pivot))",
            r"(?i)\b(interest\s+rate\s+(decision|cut|hike))",
            r"(?i)(powell|jerome\s+powell)",
        ],
        "base_impact": -3,
        "direction_rules": {
            "cut|pivot|dovish|easing": ("bullish", 5),
            "hike|hawkish|tighten": ("bearish", -6),
            "pause|hold|unchanged": ("neutral", -1),
        },
    },
    # CPI / Inflation
    {
        "category": "cpi",
        "patterns": [
            r"(?i)\b(CPI|consumer\s+price\s+index|inflation\s+data)",
            r"(?i)\b(PPI|producer\s+price)",
            r"(?i)\b(PCE|personal\s+consumption)",
        ],
        "base_impact": -2,
        "direction_rules": {
            "higher|above|hot|surge|exceed": ("bearish", -5),
            "lower|below|cool|drop|decline": ("bullish", 4),
            "in\s*line|meet|as\s+expected": ("neutral", 0),
        },
    },
    # Employment / NFP
    {
        "category": "nfp",
        "patterns": [
            r"(?i)\b(non.?farm|NFP|payroll|unemployment\s+rate|jobless)",
            r"(?i)\b(labor\s+market|jobs\s+report)",
        ],
        "base_impact": -2,
        "direction_rules": {
            "strong|beat|exceed|robust": ("bearish", -4),
            "weak|miss|disappoint|slow": ("bullish", 3),
        },
    },
    # SEC / Regulatory
    {
        "category": "sec_action",
        "patterns": [
            r"(?i)\b(SEC|CFTC|DOJ)\s+(sue|charge|enforce|crack|investig|lawsuit)",
            r"(?i)\b(regulation|regulatory\s+(crack|action|warning))",
            r"(?i)\b(Gensler|Gary\s+Gensler)",
            r"(?i)\b(ban|prohibit|restrict)\s+(crypto|bitcoin|trading)",
        ],
        "base_impact": -6,
        "direction_rules": {
            "approve|clear|dismiss|settle|favorable": ("bullish", 5),
            "sue|charge|enforce|ban|reject|fine": ("bearish", -7),
        },
    },
    # ETF
    {
        "category": "etf",
        "patterns": [
            r"(?i)\b(bitcoin|btc|ethereum|eth|crypto)\s+ETF",
            r"(?i)\bETF\s+(approv|reject|delay|file|list)",
            r"(?i)\b(spot\s+ETF|futures\s+ETF)",
        ],
        "base_impact": 0,
        "direction_rules": {
            "approv|accept|launch|list|inflow": ("bullish", 7),
            "reject|deny|delay|postpone|outflow": ("bearish", -5),
        },
    },
    # Stablecoin / Bank
    {
        "category": "stablecoin_risk",
        "patterns": [
            r"(?i)\b(USDT|USDC|DAI|TUSD|BUSD)\s+(depeg|de.?peg|audit|reserve)",
            r"(?i)\b(tether|circle)\s+(concern|risk|audit|redeem)",
            r"(?i)\b(bank\s+(run|collapse|failure|crisis))",
            r"(?i)\b(silvergate|silicon\s+valley|signature\s+bank)",
        ],
        "base_impact": -5,
        "direction_rules": {
            "stable|pass|resolve|back": ("neutral", -1),
            "depeg|concern|risk|collapse|withdraw": ("bearish", -8),
        },
    },
    # Geopolitical
    {
        "category": "geopolitical",
        "patterns": [
            r"(?i)\b(trade\s+war|tariff|sanction)",
            r"(?i)\b(war|conflict|invasion|missile|nuclear)",
            r"(?i)\b(US.?China|Russia|Ukraine|Iran|North\s+Korea)",
        ],
        "base_impact": -3,
        "direction_rules": {
            "peace|ceasefire|resolve|ease|de.?escalat": ("bullish", 3),
            "escalat|attack|war|strike|sanction": ("bearish", -5),
        },
    },
    # Government crypto policy
    {
        "category": "gov_policy",
        "patterns": [
            r"(?i)\b(bitcoin|crypto)\s+(legal\s+tender|reserve|strategic)",
            r"(?i)\b(CBDC|central\s+bank\s+digital)",
            r"(?i)\b(crypto\s+(bill|law|legislation|framework))",
            r"(?i)\b(El\s+Salvador|MiCA|stablecoin\s+bill)",
        ],
        "base_impact": 0,
        "direction_rules": {
            "adopt|legal|reserve|support|pass": ("bullish", 6),
            "ban|restrict|prohibit|reject|delay": ("bearish", -5),
        },
    },
]


def detect_macro_events(
    news_items: list[dict],
    news_report_findings: Optional[list[str]] = None,
) -> MacroEventResult:
    """Scan news items and findings for macro event signals.

    Args:
        news_items: Raw news items (from Finnhub/BlockBeats cache)
        news_report_findings: key_findings from NewsAnalystAgent report

    Returns:
        MacroEventResult with detected events and impact assessment
    """
    # Collect all text to scan
    texts: list[str] = []
    for item in news_items:
        title = item.get("title") or item.get("headline", "")
        body = item.get("body") or item.get("description") or item.get("content", "")
        if title:
            texts.append(title)
        if body:
            texts.append(body[:500])

    if news_report_findings:
        texts.extend(news_report_findings)

    if not texts:
        return MacroEventResult()

    combined_text = "\n".join(texts)
    detected: list[MacroEvent] = []
    seen_categories: set[str] = set()

    for macro_def in _MACRO_PATTERNS:
        category = macro_def["category"]
        if category in seen_categories:
            continue

        matched = False
        match_snippet = ""
        for pattern in macro_def["patterns"]:
            m = re.search(pattern, combined_text)
            if m:
                matched = True
                start = max(0, m.start() - 30)
                end = min(len(combined_text), m.end() + 50)
                match_snippet = combined_text[start:end].strip()
                break

        if not matched:
            continue

        seen_categories.add(category)

        # Determine direction from context
        direction = "neutral"
        impact = macro_def["base_impact"]

        for dir_pattern, (dir_signal, dir_impact) in macro_def["direction_rules"].items():
            if re.search(rf"(?i)({dir_pattern})", combined_text):
                direction = dir_signal
                impact = dir_impact
                break

        # Determine urgency based on time keywords
        urgency = "low"
        if re.search(r"(?i)(today|just\s+now|breaking|urgent|hours?\s+ago)", combined_text):
            urgency = "high"
            impact = impact * 1.3
        elif re.search(r"(?i)(tomorrow|this\s+week|upcoming|soon|expected)", combined_text):
            urgency = "medium"
            impact = impact * 1.1

        title_map = {
            "fomc": "美联储利率决议",
            "cpi": "CPI/通胀数据",
            "nfp": "非农就业报告",
            "sec_action": "SEC监管行动",
            "etf": "加密ETF进展",
            "stablecoin_risk": "稳定币/银行风险",
            "geopolitical": "地缘政治风险",
            "gov_policy": "政府加密政策",
        }

        category_map = {
            "fomc": "美联储",
            "cpi": "通胀数据",
            "nfp": "非农就业",
            "sec_action": "监管行动",
            "etf": "ETF进展",
            "stablecoin_risk": "稳定币风险",
            "geopolitical": "地缘政治",
            "gov_policy": "政府政策",
        }

        detected.append(MacroEvent(
            category=category_map.get(category, category),
            title=title_map.get(category, category),
            impact_score=round(impact, 1),
            direction=direction,
            urgency=urgency,
            evidence=match_snippet[:120],
        ))

    if not detected:
        return MacroEventResult()

    # Aggregate
    total_impact = sum(e.impact_score for e in detected)
    bullish_count = sum(1 for e in detected if e.direction == "bullish")
    bearish_count = sum(1 for e in detected if e.direction == "bearish")

    if total_impact > 3:
        net_direction = "bullish"
    elif total_impact < -3:
        net_direction = "bearish"
    else:
        net_direction = "neutral"

    # Confidence modifier: major macro events increase uncertainty
    high_urgency = [e for e in detected if e.urgency == "high"]
    if high_urgency:
        confidence_modifier = 0.8  # reduce confidence during active macro events
    elif any(abs(e.impact_score) >= 5 for e in detected):
        confidence_modifier = 0.9
    else:
        confidence_modifier = 1.0

    # Warning message
    _dir_zh = {"bullish": "看涨", "bearish": "看跌", "neutral": "中性"}
    _urg_zh = {"low": "低", "medium": "中", "high": "高"}
    parts: list[str] = []
    for e in sorted(detected, key=lambda x: abs(x.impact_score), reverse=True):
        e.direction = _dir_zh.get(e.direction, e.direction)
        e.urgency = _urg_zh.get(e.urgency, e.urgency)
        urgency_tag = f"[{e.urgency}]" if e.urgency != "低" else ""
        parts.append(f"{urgency_tag}{e.title}({e.direction},{e.impact_score:+.0f})")

    warning = ""
    if detected:
        warning = f"宏观事件: {'; '.join(parts)}"

    net_direction = _dir_zh.get(net_direction, net_direction)

    return MacroEventResult(
        events=detected,
        total_impact=round(total_impact, 1),
        net_direction=net_direction,
        confidence_modifier=confidence_modifier,
        warning=warning,
    )
