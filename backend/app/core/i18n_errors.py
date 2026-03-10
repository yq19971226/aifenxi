"""后端错误消息国际化

提供多语言错误消息映射和辅助函数，配合 i18n_middleware.py 使用。
错误消息按 error_key 索引，支持 zh-CN / zh-TW / en 三种语言。

用法:
    from app.core.i18n_errors import get_error_message, localized_http_exception
    # 方式1: 获取本地化消息
    msg = get_error_message("auth.login_failed", locale)
    raise HTTPException(status_code=401, detail=msg)

    # 方式2: 直接抛出本地化异常
    raise localized_http_exception(401, "auth.login_failed", locale)
"""

import logging
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ── 错误消息字典 ─────────────────────────────────────────────

_ERROR_MESSAGES: dict[str, dict[str, str]] = {
    # ── 认证 ──
    "auth.login_failed": {
        "zh-CN": "登录失败，请检查用户名和密码",
        "zh-TW": "登入失敗，請檢查使用者名稱和密碼",
        "en": "Login failed, please check username and password",
    },
    "auth.session_expired": {
        "zh-CN": "会话已过期，请重新登录",
        "zh-TW": "工作階段已過期，請重新登入",
        "en": "Session expired, please login again",
    },
    "auth.token_invalid": {
        "zh-CN": "令牌无效",
        "zh-TW": "令牌無效",
        "en": "Invalid token",
    },
    "auth.permission_denied": {
        "zh-CN": "权限不足",
        "zh-TW": "權限不足",
        "en": "Permission denied",
    },
    "auth.unauthorized": {
        "zh-CN": "未授权，请先登录",
        "zh-TW": "未授權，請先登入",
        "en": "Unauthorized, please login",
    },
    "auth.reset_code_invalid": {
        "zh-CN": "验证码无效或已过期",
        "zh-TW": "驗證碼無效或已過期",
        "en": "The verification code is invalid or has expired",
    },
    "auth.register_code_invalid": {
        "zh-CN": "注册验证码无效或已过期",
        "zh-TW": "註冊驗證碼無效或已過期",
        "en": "The registration code is invalid or has expired",
    },
    "auth.register_code_cooldown": {
        "zh-CN": "验证码已发送，请 {seconds} 秒后重试",
        "zh-TW": "驗證碼已發送，請 {seconds} 秒後重試",
        "en": "Verification code already sent. Please retry in {seconds} seconds.",
    },
    "auth.register_code_email_rate_limited": {
        "zh-CN": "该邮箱请求过于频繁，请 {seconds} 秒后重试",
        "zh-TW": "此信箱請求過於頻繁，請 {seconds} 秒後重試",
        "en": "Too many requests for this email. Please retry in {seconds} seconds.",
    },
    "auth.register_code_too_many_attempts": {
        "zh-CN": "验证码错误次数过多，请重新获取验证码",
        "zh-TW": "驗證碼錯誤次數過多，請重新取得驗證碼",
        "en": "Too many incorrect attempts. Please request a new verification code.",
    },
    "auth.registration_disabled": {
        "zh-CN": "当前已关闭新用户注册",
        "zh-TW": "目前已關閉新用戶註冊",
        "en": "New user registration is currently disabled",
    },
    "auth.email_already_registered": {
        "zh-CN": "该邮箱已注册",
        "zh-TW": "此信箱已註冊",
        "en": "This email is already registered",
    },
    "auth.user_not_found_or_disabled": {
        "zh-CN": "用户不存在或已停用",
        "zh-TW": "使用者不存在或已停用",
        "en": "User does not exist or has been disabled",
    },

    # ── 通用 HTTP ──
    "http.bad_request": {
        "zh-CN": "请求参数错误",
        "zh-TW": "請求參數錯誤",
        "en": "Bad request",
    },
    "http.not_found": {
        "zh-CN": "请求的资源不存在",
        "zh-TW": "請求的資源不存在",
        "en": "Resource not found",
    },
    "http.rate_limited": {
        "zh-CN": "请求过于频繁，请稍后再试",
        "zh-TW": "請求過於頻繁，請稍後再試",
        "en": "Too many requests, please try again later",
    },
    "http.server_error": {
        "zh-CN": "服务器内部错误",
        "zh-TW": "伺服器內部錯誤",
        "en": "Internal server error",
    },

    # ── 数据 ──
    "data.fetch_failed": {
        "zh-CN": "获取数据失败",
        "zh-TW": "取得資料失敗",
        "en": "Failed to fetch data",
    },
    "data.parse_error": {
        "zh-CN": "数据解析失败",
        "zh-TW": "資料解析失敗",
        "en": "Data parsing failed",
    },
    "data.not_available": {
        "zh-CN": "数据暂不可用",
        "zh-TW": "資料暫不可用",
        "en": "Data not available",
    },
    "data.save_failed": {
        "zh-CN": "保存失败",
        "zh-TW": "儲存失敗",
        "en": "Save failed",
    },

    # ── 交易对 ──
    "symbol.list_failed": {
        "zh-CN": "获取交易对列表失败",
        "zh-TW": "取得交易對列表失敗",
        "en": "Failed to fetch symbol list",
    },
    "symbol.add_failed": {
        "zh-CN": "添加交易对失败",
        "zh-TW": "新增交易對失敗",
        "en": "Failed to add symbol",
    },
    "symbol.update_failed": {
        "zh-CN": "更新交易对失败",
        "zh-TW": "更新交易對失敗",
        "en": "Failed to update symbol",
    },
    "symbol.delete_failed": {
        "zh-CN": "删除交易对失败",
        "zh-TW": "刪除交易對失敗",
        "en": "Failed to delete symbol",
    },
    "symbol.not_found": {
        "zh-CN": "交易对不存在或已禁用",
        "zh-TW": "交易對不存在或已停用",
        "en": "Symbol not found or disabled",
    },

    # ── 策略 ──
    "strategy.not_found": {
        "zh-CN": "未找到策略",
        "zh-TW": "未找到策略",
        "en": "Strategy not found",
    },
    "strategy.query_failed": {
        "zh-CN": "查询策略失败",
        "zh-TW": "查詢策略失敗",
        "en": "Failed to query strategy",
    },

    # ── 推送 ──
    "push.get_settings_failed": {
        "zh-CN": "获取推送设置失败",
        "zh-TW": "取得推送設置失敗",
        "en": "Failed to get push settings",
    },
    "push.update_settings_failed": {
        "zh-CN": "更新推送设置失败",
        "zh-TW": "更新推送設置失敗",
        "en": "Failed to update push settings",
    },
    "push.test_failed": {
        "zh-CN": "测试推送失败",
        "zh-TW": "測試推送失敗",
        "en": "Test push failed",
    },

    # ── 分析 ──
    "analysis.failed": {
        "zh-CN": "分析执行失败",
        "zh-TW": "分析執行失敗",
        "en": "Analysis execution failed",
    },
    "analysis.quota_exceeded": {
        "zh-CN": "分析配额已用完",
        "zh-TW": "分析配額已用完",
        "en": "Analysis quota exceeded",
    },

    # ── 剧本 ──
    "playbook.sim_failed": {
        "zh-CN": "剧本演练失败",
        "zh-TW": "劇本演練失敗",
        "en": "Playbook simulation failed",
    },
    "playbook.query_failed": {
        "zh-CN": "剧本查询失败",
        "zh-TW": "劇本查詢失敗",
        "en": "Playbook query failed",
    },

    # ── 情绪 ──
    "sentiment.fetch_failed": {
        "zh-CN": "获取情绪数据失败",
        "zh-TW": "取得情緒資料失敗",
        "en": "Failed to fetch sentiment data",
    },
    "sentiment.not_available": {
        "zh-CN": "恐贪指数数据暂不可用",
        "zh-TW": "恐貪指數資料暫不可用",
        "en": "Fear & Greed index data not available",
    },

    # ── 任务 ──
    "task.disabled": {
        "zh-CN": "任务中心功能暂未开放",
        "zh-TW": "任務中心功能暫未開放",
        "en": "Task center is not available yet",
    },
    "task.no_update_fields": {
        "zh-CN": "至少提供一个更新字段",
        "zh-TW": "至少提供一個更新欄位",
        "en": "At least one field to update is required",
    },

    # ── 表单 ──
    "form.submit_failed": {
        "zh-CN": "提交失败，请重试",
        "zh-TW": "提交失敗，請重試",
        "en": "Submit failed, please retry",
    },
    "form.invalid_data": {
        "zh-CN": "数据格式不正确",
        "zh-TW": "資料格式不正確",
        "en": "Invalid data format",
    },
}


