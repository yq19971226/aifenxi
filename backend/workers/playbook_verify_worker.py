"""Celery 任务：剧本验证 Worker — 每小时检查活跃预测，验证阶段进展。

状态机:
  active → verified（阶段匹配推进）
  active → completed（所有阶段验证完成）
  active → failed（硬失效：方向反转 + 超时）
  active → risk_flag=True（软失效：连续不匹配）
  active → expired（72h 无进展且无验证）

硬失效判定:
  当前阶段超过 typical_duration 上限 且 价格方向与阶段预期明确相反
  → status='failed', failure_reason 写入原因

软失效判定:
  连续 3 次检查阶段不匹配 → risk_flag=True, risk_note 写入原因
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone

from sqlalchemy import text

from app.agents.phase_tracker import get_current_phase
from app.core.redis import init_redis, get_redis_pool
from app.services.push_dispatcher import broadcast
from app.services.playbook_prediction_maintenance import (
    get_market_structure_type_for_playbook,
)
from workers.celery_app import celery_app
from workers.db import worker_engine

logger = logging.getLogger(__name__)

_EXPIRY_HOURS = 72
_SOFT_FAIL_THRESHOLD = 3  # 连续不匹配次数阈值

# 阶段 phase 对应的预期价格方向
_PHASE_EXPECTED_DIR: dict[str, str | None] = {
    "accumulation": "sideways",
    "markup":       "up",
    "distribution": "sideways",
    "escape":       "down",
    "washout":      "down",
    "testing":      "sideways",
    "continuation": None,  # 不判定
}

# 方向反转阈值（百分比）
_DIR_THRESHOLDS = {
    "up":       -5.0,   # 预期涨，跌超 5% → 失效
    "down":      5.0,   # 预期跌，涨超 5% → 失效
    "sideways":  8.0,   # 预期横盘，单向超 8% → 失效
}


def _parse_max_duration_hours(typical_duration: str) -> float:
    """从 '2-8小时' / '1-3天' 解析出上限小时数。"""
    if not typical_duration:
        return 24.0
    m = re.search(r"(\d+)\s*[-~]\s*(\d+)\s*(小时|天|周|h|d|w)", typical_duration)
    if m:
        upper = float(m.group(2))
        unit = m.group(3)
        if unit in ("天", "d"):
            upper *= 24
        elif unit in ("周", "w"):
            upper *= 24 * 7
        return upper
    m2 = re.search(r"(\d+)\s*(小时|天|周|h|d|w)", typical_duration)
    if m2:
        val = float(m2.group(1))
        unit = m2.group(2)
        if unit in ("天", "d"):
            val *= 24
        elif unit in ("周", "w"):
            val *= 24 * 7
        return val
    return 24.0


async def _get_current_price(symbol: str) -> float | None:
    """从 Redis 读取最新价格。"""
    try:
        redis = get_redis_pool()
        raw = await redis.get(f"latest_price:{symbol}")
        return float(raw) if raw else None
    except Exception:
        logger.exception("获取最新价格失败: symbol=%s", symbol)
        return None


def _check_hard_failure(
    expected_dir: str | None,
    base_price: float | None,
    current_price: float | None,
    elapsed_hours: float,
    max_duration_hours: float,
    stage_name: str,
) -> str | None:
    """硬失效判定。返回 failure_reason 或 None。"""
    if expected_dir is None:
        return None
    if base_price is None or current_price is None or base_price <= 0:
        return None
    if elapsed_hours < max_duration_hours:
        return None

    pct = (current_price - base_price) / base_price * 100
    threshold = _DIR_THRESHOLDS.get(expected_dir)
    if threshold is None:
        return None

    if expected_dir == "up" and pct < threshold:
        return f"预期上涨阶段({stage_name})，但价格下跌{abs(pct):.1f}%"
    if expected_dir == "down" and pct > threshold:
        return f"预期下跌阶段({stage_name})，但价格上涨{pct:.1f}%"
    if expected_dir == "sideways" and abs(pct) > threshold:
        direction = "上涨" if pct > 0 else "下跌"
        return f"预期横盘阶段({stage_name})，但价格{direction}{abs(pct):.1f}%"
    return None


async def _verify_all() -> dict[str, int]:
    """遍历所有活跃预测，验证阶段进展。"""
    t0 = time.monotonic()
    await init_redis()

    verified = 0
    completed = 0
    expired = 0
    failed = 0
    errors = 0

    async with worker_engine() as (_eng, factory):
        async with factory() as session:
            result = await session.execute(text("""
                SELECT id, symbol, playbook_name, current_stage_idx,
                       stages_json, verified_stages, created_at, published,
                       signal, market_structure_type, snapshot_price, stage_entry_price,
                       stage_entered_at, risk_flag, risk_note
                FROM playbook_predictions
                WHERE status = 'active'
                ORDER BY created_at ASC
            """))
            predictions = [dict(row) for row in result.mappings().all()]

        if not predictions:
            return {"verified": 0, "completed": 0, "expired": 0,
                    "failed": 0, "errors": 0}

        # 按 symbol 分组预加载 price 和 phase，避免 N+1
        symbols = {p["symbol"] for p in predictions}
        price_cache: dict[str, float | None] = {}
        phase_cache: dict[str, object] = {}  # MarketPhase | None
        for sym in symbols:
            price_cache[sym] = await _get_current_price(sym)
            try:
                phase_cache[sym] = await get_current_phase(sym)
            except Exception:
                phase_cache[sym] = None

        for pred in predictions:
            try:
                async with factory() as session:
                    op = await _verify_one(
                        session, pred,
                        cached_price=price_cache.get(pred["symbol"]),
                        cached_phase=phase_cache.get(pred["symbol"]),
                    )
                    if op == "verified":
                        verified += 1
                    elif op == "completed":
                        completed += 1
                    elif op == "expired":
                        expired += 1
                    elif op == "failed":
                        failed += 1
            except Exception as exc:
                errors += 1
                logger.error(
                    "验证失败: prediction=%s, error=%s", pred["id"], exc,
                )

    elapsed_sec = time.monotonic() - t0
    logger.info(
        "剧本验证完成: active=%d, verified=%d, completed=%d, "
        "failed=%d, expired=%d, errors=%d, elapsed=%.1fs",
        len(predictions), verified, completed, failed, expired, errors,
        elapsed_sec,
    )
    if elapsed_sec > 300:
        logger.warning("剧本验证耗时过长: %.1fs，可能影响下次调度", elapsed_sec)
    return {
        "active": len(predictions),
        "verified": verified,
        "completed": completed,
        "failed": failed,
        "expired": expired,
        "errors": errors,
    }


def _parse_datetime(raw, fallback: datetime) -> datetime:
    """将 str/datetime 统一为 timezone-aware datetime。"""
    if isinstance(raw, str):
        try:
            raw = datetime.fromisoformat(raw)
        except Exception:
            return fallback
    if isinstance(raw, datetime):
        return raw.replace(tzinfo=timezone.utc) if raw.tzinfo is None else raw
    return fallback


async def _handle_stage_match(
    session, pred: dict, next_idx: int, new_verified: int,
    current_price: float | None, now: datetime,
    stages: list, stage_name: str, next_stage: dict,
) -> str:
    """处理阶段匹配成功：更新数据库、推送通知、判定是否全部完成。"""
    pred_id = pred["id"]
    symbol = pred["symbol"]
    playbook_name = pred["playbook_name"]
    market_structure_type = (
        pred.get("market_structure_type")
        or get_market_structure_type_for_playbook(playbook_name)
    )

    await session.execute(
        text("""
            UPDATE playbook_predictions
            SET current_stage_idx = :idx,
                verified_stages = :verified,
                stage_entry_price = :price,
                stage_entered_at = :entered_at,
                risk_flag = FALSE,
                risk_note = NULL
            WHERE id = :id AND status = 'active'
        """),
        {"idx": next_idx, "verified": new_verified,
         "price": current_price, "entered_at": now, "id": pred_id},
    )
    await session.commit()

    logger.info(
        "阶段验证成功: prediction=%s, symbol=%s, playbook=%s, stage=%d/%d",
        pred_id, symbol, playbook_name, next_idx + 1, len(stages),
    )

    try:
        await broadcast(
            session=session,
            event_type="playbook_switch",
            data={
                "symbol": symbol,
                "matched_playbook": playbook_name,
                "market_structure_type": market_structure_type,
                "probability_pct": f"{(new_verified / len(stages) * 100):.0f}%",
                "stage_description": stage_name,
                "next_move": next_stage.get("next_stage_probability", "待观察"),
            },
        )
    except Exception as exc:
        logger.warning("阶段转换推送失败: %s", exc)

    if next_idx + 1 >= len(stages):
        accuracy = new_verified / len(stages)
        await _complete_prediction(session, pred_id, accuracy,
                                   symbol, playbook_name)
        return "completed"

    return "verified"


async def _handle_soft_failure(
    session, pred_id: str, prev_risk_note: str,
    stage_name: str, expected_phase: str, current_phase_str: str,
) -> None:
    """处理阶段未匹配：累计 miss 计数，超阈值标记风险。"""
    miss_count = _parse_miss_count(prev_risk_note) + 1
    if miss_count >= _SOFT_FAIL_THRESHOLD:
        risk_note = (
            f"连续{miss_count}次未匹配预期阶段({stage_name}/{expected_phase})，"
            f"当前市场阶段: {current_phase_str}"
        )
        await session.execute(
            text("""
                UPDATE playbook_predictions
                SET risk_flag = TRUE, risk_note = :note
                WHERE id = :id AND status = 'active'
            """),
            {"note": risk_note, "id": pred_id},
        )
        await session.commit()
        logger.info(
            "软失效标记: prediction=%s, miss_count=%d", pred_id, miss_count,
        )
    else:
        stall_note = f"miss:{miss_count}"
        await session.execute(
            text("""
                UPDATE playbook_predictions
                SET risk_note = :note
                WHERE id = :id AND status = 'active'
            """),
            {"note": stall_note, "id": pred_id},
        )
        await session.commit()


async def _verify_one(
    session, pred: dict, *,
    cached_price: float | None = None,
    cached_phase: object = None,
) -> str | None:
    """验证单条预测，返回操作类型。"""
    pred_id = pred["id"]
    symbol = pred["symbol"]
    current_idx = pred["current_stage_idx"] or 0
    verified_count = pred["verified_stages"] or 0

    # 解析阶段列表
    try:
        stages = json.loads(pred["stages_json"]) if pred["stages_json"] else []
    except Exception:
        logger.error("阶段数据损坏，无法解析 stages_json: prediction=%s", pred_id)
        stages = []

    if not stages:
        await _update_status(session, pred_id, "expired")
        return "expired"

    now = datetime.now(timezone.utc)
    created_at = _parse_datetime(pred["created_at"], now)
    total_elapsed_hours = (now - created_at).total_seconds() / 3600

    if total_elapsed_hours >= _EXPIRY_HOURS and verified_count == 0:
        await _update_status(session, pred_id, "expired")
        return "expired"

    stage_entered_at = _parse_datetime(pred.get("stage_entered_at"), created_at)
    stage_elapsed_hours = (now - stage_entered_at).total_seconds() / 3600

    # 获取当前市场阶段
    current_phase = cached_phase if cached_phase is not None else await get_current_phase(symbol)
    if current_phase is None:
        logger.warning("无法获取市场阶段，跳过验证: prediction=%s, symbol=%s", pred_id, symbol)
        return None
    current_phase_str = current_phase.value

    # 下一个待验证阶段
    next_idx = current_idx + 1 if current_idx >= 0 else 0
    if next_idx >= len(stages):
        accuracy = verified_count / len(stages) if stages else 0
        await _complete_prediction(session, pred_id, accuracy, symbol,
                                   pred["playbook_name"])
        return "completed"

    next_stage = stages[next_idx]
    expected_phase = next_stage.get("phase", "")
    stage_name = next_stage.get("name", f"阶段{next_idx + 1}")

    # ── 硬失效判定 ──
    expected_dir = _PHASE_EXPECTED_DIR.get(expected_phase)
    max_dur = _parse_max_duration_hours(next_stage.get("typical_duration", ""))
    base_price = pred.get("stage_entry_price") or pred.get("snapshot_price")
    current_price = cached_price if cached_price is not None else await _get_current_price(symbol)
    if current_price is None:
        logger.warning("无法获取最新价格，跳过硬失效判定: prediction=%s, symbol=%s", pred_id, symbol)

    failure_reason = _check_hard_failure(
        expected_dir, base_price, current_price,
        stage_elapsed_hours, max_dur, stage_name,
    )
    if failure_reason:
        await _fail_prediction(session, pred_id, failure_reason,
                               symbol, pred["playbook_name"])
        return "failed"

    # ── 阶段匹配 ──
    if current_phase_str == expected_phase:
        return await _handle_stage_match(
            session, pred, next_idx, verified_count + 1,
            current_price, now, stages, stage_name, next_stage,
        )

    # ── 软失效（阶段未匹配）──
    await _handle_soft_failure(
        session, pred_id, pred.get("risk_note") or "",
        stage_name, expected_phase, current_phase_str,
    )
    return None


def _parse_miss_count(risk_note: str) -> int:
    """从 risk_note 解析连续未匹配次数。"""
    if not risk_note:
        return 0
    m = re.search(r"miss:(\d+)", risk_note)
    if m:
        return int(m.group(1))
    m2 = re.search(r"连续(\d+)次", risk_note)
    if m2:
        return int(m2.group(1))
    return 0


async def _complete_prediction(
    session, pred_id, accuracy: float, symbol: str, playbook_name: str,
) -> None:
    """标记预测为已完成。"""
    await session.execute(
        text("""
            UPDATE playbook_predictions
            SET status = 'completed',
                final_accuracy = :accuracy
            WHERE id = :id AND status = 'active'
        """),
        {"accuracy": round(accuracy, 4), "id": pred_id},
    )
    await session.commit()
    logger.info("预测完成: prediction=%s, accuracy=%.2f%%", pred_id, accuracy * 100)

    try:
        await broadcast(
            session=session,
            event_type="playbook_completed",
            data={
                "symbol": symbol,
                "matched_playbook": playbook_name,
                "market_structure_type": get_market_structure_type_for_playbook(playbook_name),
                "stage_match_ratio": f"{accuracy * 100:.0f}%",
            },
        )
    except Exception as exc:
        logger.warning("完成推送失败: %s", exc)


async def _fail_prediction(
    session, pred_id, failure_reason: str, symbol: str, playbook_name: str,
) -> None:
    """标记预测为硬失效。"""
    await session.execute(
        text("""
            UPDATE playbook_predictions
            SET status = 'failed',
                failure_reason = :reason
            WHERE id = :id AND status = 'active'
        """),
        {"reason": failure_reason, "id": pred_id},
    )
    await session.commit()
    logger.info("预测失效: prediction=%s, reason=%s", pred_id, failure_reason)

    try:
        await broadcast(
            session=session,
            event_type="playbook_failed",
            data={
                "symbol": symbol,
                "matched_playbook": playbook_name,
                "market_structure_type": get_market_structure_type_for_playbook(playbook_name),
                "failure_reason": failure_reason,
            },
        )
    except Exception as exc:
        logger.warning("失效推送失败: %s", exc)


async def _update_status(session, pred_id, status: str) -> None:
    """更新预测状态。"""
    await session.execute(
        text("UPDATE playbook_predictions SET status = :status WHERE id = :id AND status = 'active'"),
        {"status": status, "id": pred_id},
    )
    await session.commit()


@celery_app.task(
    name="workers.playbook_verify_worker.verify_playbook_predictions_task",
    bind=True,
    max_retries=2,
)
def verify_playbook_predictions_task(self) -> dict[str, int]:
    """Celery Beat 每小时触发，验证所有活跃剧本预测。"""
    try:
        result = asyncio.run(_verify_all())
        return result
    except Exception as exc:
        logger.error("verify_playbook_predictions_task error: %s", exc)
        raise self.retry(exc=exc, countdown=60)
