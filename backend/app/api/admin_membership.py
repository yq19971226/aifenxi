"""后台会员管理 API — 订阅套餐 / 积分包 / 配额的结构化 CRUD。

所有数据底层仍存 config_service，但此模块提供面向管理后台的
结构化输入/输出，避免管理员直接操作 raw config key。
"""

import logging
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.deps import UserInfo, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/membership", tags=["admin-membership"])

# ── 积分包 ─────────────────────────────────────────────────────


class CreditPackInfo(BaseModel):
    """积分包信息（管理端 + 用户端共用）。"""

    plan: int
    label: str
    price: float
    credits: int
    mode: str  # scalping | intraday | trend | all
    description: str = ""


class CreditPackUpdate(BaseModel):
    """更新积分包请求。"""

    price: float | None = None
    credits: int | None = None
    mode: str | None = Field(None, pattern=r"^(scalping|intraday|trend|all)$")
    description: str | None = None


_PACK_DESC_KEYS: dict[int, str] = {
    3: "credits_pack_s_desc",
    4: "credits_pack_m_desc",
    5: "credits_pack_l_desc",
}

_PACK_DEFAULT_DESCS: dict[int, str] = {
    3: "轻量补充",
    4: "日常使用",
    5: "高频交易",
}


async def _get_pack_info(plan: int) -> CreditPackInfo | None:
    """从 config 读取积分包完整信息。"""
    from app.services.payment import CREDITS_PACK_CONFIG, _get_credits_pack_info

    cfg = CREDITS_PACK_CONFIG.get(plan)
    if cfg is None:
        return None
    pack = await _get_credits_pack_info(plan)
    if pack is None:
        return None

    from app.services.config_service import get_config_value

    desc = await get_config_value(
        _PACK_DESC_KEYS.get(plan, ""), _PACK_DEFAULT_DESCS.get(plan, "")
    )
    return CreditPackInfo(
        plan=plan,
        label=pack["label"],
        price=pack["price"],
        credits=pack["credits"],
        mode=pack["mode"],
        description=desc,
    )


@router.get("/packs", response_model=list[CreditPackInfo])
async def list_credit_packs(
    _admin: UserInfo = Depends(require_admin),
) -> list[CreditPackInfo]:
    """获取所有积分包配置。"""
    packs = []
    for plan_id in (3, 4, 5):
        info = await _get_pack_info(plan_id)
        if info:
            packs.append(info)
    return packs


@router.put("/packs/{plan}", response_model=CreditPackInfo)
async def update_credit_pack(
    plan: int,
    body: CreditPackUpdate,
    _admin: UserInfo = Depends(require_admin),
) -> CreditPackInfo:
    """更新积分包配置。"""
    from app.services.payment import CREDITS_PACK_CONFIG
    from app.services.config_service import get_config_value, set_config_value

    cfg = CREDITS_PACK_CONFIG.get(plan)
    if cfg is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail=f"积分包 plan={plan} 不存在")

    if body.price is not None:
        await set_config_value(cfg["price_key"], str(body.price))
    if body.credits is not None:
        await set_config_value(cfg["credits_key"], str(body.credits))
    if body.mode is not None:
        await set_config_value(cfg["mode_key"], body.mode)
    if body.description is not None:
        await set_config_value(
            _PACK_DESC_KEYS.get(plan, f"credits_pack_{plan}_desc"),
            body.description,
        )

    info = await _get_pack_info(plan)
    assert info is not None
    return info


# ── 订阅套餐 ────────────────────────────────────────────────────


class PlanConfig(BaseModel):
    """订阅套餐配置。"""

    plan: int
    name: str
    price_monthly: float
    discount_quarterly: float
    discount_yearly: float


class PlanConfigUpdate(BaseModel):
    """更新订阅套餐请求。"""

    price_monthly: float | None = None
    discount_quarterly: float | None = None
    discount_yearly: float | None = None


_PLAN_NAMES: dict[int, str] = {1: "专业", 2: "旗舰"}
_PLAN_PRICE_KEYS: dict[int, str] = {1: "plan_price_pro", 2: "plan_price_flagship"}
_PLAN_DEFAULTS: dict[int, float] = {1: 99.0, 2: 299.0}


@router.get("/plans", response_model=list[PlanConfig])
async def list_plans(
    _admin: UserInfo = Depends(require_admin),
) -> list[PlanConfig]:
    """获取订阅套餐配置。"""
    from app.services.config_service import get_config_value

    results = []
    for plan_id in (1, 2):
        price = float(
            await get_config_value(
                _PLAN_PRICE_KEYS[plan_id], str(_PLAN_DEFAULTS[plan_id])
            )
        )
        q_discount = float(
            await get_config_value("plan_discount_quarterly", "0.9")
        )
        y_discount = float(
            await get_config_value("plan_discount_yearly", "0.7")
        )
        results.append(
            PlanConfig(
                plan=plan_id,
                name=_PLAN_NAMES[plan_id],
                price_monthly=price,
                discount_quarterly=q_discount,
                discount_yearly=y_discount,
            )
        )
    return results


