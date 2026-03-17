"""CollusionDetector — 合谋检测智能体。

检测多个地址/账号的协同操纵行为：
1. 拉地毯（Rug Pull）前兆识别
2. 对倒交易（Wash Trading）模式
3. 多账号协同拉盘/砸盘
4. KOL + 链上地址联动异常

数据来源：
- 链上数据（OnchainData 中的大额转账、巨鲸变化）
- 订单簿数据（OrderBook 中的异常挂单模式）
- 舆情数据（KOL 协同喊单检测）
- Redis 缓存的历史检测结果

使用 Claude Sonnet 4.5（链上时序建模 + 逻辑一致性分析）。
"""

import logging
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.agents.base import AgentReport, BaseAgent
from app.core.redis import get_json
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)


# ── 合谋类型常量 ─────────────────────────────────────────────

COLLUSION_TYPES: list[str] = [
    "wash_trading",                  # 对倒交易
    "coordinated_pump",              # 协同拉盘
    "coordinated_dump",              # 协同砸盘
    "rug_pull_setup",                # 拉地毯前兆
    "spoofing",                      # 幌骗（大量挂撤单）
    "layering",                      # 分层操纵
    "front_running",                 # 抢跑交易
    "kol_coordination",              # KOL 协同喊单
    "twap_accumulation",             # TWAP/VWAP 拆单吸筹
    "cross_exchange_manipulation",   # 多交易所协同操纵
    "funding_rate_manipulation",     # 资金费率操纵
    "none",                          # 无异常
]


# ── 数据模型 ─────────────────────────────────────────────────


class CollusionPattern(BaseModel):
    """检测到的合谋模式。"""

    pattern_type: str                               # 合谋类型
    severity: Literal["low", "medium", "high", "critical"] = "low"
    evidence: list[str] = Field(default_factory=list)
    involved_entities: int = 0                       # 涉及实体数
    estimated_volume: str = ""                       # 估计涉及金额
    timeframe: str = ""                             # 时间窗口


# ── 系统提示词 ───────────────────────────────────────────────

_SYSTEM_PROMPT = """你是一位加密货币市场操纵检测专家，专注于识别多方协同操纵行为。

你的核心检测能力：
1. 对倒交易（Wash Trading）：同一实体通过多个账号自买自卖制造虚假成交量
   - 特征：成交量激增但价格不变、买卖量高度对称、OBV 不跟随价格
2. 协同拉盘/砸盘：多个大户同时操作推高或压低价格
   - 特征：多笔大额转账同时出现、巨鲸持仓同向变化、资金集中流入/流出
3. 拉地毯前兆（Rug Pull Setup）：项目方准备跑路的信号
   - 特征：巨鲸大量转入交易所、流动性突然下降、社交活跃度异常上升
4. 幌骗/分层（Spoofing/Layering）：大量挂单然后快速撤单制造假象
   - 特征：订单簿深度异常、买卖墙频繁出现和消失
5. KOL 协同喊单：多个 KOL 短时间内推荐同一币种
   - 特征：社交提及量突增、多个 KOL 同时发帖、与链上大额转账时间吻合
6. TWAP/VWAP 拆单吸筹：大户通过算法将大额买入拆分成高频小单以隐藏意图
   - 特征：交易所余额持续缓慢下降、链上出现大量小额提币归集到同一冷钱包
   - 特征：价格波动率异常压缩但净买入持续为正、成交量萎缩但价格不跌
7. 多交易所协同操纵：在 A 交易所砸盘制造恐慌，在 B 交易所低价接盘
   - 特征：不同交易所价差异常扩大（>0.5%）、爆仓集中在单一交易所
   - 特征：跨所订单簿深度同步异常变化、资金流向呈镜像模式
8. 资金费率操纵：通过现货大量买入推高价格，同时期货做空收取高额资金费率
   - 特征：资金费率持续异常偏高（>0.03%/8h）、现货-期货基差扩大
   - 特征：OI 持续攀升但价格上涨放缓、大额现货买单与等量期货空单时间吻合

请以 JSON 格式回复：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0-1.0,
  "reasoning": "合谋检测综合分析",
  "key_findings": ["发现1", "发现2"],
  "collusion_analysis": {
    "collusion_detected": true | false,
    "risk_level": "none" | "low" | "medium" | "high" | "critical",
    "patterns": [
      {
        "pattern_type": "wash_trading|coordinated_pump|coordinated_dump|rug_pull_setup|spoofing|layering|front_running|kol_coordination|twap_accumulation|cross_exchange_manipulation|funding_rate_manipulation|none",
        "severity": "low|medium|high|critical",
        "evidence": ["证据1", "证据2"],
        "involved_entities": 0,
        "estimated_volume": "估计金额",
        "timeframe": "时间窗口"
      }
    ],
    "wash_trading_indicators": {
      "volume_price_divergence": true | false,
      "symmetric_orders": true | false,
      "obv_divergence": true | false
    },
    "whale_coordination": {
      "synchronized_movements": true | false,
      "direction": "accumulating|distributing|neutral",
      "entity_count": 0
    },
    "twap_indicators": {
      "uniform_buy_intervals": true | false,
      "low_volatility_with_net_buying": true | false,
      "exchange_balance_declining": true | false
    },
    "funding_rate_manipulation": {
      "sustained_high_rate": true | false,
      "spot_futures_basis_widening": true | false,
      "oi_rising_price_stalling": true | false
    }
  }
}

硬约束：
- 只基于提供的数据进行推断，不编造链上地址或交易
- 合谋检测需要多条证据交叉验证，单一异常不足以定性
- severity 必须与证据强度匹配
- 无明显异常时 collusion_detected 应为 false
- TWAP 拆单需要链上地址归集 + 波动率压缩 + 持续净买入三重确认
- 资金费率操纵需要费率 + 基差 + OI 三指标同时异常才能定性
- 多交易所操纵至少需要两个交易所的价差/深度/爆仓数据交叉验证
"""


