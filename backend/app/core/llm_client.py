"""统一 LLM 客户端 — 所有模型调用必须经过此模块。

- 使用 AsyncOpenAI，base_url 指向 DMXAPI 网关
- 超时 30s，降级返回 neutral 信号
- 每次调用记录：模型名、耗时、token 用量、是否降级
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any
from collections.abc import AsyncGenerator

import re

import httpx
from openai import AsyncOpenAI, RateLimitError

logger = logging.getLogger(__name__)

# model_key → model_name 映射（精选分析系统专用模型 + 备用模型）
# 管理员可通过后台「模型分工」页面将任意智能体切换到任意模型
MODELS: dict[str, str] = {
    # ── 精选首选模型 ──────────────────────────────────────────
    "deepseek-r1": "deepseek-reasoner",                     # DeepSeek R1-671B — 深度推理
    "deepseek-v3.2": "deepseek-v3.2",                        # DeepSeek V3.2 标准分析
    "deepseek-v3.2-thinking": "deepseek-v3.2-exp-thinking", # DeepSeek V3.2 Thinking
    "claude-sonnet": "claude-sonnet-4-5-20250929",          # Claude Sonnet 4.5
    "grok-fast": "grok-4-fast",                             # Grok-4 Fast — 高性价比
    "grok-code-fast": "grok-code-fast-1",                   # Grok Code Fast — 轻量推理
    "qwen3-max": "qwen3-max",                               # Qwen3 Max — 复杂任务
    "qwen3-next-thinking": "Qwen3-Next-80B-A3B-Thinking",  # Qwen3 Next Thinking
    "claude-haiku": "claude-haiku-4-5-ssvip",               # Claude Haiku 4.5 — 低成本快速
    # ── 备用/旧模型（向后兼容）────────────────────────────────
    "deepseek": "deepseek-chat",                            # DeepSeek V3 通用
    "deepseek-reasoner": "deepseek-reasoner",               # 别名 → 同 deepseek-r1
    "grok": "grok-4",                                       # Grok-4 标准
    "claude": "claude-sonnet-4-5-20250929",                 # 别名 → 同 claude-sonnet
    "qwen": "qwen3-max",                                    # 别名 → 同 qwen3-max
    "gpt4o": "gpt-4o",                                      # GPT-4o 备用
    "gemini": "gemini-2.5-pro",                             # Gemini 2.5 Pro 备用
    "o3": "o3",                                              # OpenAI o3 推理
}

# Per-token pricing (USD per 1K tokens)
# Format: {model_name: (input_price_per_1k, output_price_per_1k)}
MODEL_PRICING: dict[str, tuple[float, float]] = {
    "deepseek-reasoner": (0.004, 0.016),
    "deepseek-v3.2": (0.0002, 0.0003),
    "deepseek-v3.2-exp-thinking": (0.0003, 0.0004),
    "claude-sonnet-4-5-20250929": (0.003, 0.015),
    "grok-4-fast": (0.001, 0.004),
    "grok-code-fast-1": (0.001, 0.004),
    "qwen3-max": (0.001, 0.004),
    "Qwen3-Next-80B-A3B-Thinking": (0.001, 0.004),
    "claude-haiku-4-5-ssvip": (0.001, 0.005),
    "deepseek-chat": (0.0014, 0.0028),
    "grok-4": (0.003, 0.015),
    "gpt-4o": (0.0025, 0.01),
    "gemini-2.5-pro": (0.00125, 0.005),
    "o3": (0.002, 0.008),
}

_COST_TTL_SECONDS: int = 172800  # 48 hours


def _calculate_cost(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate cost in USD for a single LLM call."""
    pricing = MODEL_PRICING.get(model_name)
    if pricing is None:
        return 0.0
    input_cost = (prompt_tokens / 1000) * pricing[0]
    output_cost = (completion_tokens / 1000) * pricing[1]
    return round(input_cost + output_cost, 6)


