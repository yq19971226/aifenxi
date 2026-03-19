"""信号历史记录与稳定度计算服务。

每次分析完成后记录信号到 Redis 有序集合，供用户查看信号的连续性和稳定度。
数据结构：
    key: signal:history:{symbol}:{mode}
    member: JSON { signal, confidence, timestamp }
    score: Unix timestamp

保留最近 20 条记录，TTL = 48 小时。
"""

import json
import logging
import time
from datetime import datetime, timezone

from app.core.redis import get_redis_pool

logger = logging.getLogger(__name__)

_MAX_HISTORY = 20       # 最多保留 20 条
_HISTORY_TTL = 172800   # 48 小时


async def record_signal(
    symbol: str,
    mode: str,
    signal: str,
    confidence: float,
    market_regime: str | None = None,
) -> None:
    """记录一次分析信号到历史列表。"""
    try:
        redis = get_redis_pool()
        key = f"signal:history:{symbol.upper()}:{mode}"
        now = time.time()
        entry = json.dumps({
            "signal": signal,
            "confidence": round(confidence, 4),
            "regime": market_regime,
            "ts": now,
            "time": datetime.now(timezone.utc).isoformat(),
        })
        # 使用有序集合，score=timestamp
        await redis.zadd(key, {entry: now})
        # 删除最旧的超出限制的条目
        count = await redis.zcard(key)
        if count > _MAX_HISTORY:
            await redis.zremrangebyrank(key, 0, count - _MAX_HISTORY - 1)
        # 设置 TTL
        await redis.expire(key, _HISTORY_TTL)
    except Exception as exc:
        logger.warning("record_signal failed: %s", exc)


async def get_signal_stability(
    symbol: str,
    mode: str,
) -> dict:
    """计算信号稳定度指标。

    Returns:
        {
            "recent_signals": [{"signal": "bullish", "confidence": 0.72, ...}, ...],
            "consistency": 0.75,        # 最近 N 次中与当前信号一致的比例
            "current_streak": 3,        # 当前方向连续次数
            "dominant_signal": "bullish",# 最近 N 次中占比最大的信号
            "duration_minutes": 135,    # 当前信号已持续的分钟数
            "total_count": 8,           # 历史总条数
            "stability_grade": "高",    # 稳定度等级
        }
    """
    try:
        redis = get_redis_pool()
        key = f"signal:history:{symbol.upper()}:{mode}"

        # 读取所有历史记录（按时间倒序）
        raw_entries = await redis.zrevrange(key, 0, _MAX_HISTORY - 1)
        if not raw_entries:
            return _empty_stability()

        entries = []
        for raw in raw_entries:
            try:
                entry = json.loads(raw)
                entries.append(entry)
            except (json.JSONDecodeError, TypeError):
                continue

        if not entries:
            return _empty_stability()

        latest_signal = entries[0]["signal"]
        total = len(entries)

        # 1. 当前方向连续次数（streak）
        streak = 0
        for e in entries:
            if e["signal"] == latest_signal:
                streak += 1
            else:
                break

        # 2. 一致性（consistency）= 与最新信号方向一致的比例
        same_count = sum(1 for e in entries if e["signal"] == latest_signal)
        consistency = same_count / total

        # 3. 主导信号（dominant）
        signal_counts: dict[str, int] = {}
        for e in entries:
            s = e["signal"]
            signal_counts[s] = signal_counts.get(s, 0) + 1
        dominant = max(signal_counts.items(), key=lambda x: x[1])[0]

        # 4. 持续时间 = 最早一个连续同向信号的时间到现在的分钟数
        first_same_ts = entries[0].get("ts", time.time())
        for i in range(streak - 1, -1, -1):
            if i < len(entries):
                first_same_ts = entries[i].get("ts", first_same_ts)
        duration_minutes = max(0, int((time.time() - first_same_ts) / 60))

        # 5. 稳定度等级
        if streak >= 4 and consistency >= 0.8:
            grade = "high"
        elif streak >= 2 and consistency >= 0.6:
            grade = "medium"
        else:
            grade = "low"

        # 前端展示用的简化列表（最近 5 条）
        recent = [
            {
                "signal": e["signal"],
                "confidence": e.get("confidence", 0),
                "regime": e.get("regime"),
                "time": e.get("time", ""),
            }
            for e in entries[:5]
        ]

        return {
            "recent_signals": recent,
            "consistency": round(consistency, 2),
            "current_streak": streak,
            "dominant_signal": dominant,
            "duration_minutes": duration_minutes,
            "total_count": total,
            "stability_grade": grade,
        }

    except Exception as exc:
        logger.warning("get_signal_stability failed: %s", exc)
        return _empty_stability()


def _empty_stability() -> dict:
    return {
        "recent_signals": [],
        "consistency": 0.0,
        "current_streak": 0,
        "dominant_signal": "neutral",
        "duration_minutes": 0,
        "total_count": 0,
        "stability_grade": "no_data",
    }
