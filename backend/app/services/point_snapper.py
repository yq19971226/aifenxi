"""点位吸附器 — 减少 LLM 微小随机性导致的点位漂移。

Service 层组件，从 Redis 读取上一次策略缓存，
逐字段比较偏差，偏差 < 0.5% 时沿用缓存值。
"""

import logging
from typing import Any

from app.core.redis import get_json
from app.services.strategy import StrategyResult

logger = logging.getLogger(__name__)


class PointSnapper:
    """策略点位吸附器 — 减少 LLM 微小随机性导致的点位漂移。"""

    SNAP_THRESHOLD: float = 0.005  # 0.5%

    def _should_snap(self, new_val: float, cached_val: float) -> bool:
        """判断新值与缓存值偏差是否小于阈值。"""
        if cached_val == 0:
            return False
        return abs(new_val - cached_val) / abs(cached_val) < self.SNAP_THRESHOLD

    async def snap(
        self,
        new_strategy: StrategyResult,
        symbol: str,
    ) -> StrategyResult:
        """将新策略点位与缓存策略比较，偏差小于阈值时沿用缓存值。

        - direction 不同时跳过吸附，直接返回新策略
        - Redis 读取失败或缓存不存在时跳过吸附，记录 warning 日志
        """
        cache_key = f"strategy:latest:{symbol.upper()}"
        snapped_fields: list[str] = []

        # 从 Redis 读取缓存策略
        try:
            cached_data: Any | None = await get_json(cache_key)
        except Exception as exc:
            logger.warning(
                "Redis 读取缓存策略失败，跳过吸附",
                extra={"symbol": symbol, "error": str(exc)},
            )
            new_strategy.snapped_fields = []
            return new_strategy

        if cached_data is None:
            logger.warning(
                "缓存策略不存在，跳过吸附",
                extra={"symbol": symbol},
            )
            new_strategy.snapped_fields = []
            return new_strategy

        try:
            cached_strategy = StrategyResult.model_validate(cached_data)
        except Exception as exc:
            logger.warning(
                "缓存策略解析失败，跳过吸附",
                extra={"symbol": symbol, "error": str(exc)},
            )
            new_strategy.snapped_fields = []
            return new_strategy

        # direction 不同时跳过吸附
        if new_strategy.direction != cached_strategy.direction:
            new_strategy.snapped_fields = []
            return new_strategy

        # 逐字段比较并吸附
        if self._should_snap(new_strategy.entry_low, cached_strategy.entry_low):
            new_strategy.entry_low = cached_strategy.entry_low
            snapped_fields.append("entry_low")

        if self._should_snap(new_strategy.entry_high, cached_strategy.entry_high):
            new_strategy.entry_high = cached_strategy.entry_high
            snapped_fields.append("entry_high")

        if self._should_snap(new_strategy.stop_loss, cached_strategy.stop_loss):
            new_strategy.stop_loss = cached_strategy.stop_loss
            snapped_fields.append("stop_loss")

        # targets 逐个比较（按索引对齐）
        new_targets = list(new_strategy.targets)
        cached_targets = cached_strategy.targets
        min_len = min(len(new_targets), len(cached_targets))
        for i in range(min_len):
            if self._should_snap(new_targets[i], cached_targets[i]):
                new_targets[i] = cached_targets[i]
                snapped_fields.append(f"targets[{i}]")
        new_strategy.targets = new_targets

        new_strategy.snapped_fields = snapped_fields
        return new_strategy
