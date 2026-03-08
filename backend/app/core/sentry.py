"""Sentry 错误追踪初始化 — 仅在配置了 DSN 时启用。"""

import logging

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

from app.core.config import settings

logger = logging.getLogger(__name__)


def init_sentry(dsn: str = "", traces_rate: float = 0.2) -> bool:
    """初始化 Sentry SDK。返回 True 表示已启用，False 表示跳过。

    Args:
        dsn: Sentry DSN 地址，为空则跳过初始化
        traces_rate: 采样率，默认 0.2
    """
    if not dsn:
        logger.info("Sentry DSN 未配置，跳过初始化")
        return False

    sentry_sdk.init(
        dsn=dsn,
        traces_sample_rate=traces_rate,
        environment=settings.app_env,
        release=f"axiom-backend@3.0.0",
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            CeleryIntegration(monitor_beat_tasks=True),
            LoggingIntegration(
                level=logging.INFO,
                event_level=logging.ERROR,
            ),
        ],
        send_default_pii=False,
    )
    logger.info("Sentry 已初始化", extra={"environment": settings.app_env})
    return True
