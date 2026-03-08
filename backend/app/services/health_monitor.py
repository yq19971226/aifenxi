"""Health Monitor — 30s 心跳检测 + 熔断触发。"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import structlog

from app.core.circuit_breaker import CircuitBreaker
from app.core.redis import set_with_ttl
from app.models.datasource import DataSourceStatus, HealthStatus, HealthSummary

logger = structlog.get_logger(__name__)

_HEALTH_CHECK_INTERVAL = 30   # 秒
_HEALTH_CACHE_TTL = 60        # 秒
_STALE_THRESHOLD = 60.0       # 超过 60s 无消息标记 stale
_FAILURE_THRESHOLD = 3        # 连续失败次数触发熔断
_RECOVERY_TIMEOUT = 120.0     # 熔断恢复探测间隔（秒）


class HealthMonitor:
    """健康监控 — 30s 心跳检测 + 熔断触发。"""

    def __init__(self) -> None:
        self._circuit_breakers: dict[str, CircuitBreaker] = {}
        self._running: bool = False
        self._check_task: asyncio.Task | None = None
        self._manager: object | None = None  # DataSourceManager（延迟注入避免循环引用）

    def set_manager(self, manager: object) -> None:
        """注入 DataSourceManager 引用（延迟注入）。"""
        self._manager = manager

    def _get_cb(self, source_id: str) -> CircuitBreaker:
        """获取或创建指定数据源的熔断器实例。"""
        if source_id not in self._circuit_breakers:
            self._circuit_breakers[source_id] = CircuitBreaker(
                name=f"ds_{source_id}",
                failure_threshold=_FAILURE_THRESHOLD,
                recovery_timeout=_RECOVERY_TIMEOUT,
                success_threshold=1,
            )
        return self._circuit_breakers[source_id]

    async def start(self) -> None:
        """启动定期健康检查循环。"""
        self._running = True
        self._check_task = asyncio.create_task(self._check_loop(), name="health_monitor")
        logger.info("health_monitor_started", interval=_HEALTH_CHECK_INTERVAL)

    async def stop(self) -> None:
        """停止健康检查循环。"""
        self._running = False
        if self._check_task and not self._check_task.done():
            self._check_task.cancel()
            try:
                await self._check_task
            except asyncio.CancelledError:
                pass
        logger.info("health_monitor_stopped")

    async def _check_loop(self) -> None:
        """定期检查循环。"""
        while self._running:
            try:
                await self.check_all()
                # 每次检查后刷新状态快照缓存，保证前端始终读到最新数据
                await self._refresh_snapshot()
            except Exception as exc:
                logger.error("health_check_loop_error", error=str(exc))
            await asyncio.sleep(_HEALTH_CHECK_INTERVAL)

    async def _refresh_snapshot(self) -> None:
        """刷新 DataSourceManager 的状态快照缓存。"""
        if self._manager is None:
            return
        try:
            from app.services.datasource_manager import DataSourceManager
            manager: DataSourceManager = self._manager  # type: ignore[assignment]
            await manager._update_status_snapshot()
        except Exception as exc:
            logger.warning("health_monitor_refresh_snapshot_failed", error=str(exc))

    async def check_all(self) -> dict[str, HealthStatus]:
        """检查所有数据源健康状态，更新 Redis 缓存，触发必要的熔断。"""
        if self._manager is None:
            return {}

        from app.services.datasource_manager import DataSourceManager
        manager: DataSourceManager = self._manager  # type: ignore[assignment]

        results: dict[str, HealthStatus] = {}

        # 获取所有连接器
        for source_id, connector in manager._connectors.items():
            try:
                status = connector.health_check()  # type: ignore[attr-defined]
                results[source_id] = status

                # 检查 stale
                if status.last_message_at is not None:
                    elapsed = (datetime.utcnow() - status.last_message_at).total_seconds()
                    if elapsed > _STALE_THRESHOLD and status.status == DataSourceStatus.ENABLED:
                        await manager._registry.update_source_status(
                            source_id, DataSourceStatus.STALE
                        )
                        logger.warning(
                            "datasource_stale",
                            source_id=source_id,
                            elapsed_seconds=elapsed,
                        )
                        # stale 不触发熔断，但重新计算完整度
                        await manager.recalculate_completeness()

                # 熔断判断
                cb = self._get_cb(source_id)
                if not status.connected and status.status == DataSourceStatus.ERROR:
                    await cb.record_failure()
                    cb_state = await cb.get_state()
                    if cb_state == "open":
                        logger.warning(
                            "datasource_circuit_open",
                            source_id=source_id,
                        )
                        # 不再永久停止连接器，仅重新计算完整度
                        await manager.recalculate_completeness()
                elif status.connected:
                    await cb.record_success()
                elif status.status == DataSourceStatus.DISABLED:
                    # 熔断恢复探测：检查是否可以重启
                    if await cb.can_execute():
                        cb_state = await cb.get_state()
                        if cb_state == "half_open":
                            logger.info(
                                "datasource_recovery_probe",
                                source_id=source_id,
                            )
                            await manager._start_connector(source_id)

                # 写入 Redis 健康缓存
                cb_state = await cb.get_state()
                status_with_cb = status.model_copy(
                    update={"circuit_breaker_state": cb_state}
                )
                await set_with_ttl(
                    f"ds:health:{source_id}",
                    status_with_cb.model_dump(mode="json"),
                    ttl_seconds=_HEALTH_CACHE_TTL,
                )
                results[source_id] = status_with_cb

            except Exception as exc:
                logger.error(
                    "health_check_source_error",
                    source_id=source_id,
                    error=str(exc),
                )

        return results

    async def get_health_summary(self) -> HealthSummary:
        """返回所有数据源的实时健康指标汇总。"""
        statuses = await self.check_all()
        overall_healthy = all(
            s.connected or s.status == DataSourceStatus.DISABLED
            for s in statuses.values()
        )

        if self._manager is not None:
            from app.services.datasource_manager import DataSourceManager
            manager: DataSourceManager = self._manager  # type: ignore[assignment]
            completeness = await manager.get_completeness_score()
        else:
            completeness = 0.0

        return HealthSummary(
            sources=statuses,
            overall_healthy=overall_healthy,
            completeness_score=completeness,
            checked_at=datetime.utcnow(),
        )
