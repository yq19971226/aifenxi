"""AI 输出语言检测 — 基于字符集统计判断文本主要语言。

支持检测：zh-CN（简体中文）、zh-TW（繁体中文）、en（英文）。
用于验证 AI Agent 输出语言是否与请求的 locale 一致。
"""

import logging
import re

logger = logging.getLogger(__name__)

# 繁体中文特征字（高频繁体独有字）
_TRADITIONAL_CHARS = set(
    "們個這說來後會對點開學機從現發過還進麼問書時體長處動實區們話請義質讓關點點報導際鏈圖體備環節際養製證據學導標處聯線類勝觀費視結論監護歐歷選認經語議審險題線衛論圍檢範藝與競間對類節營產設調買賣職義備應長機關據學標質處線類結際費視論監護歷選認經議險題間對營產設調買賣職"
)

# CJK 统一汉字范围
_CJK_PATTERN = re.compile(r"[\u4e00-\u9fff]")
# 基本拉丁字母
_LATIN_PATTERN = re.compile(r"[a-zA-Z]")


def detect_content_language(text: str) -> str:
    """检测文本的主要语言。

    Args:
        text: 待检测的文本内容

    Returns:
        语言代码: "zh-CN" | "zh-TW" | "en"
        无法判断时返回 "en" 作为默认值
    """
    if not text or not text.strip():
        return "en"

    # 统计字符类型
    cjk_chars = _CJK_PATTERN.findall(text)
    latin_chars = _LATIN_PATTERN.findall(text)

    cjk_count = len(cjk_chars)
    latin_count = len(latin_chars)

    # 无有效字符
    if cjk_count == 0 and latin_count == 0:
        return "en"

    # 以 CJK 字符为主 → 中文
    if cjk_count > latin_count * 0.3:
        # 区分简繁体：检测繁体特征字占比
        traditional_count = sum(1 for c in cjk_chars if c in _TRADITIONAL_CHARS)
        if cjk_count > 0 and traditional_count / cjk_count > 0.15:
            return "zh-TW"
        return "zh-CN"

    return "en"


def check_language_mismatch(
    text: str,
    expected_locale: str,
) -> tuple[str, bool]:
    """检测文本语言并判断是否与期望语言不匹配。

    Args:
        text: AI 输出的文本
        expected_locale: 请求时指定的目标语言

    Returns:
        (detected_locale, is_mismatch) 元组
    """
    detected = detect_content_language(text)
    # zh-CN 和 zh-TW 视为同一语系，不算 mismatch
    if expected_locale.startswith("zh") and detected.startswith("zh"):
        return detected, False
    is_mismatch = detected != expected_locale
    if is_mismatch:
        logger.warning(
            "AI output language mismatch: expected=%s, detected=%s",
            expected_locale,
            detected,
        )
    return detected, is_mismatch