@router.put("/plans/{plan}", response_model=PlanConfig)
async def update_plan(
    plan: int,
    body: PlanConfigUpdate,
    _admin: UserInfo = Depends(require_admin),
) -> PlanConfig:
    """更新订阅套餐配置。"""
    from app.services.config_service import get_config_value, set_config_value

    if plan not in _PLAN_PRICE_KEYS:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail=f"套餐 plan={plan} 不存在")

    if body.price_monthly is not None:
        await set_config_value(_PLAN_PRICE_KEYS[plan], str(body.price_monthly))
    if body.discount_quarterly is not None:
        await set_config_value(
            "plan_discount_quarterly", str(body.discount_quarterly)
        )
    if body.discount_yearly is not None:
        await set_config_value("plan_discount_yearly", str(body.discount_yearly))

    price = float(
        await get_config_value(
            _PLAN_PRICE_KEYS[plan], str(_PLAN_DEFAULTS[plan])
        )
    )
    q_discount = float(await get_config_value("plan_discount_quarterly", "0.9"))
    y_discount = float(await get_config_value("plan_discount_yearly", "0.7"))

    return PlanConfig(
        plan=plan,
        name=_PLAN_NAMES[plan],
        price_monthly=price,
        discount_quarterly=q_discount,
        discount_yearly=y_discount,
    )


# ── 配额矩阵 ────────────────────────────────────────────────────


class QuotaCell(BaseModel):
    """单个配额项。"""

    config_key: str
    level: int  # 0=free, 1=pro, 2=flagship
    mode: str  # scalping | intraday | trend
    value: int


class WelcomeBonus(BaseModel):
    """欢迎包配置。"""

    scalping: int
    intraday: int
    trend: int
    free_trial_intraday: int


class QuotaMatrix(BaseModel):
    """配额矩阵。"""

    quotas: list[QuotaCell]
    welcome: WelcomeBonus


class QuotaMatrixUpdate(BaseModel):
    """批量更新配额。key → value 映射。"""

    updates: dict[str, int]


_QUOTA_KEYS: list[tuple[int, str, str]] = [
    (0, "scalping", "analysis_daily_limit_free_scalping"),
    (1, "scalping", "analysis_daily_limit_pro_scalping"),
    (2, "scalping", "analysis_daily_limit_flagship_scalping"),
    (1, "intraday", "analysis_daily_limit_pro_intraday"),
    (2, "intraday", "analysis_daily_limit_flagship_intraday"),
    (2, "trend", "analysis_daily_limit_flagship_trend"),
]

_QUOTA_DEFAULTS: dict[str, int] = {
    "analysis_daily_limit_free_scalping": 0,
    "analysis_daily_limit_pro_scalping": 50,
    "analysis_daily_limit_flagship_scalping": 200,
    "analysis_daily_limit_pro_intraday": 20,
    "analysis_daily_limit_flagship_intraday": 100,
    "analysis_daily_limit_flagship_trend": 50,
    "welcome_bonus_scalping": 0,
    "welcome_bonus_intraday": 3,
    "welcome_bonus_trend": 1,
    "free_trial_intraday_count": 1,
}


@router.get("/quotas", response_model=QuotaMatrix)
async def get_quotas(
    _admin: UserInfo = Depends(require_admin),
) -> QuotaMatrix:
    """获取配额矩阵 + 欢迎包配置。"""
    from app.services.config_service import get_config_value

    cells = []
    for level, mode, key in _QUOTA_KEYS:
        val = int(await get_config_value(key, str(_QUOTA_DEFAULTS.get(key, 0))))
        cells.append(QuotaCell(config_key=key, level=level, mode=mode, value=val))

    welcome = WelcomeBonus(
        scalping=int(
            await get_config_value("welcome_bonus_scalping", str(_QUOTA_DEFAULTS["welcome_bonus_scalping"]))
        ),
        intraday=int(
            await get_config_value("welcome_bonus_intraday", str(_QUOTA_DEFAULTS["welcome_bonus_intraday"]))
        ),
        trend=int(
            await get_config_value("welcome_bonus_trend", str(_QUOTA_DEFAULTS["welcome_bonus_trend"]))
        ),
        free_trial_intraday=int(
            await get_config_value(
                "free_trial_intraday_count",
                str(_QUOTA_DEFAULTS["free_trial_intraday_count"]),
            )
        ),
    )
    return QuotaMatrix(quotas=cells, welcome=welcome)


@router.put("/quotas", response_model=QuotaMatrix)
async def update_quotas(
    body: QuotaMatrixUpdate,
    _admin: UserInfo = Depends(require_admin),
) -> QuotaMatrix:
    """批量更新配额参数。"""
    from app.services.config_service import set_config_value

    allowed_keys = {k for _, _, k in _QUOTA_KEYS} | {
        "welcome_bonus_scalping",
        "welcome_bonus_intraday",
        "welcome_bonus_trend",
        "free_trial_intraday_count",
    }

    for key, value in body.updates.items():
        if key in allowed_keys:
            await set_config_value(key, str(value))
        else:
            logger.warning("忽略不允许的配额 key: %s", key)

    return await get_quotas(_admin)


# ── 公共端点：积分包配置（用户端使用）─────────────────────────────

public_router = APIRouter(prefix="/api/membership", tags=["membership"])


@public_router.get("/credit-packs", response_model=list[CreditPackInfo])
async def public_credit_packs() -> list[CreditPackInfo]:
    """获取积分包配置（公共端点，用户端购买页使用）。"""
    packs = []
    for plan_id in (3, 4, 5):
        info = await _get_pack_info(plan_id)
        if info:
            packs.append(info)
    return packs
""",
    "Complexity": 7,
    "Description": "New admin membership API providing structured CRUD for credit packs, subscription plans, and quota matrix — all backed by config_service",
    "EmptyFile": false
}