async def _record_cost(model_key: str, cost_usd: float, tokens: int) -> None:
    """Record LLM call cost to Redis for daily monitoring.

    Redis keys (all with 48h TTL):
    - llm_cost:daily:{date} — total daily cost (INCRBYFLOAT)
    - llm_cost:daily:{date}:{model_key} — per-model daily cost (INCRBYFLOAT)
    - llm_tokens:daily:{date} — total daily tokens (INCRBY)
    - llm_calls:daily:{date} — total daily call count (INCR)
    """
    try:
        from app.core.redis import get_redis_pool

        redis = get_redis_pool()
        today = datetime.now(timezone.utc).date().isoformat()

        cost_key = f"llm_cost:daily:{today}"
        model_cost_key = f"llm_cost:daily:{today}:{model_key}"
        tokens_key = f"llm_tokens:daily:{today}"
        calls_key = f"llm_calls:daily:{today}"

        pipe = redis.pipeline()
        pipe.incrbyfloat(cost_key, cost_usd)
        pipe.expire(cost_key, _COST_TTL_SECONDS)
        pipe.incrbyfloat(model_cost_key, cost_usd)
        pipe.expire(model_cost_key, _COST_TTL_SECONDS)
        pipe.incrby(tokens_key, tokens)
        pipe.expire(tokens_key, _COST_TTL_SECONDS)
        pipe.incr(calls_key)
        pipe.expire(calls_key, _COST_TTL_SECONDS)
        await pipe.execute()
    except Exception as exc:
        logger.warning(
            "Failed to record LLM cost to Redis",
            extra={"model_key": model_key, "cost_usd": cost_usd, "error": str(exc)},
        )


