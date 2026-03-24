"""推广素材生成服务 — 基于最新策略数据动态生成文案和长图数据。

文案模板从 system_configs (task_promo_templates) 读取，
品牌名从 site_brand_name 读取，运行时替换 {brand_name} 占位符。
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis_pool
from app.services.config_service import get_config_value

logger = logging.getLogger(__name__)

# 内置默认文案模板（system_configs 为空时使用）
DEFAULT_TEMPLATES = [
    {
        "style": "成绩展示",
        "template": (
            "刚看了一下 {symbol}，{direction}信号 {gain_pct}%！\n"
            "入场 {entry_price} → 目标 {target_price}\n"
            "链上数据同步验证 ✅\n"
            "搜索 {brand_name} 看完整分析"
        ),
    },
    {
        "style": "疑问引导",
        "template": (
            "{symbol} 接下来怎么走？\n"
            "{brand_name} 的 AI 多智能体系统给出了{direction}信号，准确率一直很高\n"
            "感兴趣的搜一下 {brand_name}"
        ),
    },
    {
        "style": "口碑推荐",
        "template": (
            "推荐一个 AI 量化分析工具 {brand_name}\n"
            "10个AI智能体 + 链上数据交叉验证\n"
            "免费就能用，搜 {brand_name}"
        ),
    },
]


async def generate_promo(session: AsyncSession) -> dict:
    """生成推广素材：多条文案 + 长图数据。

    Returns:
        {
            "copies": [{"style": "...", "text": "..."}],
            "image_data": {...},  # 前端 Canvas 渲染用数据
            "generated_at": "..."
        }
    """
    # 1. 获取最新策略数据
    strategy_data = await _get_latest_strategy(session)

    # 2. 获取品牌名
    brand_name = await get_config_value("site_brand_name", "")

    # 3. 加载文案模板
    templates = await _load_templates()

    # 4. 填充变量生成文案
    copies = []
    for tmpl in templates:
        try:
            filled = tmpl["template"].format(
                brand_name=brand_name,
                symbol=strategy_data.get("symbol", "BTCUSDT"),
                direction=strategy_data.get("direction", "做多"),
                gain_pct=strategy_data.get("gain_pct", "0"),
                entry_price=strategy_data.get("entry_price", "-"),
                target_price=strategy_data.get("target_price", "-"),
            )
            copies.append({"style": tmpl.get("style", ""), "text": filled})
        except (KeyError, ValueError) as e:
            logger.warning("文案模板填充失败: %s", e)
            continue

    # 5. 组装长图数据（前端 Canvas 渲染）
    image_data = {
        "symbol": strategy_data.get("symbol", "BTCUSDT"),
        "direction": strategy_data.get("direction", "做多"),
        "gain_pct": strategy_data.get("gain_pct", "0"),
        "entry_price": strategy_data.get("entry_price", "-"),
        "target_price": strategy_data.get("target_price", "-"),
        "verified": strategy_data.get("verified", False),
        "brand_name": brand_name,
    }

    return {
        "copies": copies,
        "image_data": image_data,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def _get_latest_strategy(session: AsyncSession) -> dict:
    """从数据库或 Redis 获取最新的已验证策略数据。"""
    # 优先从 Redis 缓存读取
    redis = get_redis_pool()
    cached = await redis.get("promo:latest_strategy")
    if cached:
        try:
            return json.loads(cached)
        except (json.JSONDecodeError, TypeError):
            pass

    # 回退到数据库查询最新策略
    try:
        result = await session.execute(
            text(
                """
                SELECT symbol, direction, entry_low, entry_high,
                       stop_loss, targets, confidence, created_at
                FROM strategies
                WHERE direction != 'neutral'
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
        )
        row = result.mappings().first()
        if row:
            # 入场价 = entry_low 和 entry_high 的中位
            entry_low = float(row["entry_low"] or 0)
            entry_high = float(row["entry_high"] or 0)
            entry_mid = (entry_low + entry_high) / 2 if entry_low and entry_high else entry_low or entry_high

            # 目标价 = targets 数组的第一个元素
            targets_raw = row["targets"]
            targets = json.loads(targets_raw) if isinstance(targets_raw, str) else (targets_raw or [])
            target_price = targets[0] if targets else 0

            # 收益率 = (目标价 - 入场价) / 入场价 * 100
            if entry_mid > 0 and target_price > 0:
                direction_str = row["direction"]
                if direction_str == "long":
                    gain_pct = round((target_price - entry_mid) / entry_mid * 100, 2)
                else:
                    gain_pct = round((entry_mid - target_price) / entry_mid * 100, 2)
            else:
                gain_pct = 0

            # 价格格式化
            def _fmt_price(val: float) -> str:
                if val > 10000: return f"{val:.1f}"
                if val > 100:   return f"{val:.2f}"
                if val > 1:     return f"{val:.4f}"
                if val > 0.01:  return f"{val:.6f}"
                return f"{val:.8f}"

            data = {
                "symbol": row["symbol"],
                "direction": "做多" if row["direction"] == "long" else "做空",
                "entry_price": _fmt_price(entry_mid) if entry_mid > 0 else "-",
                "target_price": _fmt_price(target_price) if target_price > 0 else "-",
                "gain_pct": str(gain_pct),
                "verified": True,
            }
            # 缓存 10 分钟
            await redis.set("promo:latest_strategy", json.dumps(data), ex=600)
            return data
    except Exception as e:
        logger.warning("查询最新策略失败: %s", e)

    # 兜底默认数据
    return {
        "symbol": "BTCUSDT",
        "direction": "做多",
        "entry_price": "-",
        "target_price": "-",
        "gain_pct": "0",
        "verified": False,
    }


async def _load_templates() -> list[dict]:
    """从 system_configs 加载文案模板，失败时使用默认模板。"""
    try:
        raw = await get_config_value("task_promo_templates", "[]")
        templates = json.loads(raw)
        if isinstance(templates, list) and len(templates) > 0:
            return templates
    except (json.JSONDecodeError, TypeError):
        pass
    return DEFAULT_TEMPLATES
