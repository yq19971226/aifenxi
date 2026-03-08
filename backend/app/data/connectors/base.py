"""连接器基类 — 统一重连、心跳、数据发布。"""

from __future__ import annotations

import asyncio
import logging
import os
import ssl
import time
from abc import ABC, abstractmethod
from collections import deque
from datetime import datetime
from urllib.parse import urlparse

import websockets

from app.models.datasource import DataSourceStatus, HealthStatus

logger = logging.getLogger(__name__)

_INITIAL_BACKOFF = 5.0   # 秒
_MAX_BACKOFF = 60.0       # 秒
_MAX_RECONNECT_ATTEMPTS = 10
_RECOVERY_COOLDOWN = 300.0  # 重试耗尽后冷却 5 分钟再重新尝试
_STALE_THRESHOLD = 60.0  # 超过 60s 无消息标记为 stale
_RATE_HISTORY_MINUTES = 60  # 保留最近 60 分钟的速率历史


class BaseConnector(ABC):
    """WebSocket 连接器基类 — 统一重连、心跳、数据发布。

    子类必须实现:
        connect()         — 建立 WebSocket 连接
        subscribe()       — 订阅频道
        _parse_message()  — 原始消息 → 标准模型列表
    """

    source_id: str
    ws_url: str

    def __init__(self) -> None:
        self._running: bool = False
        self._reconnect_count: int = 0
        self._error_count: int = 0
        self._last_message_at: datetime | None = None
        self._message_count: int = 0
        self._message_window: list[datetime] = []  # 用于计算速率的滑动窗口
        self._status: DataSourceStatus = DataSourceStatus.DISABLED
        # 每分钟速率历史：deque of (minute_ts, msg_count)
        self._rate_history: deque[tuple[int, int]] = deque(maxlen=_RATE_HISTORY_MINUTES)
        self._current_minute_ts: int = int(time.time()) // 60
        self._current_minute_count: int = 0

    # ── 抽象方法（子类必须实现） ────────────────────────────

    @abstractmethod
    async def connect(self) -> bool:
        """建立 WebSocket 连接，返回是否成功。"""

    @abstractmethod
    async def subscribe(self, channels: list[str] | None = None) -> None:
        """订阅指定频道。"""

    @abstractmethod
    async def _run_loop(self) -> None:
        """内部消息接收主循环（连接已建立后调用）。"""

    # ── 公共接口 ────────────────────────────────────────────

    async def run_with_reconnect(self) -> None:
        """带指数退避重连的主循环（5s 初始，60s 上限，10 次最大）。

        重试耗尽后不会永久死亡，而是进入冷却期（5 分钟）后重置计数器重新尝试。
        """
        self._running = True
        while self._running:
            # ── 内层重连循环（最多 _MAX_RECONNECT_ATTEMPTS 次） ──
            while self._running and self._reconnect_count < _MAX_RECONNECT_ATTEMPTS:
                connected = await self.connect()
                if not connected:
                    logger.warning(
                        "Connector connect failed, backing off",
                        extra={"source_id": self.source_id, "attempt": self._reconnect_count},
                    )
                    self._status = DataSourceStatus.ERROR
                    self._error_count += 1
                    self._reconnect_count += 1
                    if self._reconnect_count >= _MAX_RECONNECT_ATTEMPTS:
                        break
                    backoff = self._exponential_backoff(self._reconnect_count)
                    await asyncio.sleep(backoff)
                    continue

                self._status = DataSourceStatus.ENABLED
                self._reconnect_count = 0  # 连接成功后重置
                await self.subscribe()

                try:
                    await self._run_loop()
                except Exception as exc:
                    logger.error(
                        "Connector run_loop error",
                        extra={"source_id": self.source_id, "error": str(exc)},
                    )
                    self._error_count += 1

                if not self._running:
                    return

                # 断线后重连
                self._reconnect_count += 1
                self._status = DataSourceStatus.ERROR
                backoff = self._exponential_backoff(self._reconnect_count)
                logger.info(
                    "Connector reconnecting",
                    extra={
                        "source_id": self.source_id,
                        "attempt": self._reconnect_count,
                        "backoff": backoff,
                    },
                )
                await asyncio.sleep(backoff)

            if not self._running:
                return

            # ── 重试耗尽 → 冷却后自动恢复 ──
            logger.warning(
                "Connector max reconnects exceeded, entering recovery cooldown",
                extra={
                    "source_id": self.source_id,
                    "cooldown_seconds": _RECOVERY_COOLDOWN,
                },
            )
            self._status = DataSourceStatus.ERROR
            await asyncio.sleep(_RECOVERY_COOLDOWN)
            self._reconnect_count = 0
            logger.info(
                "Connector recovery cooldown finished, retrying",
                extra={"source_id": self.source_id},
            )

    async def close(self) -> None:
        """关闭连接。子类应覆盖此方法关闭 WebSocket。"""
        self._running = False
        self._status = DataSourceStatus.DISABLED

    def health_check(self) -> HealthStatus:
        """返回当前连接健康状态。"""
        connected = self._status == DataSourceStatus.ENABLED
        return HealthStatus(
            source_id=self.source_id,
            connected=connected,
            status=self._status,
            last_message_at=self._last_message_at,
            message_rate=self._calc_message_rate(),
            reconnect_count=self._reconnect_count,
            error_count=self._error_count,
            circuit_breaker_state="closed",
            checked_at=datetime.utcnow(),
        )

    # ── 保护方法（供子类调用） ──────────────────────────────

    _shared_router: object | None = None  # class-level cached StreamRouter

    @staticmethod
    async def _proxy_connect(
        ws_url: str,
        *,
        ping_interval: float | None = 20,
        ping_timeout: float | None = 10,
    ) -> websockets.WebSocketClientProtocol:
        """创建 WebSocket 连接，自动检测 HTTPS_PROXY 环境变量。

        如果存在代理，通过 HTTP CONNECT 隧道建立 TLS 连接。
        如果不存在代理，直接连接。
        """
        import socket as _socket

        proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        no_proxy = os.environ.get("NO_PROXY", "") or os.environ.get("no_proxy", "")

        parsed_ws = urlparse(ws_url)
        ws_host = parsed_ws.hostname or ""
        ws_port = parsed_ws.port or (443 if parsed_ws.scheme == "wss" else 80)

        # 检查 NO_PROXY
        skip_proxy = False
        if no_proxy:
            for entry in no_proxy.split(","):
                entry = entry.strip()
                if entry and (ws_host == entry or ws_host.endswith(f".{entry}")):
                    skip_proxy = True
                    break

        if not proxy_url or skip_proxy:
            return await websockets.connect(
                ws_url, ping_interval=ping_interval, ping_timeout=ping_timeout
            )

        # 通过 HTTP CONNECT 隧道（使用原始 socket）
        parsed_proxy = urlparse(proxy_url)
        proxy_host = parsed_proxy.hostname or "localhost"
        proxy_port = parsed_proxy.port or 1080

        logger.info(
            "Connecting via proxy",
            extra={"proxy": f"{proxy_host}:{proxy_port}", "target": f"{ws_host}:{ws_port}"},
        )

        def _blocking_tunnel() -> _socket.socket:
            """在线程中建立 CONNECT 隧道（阻塞 I/O）。"""
            sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect((proxy_host, proxy_port))

            connect_req = (
                f"CONNECT {ws_host}:{ws_port} HTTP/1.1\r\n"
                f"Host: {ws_host}:{ws_port}\r\n"
                f"\r\n"
            ).encode()
            sock.sendall(connect_req)

            response = b""
            while b"\r\n\r\n" not in response:
                chunk = sock.recv(4096)
                if not chunk:
                    sock.close()
                    raise ConnectionError("Proxy closed connection before response")
                response += chunk

            status_line = response.split(b"\r\n")[0].decode()
            if "200" not in status_line:
                sock.close()
                raise ConnectionError(f"Proxy CONNECT failed: {status_line}")

            sock.settimeout(None)  # 恢复为阻塞模式（websockets 会自行设置）
            return sock

        # 在线程池中执行阻塞隧道建立
        loop = asyncio.get_event_loop()
        tunnel_sock = await loop.run_in_executor(None, _blocking_tunnel)

        try:
            return await websockets.connect(
                ws_url,
                sock=tunnel_sock,
                ssl=ssl.create_default_context(),
                server_hostname=ws_host,
                ping_interval=ping_interval,
                ping_timeout=ping_timeout,
            )
        except Exception:
            tunnel_sock.close()
            raise

    async def _publish(self, data_type: str, message: dict) -> None:
        """通过 StreamRouter 发布标准化消息到 Redis Stream。"""
        if BaseConnector._shared_router is None:
            from app.data.stream_router import StreamRouter
            BaseConnector._shared_router = StreamRouter()
        try:
            await BaseConnector._shared_router.publish(self.source_id, data_type, message)  # type: ignore[union-attr]
            self._record_message()
        except Exception as exc:
            logger.error(
                "Connector _publish failed",
                extra={"source_id": self.source_id, "data_type": data_type, "error": str(exc)},
            )

    def _record_message(self) -> None:
        """记录消息接收时间，用于计算速率和 stale 检测。"""
        now = datetime.utcnow()
        self._last_message_at = now
        self._message_count += 1
        self._message_window.append(now)
        # 保留最近 60 秒的记录
        cutoff = now.timestamp() - 60.0
        self._message_window = [t for t in self._message_window if t.timestamp() > cutoff]
        # 更新 stale 状态
        if self._status == DataSourceStatus.STALE:
            self._status = DataSourceStatus.ENABLED
        # 每分钟速率历史
        minute_ts = int(time.time()) // 60
        if minute_ts != self._current_minute_ts:
            self._rate_history.append((self._current_minute_ts, self._current_minute_count))
            self._current_minute_ts = minute_ts
            self._current_minute_count = 0
        self._current_minute_count += 1

    def _check_stale(self) -> None:
        """检查是否超过 60s 未收到消息，标记为 stale。"""
        if self._last_message_at is None:
            return
        elapsed = (datetime.utcnow() - self._last_message_at).total_seconds()
        if elapsed > _STALE_THRESHOLD and self._status == DataSourceStatus.ENABLED:
            self._status = DataSourceStatus.STALE
            logger.warning(
                "Connector stale: no message received",
                extra={"source_id": self.source_id, "elapsed_seconds": elapsed},
            )

    def _calc_message_rate(self) -> float:
        """计算最近 60 秒的消息速率（条/秒）。"""
        if not self._message_window:
            return 0.0
        return len(self._message_window) / 60.0

    def get_rate_history(self) -> list[dict]:
        """返回最近 60 分钟的每分钟消息速率列表。

        返回格式: [{"minute_ts": 1234567, "rate": 12.5}, ...]
        rate = 该分钟内消息数 / 60（条/秒）
        """
        # 先刷新当前分钟
        result: list[dict] = []
        for minute_ts, count in self._rate_history:
            result.append({"minute_ts": minute_ts * 60, "rate": round(count / 60.0, 2)})
        # 追加当前未完成的分钟
        result.append({
            "minute_ts": self._current_minute_ts * 60,
            "rate": round(self._current_minute_count / 60.0, 2),
        })
        return result

    @staticmethod
    def _exponential_backoff(attempt: int) -> float:
        """计算指数退避等待时间。公式: min(5 * 2^(n-1), 60)"""
        return min(_INITIAL_BACKOFF * (2 ** (attempt - 1)), _MAX_BACKOFF)
