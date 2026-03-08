"""Celery 应用实例 — 所有 worker 共享此配置。"""

from celery import Celery
from app.core.config import settings
from app.core.sentry import init_sentry

# Worker 进程也需要 Sentry 错误追踪
init_sentry()

celery_app = Celery(
    "axiom",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "workers.kline_collector",
        "workers.indicator_worker",
        "workers.onchain_collector",
        "workers.telegram_worker",
        "workers.email_worker",
        "workers.alert_eval_worker",
        "workers.multi_symbol_scheduler",
        "workers.perf_settle_worker",
        "workers.derivatives_worker",
        "workers.sentiment_worker",
        "workers.weight_worker",
        "workers.coinglass_worker",
        "workers.coingecko_worker",
        "workers.anomaly_stats_worker",
        "workers.calendar_worker",
        "workers.orderbook_worker",
        "workers.playbook_verify_worker",
        "workers.cryptoquant_worker",
        "workers.fred_worker",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "collect-klines-every-5min": {
            "task": "workers.kline_collector.collect_klines_task",
            "schedule": 300.0,  # 5 分钟（symbols 自动从数据库读取，intervals 使用 DEFAULT_INTERVALS）
        },
        "collect-onchain-every-30min": {
            "task": "workers.onchain_collector.collect_onchain_data",
            "schedule": 1800.0,  # 30 分钟（symbols 从数据库动态读取）
        },
        "calculate-indicators-every-30s": {
            "task": "workers.indicator_worker.calculate_indicators_task",
            "schedule": 30.0,  # 30 秒消费一次 kline_updates stream
        },
        "process-telegram-alerts-every-10s": {
            "task": "workers.telegram_worker.process_telegram_alerts",
            "schedule": 10.0,  # 10 秒
        },
        "process-email-alerts-every-15s": {
            "task": "workers.email_worker.process_email_alerts",
            "schedule": 15.0,  # 15 秒
        },
        "evaluate-alerts-every-5s": {
            "task": "workers.alert_eval_worker.evaluate_alerts_task",
            "schedule": 5.0,  # 5 秒，确保预警评估在5秒内完成
        },
        "schedule-all-symbols-every-1min": {
            "task": "workers.multi_symbol_scheduler.schedule_all_symbols",
            "schedule": 60.0,  # 1 分钟
        },
        "settle-strategies-every-1min": {
            "task": "workers.perf_settle_worker.settle_strategies_task",
            "schedule": 60.0,  # 1 分钟
        },
        "collect-derivatives-snapshot-every-5min": {
            "task": "workers.derivatives_worker.collect_derivatives_snapshot_task",
            "schedule": 300.0,  # 5 分钟
        },
        "collect-liquidations-every-1min": {
            "task": "workers.derivatives_worker.collect_liquidations_task",
            "schedule": 60.0,  # 1 分钟
        },
        "collect-sentiment-every-30min": {
            "task": "workers.sentiment_worker.collect_sentiment_task",
            "schedule": 1800.0,  # 30 分钟
        },
        "update-weights-every-6h": {
            "task": "workers.weight_worker.update_weights_task",
            "schedule": 21600.0,  # 6 小时
        },
        "collect-coinglass-every-3min": {
            "task": "workers.coinglass_worker.collect_coinglass_data",
            "schedule": 180.0,  # 3 分钟（proxy 配额保护：100万/月，3币种下日消耗约25920次）
        },
        "evaluate-kill-zone-every-60s": {
            "task": "workers.coinglass_worker.evaluate_kill_zone",
            "schedule": 60.0,  # 60 秒
        },
        "collect-coingecko-every-30min": {
            "task": "workers.coingecko_worker.collect_coingecko_data",
            "schedule": 1800.0,  # 30 分钟（Demo 默认频率，实际由 TierManager 控制）
        },
        "compute-anomaly-stats-every-1h": {
            "task": "workers.anomaly_stats_worker.compute_anomaly_stats",
            "schedule": 3600.0,  # 1 小时（symbols 从数据库动态读取）
        },
        "collect-orderbook-every-10s": {
            "task": "workers.orderbook_worker.collect_orderbook_task",
            "schedule": 10.0,  # 10 秒
        },
        "verify-playbook-predictions-every-1h": {
            "task": "workers.playbook_verify_worker.verify_playbook_predictions_task",
            "schedule": 3600.0,  # 1 小时
        },
        "probe-proxy-recovery-every-5min": {
            "task": "workers.coinglass_worker.probe_proxy_recovery",
            "schedule": 300.0,  # 5 分钟（T7.3：定时主动恢复 proxy）
        },
        "collect-cryptoquant-every-30min": {
            "task": "workers.cryptoquant_worker.collect_cryptoquant_data",
            "schedule": 1800.0,  # 30 分钟（日线数据，不需要更高频率）
        },
        "collect-fred-every-6h": {
            "task": "workers.fred_worker.collect_fred_data",
            "schedule": 21600.0,  # 6 小时（宏观数据更新频率低）
        },
    },
)
