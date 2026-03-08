"""数据源开关检查工具 — 采集器在采集前调用，决定是否跳过。

用法:
    from app.data.source_gate import is_enabled

    if not await is_enabled("glassnode"):
        return []
"""

import logging

logger = logging.getLogger(__name__)

# 全局 registry 实例缓存
_registry = None


async def _get_registry():
    global _registry
    if _registry is not None and _registry.is_initialized():
        return _registry
    from app.data.datasource_registry import DataSourceRegistry
    _registry = DataSourceRegistry()
    try:
        await _registry.load_from_config()
    except Exception as exc:
        logger.warning("source_gate: registry load failed, defaulting to enabled", extra={"error": str(exc)})
        return None
    return _registry


async def is_enabled(source_id: str) -> bool:
    """检查指定数据源是否启用。加载失败时默认返回 True（不阻断采集）。"""
    try:
        registry = await _get_registry()
        if registry is None:
            return True
        return await registry.is_source_enabled(source_id)
    except Exception:
        return True
