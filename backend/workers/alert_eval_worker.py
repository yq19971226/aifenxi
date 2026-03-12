"""Celery 任务：消费 Redis Streams 数据更新事件，评估预警规则并触发通知。"""

import asyncio
import json
import logging

from app.core.redis import get_redis_pool, init_redis, publish_stream
from app.models.alert import MetricType
from app.services.alert_engine import AlertRuleEngine
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)

# 消费的 Stream 列表
_STREAMS = ["kline_updates", "indicator_updates", "onchain_updates", "ai_signal_updates"]
_CONSUMER_GROUP = "alert_eval_workers"
_CONSUMER_NAME = "alert_eval_worker_1"

# onchain 字段到 MetricType 的映射
_ONCHAIN_METRIC_MAP: dict[str, str] = {
    "exchange_netflow": MetricType.EXCHANGE_NETFLOW.value,
    "whale_change_24h": MetricType.WHALE_CHANGE_24H.value,
    "fear_greed_index": MetricType.FEAR_GREED_INDEX.value,
    "mvrv": MetricType.MVRV.value,
}


def _is_streams_unsupported(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "unknown command" in msg or "not supported" in msg


def _normalize_message(stream_name: str, msg_data: dict) -> list[dict]:
    """将不同 Stream 的消息格式统一为 [{symbol, metric_type, current_value}]。

    kline_updates → 提取 close 价格，生成 metric_type=price（仅 WS 来源有 close 字段）
    onchain_updates → 拆分为多条消息，每个链上指标一条
    indicator_updates → 已经是标准格式，直接透传
    """
    if stream_name == "indicator_updates":
        return [msg_data]

    if stream_name == "kline_updates":
        # 仅处理有 close 字段的消息（来自 WebSocket 实时推送）
        close_raw = msg_data.get("close")
        if close_raw is None:
            return []
        try:
            symbol = json.loads(msg_data.get("symbol", '""'))
            close_val = float(json.loads(close_raw))
        except (json.JSONDecodeError, ValueError, TypeError):
            return []
        if not symbol:
            return []
        return [{
            "symbol": json.dumps(symbol),
            "metric_type": json.dumps(MetricType.PRICE.value),
            "current_value": json.dumps(close_val),
        }]

    if stream_name == "onchain_updates":
        try:
            symbol = json.loads(msg_data.get("symbol", '""'))
        except (json.JSONDecodeError, ValueError, TypeError):
            return []
        if not symbol:
            return []

        results = []
        for field, metric_type_val in _ONCHAIN_METRIC_MAP.items():
            raw = msg_data.get(field)
            if raw is None:
                continue
            try:
                value = float(json.loads(raw))
            except (json.JSONDecodeError, ValueError, TypeError):
                continue
            results.append({
                "symbol": json.dumps(symbol),
                "metric_type": json.dumps(metric_type_val),
                "current_value": json.dumps(value),
            })
        return results

    # ai_signal_updates 已经是标准格式 {symbol, metric_type, current_value}
    if stream_name == "ai_signal_updates":
        return [msg_data]

    return []


async def _notify_alert_triggered(
    rule_name: str,
    rule_id: str,
    symbol: str,
    current_value: float,
    notify_channels: list[str],
) -> None:
    """通过推送模块发送预警通知（写入对应的 Redis Stream）。"""
    for channel in notify_channels:
        try:
            if channel == "websocket":
                await publish_stream("alert_notifications", {
                    "type": "alert_triggered",
                    "rule_id": rule_id,
                    "rule_name": rule_name,
                    "symbol": symbol,
                    "value": current_value,
                })
            elif channel == "telegram":
                await publish_stream("telegram_alerts", {
                    "type": "alert",
                    "message": (
                        f"⚠️ 预警触发: {rule_name}\n"
                        f"交易对: {symbol}\n"
                        f"当前值: {current_value}"
                    ),
                })
            elif channel == "email":
                await publish_stream("email_alerts", {
                    "type": "alert",
                    "subject": f"预警触发: {rule_name}",
                    "body": (
                        f"交易对 {symbol} 触发预警规则 [{rule_name}]，"
                        f"当前值: {current_value}"
                    ),
                })
            logger.info("预警通知已发送: rule=%s, channel=%s", rule_id, channel)
        except Exception as exc:
            logger.error(
                "预警通知发送失败: rule=%s, channel=%s, error=%s",
                rule_id, channel, exc,
            )


async def _process_update(msg_data: dict) -> int:
    """处理单条数据更新消息，评估预警规则。返回触发的规则数。"""
    try:
        symbol = json.loads(msg_data.get("symbol", '""'))
        metric_type_str = json.loads(msg_data.get("metric_type", '""'))
        current_value = float(json.loads(msg_data.get("current_value", "0")))
        prev_value_raw = msg_data.get("prev_value")
        prev_value = float(json.loads(prev_value_raw)) if prev_value_raw else None

        if not symbol or not metric_type_str:
            return 0

        metric_type = MetricType(metric_type_str)

        async with worker_session() as session:
            async with session.begin():
                engine = AlertRuleEngine(session)
                triggered_ids = await engine.evaluate(
                    symbol=symbol,
                    metric_type=metric_type,
                    current_value=current_value,
                    prev_value=prev_value,
                )

                for rule_id in triggered_ids:
                    rule = await engine.get_rule(rule_id)
                    if rule is None:
                        continue

                    notify_channels = rule.notify_channels
                    # 记录每个通知渠道的触发历史
                    for channel in notify_channels:
                        await engine.record_trigger(
                            rule_id, current_value, metric_type_str, channel
                        )

                    # 发送通知
                    await _notify_alert_triggered(
                        rule_name=rule.name,
                        rule_id=str(rule.id),
                        symbol=rule.symbol,
                        current_value=current_value,
                        notify_channels=notify_channels,
                    )

        return len(triggered_ids)
    except Exception as exc:
        logger.error("处理预警评估消息失败: %s", exc)
        return 0


async def _consume_alert_streams_once() -> int:
    """从多个 Redis Stream 读取消息并评估预警规则，返回处理条数。"""
    await init_redis()
    redis = get_redis_pool()

    # 确保 consumer group 存在
    for stream in _STREAMS:
        try:
            await redis.xgroup_create(stream, _CONSUMER_GROUP, id="0", mkstream=True)
        except Exception as exc:
            if _is_streams_unsupported(exc):
                logger.warning(
                    "Redis Streams not supported (requires Redis 5.0+), alert_eval_worker disabled",
                )
                return 0
            pass  # group 已存在或其他可恢复错误

    stream_dict = {s: ">" for s in _STREAMS}
    try:
        messages = await redis.xreadgroup(
            _CONSUMER_GROUP,
            _CONSUMER_NAME,
            stream_dict,
            count=50,
            block=3000,
        )
    except Exception as exc:
        if _is_streams_unsupported(exc):
            logger.warning(
                "Redis Streams not supported (requires Redis 5.0+), alert_eval_worker disabled",
            )
            return 0
        raise

    count = 0
    if messages:
        for stream_name, entries in messages:
            for msg_id, msg_data in entries:
                # 将不同 Stream 的消息格式统一为标准格式
                normalized = _normalize_message(stream_name, msg_data)
                for norm_msg in normalized:
                    triggered = await _process_update(norm_msg)
                    if triggered > 0:
                        logger.info(
                            "预警评估完成: stream=%s, triggered=%d",
                            stream_name, triggered,
                        )
                await redis.xack(stream_name, _CONSUMER_GROUP, msg_id)
                count += 1
    return count


@celery_app.task(
    name="workers.alert_eval_worker.evaluate_alerts_task",
    bind=True,
    max_retries=3,
)
def evaluate_alerts_task(self) -> dict:
    """消费 Redis Streams 数据更新事件，评估预警规则并触发通知。"""
    try:
        processed = asyncio.run(_consume_alert_streams_once())
        return {"processed": processed}
    except Exception as exc:
        logger.error("evaluate_alerts_task error: %s", exc)
        raise self.retry(exc=exc, countdown=10)
