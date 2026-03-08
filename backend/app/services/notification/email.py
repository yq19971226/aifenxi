"""SendGrid 邮件推送服务

提供策略邮件 HTML 模板构建与发送功能。
模板采用科技风深色主题，与前端视觉风格一致。
"""

import logging
from typing import Literal

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ── Pydantic 数据模型 ─────────────────────────────────────────


class StrategyEmailData(BaseModel):
    """策略邮件数据模型，用于构建 HTML 邮件内容。"""

    symbol: str = Field(..., description="交易对，如 BTCUSDT")
    direction: Literal["bullish", "bearish", "neutral"] = Field(
        ..., description="策略方向"
    )
    entry_low: float = Field(..., description="入场区间下限")
    entry_high: float = Field(..., description="入场区间上限")
    stop_loss: float = Field(..., description="止损价")
    targets: list[float] = Field(default_factory=list, description="目标价列表")
    confidence: float = Field(..., ge=0.0, le=1.0, description="置信度 0-1")
    reasoning: str = Field(default="", description="策略推理摘要")


# ── 颜色常量 ──────────────────────────────────────────────────

_COLOR_MAP: dict[str, dict[str, str]] = {
    "bullish": {
        "accent": "#00F5A0",
        "label": "📈 多头 BULLISH",
        "bg_gradient": "linear-gradient(135deg, rgba(0,245,160,0.15), rgba(0,245,160,0.03))",
    },
    "bearish": {
        "accent": "#FF3B6F",
        "label": "📉 空头 BEARISH",
        "bg_gradient": "linear-gradient(135deg, rgba(255,59,111,0.15), rgba(255,59,111,0.03))",
    },
    "neutral": {
        "accent": "#2A6DFF",
        "label": "⏸ 观望 NEUTRAL",
        "bg_gradient": "linear-gradient(135deg, rgba(42,109,255,0.15), rgba(42,109,255,0.03))",
    },
}


# ── HTML 模板构建 ─────────────────────────────────────────────


def _format_price(price: float) -> str:
    """格式化价格，保留合理小数位。"""
    if price >= 1000:
        return f"{price:,.2f}"
    if price >= 1:
        return f"{price:.4f}"
    return f"{price:.8f}"


def _build_confidence_stars(confidence: float) -> str:
    """将 0-1 置信度转换为星级 HTML。"""
    stars = round(confidence * 5)
    filled = "★" * stars
    empty = "☆" * (5 - stars)
    return f"{filled}{empty}"


def _build_targets_html(targets: list[float], accent: str) -> str:
    """构建目标价列表 HTML。"""
    if not targets:
        return '<span style="color:#666;">—</span>'
    items: list[str] = []
    for i, t in enumerate(targets, 1):
        items.append(
            f'<span style="color:{accent};font-family:\'Roboto Mono\',monospace;">'
            f"T{i}: {_format_price(t)}</span>"
        )
    return " → ".join(items)