_MD_JSON_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?\s*```", re.DOTALL)


def _strip_markdown_json(text: str) -> str:
    """Strip markdown code fences (```json ... ```) from LLM output."""
    text = text.strip()
    m = _MD_JSON_RE.search(text)
    if m:
        return m.group(1).strip()
    return text


def _fallback_response(model_key: str, reason: str) -> dict[str, Any]:
    """降级响应 — 格式与正常响应一致，signal 固定 neutral。"""
    return {
        "signal": "neutral",
        "confidence": 0.0,
        "reasoning": f"模型降级: {reason} (model={model_key})",
        "is_fallback": True,
    }


class UnifiedLLMClient:
    """DMXAPI 统一网关客户端，单例使用。"""

    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None
        self._api_key: str = ""
        self._base_url: str = ""

    async def _ensure_client(self) -> AsyncOpenAI:
        """延迟初始化 — 首次调用时从 ConfigService 读取 API 配置。"""
        if self._client is None:
            from app.services.config_service import get_config_value
            self._api_key = await get_config_value("dmx_api_key")
            self._base_url = await get_config_value("dmx_base_url", "https://www.dmxapi.cn/v1")
            self._client = AsyncOpenAI(api_key=self._api_key, base_url=self._base_url)
        return self._client

    async def _raw_httpx_call(
        self,
        model_name: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        timeout_s: float,
    ) -> dict[str, Any]:
        """httpx 直接调用 — 绕过 openai SDK 的 Pydantic 序列化。"""
        await self._ensure_client()  # 确保 _api_key/_base_url 已初始化
        async with httpx.AsyncClient(timeout=timeout_s) as hc:
            resp = await hc.post(
                f"{self._base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
                json={
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": temperature,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"] or "{}"
            usage = data.get("usage") or {}
            return {
                "content": content,
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            }


    async def call_model(
        self,
        model_key: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.1,
        timeout_s: float | None = None,  # None = 自动按模型类型选择
    ) -> dict[str, Any]:
        """调用单个模型，返回解析后的 JSON dict。

        超时或异常时返回降级响应，不抛出异常。
        timeout_s 为 None 时自动根据模型类型选择：
          - Thinking/R1 推理模型 → 90s
          - 普通快速模型 → 30s
        """
        from app.core.model_router import get_timeout_for_model
        if timeout_s is None:
            timeout_s = get_timeout_for_model(model_key)
        # 范围校验：temperature 超出 [0.0, 1.0] 时裁剪至边界值
        if temperature < 0.0 or temperature > 1.0:
            clamped = max(0.0, min(1.0, temperature))
            logger.warning(
                "temperature 超出范围，已裁剪",
                extra={"original": temperature, "clamped": clamped},
            )
            temperature = clamped

        model_name = MODELS.get(model_key)
        if model_name is None:
            logger.error("Unknown model_key", extra={"model_key": model_key})
            return _fallback_response(model_key, "unknown_model_key")

        start = time.monotonic()
        is_fallback = False
        tokens: int | None = None
        prompt_tokens: int = 0
        completion_tokens: int = 0
        cost_usd: float = 0.0

        _MAX_RETRIES = 3
        _BASE_DELAY = 2.0  # 首次重试等待秒数，后续指数退避

        try:
            for _attempt in range(1, _MAX_RETRIES + 1):
                try:
                    try:
                        client = await self._ensure_client()
                        response = await asyncio.wait_for(
                            client.chat.completions.create(
                                model=model_name,
                                messages=[
                                    {"role": "system", "content": system_prompt},
                                    {"role": "user", "content": user_prompt},
                                ],
                                temperature=temperature,
                                response_format={"type": "json_object"},
                            ),
                            timeout=timeout_s,
                        )

                        content = response.choices[0].message.content or "{}"
                        if response.usage:
                            tokens = response.usage.total_tokens
                            prompt_tokens = response.usage.prompt_tokens or 0
                            completion_tokens = response.usage.completion_tokens or 0
                    except asyncio.TimeoutError:
                        raise  # 超时由外层处理
                    except RateLimitError:
                        raise  # 429 由重试层处理
                    except Exception as sdk_exc:
                        sdk_err_str = str(sdk_exc)
                        if "429" in sdk_err_str or "rate" in sdk_err_str.lower():
                            raise RateLimitError(
                                message=sdk_err_str,
                                response=getattr(sdk_exc, "response", None),  # type: ignore[arg-type]
                                body=None,
                            )
                        # openai SDK 兼容性问题 — 回退到 httpx 直接调用
                        logger.warning(
                            "openai SDK error, falling back to httpx",
                            extra={"model_key": model_key, "error": sdk_err_str},
                        )
                        raw = await self._raw_httpx_call(model_name, system_prompt, user_prompt, temperature, timeout_s)
                        content = raw["content"]
                        prompt_tokens = raw["prompt_tokens"]
                        completion_tokens = raw["completion_tokens"]
                        tokens = raw["total_tokens"]

                    cost_usd = _calculate_cost(model_name, prompt_tokens, completion_tokens)
                    content = _strip_markdown_json(content)
                    result: dict[str, Any] = json.loads(content)
                    result["is_fallback"] = False
                    return result

                except (RateLimitError, httpx.HTTPStatusError) as rate_exc:
                    # 仅对 429 重试
                    if isinstance(rate_exc, httpx.HTTPStatusError) and rate_exc.response.status_code != 429:
                        raise
                    if _attempt >= _MAX_RETRIES:
                        logger.warning(
                            "429 rate limit exhausted after retries",
                            extra={"model_key": model_key, "attempts": _attempt},
                        )
                        return _fallback_response(model_key, str(rate_exc))
                    delay = _BASE_DELAY * (2 ** (_attempt - 1))
                    logger.info(
                        "429 rate limited, retrying",
                        extra={"model_key": model_key, "attempt": _attempt, "delay_s": delay},
                    )
                    await asyncio.sleep(delay)

        except asyncio.TimeoutError:
            is_fallback = True
            logger.warning(
                "LLM call timed out",
                extra={"model_key": model_key, "model_name": model_name, "timeout_s": timeout_s},
            )
            return _fallback_response(model_key, "timeout")

        except json.JSONDecodeError as exc:
            is_fallback = True
            logger.warning(
                "LLM response JSON parse failed",
                extra={"model_key": model_key, "model_name": model_name, "error": str(exc)},
            )
            return _fallback_response(model_key, "json_decode_error")

        except Exception as exc:
            is_fallback = True
            logger.error(
                "LLM call failed",
                extra={"model_key": model_key, "model_name": model_name, "error": str(exc)},
            )
            return _fallback_response(model_key, str(exc))

        finally:
            elapsed = round(time.monotonic() - start, 3)
            logger.info(
                "LLM call completed",
                extra={
                    "model_key": model_key,
                    "model_name": model_name or model_key,
                    "elapsed_s": elapsed,
                    "tokens": tokens,
                    "is_fallback": is_fallback,
                    "cost_usd": cost_usd,
                },
            )
            if cost_usd > 0:
                await _record_cost(model_key, cost_usd, tokens or 0)

    async def stream_model(
        self,
        model_key: str,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        timeout_s: float = 30.0,
    ) -> AsyncGenerator[str, None]:
        """流式调用单个模型，逐块 yield 文本内容。

        超时或异常时 yield 错误提示，不抛出异常。
        """
        model_name = MODELS.get(model_key)
        if model_name is None:
            logger.error("Unknown model_key for stream", extra={"model_key": model_key})
            yield f"[错误] 未知模型: {model_key}"
            return

        start = time.monotonic()
        is_fallback = False

        try:
            client = await self._ensure_client()
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=temperature,
                    stream=True,
                ),
                timeout=timeout_s,
            )
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except asyncio.TimeoutError:
            is_fallback = True
            logger.warning(
                "LLM stream timed out",
                extra={"model_key": model_key, "model_name": model_name, "timeout_s": timeout_s},
            )
            yield "\n[错误] 模型响应超时，请稍后重试"

        except Exception as exc:
            is_fallback = True
            logger.error(
                "LLM stream failed",
                extra={"model_key": model_key, "model_name": model_name, "error": str(exc)},
            )
            yield f"\n[错误] 模型调用失败: {exc}"

        finally:
            elapsed = round(time.monotonic() - start, 3)
            logger.info(
                "LLM stream completed",
                extra={
                    "model_key": model_key,
                    "model_name": model_name or model_key,
                    "elapsed_s": elapsed,
                    "is_fallback": is_fallback,
                },
            )

    async def call_multiple(
        self,
        model_keys: list[str],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
    ) -> dict[str, dict[str, Any]]:
        """并行调用多个模型，返回 {model_key: result} 字典。"""
        tasks = [
            self.call_model(key, system_prompt, user_prompt, temperature)
            for key in model_keys
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return dict(zip(model_keys, results))

    @staticmethod
    async def get_daily_cost_summary() -> dict[str, Any]:
        """Get today's LLM cost summary from Redis."""
        today = datetime.now(timezone.utc).date().isoformat()
        try:
            from app.core.redis import get_redis_pool

            redis = get_redis_pool()

            cost_key = f"llm_cost:daily:{today}"
            tokens_key = f"llm_tokens:daily:{today}"
            calls_key = f"llm_calls:daily:{today}"

            total_cost_raw, total_tokens_raw, total_calls_raw = await asyncio.gather(
                redis.get(cost_key),
                redis.get(tokens_key),
                redis.get(calls_key),
            )

            by_model: dict[str, float] = {}
            model_keys = list(MODELS.keys())
            cost_keys = [f"llm_cost:daily:{today}:{mk}" for mk in model_keys]
            vals = await redis.mget(*cost_keys) if cost_keys else []
            for mk, val in zip(model_keys, vals):
                cost_val = float(val) if val else 0.0
                if cost_val > 0:
                    by_model[mk] = cost_val

            return {
                "date": today,
                "total_cost_usd": float(total_cost_raw) if total_cost_raw else 0.0,
                "total_tokens": int(total_tokens_raw) if total_tokens_raw else 0,
                "total_calls": int(total_calls_raw) if total_calls_raw else 0,
                "by_model": by_model,
            }
        except Exception as exc:
            logger.warning(
                "Failed to get daily cost summary from Redis",
                extra={"error": str(exc)},
            )
            return {
                "date": today,
                "total_cost_usd": 0.0,
                "total_tokens": 0,
                "total_calls": 0,
                "by_model": {},
            }


# 模块级单例
llm_client = UnifiedLLMClient()
