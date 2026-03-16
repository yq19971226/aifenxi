"""会员套餐与功能对比 API — 动态价格 + 功能矩阵 + 免费体验。"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import UserInfo, get_current_user
from app.core.redis import get_redis_pool
from app.models.analysis import AnalysisMode
from app.services.analysis_quota import AnalysisQuotaService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/membership", tags=["membership"])


# ── 响应模型 ──────────────────────────────────────────────────


class PlanDetail(BaseModel):
    """单个套餐信息。"""

    plan: int
    name: str
    price_monthly: float
    price_quarterly: float
    price_yearly: float


class PlanFeature(BaseModel):
    """功能对比行。"""

    name: str
    free: str
    pro: str
    flagship: str


class PlansResponse(BaseModel):
    """套餐列表 + 功能对比。"""

    plans: list[PlanDetail]
    features: list[PlanFeature]


# ── 功能对比矩阵（分析次数从动态配置读取） ──────────────────


# 非分析次数的功能行 — 仍为静态
_STATIC_FEATURES: list[dict[str, str]] = [
    {"name": "链上数据", "free": "延迟15分钟", "pro": "实时", "flagship": "实时"},
    {"name": "多智能体共识", "free": "—", "pro": "—", "flagship": "✓"},
    {"name": "策略推送", "free": "—", "pro": "邮件", "flagship": "邮件+TG"},
    {"name": "剧本推演", "free": "—", "pro": "基础", "flagship": "完整"},
    {"name": "对抗防御", "free": "—", "pro": "—", "flagship": "✓"},
    {"name": "策略回测", "free": "7天", "pro": "30天", "flagship": "180天"},
    {"name": "API 访问", "free": "—", "pro": "—", "flagship": "✓"},
]


async def _build_feature_matrix() -> list[dict[str, str]]:
    """构建功能对比矩阵 — 分析次数从动态配置读取。"""
    from app.services.config_service import get_config_value

    # 读取各等级分析次数（与 analysis_quota.py 使用相同 config key）
    free_scalp = await get_config_value("analysis_daily_limit_free_scalping", "5")
    pro_scalp = await get_config_value("analysis_daily_limit_pro_scalping", "50")
    flag_scalp = await get_config_value("analysis_daily_limit_flagship_scalping", "200")
    pro_intra = await get_config_value("analysis_daily_limit_pro_intraday", "20")
    flag_intra = await get_config_value("analysis_daily_limit_flagship_intraday", "100")
    flag_trend = await get_config_value("analysis_daily_limit_flagship_trend", "50")
    free_trial = await get_config_value("free_trial_intraday_count", "1")

    try:
        free_trial_count = int(free_trial)
    except (ValueError, TypeError):
        free_trial_count = 1
    free_intra_label = f"免费体验{free_trial_count}次" if free_trial_count > 0 else "锁定"

    analysis_features = [
        {
            "name": "实时短线分析",
            "free": f"{free_scalp}次/天",
            "pro": f"{pro_scalp}次/天",
            "flagship": f"{flag_scalp}次/天",
        },
        {
            "name": "日内博弈分析",
            "free": free_intra_label,
            "pro": f"{pro_intra}次/天",
            "flagship": f"{flag_intra}次/天",
        },
        {
            "name": "趋势布局分析",
            "free": "锁定",
            "pro": "锁定",
            "flagship": f"{flag_trend}次/天",
        },
    ]

    return analysis_features + _STATIC_FEATURES


@router.get("/plans", response_model=PlansResponse)
async def get_plans() -> PlansResponse:
    """返回动态套餐价格和功能对比矩阵。"""
    from app.services.config_service import get_config_value

    try:
        pro_price = float(await get_config_value("plan_price_pro", "99"))
        flagship_price = float(await get_config_value("plan_price_flagship", "299"))
        q_discount = float(await get_config_value("plan_discount_quarterly", "0.9"))
        y_discount = float(await get_config_value("plan_discount_yearly", "0.7"))
    except Exception:
        logger.warning("读取动态定价失败，使用默认值")
        pro_price, flagship_price = 99.0, 299.0
        q_discount, y_discount = 0.9, 0.7

    plans = [
        PlanDetail(
            plan=1,
            name="专业",
            price_monthly=pro_price,
            price_quarterly=round(pro_price * 3 * q_discount, 2),
            price_yearly=round(pro_price * 12 * y_discount, 2),
        ),
        PlanDetail(
            plan=2,
            name="旗舰",
            price_monthly=flagship_price,
            price_quarterly=round(flagship_price * 3 * q_discount, 2),
            price_yearly=round(flagship_price * 12 * y_discount, 2),
        ),
    ]

    try:
        feature_matrix = await _build_feature_matrix()
    except Exception:
        logger.warning("读取动态功能矩阵失败，使用静态默认值")
        feature_matrix = [
            {"name": "实时短线分析", "free": "5次/天", "pro": "50次/天", "flagship": "200次/天"},
            {"name": "日内博弈分析", "free": "免费体验1次", "pro": "20次/天", "flagship": "100次/天"},
            {"name": "趋势布局分析", "free": "锁定", "pro": "锁定", "flagship": "50次/天"},
        ] + _STATIC_FEATURES

    features = [PlanFeature(**f) for f in feature_matrix]

    return PlansResponse(plans=plans, features=features)


# ── 免费体验 ──────────────────────────────────────────────────

_FREE_TRIAL_CLAIMED_PREFIX = "free_trial_claimed"


class FreeTrialStatus(BaseModel):
    """免费体验状态。"""

    enabled: bool
    total: int
    claimed: bool
    remaining: int


@router.get("/free-trial", response_model=FreeTrialStatus)
async def get_free_trial_status(
    user: UserInfo = Depends(get_current_user),
) -> FreeTrialStatus:
    """查询当前用户的免费体验状态。"""
    from app.services.config_service import get_config_value

    total = int(await get_config_value("free_trial_intraday_count", "1"))
    enabled = total > 0

    redis = get_redis_pool()
    claimed_key = f"{_FREE_TRIAL_CLAIMED_PREFIX}:{user.id}"
    claimed = await redis.exists(claimed_key)

    quota_svc = AnalysisQuotaService(redis)
    bonus = await quota_svc.get_bonus_remaining(
        UUID(user.id), AnalysisMode.INTRADAY,
    )

    return FreeTrialStatus(
        enabled=enabled,
        total=total,
        claimed=bool(claimed),
        remaining=bonus if not claimed else bonus,
    )


@router.post("/free-trial/claim", response_model=FreeTrialStatus)
async def claim_free_trial(
    user: UserInfo = Depends(get_current_user),
) -> FreeTrialStatus:
    """领取免费体验次数（仅限免费用户，每人一次）。"""
    from app.services.config_service import get_config_value

    total = int(await get_config_value("free_trial_intraday_count", "1"))
    if total <= 0:
        return FreeTrialStatus(enabled=False, total=0, claimed=False, remaining=0)

    redis = get_redis_pool()
    claimed_key = f"{_FREE_TRIAL_CLAIMED_PREFIX}:{user.id}"

    # 原子领取：SET NX 保证并发只成功一次
    newly_set = await redis.set(claimed_key, "1", nx=True)
    quota_svc = AnalysisQuotaService(redis)

    if not newly_set:
        bonus = await quota_svc.get_bonus_remaining(
            UUID(user.id), AnalysisMode.INTRADAY,
        )
        return FreeTrialStatus(enabled=True, total=total, claimed=True, remaining=bonus)

    await quota_svc.add_bonus_credits(
        UUID(user.id), AnalysisMode.INTRADAY, total,
    )

    logger.info("免费体验已发放: user=%s, count=%d", user.id, total)

    bonus = await quota_svc.get_bonus_remaining(
        UUID(user.id), AnalysisMode.INTRADAY,
    )
    return FreeTrialStatus(enabled=True, total=total, claimed=True, remaining=bonus)
