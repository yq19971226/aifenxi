"""因子 AI 训练器 — 使用 DeepSeek V3.2 官方 API 分析因子表现并建议权重优化。

独立于主分析系统的 DMXAPI 网关，使用单独配置的 DeepSeek 官方 API Key。
管理员在后台设置 `deepseek_factor_api_key` 即可启用。

调用流程：
  1. 管理员点击"AI 训练" → 触发 run_ai_training()
  2. 查询近 N 天因子命中率数据
  3. 构建 prompt 发送给 DeepSeek V3.2
  4. 解析 AI 返回的权重建议
  5. 返回建议（不自动生效） → 管理员确认后一键应用

安全约束：
  - AI 建议 ≠ 自动生效
  - 单因子权重上限 0.40
  - 至少 100 条样本才允许训练
  - 结果缓存 1 小时
"""

import json
import logging
from datetime import datetime, timezone, timedelta

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# DeepSeek 官方 API 配置
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"  # V3.2, 128K context

# 系统 prompt — 专业量化因子分析师
_SYSTEM_PROMPT = """你是一位资深的加密货币量化因子分析师。你的任务是分析多因子系统的历史表现数据，并建议优化因子权重。

你管理的因子系统包含 13 个因子：
- f1_peak_divergence: 极值点量价背离（核心因子）
- f2_volume_zscore: Log-Z-Score 成交量异常度
- f3_cmf_divergence: Chaikin Money Flow 资金流背离
- f4_macd_rsi_divergence: MACD+RSI 动量复合背离
- f5_obv_divergence: OBV 趋势背离
- f6_derivatives_health: 衍生品健康度（OI+Funding Rate）
- f7_vsa_efficiency: VSA K线效率分析
- f9_bb_squeeze: 布林带挤压（波动率收缩突破信号）
- f10_exchange_netflow: 交易所净流量（仅BTC/ETH，Glassnode）
- f11_ls_ratio_extreme: 多空比极端（逆向拥挤信号）
- f12_vwap_deviation: VWAP偏离（机构成本线回归）
- f13_fear_greed: 恐惧贪婪指数（仅BTC，逆向情绪）
- f14_mvrv: MVRV估值（仅BTC/ETH，周期定位）

分析原则：
1. 命中率高且样本量充足的因子应提高权重
2. 命中率低或样本量不足的因子权重应降低
3. 单因子权重不得超过 0.40
4. 所有权重之和应为 1.0
5. 变化应该保守，单次调整幅度不超过 ±0.05
6. 考虑因子间的互补性，不要让相关因子（如 F1 和 F5）权重之和过高
7. 仅部分币种可用的因子（F10/F13/F14）权重不宜过高

你必须返回严格的 JSON 格式。"""

_USER_PROMPT_TEMPLATE = """以下是过去 {days} 天的因子表现数据：

## 总体统计
- 总分析次数：{total_analyses}
- 已追踪次数：{tracked_count}
- 1h 总体命中率：{overall_hit_rate_1h}%
- 4h 总体命中率：{overall_hit_rate_4h}%

## 各因子表现
{factor_table}

## 当前权重
{current_weights}

请分析以上数据，并返回以下 JSON 格式：
```json
{{
  "analysis": "你对当前因子表现的分析总结（2-3句话）",
  "suggested_weights": {{
    "f1_peak_divergence": 0.xx,
    "f2_volume_zscore": 0.xx,
    "f3_cmf_divergence": 0.xx,
    "f4_macd_rsi_divergence": 0.xx,
    "f5_obv_divergence": 0.xx,
    "f6_derivatives_health": 0.xx,
    "f7_vsa_efficiency": 0.xx,
    "f9_bb_squeeze": 0.xx,
    "f10_exchange_netflow": 0.xx,
    "f11_ls_ratio_extreme": 0.xx,
    "f12_vwap_deviation": 0.xx,
    "f13_fear_greed": 0.xx,
    "f14_mvrv": 0.xx
  }},
  "changes": [
    {{"factor": "factor_id", "old": 0.xx, "new": 0.xx, "reason": "调整原因"}}
  ],
  "confidence": 0.xx,
  "min_samples_met": true,
  "warnings": ["可选的警告信息"]
}}
```"""


