---
description: CoinGlass endpoint 新增/变更时的同步检查清单
---

# CoinGlass Endpoint 变更同步清单

新增、移除或修改 CoinGlass API endpoint 时，**必须同步修改以下 4 处**，缺一不可。
回归测试 `tests/test_capability_state.py` 会在任一处遗漏时报错。

## 1. `backend/app/data/coinglass_tier.py`

- 新增 real V4 endpoint → 加入对应 tier 的 `_STARTUP_EXTRA_ENDPOINTS` 或 `_STANDARD_EXTRA_ENDPOINTS`
- 移除 endpoint → 从 tier matrix 中删除
- V4 已移除的 endpoint **不应**出现在任何 tier 集合中

## 2. `backend/workers/coinglass_worker.py`

- `_CAP_ENDPOINTS`: capability → endpoint 映射
  - 新增 capability 时添加映射
  - endpoint 名必须与 `coinglass_tier.py` 中一致
- `_V4_REMOVED_ENDPOINTS`: V4 已移除的 endpoint
  - 确认移除的 endpoint 加入此集合
  - 确保不在 tier matrix 中

## 3. `backend/app/core/capability_state.py`

- `_CAPABILITY_REGISTRY`: 静态注册表
  - 新增 capability 时添加条目（默认 `AVAILABLE`）
  - V4 已移除的 capability 标记为 `UNAVAILABLE` + reason
  - 无写入端的 capability 标记为 `UNAVAILABLE` + reason

## 4. `.kiro/specs/project-deep-audit-2026-03/design.md` Appendix B

- 更新 Redis 能力矩阵表格
- 确保 Static Default / Runtime Status / Tier Gate / Note 列准确

## 验证

```bash
cd backend
# 回归测试（6 项，覆盖对齐一致性）
python -m pytest tests/test_capability_state.py -v

# 运行时验收（需 Redis）
python scripts/verify_capability_matrix.py
```
