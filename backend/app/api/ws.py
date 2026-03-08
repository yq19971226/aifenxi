"""WebSocket 推送端点 — Redis-backed 连接管理 + JWT 认证。

端点:
  /ws/price?token=<jwt>   — 实时价格推送（所有会员）
  /ws/alerts?token=<jwt>  — 预警推送（专业+旗舰）

数据流:
  Redis Streams(kline_updates) → ws_broadcaster → 前端 /ws/price（按 symbol 过滤）
  Redis Streams(alerts)        → ws_broadcaster → 前端 /ws/alerts
  Redis Streams(alert_triggers)→ ws_broadcaster → 前端 /ws/alerts（定向推送给规则所有者）
"""

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.core.config import settings
from app.core.redis import get_redis_pool
from app.core.security import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

# ── 常量 ──────────────────────────────────────────────────────
HEARTBEAT_INTERVAL: int = 30  # 秒
HEARTBEAT_TIMEOUT: int = 10   # 等待 pong 超时
REDIS_KEY_WS_ONLINE: str = "ws:online:{channel}"
REDIS_ONLINE_TTL: int = 120   # 在线状态 TTL（秒）
STREAM_BLOCK_MS: int = 2000   # xread 阻塞时间
STREAM_BATCH: int = 50        # 每次读取最大消息数
DEFAULT_SYMBOL: str = "BTCUSDT"  # 免费用户默认订阅


# ── 连接信息类型 ──────────────────────────────────────────────

class _PriceConnection:
    """价格频道连接信息，包含 WebSocket 和订阅的 symbol 集合。"""

    __slots__ = ("ws", "symbols")

    def __init__(self, ws: WebSocket, symbols: set[str] | None = None) -> None:
        self.ws: WebSocket = ws
        self.symbols: set[str] = symbols if symbols is not None else {DEFAULT_SYMBOL}


# ── 进程内连接池 ──────────────────────────────────────────────
# price 频道：跟踪每个用户订阅的 symbol 列表
_price_connections: dict[str, _PriceConnection] = {}
# alerts 频道：简单的 user_id → WebSocket 映射
_alert_connections: dict[str, WebSocket] = {}
# 兼容旧接口的 _connections 引用（用于 get_online_count 回退）
_connections: dict[str, dict[str, Any]] = {
    "price": _price_connections,  # type: ignore[dict-item]
    "alerts": _alert_connections,  # type: ignore[dict-item]
}
_broadcaster_tasks: dict[str, asyncio.Task[None]] = {}


# ── 认证辅助 ──────────────────────────────────────────────────

def _authenticate_ws(token: str | None) -> dict[str, Any] | None:
    """解析 JWT token，返回 payload 或 None。"""
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        token_type = payload.get("type")
        if not user_id or token_type != "access":
            return None
        return payload
    except JWTError:
        return None


async def _get_membership_level(user_id: str) -> int:
    """从 Redis 缓存或默认值获取用户会员等级。"""
    try:
        redis = get_redis_pool()
        cached = await redis.get(f"user:membership:{user_id}")
        if cached is not None:
            return int(cached)
    except Exception as exc:
        logger.warning("Failed to get membership level from Redis: %s", exc)
    return 0  # 默认免费


# ── Redis 在线状态管理 ────────────────────────────────────────

async def _register_online(channel: str, user_id: str) -> None:
    """在 Redis 中注册用户在线状态。"""
    try:
        redis = get_redis_pool()
        key = REDIS_KEY_WS_ONLINE.format(channel=channel)
        await redis.hset(key, user_id, str(int(time.time())))
        await redis.expire(key, REDIS_ONLINE_TTL)
    except Exception as exc:
        logger.warning("Failed to register online status: %s", exc)


async def _unregister_online(channel: str, user_id: str) -> None:
    """从 Redis 中移除用户在线状态。"""
    try:
        redis = get_redis_pool()
        key = REDIS_KEY_WS_ONLINE.format(channel=channel)
        await redis.hdel(key, user_id)
    except Exception as exc:
        logger.warning("Failed to unregister online status: %s", exc)


async def get_online_count(channel: str) -> int:
    """获取指定频道在线用户数。"""
    try:
        redis = get_redis_pool()
        key = REDIS_KEY_WS_ONLINE.format(channel=channel)
        return await redis.hlen(key)
    except Exception as exc:
        logger.warning("Failed to get online count: %s", exc)
        return len(_connections.get(channel, {}))


