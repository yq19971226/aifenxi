"""历史案例检索服务 — 余弦相似度匹配历史操盘案例。

路由层通过本服务查询 cases 表，不直接调用数据库。
"""

import logging
import math
from datetime import date
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class CaseRecord(BaseModel):
    """历史案例查询结果。"""

    id: str
    case_name: str
    date: date
    symbol: str
    pattern_type: str
    description: Optional[str] = None
    similarity_features: dict
    max_gain_pct: Optional[float] = None
    max_loss_pct: Optional[float] = None
    similarity_score: float = 0.0


class CaseSearchService:
    """历史案例检索服务 — 基于余弦相似度。"""

    async def search_similar(
        self,
        session: AsyncSession,
        features: dict[str, float],
        pattern_type: Optional[str] = None,
        top_k: int = 5,
    ) -> list[CaseRecord]:
        """根据输入特征向量，检索最相似的历史案例。

        features dict example: {
            "exchange_netflow": -1200.0,
            "whale_change": 2.35,
            "fear_greed": 32,
            "mvrv": 1.8,
            "rsi": 58.5,
            "price_change_pct": -5.2,
        }
        """
        try:
            cases = await self._query_cases(session, pattern_type)

            scored: list[CaseRecord] = []
            for case in cases:
                stored_features = case.similarity_features or {}
                score = self._cosine_similarity(features, stored_features)
                case.similarity_score = score
                scored.append(case)

            scored.sort(key=lambda c: c.similarity_score, reverse=True)
            return scored[:top_k]
        except Exception as exc:
            logger.error("search_similar failed", extra={"error": str(exc)})
            raise

    async def get_all_cases(
        self,
        session: AsyncSession,
        pattern_type: Optional[str] = None,
        limit: int = 50,
    ) -> list[CaseRecord]:
        """获取所有案例，按日期降序排列。"""
        try:
            return await self._query_cases(session, pattern_type, limit)
        except Exception as exc:
            logger.error("get_all_cases failed", extra={"error": str(exc)})
            raise

    async def _query_cases(
        self,
        session: AsyncSession,
        pattern_type: Optional[str] = None,
        limit: int = 50,
    ) -> list[CaseRecord]:
        """从数据库查询案例，可选按 pattern_type 过滤。"""
        params: dict = {"limit": limit}

        if pattern_type:
            sql = text("""
                SELECT id, case_name, date, symbol, pattern_type,
                       description, similarity_features,
                       max_gain_pct, max_loss_pct
                FROM cases
                WHERE pattern_type = :pattern_type
                ORDER BY date DESC
                LIMIT :limit
            """)
            params["pattern_type"] = pattern_type
        else:
            sql = text("""
                SELECT id, case_name, date, symbol, pattern_type,
                       description, similarity_features,
                       max_gain_pct, max_loss_pct
                FROM cases
                ORDER BY date DESC
                LIMIT :limit
            """)

        result = await session.execute(sql, params)
        rows = result.mappings().all()

        return [
            CaseRecord(
                id=str(row["id"]),
                case_name=row["case_name"],
                date=row["date"],
                symbol=row["symbol"],
                pattern_type=row["pattern_type"],
                description=row["description"],
                similarity_features=row["similarity_features"] or {},
                max_gain_pct=_to_float(row["max_gain_pct"]),
                max_loss_pct=_to_float(row["max_loss_pct"]),
            )
            for row in rows
        ]

    @staticmethod
    def _cosine_similarity(a: dict[str, float], b: dict[str, float]) -> float:
        """计算两个特征字典的余弦相似度。

        只考虑两个字典中都存在的键。
        如果没有共同键或任一向量为零向量，返回 0.0。
        """
        common_keys = set(a.keys()) & set(b.keys())
        if not common_keys:
            return 0.0

        dot_product = sum(a[k] * b[k] for k in common_keys)
        norm_a = math.sqrt(sum(a[k] ** 2 for k in common_keys))
        norm_b = math.sqrt(sum(b[k] ** 2 for k in common_keys))

        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0

        return dot_product / (norm_a * norm_b)


def _to_float(v: object) -> float | None:
    return float(v) if v is not None else None