# --- 单例缓存 ---
_ds_client: AsyncOpenAI | None = None
_ds_client_key: str = ""


async def _get_deepseek_client() -> AsyncOpenAI | None:
    """获取 DeepSeek 官方 API 客户端（使用独立 API Key，单例缓存）。"""
    global _ds_client, _ds_client_key
    try:
        from app.services.config_service import get_config_value
        api_key = await get_config_value("deepseek_factor_api_key", default="")
        if not api_key or not api_key.strip():
            return None
        api_key = api_key.strip()
        # Key 变化时重新创建客户端
        if _ds_client is not None and _ds_client_key == api_key:
            return _ds_client
        _ds_client = AsyncOpenAI(
            api_key=api_key,
            base_url=DEEPSEEK_BASE_URL,
        )
        _ds_client_key = api_key
        return _ds_client
    except Exception as exc:
        logger.warning("Failed to create DeepSeek client: %s", exc)
        return None


async def run_ai_training(days: int = 14) -> dict:
    """执行 AI 因子训练 — 调用 DeepSeek V3.2 分析因子表现并建议权重。

    Args:
        days: 分析的历史天数

    Returns:
        包含 AI 分析结果和权重建议的 dict
    """
    # 1. 检查 DeepSeek API Key
    client = await _get_deepseek_client()
    if client is None:
        return {
            "ok": False,
            "error": "DeepSeek API Key 未配置。请在后台 系统配置 中设置 deepseek_factor_api_key",
        }

    # 2. 获取因子统计数据
    from app.services.factor_learning import get_factor_stats
    stats = await get_factor_stats(days=days)

    if stats["total_analyses"] < 100:
        return {
            "ok": False,
            "error": f"样本量不足：当前 {stats['total_analyses']} 条，最低需要 100 条",
            "stats": stats,
        }

    if stats["tracked_count"] < 50:
        return {
            "ok": False,
            "error": f"已追踪样本不足：当前 {stats['tracked_count']} 条，最低需要 50 条",
            "stats": stats,
        }

    # 3. 获取当前权重
    from app.services.config_service import get_config_value
    from app.services.volume_price_divergence_v2 import DEFAULT_WEIGHTS
    raw = await get_config_value("vpd_factor_weights", default="")
    current_weights = json.loads(raw) if raw and raw.strip() else dict(DEFAULT_WEIGHTS)

    # 4. 构建因子表格
    factor_lines = []
    for f in stats.get("factor_stats", []):
        factor_lines.append(
            f"- {f['factor_id']}: 活跃 {f['active_count']} 次, "
            f"1h命中率 {f['hit_rate_1h']}%, 4h命中率 {f['hit_rate_4h']}%, "
            f"平均分 {f['avg_score']}"
        )
    factor_table = "\n".join(factor_lines) if factor_lines else "暂无因子数据"

    # 5. 构建 prompt
    user_prompt = _USER_PROMPT_TEMPLATE.format(
        days=days,
        total_analyses=stats["total_analyses"],
        tracked_count=stats["tracked_count"],
        overall_hit_rate_1h=stats["overall_hit_rate_1h"],
        overall_hit_rate_4h=stats["overall_hit_rate_4h"],
        factor_table=factor_table,
        current_weights=json.dumps(current_weights, indent=2),
    )

    # 6. 调用 DeepSeek V3.2
    content = "{}"  # 在 try 外初始化，防止异常时 UnboundLocalError
    try:
        import asyncio
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,  # 分析任务用较低 temperature
                response_format={"type": "json_object"},
            ),
            timeout=60.0,
        )

        content = response.choices[0].message.content or "{}"
        tokens_used = response.usage.total_tokens if response.usage else 0

        # 解析 AI 返回
        ai_result = json.loads(content)

        # 验证建议权重
        suggested = ai_result.get("suggested_weights", {})
        if suggested:
            # 安全检查
            for fid, w in suggested.items():
                if fid not in DEFAULT_WEIGHTS:
                    return {"ok": False, "error": f"AI 建议了未知因子: {fid}"}
                if w > 0.40:
                    suggested[fid] = 0.40  # 自动截断
                    ai_result.setdefault("warnings", []).append(
                        f"{fid} 权重被截断至上限 0.40"
                    )
                if w < 0:
                    suggested[fid] = 0.0

            total = sum(suggested.values())
            if abs(total - 1.0) > 0.05:
                # 归一化
                for fid in suggested:
                    suggested[fid] = round(suggested[fid] / total, 4)
                ai_result["warnings"] = ai_result.get("warnings", [])
                ai_result["warnings"].append(
                    f"权重总和 {total:.3f} 偏离 1.0，已自动归一化"
                )

        return {
            "ok": True,
            "ai_result": ai_result,
            "current_weights": current_weights,
            "suggested_weights": suggested,
            "tokens_used": tokens_used,
            "stats": stats,
            "model": DEEPSEEK_MODEL,
            "message": "AI 分析完成。请审核建议后手动应用。",
        }

    except json.JSONDecodeError as exc:
        logger.warning("AI returned invalid JSON: %s", exc)
        return {"ok": False, "error": f"AI 返回格式错误: {exc}", "raw_content": content}
    except Exception as exc:
        logger.error("DeepSeek API call failed: %s", exc)
        return {"ok": False, "error": f"DeepSeek API 调用失败: {exc}"}


