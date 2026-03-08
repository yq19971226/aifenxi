"""Celery 任务：剧本验证 Worker — 每小时检查活跃预测，验证阶段进展。

D5.4: 遍历 status='active' 的预测记录，对比当前 phase_tracker 阶段：
  - 阶段匹配 → verified_stages += 1，推进 current_stage_idx
  - 所有阶段验证完成 → 计算 final_accuracy，status='completed'
  - 超过 72h 无进展 → status='expired'

F1: 阶段转换时触发推送通知。
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import text

from app.agents.phase_tracker import get_current_phase
from app.services.push_dispatcher import broadcast
from workers.celery_app import celery_app
from workers.db import worker_engine

logger = logging.getLogger(__name__)

_EXPIRY_HOURS = 72  # 超过此时间无进展则过期


async def _verify_all() -> dict[str, int]:
    """遍历所有活跃预测，验证阶段进展。"""
    verified = 0
    completed = 0
    expired = 0
    errors = 0

    async with worker_engine() as (_eng, factory):
        # 1. 获取所有活跃预测
        async with factory() as session:
            result = await session.execute(text("""
                SELECT id, symbol, playbook_name, current_stage_idx,
                       stages_json, verified_stages, created_at, published
                FROM playbook_predictions
                WHERE status = 'active'
                ORDER BY created_at ASC
            """))
            predictions = [dict(row) for row in result.mappings().all()]

        if not predictions:
            return {"verified": 0, "completed": 0, "expired": 0, "errors": 0}

        for pred in predictions:
            try:
                async with factory() as session:
                    result = await _verify_one(session, pred)
                    if result == "verified":
                        verified += 1
                    elif result == "completed":
                        completed += 1
                    elif result == "expired":
                        expired += 1
            except Exception as exc:
                errors += 1
                logger.error(
                    "验证失败: prediction=%s, error=%s",
                    pred["id"], exc,
                )

    logger.info(
        "剧本验证完成: active=%d, verified=%d, completed=%d, expired=%d, errors=%d",
        len(predictions), verified, completed, expired, errors,
    )
    return {
        "active": len(predictions),
        "verified": verified,
        "completed": completed,
        "expired": expired,
        "errors": errors,
    }


async def _verify_one(session, pred: dict) -> str | None:
    """验证单条预测，返回操作类型。"""
    pred_id = pred["id"]
    symbol = pred["symbol"]
    current_idx = pred["current_stage_idx"] or 0
    verified_count = pred["verified_stages"] or 0
    created_at = pred["created_at"]

    # 解析阶段列表
    try:
        stages = json.loads(pred["stages_json"]) if pred["stages_json"] else []
    except Exception:
        stages = []

    if not stages:
        # 无阶段数据，标记为过期
        await _update_status(session, pred_id, "expired")
        return "expired"

    # 检查是否超时
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at)
        except Exception:
            created_at = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    elapsed_hours = (
        datetime.now(timezone.utc) - created_at
    ).total_seconds() / 3600

    if elapsed_hours >= _EXPIRY_HOURS and verified_count == 0:
        await _update_status(session, pred_id, "expired")
        return "expired"

    # 获取当前市场阶段
    current_phase = await get_current_phase(symbol)
    if current_phase is None:
        return None  # phase_tracker 不可用，跳过

    current_phase_str = current_phase.value

    # 检查下一个待验证阶段是否匹配
    next_idx = current_idx + 1 if current_idx >= 0 else 0
    if next_idx >= len(stages):
        # 所有阶段已验证完毕 → 计算准确率并完成
        accuracy = verified_count / len(stages) if stages else 0
        await _complete_prediction(session, pred_id, accuracy)
        return "completed"

    next_stage = stages[next_idx]
    expected_phase = next_stage.get("phase", "")

    if current_phase_str == expected_phase:
        # 阶段匹配 → 验证成功，推进
        new_verified = verified_count + 1
        await session.execute(
            text("""
                UPDATE playbook_predictions
                SET current_stage_idx = :idx,
                    verified_stages = :verified
                WHERE id = :id
            """),
            {"idx": next_idx, "verified": new_verified, "id": pred_id},
        )
        await session.commit()

        logger.info(
            "阶段验证成功: prediction=%s, symbol=%s, playbook=%s, stage=%d/%d",
            pred_id, symbol, pred["playbook_name"], next_idx + 1, len(stages),
        )

        # F1: 阶段转换推送
        try:
            stage_name = next_stage.get("name", f"阶段{next_idx + 1}")
            await broadcast(
                session=session,
                event_type="playbook_switch",
                data={
                    "symbol": symbol,
                    "matched_playbook": pred["playbook_name"],
                    "probability_pct": f"{(new_verified / len(stages) * 100):.0f}%",
                    "stage_description": stage_name,
                    "next_move": next_stage.get("next_stage_probability", "待观察"),
                },
            )
        except Exception as exc:
            logger.warning("阶段转换推送失败: %s", exc)

        # 检查是否全部验证完成
        if next_idx + 1 >= len(stages):
            accuracy = new_verified / len(stages)
            await _complete_prediction(session, pred_id, accuracy)
            return "completed"

        return "verified"

    return None  # 阶段未匹配，等待下次检查


async def _complete_prediction(session, pred_id, accuracy: float) -> None:
    """标记预测为已完成，计算准确率。"""
    await session.execute(
        text("""
            UPDATE playbook_predictions
            SET status = 'completed',
                final_accuracy = :accuracy
            WHERE id = :id
        """),
        {"accuracy": round(accuracy, 4), "id": pred_id},
    )
    await session.commit()
    logger.info("预测完成: prediction=%s, accuracy=%.2f%%", pred_id, accuracy * 100)


async def _update_status(session, pred_id, status: str) -> None:
    """更新预测状态。"""
    await session.execute(
        text("UPDATE playbook_predictions SET status = :status WHERE id = :id"),
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
