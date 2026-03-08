"""熔断器 — 基于 Redis 的跨进程 Circuit Breaker。

状态机: closed → open → half_open → closed / open
Redis key 格式: cb:{name}:state  (JSON)
Redis 不可用时 fail-open（允许调用）。
"""

import json
import logging
import time
from typing import Literal

from app.core.redis import get_redis_pool

logger = logging.getLogger(__name__)

State = Literal["closed", "open", "half_open"]

_DEFAULT_STATE: dict[str, object] = {
    "failures": 0,
    "state": "closed",
    "last_failure_ts": 0.0,
    "last_attempt_ts": 0.0,
    "half_open_successes": 0,
}


class CircuitBreaker:
    """Redis-backed circuit breaker for agent calls."""

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = 3,
        recovery_timeout: float = 120.0,
        success_threshold: int = 1,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold
        self._key = f"cb:{name}:state"
        self._ttl = int(recovery_timeout * 10)

    # ── public API ────────────────────────────────────────────

    async def can_execute(self) -> bool:
        """Return True if the call is allowed."""
        state_data = await self._load()
        state: State = state_data["state"]  # type: ignore[assignment]

        if state == "closed":
            return True

        if state == "open":
            elapsed = time.time() - float(state_data["last_failure_ts"])
            if elapsed >= self.recovery_timeout:
                state_data["state"] = "half_open"
                state_data["half_open_successes"] = 0
                state_data["last_attempt_ts"] = time.time()
                await self._save(state_data)
                logger.info(
                    "Circuit breaker for %s transitioned to half_open", self.name,
                )
                return True
            return False

        # half_open — allow a probe call
        return True

    async def record_success(self) -> None:
        """Record a successful call."""
        state_data = await self._load()
        state: State = state_data["state"]  # type: ignore[assignment]

        if state == "half_open":
            state_data["half_open_successes"] = int(state_data["half_open_successes"]) + 1
            if state_data["half_open_successes"] >= self.success_threshold:
                state_data["state"] = "closed"
                state_data["failures"] = 0
                state_data["half_open_successes"] = 0
                logger.info(
                    "Circuit breaker for %s closed after successful probe", self.name,
                )
            await self._save(state_data)
        elif state == "open":
            # Shouldn't normally happen, but reset if it does
            pass
        else:
            # closed — reset failure counter on success
            if int(state_data["failures"]) > 0:
                state_data["failures"] = 0
                await self._save(state_data)

    async def record_failure(self) -> None:
        """Record a failed call."""
        state_data = await self._load()
        state: State = state_data["state"]  # type: ignore[assignment]
        now = time.time()

        if state == "half_open":
            # Probe failed — reopen
            state_data["state"] = "open"
            state_data["last_failure_ts"] = now
            state_data["half_open_successes"] = 0
            await self._save(state_data)
            logger.warning(
                "Circuit breaker for %s re-opened after half_open failure", self.name,
            )
            return

        # closed (or open, edge case)
        state_data["failures"] = int(state_data["failures"]) + 1
        state_data["last_failure_ts"] = now

        if state_data["failures"] >= self.failure_threshold:
            state_data["state"] = "open"
            logger.warning(
                "Circuit breaker for %s opened after %d failures",
                self.name,
                state_data["failures"],
            )

        await self._save(state_data)

    async def get_state(self) -> str:
        """Return current state string."""
        state_data = await self._load()
        return str(state_data["state"])

    # ── internal ──────────────────────────────────────────────

    async def _load(self) -> dict[str, object]:
        """Load state from Redis. Returns default on any failure (fail-open)."""
        try:
            redis = get_redis_pool()
            raw = await redis.get(self._key)
            if raw is None:
                return dict(_DEFAULT_STATE)
            return json.loads(raw)  # type: ignore[no-any-return]
        except Exception as exc:
            logger.error(
                "Circuit breaker Redis read failed for %s: %s", self.name, exc,
            )
            return dict(_DEFAULT_STATE)

    async def _save(self, state_data: dict[str, object]) -> None:
        """Persist state to Redis with TTL."""
        try:
            redis = get_redis_pool()
            await redis.setex(
                self._key,
                self._ttl,
                json.dumps(state_data, default=str),
            )
        except Exception as exc:
            logger.error(
                "Circuit breaker Redis write failed for %s: %s", self.name, exc,
            )
