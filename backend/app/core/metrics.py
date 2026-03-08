"""关键业务指标结构化日志。

所有指标通过 structlog 以 JSON 格式输出，便于日志聚合系统（ELK / Loki）采集。
使用方式：
    from app.core.metrics import metrics
    metrics.log_agent_response("technical", 1230, success=True)
"""

import logging
import time
from contextlib import contextmanager
from typing import Generator

import structlog

_logger: structlog.stdlib.BoundLogger = structlog.get_logger("axiom.metrics")


class BusinessMetrics:
    """业务指标记录器 — 统一格式，方便下游聚合。"""

    def log_agent_response(
        self,
        agent_id: str,
        duration_ms: float,
        *,
        success: bool,
        symbol: str = "",
        model: str = "",
    ) -> None:
        """记录智能体响应时间。"""
        _logger.info(
            "agent_response",
            metric_type="agent_response",
            agent_id=agent_id,
            duration_ms=round(duration_ms, 2),
            success=success,
            symbol=symbol,
            model=model,
        )

    def log_consensus_result(
        self,
        symbol: str,
        *,
        success: bool,
        duration_ms: float,
        model_count: int,
        divergence: float = 0.0,
    ) -> None:
        """记录共识引擎执行结果。"""
        _logger.info(
            "consensus_result",
            metric_type="consensus_result",
            symbol=symbol,
            success=success,
            duration_ms=round(duration_ms, 2),
            model_count=model_count,
            divergence=round(divergence, 4),
        )

    def log_push_result(
        self,
        channel: str,
        *,
        success: bool,
        user_id: str = "",
        error: str = "",
    ) -> None:
        """记录推送结果（Telegram / Email / WebSocket）。"""
        _logger.info(
            "push_result",
            metric_type="push_result",
            channel=channel,
            success=success,
            user_id=user_id,
            error=error,
        )

    def log_payment_event(
        self,
        payment_id: str,
        *,
        status: str,
        amount_usd: float = 0.0,
        network: str = "",
    ) -> None:
        """记录支付事件。"""
        _logger.info(
            "payment_event",
            metric_type="payment_event",
            payment_id=payment_id,
            status=status,
            amount_usd=amount_usd,
            network=network,
        )

    @contextmanager
    def measure_agent(
        self, agent_id: str, symbol: str = "", model: str = ""
    ) -> Generator[None, None, None]:
        """上下文管理器 — 自动计时并记录智能体响应。"""
        start = time.perf_counter()
        success = True
        try:
            yield
        except Exception:
            success = False
            raise
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            self.log_agent_response(
                agent_id, elapsed_ms, success=success, symbol=symbol, model=model
            )

    @contextmanager
    def measure_consensus(
        self, symbol: str, model_count: int
    ) -> Generator[None, None, None]:
        """上下文管理器 — 自动计时并记录共识引擎执行。"""
        start = time.perf_counter()
        success = True
        try:
            yield
        except Exception:
            success = False
            raise
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            self.log_consensus_result(
                symbol,
                success=success,
                duration_ms=elapsed_ms,
                model_count=model_count,
            )


# 全局单例
metrics = BusinessMetrics()