# ── 心跳检测 ─────────────────────────────────────────────────

async def _heartbeat_loop(ws: WebSocket, channel: str, user_id: str) -> None:
    """定期发送 ping，检测连接是否存活。"""
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            try:
                await asyncio.wait_for(
                    ws.send_json({"type": "ping", "ts": int(time.time())}),
                    timeout=HEARTBEAT_TIMEOUT,
                )
            except (asyncio.TimeoutError, Exception):
                logger.info("Heartbeat failed for user %s on %s, closing", user_id, channel)
                await _remove_connection(channel, user_id)
                try:
                    await ws.close(code=status.WS_1001_GOING_AWAY)
                except Exception:
                    pass
                return
    except asyncio.CancelledError:
        return


# ── 连接管理 ─────────────────────────────────────────────────

async def _add_connection(channel: str, user_id: str, ws: WebSocket) -> None:
    """添加连接到进程内池 + Redis 在线状态。"""
    if channel == "price":
        old = _price_connections.get(user_id)
        if old is not None:
            try:
                await old.ws.close(code=status.WS_1000_NORMAL_CLOSURE)
            except Exception:
                pass
        _price_connections[user_id] = _PriceConnection(ws)
    else:
        old_ws = _alert_connections.get(user_id)
        if old_ws is not None:
            try:
                await old_ws.close(code=status.WS_1000_NORMAL_CLOSURE)
            except Exception:
                pass
        _alert_connections[user_id] = ws
    await _register_online(channel, user_id)
    logger.info("WS connected: user=%s channel=%s", user_id, channel)


async def _remove_connection(channel: str, user_id: str) -> None:
    """从进程内池 + Redis 移除连接。"""
    if channel == "price":
        _price_connections.pop(user_id, None)
    else:
        _alert_connections.pop(user_id, None)
    await _unregister_online(channel, user_id)
    logger.info("WS disconnected: user=%s channel=%s", user_id, channel)


# ── 订阅管理 ─────────────────────────────────────────────────

def subscribe_symbols(user_id: str, symbols: list[str]) -> set[str]:
    """为 price 频道用户添加 symbol 订阅，返回更新后的订阅集合。"""
    conn = _price_connections.get(user_id)
    if conn is None:
        return set()
    normalized = {s.upper() for s in symbols if s}
    conn.symbols.update(normalized)
    logger.info("User %s subscribed to symbols: %s", user_id, normalized)
    return set(conn.symbols)


def unsubscribe_symbols(user_id: str, symbols: list[str]) -> set[str]:
    """为 price 频道用户移除 symbol 订阅，返回更新后的订阅集合。"""
    conn = _price_connections.get(user_id)
    if conn is None:
        return set()
    normalized = {s.upper() for s in symbols if s}
    conn.symbols.difference_update(normalized)
    logger.info("User %s unsubscribed from symbols: %s", user_id, normalized)
    return set(conn.symbols)


def get_user_subscriptions(user_id: str) -> set[str]:
    """获取用户当前订阅的 symbol 集合。"""
    conn = _price_connections.get(user_id)
    if conn is None:
        return set()
    return set(conn.symbols)


# ── 广播 ─────────────────────────────────────────────────────

async def broadcast(channel: str, data: dict[str, Any], symbol: str | None = None) -> None:
    """向指定频道广播消息。

    对于 price 频道，如果提供了 symbol 参数，则只发送给订阅了该 symbol 的用户。
    对于 alerts 频道，行为与之前一致（发送给所有连接）。
    """
    if channel == "price":
        await _broadcast_price(data, symbol)
    else:
        await _broadcast_alerts(data)


async def _broadcast_price(data: dict[str, Any], symbol: str | None = None) -> None:
    """价格频道广播 — 按 symbol 过滤订阅者。"""
    dead: list[str] = []
    for user_id, conn in _price_connections.items():
        # 如果指定了 symbol，只发送给订阅了该 symbol 的用户
        if symbol is not None and symbol.upper() not in conn.symbols:
            continue
        try:
            await conn.ws.send_json(data)
        except Exception:
            dead.append(user_id)
    for user_id in dead:
        await _remove_connection("price", user_id)


async def _broadcast_alerts(data: dict[str, Any]) -> None:
    """预警频道广播 — 发送给所有连接。"""
    dead: list[str] = []
    for user_id, ws in _alert_connections.items():
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(user_id)
    for user_id in dead:
        await _remove_connection("alerts", user_id)


