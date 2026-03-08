"""情绪数据采集模块 — 多源交叉验证。

- Alternative.me 恐慌贪婪指数（免费，无需 API Key）
- CoinGlass 恐慌贪婪指数（需 API Key，30s 超时）
- 两源有效时加权平均（Alternative 0.6 + CoinGlass 0.4）
- 仅一源有效时使用该源值
- 全部失败返回 None
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_FEAR_GREED_URL = "https://api.alternative.me/fng/"
_COINGLASS_FG_URL = "https://open-api.coinglass.com/public/v2/index/fear-greed"
_DEFAULT_TIMEOUT = 30.0

# 加权系数
_WEIGHT_ALTERNATIVE = 0.6
_WEIGHT_COINGLASS = 0.4


class SentimentCollector:
    """情绪数据采集器 — 多源交叉验证。"""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout

    async def fetch_fear_greed_alternative(self) -> int | None:
        """从 Alternative.me 获取恐慌贪婪指数（0-100）。

        Returns:
            int 或 None（失败时）
        """
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await asyncio.wait_for(
                    client.get(_FEAR_GREED_URL, params={"limit": 1}),
                    timeout=self._timeout,
                )
                resp.raise_for_status()
                data = resp.json()
                if data.get("data"):
                    value = int(data["data"][0]["value"])
                    logger.info("Alternative.me fear & greed fetched", extra={"value": value})
                    return value
        except Exception:
            logger.warning("fetch_fear_greed_alternative failed", exc_info=True)
        return None

    async def fetch_fear_greed_coinglass(self) -> int | None:
        """从 CoinGlass 获取恐慌贪婪指数（0-100）。

        需要 CoinGlass API Key，无 Key 时降级返回 None。
        注意：使用 V2 API，AlphaNode 代理不支持，固定走官方直连。

        Returns:
            int 或 None（失败/无 Key 时）
        """
        from app.services.config_service import get_config_value

        api_key = await get_config_value("coinglass_api_key")
        if not api_key:
            logger.warning("CoinGlass API key not configured, skipping sentiment")
            return None

        headers = {"CG-API-KEY": api_key, "accept": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await asyncio.wait_for(
                    client.get(_COINGLASS_FG_URL, headers=headers),
                    timeout=self._timeout,
                )
                resp.raise_for_status()
                data = resp.json()
                if data.get("code") == "0" and data.get("data"):
                    value = int(data["data"].get("value", 0))
                    logger.info("CoinGlass fear & greed fetched", extra={"value": value})
                    return value
        except Exception:
            logger.warning("fetch_fear_greed_coinglass failed", exc_info=True)
        return None

    async def collect_sentiment(self) -> int | None:
        """并行采集两源情绪数据，加权平均。

        - 两源有效：Alternative × 0.6 + CoinGlass × 0.4
        - 仅一源有效：使用该源值
        - 全部失败：返回 None

        Returns:
            int（0-100）或 None
        """
        alt_val, cg_val = await asyncio.gather(
            self.fetch_fear_greed_alternative(),
            self.fetch_fear_greed_coinglass(),
            return_exceptions=True,
        )

        # 异常转 None
        if isinstance(alt_val, BaseException):
            logger.error("alternative sentiment raised exception", extra={"error": str(alt_val)})
            alt_val = None
        if isinstance(cg_val, BaseException):
            logger.error("coinglass sentiment raised exception", extra={"error": str(cg_val)})
            cg_val = None

        if alt_val is not None and cg_val is not None:
            weighted = alt_val * _WEIGHT_ALTERNATIVE + cg_val * _WEIGHT_COINGLASS
            result = int(round(weighted))
            logger.info(
                "Sentiment cross-validated",
                extra={"alternative": alt_val, "coinglass": cg_val, "weighted": result},
            )
            return result
        elif alt_val is not None:
            logger.info("Sentiment from Alternative.me only", extra={"value": alt_val})
            return alt_val
        elif cg_val is not None:
            logger.info("Sentiment from CoinGlass only", extra={"value": cg_val})
            return cg_val
        else:
            logger.warning("All sentiment sources failed")
            return None


# ── 向后兼容 ─────────────────────────────────────────────────


async def fetch_fear_greed_index(timeout: float = 30.0) -> Optional[dict]:
    """向后兼容的恐慌贪婪指数获取函数。

    Returns:
        包含 value, classification, timestamp 的字典，失败返回 None
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await asyncio.wait_for(
                client.get(_FEAR_GREED_URL, params={"limit": 1}),
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("data"):
                entry = data["data"][0]
                return {
                    "value": int(entry["value"]),
                    "classification": entry["value_classification"],
                    "timestamp": datetime.fromtimestamp(int(entry["timestamp"])),
                }
    except Exception:
        logger.exception("Failed to fetch fear & greed index")
    return None