def build_strategy_html(data: StrategyEmailData) -> str:
    """根据策略数据构建科技风 HTML 邮件内容。

    Args:
        data: 策略邮件数据（pydantic 模型）

    Returns:
        完整的 HTML 邮件字符串
    """
    colors = _COLOR_MAP.get(data.direction, _COLOR_MAP["neutral"])
    accent = colors["accent"]
    label = colors["label"]
    bg_gradient = colors["bg_gradient"]
    confidence_pct = f"{data.confidence:.0%}"
    stars_html = _build_confidence_stars(data.confidence)
    targets_html = _build_targets_html(data.targets, accent)

    return f"""\
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0A0F1B;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0F1B;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr><td style="padding:24px 32px;text-align:center;">
    <span style="font-size:24px;font-weight:700;color:#2A6DFF;letter-spacing:2px;">⚡ Axiom</span>
    <div style="color:#555;font-size:12px;margin-top:4px;letter-spacing:1px;">多智能体博弈共识分析系统</div>
  </td></tr>

  <!-- Direction Banner -->
  <tr><td style="padding:0 24px;">
    <div style="background:{bg_gradient};border:1px solid {accent}33;border-radius:12px;padding:20px 24px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:{accent};letter-spacing:3px;">{label}</div>
      <div style="color:#888;font-size:14px;margin-top:6px;font-family:'Roboto Mono',monospace;">{data.symbol}</div>
    </div>
  </td></tr>

  <!-- Strategy Details -->
  <tr><td style="padding:16px 24px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:rgba(255,255,255,0.04);border:1px solid rgba(42,109,255,0.15);border-radius:10px;">
      <!-- Entry Range -->
      <tr>
        <td style="padding:16px 20px 8px;color:#888;font-size:13px;">🎯 入场区间</td>
        <td style="padding:16px 20px 8px;text-align:right;color:#E0E0E0;font-family:'Roboto Mono',monospace;font-size:15px;">
          {_format_price(data.entry_low)} ~ {_format_price(data.entry_high)}
        </td>
      </tr>
      <!-- Stop Loss -->
      <tr>
        <td style="padding:8px 20px;color:#888;font-size:13px;">🛑 止损</td>
        <td style="padding:8px 20px;text-align:right;color:#FF3B6F;font-family:'Roboto Mono',monospace;font-size:15px;">
          {_format_price(data.stop_loss)}
        </td>
      </tr>
      <!-- Targets -->
      <tr>
        <td style="padding:8px 20px;color:#888;font-size:13px;">🏁 目标</td>
        <td style="padding:8px 20px;text-align:right;font-size:14px;">{targets_html}</td>
      </tr>
      <!-- Confidence -->
      <tr>
        <td style="padding:8px 20px 16px;color:#888;font-size:13px;">📊 置信度</td>
        <td style="padding:8px 20px 16px;text-align:right;">
          <span style="color:{accent};font-size:18px;letter-spacing:2px;">{stars_html}</span>
          <span style="color:#E0E0E0;font-family:'Roboto Mono',monospace;margin-left:8px;">{confidence_pct}</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Reasoning -->
  <tr><td style="padding:16px 24px 0;">
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(42,109,255,0.1);border-radius:10px;padding:16px 20px;">
      <div style="color:#2A6DFF;font-size:13px;font-weight:600;margin-bottom:8px;">💡 分析摘要</div>
      <div style="color:#AAAAAA;font-size:13px;line-height:1.7;">{data.reasoning or '暂无详细分析'}</div>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 32px;text-align:center;">
    <div style="color:#444;font-size:11px;line-height:1.6;">
      本邮件由 Axiom 系统自动生成，仅供参考，不构成投资建议。<br>
      如需退订，请在设置页面关闭邮件推送。
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


# ── 邮件发送 ──────────────────────────────────────────────────


async def send_strategy_email(
    to_email: str,
    strategy_data: StrategyEmailData,
) -> bool:
    """构建策略 HTML 并通过 SendGrid 发送。

    Args:
        to_email: 收件人邮箱
        strategy_data: 策略数据（pydantic 模型）

    Returns:
        是否发送成功
    """
    from app.services.config_service import get_config_value

    api_key = await get_config_value("sendgrid_api_key")
    if not api_key:
        logger.warning("SendGrid API key not configured, skipping email")
        return False

    html_content = build_strategy_html(strategy_data)
    direction_label = {
        "bullish": "多头",
        "bearish": "空头",
        "neutral": "观望",
    }.get(strategy_data.direction, "观望")
    subject = f"[Axiom] {strategy_data.symbol} 策略更新 — {direction_label}"

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email="noreply@axiom.trade",
            to_emails=to_email,
            subject=subject,
            html_content=html_content,
        )
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        logger.info(
            "Strategy email sent",
            extra={
                "to": to_email,
                "symbol": strategy_data.symbol,
                "direction": strategy_data.direction,
                "status": response.status_code,
            },
        )
        return response.status_code in (200, 201, 202)
    except Exception:
        logger.exception("Failed to send strategy email", extra={"to": to_email})
        return False


async def send_raw_email(
    to_email: str,
    subject: str,
    html_content: str,
) -> bool:
    """发送自定义 HTML 邮件（通用接口）。

    Args:
        to_email: 收件人邮箱
        subject: 邮件主题
        html_content: HTML 内容

    Returns:
        是否发送成功
    """
    from app.services.config_service import get_config_value

    api_key = await get_config_value("sendgrid_api_key")
    if not api_key:
        logger.warning("SendGrid API key not configured, skipping email")
        return False

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email="noreply@axiom.trade",
            to_emails=to_email,
            subject=subject,
            html_content=html_content,
        )
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        logger.info(
            "Email sent",
            extra={"to": to_email, "status": response.status_code},
        )
        return response.status_code in (200, 201, 202)
    except Exception:
        logger.exception("Failed to send email", extra={"to": to_email})
        return False