async def broadcast_to_user(channel: str, user_id: str, data: dict[str, Any]) -> bool:
    """向指定用户定向推送消息。返回是否发送成功。"""
    try:
        if channel == "price":
            conn = _price_connections.get(user_id)
            if conn is None:
                return False
            await conn.ws.send_json(data)
        else:
            ws = _alert_connections.get(user_id)
            if ws is None:
                return False
            await ws.send_json(data)
        return True
    except Exception:
        await _remove_connection(channel, user_id)
        return False


# ── Redis Streams 消费者 ─────────────────────────────────────

async def _consume_stream(stream: str, channel: str) -> None:
    """后台任务：持续消费 Redis Stream 并广播到 WebSocket 频道。"""
    last_id = "$"  # 只读取新消息
    while True:
        try:
            redis = get_redis_pool()
            messages = await redis.xread(
                {stream: last_id},
                count=STREAM_BATCH,
                block=STREAM_BLOCK_MS,
            )
            if not messages:
                continue
            for _stream_name, entries in messages:
                for msg_id, fields in entries:
                    last_id = msg_id
                    # 反序列化 JSON 字段
                    parsed: dict[str, Any] = {}
                    for k, v in fields.items():
                        try:
                            parsed[k] = json.loads(v)
                        except (json.JSONDecodeError, TypeError):
                            parsed[k] = v
                    parsed["type"] = channel
                    # 提取 symbol 用于 price 频道过滤
                    msg_symbol: str | None = parsed.get("symbol") if channel == "price" else None
                    await broadcast(channel, parsed, symbol=msg_symbol)
        except asyncio.CancelledError:
            logger.info("Stream consumer %s stopped", stream)
            return
        except Exception as exc:
            err_msg = str(exc).lower()
            if "unknown command" in err_msg or "not supported" in err_msg:
                logger.warning(
                    "Stream consumer %s: Redis Streams not supported "
                    "(requires Redis 5.0+), consumer disabled",
                    stream,
                )
                return
            logger.error("Stream consumer %s error: %s", stream, exc)
            await asyncio.sleep(2)


async def _consume_alert_triggers() -> None:
    """后台任务：消费 alert_triggers 流，定向推送给规则所有者。

    消息格式（由 alert_eval_worker 发布）:
    {
        "user_id": "...",
        "rule_id": "...",
        "rule_name": "...",
        "symbol": "...",
        "triggered_value": ...,
        "timestamp": "..."
    }
    """
    last_id = "$"
    while True:
        try:
            redis = get_redis_pool()
            messages = await redis.xread(
                {"alert_triggers": last_id},
                count=STREAM_BATCH,
                block=STREAM_BLOCK_MS,
            )
            if not messages:
                continue
            for _stream_name, entries in messages:
                for msg_id, fields in entries:
                    last_id = msg_id
                    parsed: dict[str, Any] = {}
                    for k, v in fields.items():
                        try:
                            parsed[k] = json.loads(v)
                        except (json.JSONDecodeError, TypeError):
                            parsed[k] = v

                    target_user_id: str | None = parsed.pop("user_id", None)
                    if not target_user_id:
                        logger.warning("alert_triggers message missing user_id: %s", msg_id)
                        continue

                    notification = {
                        "type": "alert_trigger",
                        "rule_id": parsed.get("rule_id", ""),
                        "rule_name": parsed.get("rule_name", ""),
                        "symbol": parsed.get("symbol", ""),
                        "triggered_value": parsed.get("triggered_value"),
                        "timestamp": parsed.get("timestamp", ""),
                    }
                    sent = await broadcast_to_user("alerts", target_user_id, notification)
                    if sent:
                        logger.info(
                            "Alert trigger sent to user %s: rule=%s symbol=%s",
                            target_user_id,
                            notification["rule_id"],
                            notification["symbol"],
                        )
        except asyncio.CancelledError:
            logger.info("Stream consumer alert_triggers stopped")
            return
        except Exception as exc:
            err_msg = str(exc).lower()
            if "unknown command" in err_msg or "not supported" in err_msg:
                logger.warning(
                    "Stream consumer alert_triggers: Redis Streams not "
                    "supported (requires Redis 5.0+), consumer disabled",
                )
                return
            logger.error("Stream consumer alert_triggers error: %s", exc)
            await asyncio.sleep(2)


