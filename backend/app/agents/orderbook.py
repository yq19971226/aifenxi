"""订单簿分析智能体 — 检测幽灵挂单、冰山订单、分层压单/托单等微观操纵行为。

数据来源：Redis 缓存的订单簿快照（由 WebSocket 采集器写入）
缓存键：orderbook:{symbol}（TTL=10s，高频更新）
输出：AgentReport，包含订单簿异常信号和操纵行为识别结果
"""

import logging
from datetime import datetime, timezone
from typing import Any

from app.agents.base import AgentReport, BaseAgent
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

# ── 检测阈值 ─────────────────────────────────────────────────

# 单笔挂单占总深度比例超过此值视为"大额挂单"
LARGE_ORDER_DEPTH_RATIO: float = 0.05
# 撤单率超过此值视为幽灵挂单嫌疑
CANCEL_RATE_THRESHOLD: float = 0.70
# 买卖深度比偏离 1.0 超过此值视为分层压单/托单
DEPTH_IMBALANCE_THRESHOLD: float = 0.40
# 冰山订单检测：实际成交量 / 挂单量 > 此值
ICEBERG_RATIO_THRESHOLD: float = 3.0
# 冰山订单：连续档位挂单量变异系数 < 此值视为均匀分布（算法拆单特征）
ICEBERG_UNIFORMITY_CV: float = 0.15
# 冰山订单：K线成交量 / 可见挂单量 > 此值 → 隐藏流动性嫌疑
ICEBERG_VOLUME_DEPTH_RATIO: float = 5.0
# 分层检测：连续档位密集挂单的最少档位数
LAYERING_MIN_LEVELS: int = 5
# 分层检测：连续档位挂单量与均值的比值阈值
LAYERING_CLUSTER_RATIO: float = 2.0


def _detect_iceberg_uniformity(quantities: list[float]) -> dict[str, Any]:
    """检测冰山订单特征：连续档位挂单量异常均匀（算法拆单的典型特征）。

    算法逻辑：
    - 计算连续档位挂单量的变异系数 (CV = std/mean)
    - CV < ICEBERG_UNIFORMITY_CV 且档位数 >= 5 → 高度均匀，冰山订单嫌疑
    - 正常市场中，各档位挂单量差异较大（CV > 0.3）

    Returns:
        {"detected": bool, "cv": float, "uniform_levels": int}
    """
    if len(quantities) < 5:
        return {"detected": False, "cv": 1.0, "uniform_levels": 0}

    mean_q = sum(quantities) / len(quantities)
    if mean_q <= 0:
        return {"detected": False, "cv": 1.0, "uniform_levels": 0}

    variance = sum((q - mean_q) ** 2 for q in quantities) / len(quantities)
    std = variance ** 0.5
    cv = std / mean_q

    return {
        "detected": cv < ICEBERG_UNIFORMITY_CV and len(quantities) >= 5,
        "cv": round(cv, 4),
        "uniform_levels": len(quantities) if cv < ICEBERG_UNIFORMITY_CV else 0,
    }


def _detect_layering_cluster(quantities: list[float]) -> dict[str, Any]:
    """检测分层压单/托单：连续多档位密集挂单形成人工支撑/阻力墙。

    算法逻辑：
    - 计算整体平均挂单量
    - 寻找连续 >= LAYERING_MIN_LEVELS 档位挂单量 > 均值 × LAYERING_CLUSTER_RATIO
    - 存在则为分层操纵嫌疑

    Returns:
        {"detected": bool, "cluster_levels": int, "avg_ratio": float}
    """
    if len(quantities) < LAYERING_MIN_LEVELS:
        return {"detected": False, "cluster_levels": 0, "avg_ratio": 0.0}

    mean_q = sum(quantities) / len(quantities)
    if mean_q <= 0:
        return {"detected": False, "cluster_levels": 0, "avg_ratio": 0.0}

    # 寻找最长连续超均值档位
    max_run = 0
    max_run_sum = 0.0
    current_run = 0
    current_sum = 0.0

    for q in quantities:
        if q > mean_q * LAYERING_CLUSTER_RATIO:
            current_run += 1
            current_sum += q
            if current_run > max_run:
                max_run = current_run
                max_run_sum = current_sum
        else:
            current_run = 0
            current_sum = 0.0

    detected = max_run >= LAYERING_MIN_LEVELS
    avg_ratio = (max_run_sum / max_run / mean_q) if max_run > 0 and mean_q > 0 else 0.0

    return {
        "detected": detected,
        "cluster_levels": max_run,
        "avg_ratio": round(avg_ratio, 2),
    }


