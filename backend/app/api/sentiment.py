"""市场情绪 API 路由。

- GET /api/sentiment/fear-greed — 恐贪指数（从 Redis 缓存读取）
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from redis.asyncio import Redis

from app.core.deps import UserInfo, get_current_user
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sentiment", tags=["sentiment"])


class SentimentResponse(BaseModel):
    """恐贪指数响应模型。"""

    value: int  # 0-100
    classification: str  # "Extreme Fear" / "Fear" / "Neutral" / "Greed" / "Extreme Greed"
    timestamp: str


@router.get("/fear-greed", response_model=SentimentResponse)
async def get_fear_greed(
    user: UserInfo = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SentimentResponse:
    """获取恐贪指数。面向所有登录用户，无会员等级限制。"""
    try:
        raw = await redis.get("sentiment:fear_greed")
    except Exception as exc:
        logger.error("Redis 连接失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取情绪数据失败",
        )

    if raw is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="恐贪指数数据暂不可用",
        )

    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("恐贪指数数据解析失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="情绪数据格式异常",
        )

    return SentimentResponse(
        value=data["value"],
        classification=data["classification"],
        timestamp=data["timestamp"],
    )