# ── 公共 API ──────────────────────────────────────────────────


def get_error_message(
    error_key: str,
    locale: str = "zh-CN",
    **kwargs: Any,
) -> str:
    """获取本地化错误消息。

    Args:
        error_key: 错误键，如 "auth.login_failed"
        locale: 语言代码
        **kwargs: 消息模板变量（如 symbol=BTCUSDT）

    Returns:
        本地化的错误消息字符串
    """
    messages = _ERROR_MESSAGES.get(error_key)
    if not messages:
        logger.warning("Unknown error key: %s", error_key)
        return error_key

    # 语言降级
    msg = messages.get(locale)
    if msg is None and locale.startswith("zh"):
        msg = messages.get("zh-CN")
    if msg is None:
        msg = messages.get("en", error_key)

    # 模板变量替换
    if kwargs:
        try:
            msg = msg.format(**kwargs)
        except (KeyError, IndexError):
            pass

    return msg


def localized_http_exception(
    status_code: int,
    error_key: str,
    locale: str = "zh-CN",
    **kwargs: Any,
) -> HTTPException:
    """创建本地化的 HTTPException。

    Args:
        status_code: HTTP 状态码
        error_key: 错误键
        locale: 语言代码
        **kwargs: 消息模板变量

    Returns:
        HTTPException 实例
    """
    detail = get_error_message(error_key, locale, **kwargs)
    return HTTPException(status_code=status_code, detail=detail)