_SYSTEM_PROMPT = """你是一位专业的加密货币订单簿微观结构分析师，擅长识别以下操纵行为：
1. 幽灵挂单（Spoofing）：大额挂单频繁出现又快速撤销，制造虚假买卖压力
2. 冰山订单（Iceberg Orders）：实际成交量远大于可见挂单量，隐藏真实意图
3. 分层压单/托单（Layering）：在多个价格层级密集挂单，制造人工支撑/阻力
4. 买卖墙（Walls）：特定价格大额挂单阻止价格突破

你必须以 JSON 格式回复：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 到 1.0,
  "manipulation_detected": true | false,
  "manipulation_type": "spoofing" | "iceberg" | "layering" | "wall" | "none",
  "manipulation_side": "buy" | "sell" | "both" | "none",
  "reasoning": "分析说明",
  "key_findings": ["发现1", "发现2"],
  "depth_summary": {
    "bid_depth_usd": 数值,
    "ask_depth_usd": 数值,
    "imbalance_ratio": 数值,
    "largest_order_pct": 数值
  }
}

硬约束：
- 仅基于提供的订单簿数据分析，禁止编造数据
- 数据缺失时对应字段标注 null
- manipulation_detected 必须有具体证据支撑
"""


class OrderBookAgent(BaseAgent):
    """订单簿微观结构分析智能体。"""

    async def analyze(self, data: MarketData) -> AgentReport:
        """分析订单簿快照，检测微观操纵行为。"""
        # 从 Redis 读取订单簿快照
        ob_snapshot = await self._load_orderbook(data.symbol)

        if ob_snapshot is None:
            return AgentReport(
                agent_id="orderbook",
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning="订单簿数据不可用",
                key_findings=["订单簿快照缺失，无法进行微观结构分析"],
                raw_data={},
            )

        # 预处理：计算结构化指标
        metrics = self._compute_metrics(ob_snapshot, data.current_price)

        # 构建 prompt
        user_prompt = self._build_prompt(data, ob_snapshot, metrics)

        try:
            enriched_prompt = await self._enrich_prompt(_SYSTEM_PROMPT, data.symbol)
            from app.core.model_router import call_with_fallback
            _model_key, result = await call_with_fallback(
                "orderbook",
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
            )

            signal = result.get("signal", "neutral")
            confidence = float(result.get("confidence", 0.0))
            manipulation_detected = result.get("manipulation_detected", False)

            key_findings = result.get("key_findings", [])
            if manipulation_detected:
                m_type = result.get("manipulation_type", "unknown")
                m_side = result.get("manipulation_side", "unknown")
                key_findings.insert(0, f"检测到操纵行为: {m_type} ({m_side})")

            return AgentReport(
                agent_id="orderbook",
                symbol=data.symbol,
                signal=signal,
                confidence=min(max(confidence, 0.0), 1.0),
                reasoning=result.get("reasoning", ""),
                key_findings=key_findings,
                raw_data={
                    "manipulation_detected": manipulation_detected,
                    "manipulation_type": result.get("manipulation_type", "none"),
                    "manipulation_side": result.get("manipulation_side", "none"),
                    "depth_summary": result.get("depth_summary", {}),
                    "metrics": metrics,
                },
            )

        except Exception as exc:
            logger.error("OrderBookAgent analysis failed", extra={"error": str(exc)})
            return AgentReport(
                agent_id="orderbook",
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"订单簿分析失败: {exc}",
                key_findings=[],
                raw_data={},
            )

    # ── 数据加载 ──────────────────────────────────────────────

    @staticmethod
    async def _load_orderbook(symbol: str) -> dict[str, Any] | None:
        """从 Redis 加载订单簿快照。"""
        try:
            from app.core.redis import get_json

            snapshot = await get_json(f"orderbook:{symbol}")
            if snapshot and isinstance(snapshot, dict):
                return snapshot
            return None
        except Exception as exc:
            logger.warning("Failed to load orderbook snapshot", extra={"error": str(exc)})
            return None

    # ── 指标计算 ──────────────────────────────────────────────

    @staticmethod
    def _compute_metrics(ob: dict[str, Any], current_price: float) -> dict[str, Any]:
        """从原始订单簿数据计算结构化指标。"""
        bids = ob.get("bids", [])
        asks = ob.get("asks", [])

        bid_depth = sum(float(b[1]) * float(b[0]) for b in bids if len(b) >= 2)
        ask_depth = sum(float(a[1]) * float(a[0]) for a in asks if len(a) >= 2)
        total_depth = bid_depth + ask_depth

        # 深度失衡比
        imbalance = 0.0
        if total_depth > 0:
            imbalance = (bid_depth - ask_depth) / total_depth

        # 最大单笔挂单占比
        all_orders = [(float(o[1]) * float(o[0])) for o in bids + asks if len(o) >= 2]
        largest_pct = max(all_orders) / total_depth if all_orders and total_depth > 0 else 0.0

        # 买卖价差
        best_bid = float(bids[0][0]) if bids else 0.0
        best_ask = float(asks[0][0]) if asks else 0.0
        spread_pct = (best_ask - best_bid) / current_price * 100 if current_price > 0 else 0.0

        # 撤单率（需要历史快照对比，此处留接口）
        cancel_rate = ob.get("cancel_rate", None)

        # 冰山订单检测：挂单量均匀度分析
        iceberg_bid = _detect_iceberg_uniformity([float(b[1]) for b in bids if len(b) >= 2])
        iceberg_ask = _detect_iceberg_uniformity([float(a[1]) for a in asks if len(a) >= 2])

        # 分层压单/托单检测：连续档位密集挂单簇
        layering_bid = _detect_layering_cluster([float(b[1]) for b in bids if len(b) >= 2])
        layering_ask = _detect_layering_cluster([float(a[1]) for a in asks if len(a) >= 2])

        return {
            "bid_depth_usd": round(bid_depth, 2),
            "ask_depth_usd": round(ask_depth, 2),
            "imbalance_ratio": round(imbalance, 4),
            "largest_order_pct": round(largest_pct, 4),
            "spread_pct": round(spread_pct, 4),
            "cancel_rate": cancel_rate,
            "bid_levels": len(bids),
            "ask_levels": len(asks),
            "iceberg_bid": iceberg_bid,
            "iceberg_ask": iceberg_ask,
            "layering_bid": layering_bid,
            "layering_ask": layering_ask,
        }

    # ── Prompt 构建 ───────────────────────────────────────────

    @staticmethod
    def _build_prompt(
        data: MarketData,
        ob: dict[str, Any],
        metrics: dict[str, Any],
    ) -> str:
        """构建 LLM 分析 prompt。"""
        bids = ob.get("bids", [])[:20]
        asks = ob.get("asks", [])[:20]

        lines = [
            f"交易对: {data.symbol}",
            f"当前价格: {data.current_price}",
            "",
            "── 订单簿深度指标 ──",
            f"买盘总深度(USD): {metrics['bid_depth_usd']:,.0f}",
            f"卖盘总深度(USD): {metrics['ask_depth_usd']:,.0f}",
            f"深度失衡比: {metrics['imbalance_ratio']:.4f} (正=买盘偏强, 负=卖盘偏强)",
            f"最大单笔挂单占比: {metrics['largest_order_pct']:.2%}",
            f"买卖价差: {metrics['spread_pct']:.4f}%",
            f"买盘档位数: {metrics['bid_levels']}",
            f"卖盘档位数: {metrics['ask_levels']}",
        ]

        if metrics.get("cancel_rate") is not None:
            lines.append(f"撤单率: {metrics['cancel_rate']:.2%}")

        lines.append("")
        lines.append("── 买盘前20档 (价格, 数量) ──")
        for b in bids:
            lines.append(f"  {b[0]}, {b[1]}")

        lines.append("")
        lines.append("── 卖盘前20档 (价格, 数量) ──")
        for a in asks:
            lines.append(f"  {a[0]}, {a[1]}")

        # 异常标记
        alerts = []
        if metrics["largest_order_pct"] > LARGE_ORDER_DEPTH_RATIO:
            alerts.append(f"⚠️ 存在大额挂单（占深度 {metrics['largest_order_pct']:.1%}）")
        if abs(metrics["imbalance_ratio"]) > DEPTH_IMBALANCE_THRESHOLD:
            side = "买盘" if metrics["imbalance_ratio"] > 0 else "卖盘"
            alerts.append(f"⚠️ 深度严重失衡，{side}偏强 ({metrics['imbalance_ratio']:.2f})")
        if metrics.get("cancel_rate") and metrics["cancel_rate"] > CANCEL_RATE_THRESHOLD:
            alerts.append(f"⚠️ 撤单率异常 ({metrics['cancel_rate']:.1%})，疑似幽灵挂单")

        # 冰山订单检测结果
        if metrics.get("iceberg_bid", {}).get("detected"):
            ib = metrics["iceberg_bid"]
            alerts.append(
                f"⚠️ 买盘冰山订单嫌疑: {ib['uniform_levels']}档挂单量高度均匀"
                f"（CV={ib['cv']:.3f}），算法拆单特征"
            )
        if metrics.get("iceberg_ask", {}).get("detected"):
            ia = metrics["iceberg_ask"]
            alerts.append(
                f"⚠️ 卖盘冰山订单嫌疑: {ia['uniform_levels']}档挂单量高度均匀"
                f"（CV={ia['cv']:.3f}），算法拆单特征"
            )

        # 分层压单/托单检测结果
        if metrics.get("layering_bid", {}).get("detected"):
            lb = metrics["layering_bid"]
            alerts.append(
                f"⚠️ 买盘分层托单: {lb['cluster_levels']}档连续密集挂单"
                f"（均量比={lb['avg_ratio']:.1f}x）"
            )
        if metrics.get("layering_ask", {}).get("detected"):
            la = metrics["layering_ask"]
            alerts.append(
                f"⚠️ 卖盘分层压单: {la['cluster_levels']}档连续密集挂单"
                f"（均量比={la['avg_ratio']:.1f}x）"
            )

        if alerts:
            lines.append("")
            lines.append("── 预处理异常标记 ──")
            lines.extend(alerts)

        # CoinGlass 多交易所订单簿 + 大单数据
        cg = data.coinglass
        if cg:
            if cg.orderbook_levels:
                lines.append("")
                lines.append("── CoinGlass 聚合订单簿（多交易所）──")
                for lvl in cg.orderbook_levels[-10:]:
                    lines.append(
                        f"  价格={lvl.get('price', 'N/A')} "
                        f"买量={lvl.get('bid_qty', 'N/A')} "
                        f"卖量={lvl.get('ask_qty', 'N/A')}"
                    )
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
                lines.append("")
                lines.append("── CoinGlass 大单挂单 ──")
                for order in relevant[:10]:
                    lines.append(
                        f"  价格={order.get('price', 'N/A')} "
                        f"数量={order.get('amount', 'N/A')} "
                        f"USD={order.get('usd_value', 'N/A')} "
                        f"方向={order.get('side', 'N/A')} "
                        f"交易所={order.get('exchange', 'N/A')}"
                    )

        return "\n".join(lines)