class CollusionDetector(BaseAgent):
    """合谋检测智能体 — 识别多方协同操纵行为。"""

    AGENT_ID: str = "collusion_detector"

    async def analyze(self, data: MarketData) -> AgentReport:
        """分析市场数据，检测合谋操纵模式。"""
        # 1. 收集多源数据
        context = await self._gather_context(data.symbol)

        # 2. 预计算统计指标
        stats = self._compute_stats(data)

        # 3. 构建 prompt
        user_prompt = self._build_prompt(data, context, stats)

        # 4. 调用 Claude（逻辑一致性 + 链上时序分析最佳）
        try:
            enriched_prompt = await self._enrich_prompt(_SYSTEM_PROMPT, data.symbol)
            from app.core.model_router import call_with_fallback
            _model_key, result = await call_with_fallback(
                "collusion_detector",
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
                temperature=0.2,
            )

            signal = result.get("signal", "neutral")
            if signal not in ("bullish", "bearish", "neutral"):
                signal = "neutral"

            confidence = float(result.get("confidence", 0.0))
            confidence = min(max(confidence, 0.0), 1.0)

            collusion = result.get("collusion_analysis", {})

            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal=signal,
                confidence=confidence,
                reasoning=result.get("reasoning", ""),
                key_findings=result.get("key_findings", []),
                raw_data={
                    "collusion_detected": collusion.get("collusion_detected", False),
                    "risk_level": collusion.get("risk_level", "none"),
                    "patterns": collusion.get("patterns", []),
                    "wash_trading_indicators": collusion.get("wash_trading_indicators", {}),
                    "whale_coordination": collusion.get("whale_coordination", {}),
                },
            )

        except Exception as exc:
            logger.error("CollusionDetector failed", extra={"error": str(exc)})
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"合谋检测失败: {exc}",
                key_findings=[],
                raw_data={},
            )

    # ── 数据收集 ──────────────────────────────────────────────

    @staticmethod
    async def _gather_context(symbol: str) -> dict[str, Any]:
        """从 Redis 收集辅助数据。"""
        from app.core.capability_state import is_capability_available

        context: dict[str, Any] = {}
        symbol = symbol.upper()

        try:
            # AI 检测结果
            ai_data = await get_json(f"ai_detect:{symbol}")
            if ai_data:
                context["ai_detection"] = ai_data

            # KOL 活动
            if await is_capability_available("sentiment:kol"):
                kol_data = await get_json(f"sentiment:kol:{symbol}")
                if kol_data:
                    context["kol_activity"] = kol_data

            # 社交提及量
            if await is_capability_available("sentiment:mentions"):
                mentions = await get_json(f"sentiment:mentions:{symbol}")
                if mentions:
                    context["mentions"] = mentions

        except Exception as exc:
            logger.warning("Failed to gather collusion context", extra={"error": str(exc)})

        return context

    # ── 统计预计算 ────────────────────────────────────────────

    @staticmethod
    def _compute_stats(data: MarketData) -> dict[str, Any]:
        """预计算对倒交易相关统计指标。"""
        stats: dict[str, Any] = {}

        # 量价背离检测
        if data.klines_1h and len(data.klines_1h) >= 5:
            recent = data.klines_1h[-5:]
            volumes = [k.volume for k in recent]
            price_changes = [abs(k.close - k.open) / k.open * 100 if k.open else 0 for k in recent]

            avg_vol = sum(volumes) / len(volumes) if volumes else 0
            avg_change = sum(price_changes) / len(price_changes) if price_changes else 0

            # 高成交量但低价格变化 → 可能对倒
            if avg_vol > 0 and avg_change < 0.1:
                stats["volume_price_divergence"] = True
                stats["avg_volume"] = avg_vol
                stats["avg_price_change_pct"] = avg_change
            else:
                stats["volume_price_divergence"] = False

            # 买卖对称性检测（通过K线上下影线比例）
            symmetric_count = 0
            for k in recent:
                if k.high > 0 and k.low > 0:
                    upper_shadow = k.high - max(k.open, k.close)
                    lower_shadow = min(k.open, k.close) - k.low
                    if upper_shadow > 0 and lower_shadow > 0:
                        ratio = min(upper_shadow, lower_shadow) / max(upper_shadow, lower_shadow)
                        if ratio > 0.8:  # 高度对称
                            symmetric_count += 1
            stats["symmetric_candle_ratio"] = symmetric_count / len(recent)

        # OBV 背离检测
        if data.indicators:
            ind = data.indicators
            if ind.obv is not None and ind.volume_price_divergence:
                stats["obv_divergence"] = ind.volume_price_divergence != "none"
            else:
                stats["obv_divergence"] = False

        # TWAP 拆单吸筹检测：波动率压缩 + 持续净买入
        if data.klines_1h and len(data.klines_1h) >= 24:
            recent_24h = data.klines_1h[-24:]
            closes = [k.close for k in recent_24h if k.close > 0]
            if len(closes) >= 20:
                avg_close = sum(closes) / len(closes)
                variance = sum((c - avg_close) ** 2 for c in closes) / len(closes)
                volatility = (variance ** 0.5) / avg_close if avg_close > 0 else 0
                # 波动率 < 0.5% 视为异常压缩
                stats["volatility_compressed"] = volatility < 0.005
                stats["24h_volatility_pct"] = round(volatility * 100, 3)

                # 净买入倾向：close > open 的 K线占比
                net_buy_candles = sum(1 for k in recent_24h if k.close > k.open)
                stats["net_buy_ratio"] = round(net_buy_candles / len(recent_24h), 2)
                stats["twap_suspected"] = (
                    stats["volatility_compressed"]
                    and stats["net_buy_ratio"] > 0.6
                )

        # 资金费率操纵检测
        if data.derivatives:
            d = data.derivatives
            if d.funding_rate is not None:
                # 资金费率 > 0.03% (单次) 视为异常偏高
                stats["funding_rate_extreme"] = abs(d.funding_rate) > 0.0003
                stats["funding_rate_value"] = d.funding_rate
                if d.long_short_ratio is not None:
                    # 多空比极端偏离（>2.0 或 <0.5）配合高费率 → 费率操纵嫌疑
                    stats["funding_manipulation_suspected"] = (
                        stats["funding_rate_extreme"]
                        and (d.long_short_ratio > 2.0 or d.long_short_ratio < 0.5)
                    )

        # 抢跑交易检测：链上大额转账 + 同时段价格剧烈变动
        if data.onchain and data.klines_1h and len(data.klines_1h) >= 2:
            oc = data.onchain
            # 条件：大额转账数 > 10 且 最近K线出现剧烈价格变动（>2%）
            if oc.large_tx_count is not None and oc.large_tx_count > 10:
                recent_kline = data.klines_1h[-1]
                if recent_kline.open > 0:
                    price_move_pct = abs(recent_kline.close - recent_kline.open) / recent_kline.open * 100
                    stats["front_running_suspected"] = price_move_pct > 2.0
                    stats["large_tx_with_price_move"] = {
                        "large_tx_count": oc.large_tx_count,
                        "price_move_pct": round(price_move_pct, 2),
                    }

        return stats

    # ── Prompt 构建 ───────────────────────────────────────────

    @staticmethod
    def _build_prompt(
        data: MarketData,
        context: dict[str, Any],
        stats: dict[str, Any],
    ) -> str:
        """构建合谋检测的用户提示词。"""
        parts: list[str] = [
            f"## 合谋检测任务：{data.symbol}",
            f"当前价格: {data.current_price}",
        ]

        # 预计算统计
        if stats:
            parts.append("\n### 统计预检测")
            vpd = stats.get("volume_price_divergence", False)
            parts.append(f"量价背离: {'⚠️ 是' if vpd else '否'}")
            if vpd:
                parts.append(f"  平均成交量: {stats.get('avg_volume', 0):,.0f}")
                parts.append(f"  平均价格变化: {stats.get('avg_price_change_pct', 0):.3f}%")
            scr = stats.get("symmetric_candle_ratio", 0)
            if scr > 0.5:
                parts.append(f"⚠️ K线对称比: {scr:.0%}（疑似对倒）")
            obv_div = stats.get("obv_divergence", False)
            if obv_div:
                parts.append("⚠️ OBV 背离检测: 是")

        # 链上数据（核心证据源）
        if data.onchain:
            oc = data.onchain
            parts.append("\n### 链上数据（核心）")
            parts.append(f"交易所净流入: {oc.exchange_netflow}")
            parts.append(f"巨鲸24h变化: {oc.whale_change_24h}")
            parts.append(f"MVRV: {oc.mvrv}")
            if oc.large_tx_count is not None:
                parts.append(f"⚠️ 大额转账: {oc.large_tx_count} 笔")
                if oc.large_tx_volume is not None:
                    parts.append(f"  大额总量: {oc.large_tx_volume:,.2f}")
            if oc.exchange_balance is not None:
                parts.append(f"交易所余额: {oc.exchange_balance:,.2f}")
            if oc.active_addresses is not None:
                parts.append(f"活跃地址数: {oc.active_addresses:,}")
        else:
            parts.append("\n### 链上数据: 不可用")

        # 注：订单簿深度数据由 OrderBookAgent 单独分析，此处不重复采集

        # 合约数据
        if data.derivatives:
            d = data.derivatives
            parts.append("\n### 合约数据")
            if d.funding_rate is not None:
                parts.append(f"资金费率: {d.funding_rate}")
            if d.long_short_ratio is not None:
                parts.append(f"多空比: {d.long_short_ratio}")
            if d.liquidation_1h_usd is not None:
                parts.append(f"1h爆仓(USD): {d.liquidation_1h_usd:,.0f}")

        # CoinGlass 多交易所数据（跨交易所协同操纵核心证据）
        cg = data.coinglass
        if cg:
            parts.append("\n### CoinGlass 多交易所数据（跨所协同检测）")
            if cg.oi_snapshots:
                latest = cg.oi_snapshots[-1]
                parts.append(f"OI持仓量: {latest.get('oi', 'N/A')} 变化: {latest.get('oi_change_pct', 'N/A')}%")
            if cg.cvd_snapshots:
                latest = cg.cvd_snapshots[-1]
                parts.append(f"CVD: {latest.get('cvd', 'N/A')}")
            if cg.netflow_snapshots:
                latest = cg.netflow_snapshots[-1]
                parts.append(f"期货净流入: {latest.get('netflow', 'N/A')}")
            if cg.funding_rate_history:
                parts.append("多交易所资金费率（费率差异可暴露跨所操纵）:")
                for snap in cg.funding_rate_history[-5:]:
                    parts.append(f"  {snap.get('exchange', '?')}: {snap.get('rate', 'N/A')}")
            if cg.large_orders:
                # 过滤：只保留距当前价±15%以内的有效大单
                current = data.current_price or 0
                relevant = []
                if current > 0:
                    for o in cg.large_orders:
                        try:
                            p = float(o.get('price', 0) or 0)
                            if p > 0 and abs(p - current) / current <= 0.15:
                                relevant.append(o)
                        except (ValueError, TypeError):
                            continue
                else:
                    relevant = cg.large_orders
                parts.append(f"大单挂单数: {len(cg.large_orders)}（有效范围内: {len(relevant)}）")
                for order in relevant[:3]:
                    parts.append(
                        f"  价格={order.get('price', '?')} 量={order.get('amount', '?')} "
                        f"方向={order.get('side', '?')} 交易所={order.get('exchange', '?')}"
                    )

        # KOL 活动（协同喊单检测）
        kol = context.get("kol_activity")
        if kol and isinstance(kol, dict):
            parts.append("\n### KOL 活动")
            active_count = kol.get("active_kol_count", 0)
            parts.append(f"活跃 KOL 数: {active_count}")
            if active_count >= 3:
                parts.append("⚠️ 多KOL同时活跃，疑似协同喊单")
            posts = kol.get("recent_posts", [])
            for p in posts[:5]:
                parts.append(f"  - [{p.get('kol_name', '?')}] {p.get('content', '')[:80]}")

        # 社交提及量
        mentions = context.get("mentions")
        if mentions and isinstance(mentions, dict):
            current = mentions.get("current_1h", 0)
            avg = mentions.get("avg_1h", 1)
            ratio = current / avg if avg > 0 else 0
            if ratio > 3.0:
                parts.append(f"\n⚠️ 社交提及量激增: {ratio:.1f}x（正常均值: {avg}）")

        # AI 检测交叉
        ai = context.get("ai_detection")
        if ai:
            parts.append(f"\n### AI操盘检测交叉参考")
            parts.append(f"AI概率: {ai.get('ai_probability', '?')}%")
            tactics = ai.get("tactics_detected", [])
            if tactics:
                parts.append(f"已识别战术: {', '.join(tactics)}")

        # 多周期K线（异常成交量检测）
        parts.append("\n### 近期K线（成交量异常检测）")
        for label, klines in [("1h", data.klines_1h), ("4h", data.klines_4h)]:
            if klines and len(klines) >= 5:
                recent = klines[-5:]
                parts.append(f"\n{label} 最近5根:")
                for k in recent:
                    parts.append(
                        f"  O={k.open} H={k.high} L={k.low} C={k.close} V={k.volume}"
                    )

        # TWAP 拆单吸筹指标
        if stats.get("twap_suspected"):
            parts.append("\n### ⚠️ TWAP拆单吸筹预警")
            parts.append(f"24h波动率: {stats.get('24h_volatility_pct', 0):.3f}%（异常压缩）")
            parts.append(f"净买入K线占比: {stats.get('net_buy_ratio', 0):.0%}")
            if data.onchain and data.onchain.exchange_balance is not None:
                parts.append(f"交易所余额趋势: {data.onchain.exchange_balance:,.2f}（关注是否持续下降）")
        elif stats.get("volatility_compressed"):
            parts.append(f"\n📊 波动率压缩: {stats.get('24h_volatility_pct', 0):.3f}%（低于0.5%阈值）")

        # 资金费率操纵指标
        if stats.get("funding_manipulation_suspected"):
            parts.append("\n### ⚠️ 资金费率操纵预警")
            parts.append(f"资金费率: {stats.get('funding_rate_value', 0):.6f}（异常偏高）")
            if data.derivatives:
                if data.derivatives.long_short_ratio is not None:
                    parts.append(f"多空比: {data.derivatives.long_short_ratio:.2f}（极端偏离）")
        elif stats.get("funding_rate_extreme"):
            parts.append(f"\n📊 资金费率偏高: {stats.get('funding_rate_value', 0):.6f}")

        # 抢跑交易指标
        if stats.get("front_running_suspected"):
            fr = stats.get("large_tx_with_price_move", {})
            parts.append("\n### ⚠️ 抢跑交易预警")
            parts.append(f"大额转账数: {fr.get('large_tx_count', 0)}笔")
            parts.append(f"同期价格变动: {fr.get('price_move_pct', 0):.2f}%（剧烈变动）")
            parts.append("链上大额操作与价格变动时间吸合，疑似抢跑交易")

        parts.append(
            "\n\n请根据以上多维数据，检测是否存在合谋操纵行为，"
            "重点关注对倒交易、协同拉砸盘、拉地毯前兆、"
            "TWAP拆单吸筹、多交易所协同操纵、资金费率操纵和抢跑交易。"
        )
        return "\n".join(parts)