def start_stream_consumers() -> None:
    """启动 Redis Streams 消费后台任务（在 app lifespan 中调用）。"""
    if "price" not in _broadcaster_tasks or _broadcaster_tasks["price"].done():
        _broadcaster_tasks["price"] = asyncio.create_task(
            _consume_stream("kline_updates", "price")
        )
    if "alerts" not in _broadcaster_tasks or _broadcaster_tasks["alerts"].done():
        _broadcaster_tasks["alerts"] = asyncio.create_task(
            _consume_stream("alerts", "alerts")
        )
    if "alert_triggers" not in _broadcaster_tasks or _broadcaster_tasks["alert_triggers"].done():
        _broadcaster_tasks["alert_triggers"] = asyncio.create_task(
            _consume_alert_triggers()
        )
    logger.info("WebSocket stream consumers started")


async def stop_stream_consumers() -> None:
    """停止所有后台消费任务。"""
    for name, task in _broadcaster_tasks.items():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        logger.info("Stream consumer %s stopped", name)
    _broadcaster_tasks.clear()


# ── 客户端消息处理 ────────────────────────────────────────────

async def _handle_client_message(channel: str, user_id: str, raw: str) -> None:
    """解析并处理客户端发送的 WebSocket 消息。

    支持的消息类型:
    - {"type": "pong"}                                — 心跳响应
    - {"type": "subscribe", "symbols": ["BTCUSDT"]}   — 订阅 symbol（仅 price 频道）
    - {"type": "unsubscribe", "symbols": ["BTCUSDT"]} — 取消订阅 symbol（仅 price 频道）
    """
    try:
        msg = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return

    msg_type = msg.get("type")

    if msg_type == "pong":
        await _register_online(channel, user_id)
        return

    if channel != "price":
        return

    if msg_type == "subscribe":
        symbols = msg.get("symbols")
        if isinstance(symbols, list) and symbols:
            updated = subscribe_symbols(user_id, symbols)
            conn = _price_connections.get(user_id)
            if conn is not None:
                try:
                    await conn.ws.send_json({
                        "type": "subscribed",
                        "symbols": sorted(updated),
                    })
                except Exception:
                    pass

    elif msg_type == "unsubscribe":
        symbols = msg.get("symbols")
        if isinstance(symbols, list) and symbols:
            updated = unsubscribe_symbols(user_id, symbols)
            conn = _price_connections.get(user_id)
            if conn is not None:
                try:
                    await conn.ws.send_json({
                        "type": "unsubscribed",
                        "symbols": sorted(updated),
                    })
                except Exception:
                    pass


# ── WebSocket 端点 ────────────────────────────────────────────

async def _handle_ws(
    websocket: WebSocket,
    channel: str,
    required_level: int = 0,
) -> None:
    """通用 WebSocket 处理逻辑：认证 → 权限 → 连接 → 心跳 → 接收。"""
    # 1. 认证
    token = websocket.query_params.get("token")
    payload = _authenticate_ws(token)
    if payload is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id: str = payload["sub"]

    # 2. 权限检查
    if required_level > 0:
        level = await _get_membership_level(user_id)
        if level < required_level:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    # 3. 接受连接
    await websocket.accept()
    await _add_connection(channel, user_id, websocket)

    # 4. 对 price 频道，发送当前订阅状态
    if channel == "price":
        subs = get_user_subscriptions(user_id)
        try:
            await websocket.send_json({
                "type": "subscribed",
                "symbols": sorted(subs),
            })
        except Exception:
            pass

    # 5. 启动心跳
    heartbeat_task = asyncio.create_task(
        _heartbeat_loop(websocket, channel, user_id)
    )

    try:
        while True:
            data = await websocket.receive_text()
            await _handle_client_message(channel, user_id, data)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("WS error user=%s channel=%s: %s", user_id, channel, exc)
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        await _remove_connection(channel, user_id)


@router.websocket("/price")
async def ws_price(websocket: WebSocket) -> None:
    """实时价格推送 — 所有认证用户可用。按 symbol 订阅过滤。"""
    await _handle_ws(websocket, "price", required_level=0)


@router.websocket("/alerts")
async def ws_alerts(websocket: WebSocket) -> None:
    """预警推送 — 专业(1)及以上会员。支持定向预警触发通知。"""
    await _handle_ws(websocket, "alerts", required_level=1)