async def apply_ai_suggestion(suggested_weights: dict, admin_id: str = "admin") -> dict:
    """管理员确认后应用 AI 建议的权重。

    Args:
        suggested_weights: AI 建议的权重 dict
        admin_id: 操作管理员

    Returns:
        应用结果
    """
    from app.services.volume_price_divergence_v2 import DEFAULT_WEIGHTS
    from app.services.config_service import get_config_value, set_config_value
    from app.services.factor_learning import log_weight_change

    # 安全验证
    for fid, w in suggested_weights.items():
        if fid not in DEFAULT_WEIGHTS:
            return {"ok": False, "error": f"未知因子: {fid}"}
        if w < 0 or w > 0.40:
            return {"ok": False, "error": f"因子 {fid} 权重 {w} 超出安全范围 [0, 0.40]"}

    total = sum(suggested_weights.values())
    if total < 0.8 or total > 1.2:
        return {"ok": False, "error": f"权重总和 {total:.3f} 不在允许范围 [0.8, 1.2]"}

    # 读取旧权重
    old_raw = await get_config_value("vpd_factor_weights", default="")
    old_weights = json.loads(old_raw) if old_raw and old_raw.strip() else dict(DEFAULT_WEIGHTS)

    # 写入新权重
    await set_config_value("vpd_factor_weights", json.dumps(suggested_weights))

    # 清除 VPD 引擎的权重缓存，使新权重立即生效
    try:
        from app.services.volume_price_divergence_v2 import (
            _weight_cache as _wc_ref,
        )
        import app.services.volume_price_divergence_v2 as vpd_mod
        vpd_mod._weight_cache = None
        vpd_mod._weight_cache_ts = 0.0
    except Exception:
        pass

    # 审计日志
    await log_weight_change(
        changed_by=admin_id,
        source="ai_deepseek",
        old_weights=old_weights,
        new_weights=suggested_weights,
        notes=f"DeepSeek V3.2 AI training suggestion applied by {admin_id}",
    )

    return {
        "ok": True,
        "message": "AI 建议权重已应用",
        "old_weights": old_weights,
        "new_weights": suggested_weights,
    }
