"""Runtime verification script for capability-matrix 4-status coverage.

Usage:
    cd backend
    python scripts/verify_capability_matrix.py
"""

import asyncio
import json
import sys
import os

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# 确保 backend 目录在 sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def main() -> None:
    from app.core.redis import init_redis, close_redis
    from app.core.capability_state import (
        CapabilityStatus,
        get_all_capabilities,
        set_capability_status,
    )

    print("=" * 60)
    print("Capability-Matrix Runtime Verification")
    print("=" * 60)

    # ── 初始化 Redis ──
    await init_redis()
    print("\n[INIT] Redis connected\n")

    # ── 场景 1: 静态回退 — cg_oi / cg_fr 应为 UNAVAILABLE ──
    print("-- Scenario 1: Static defaults (no Redis override) --")
    caps_before = await get_all_capabilities()
    for cap in ("cg_oi", "cg_fr"):
        s = caps_before.get(cap, {})
        status_val = s.get("status", "MISSING")
        ok = status_val == "unavailable"
        mark = "[PASS]" if ok else "[FAIL] EXPECTED unavailable"
        print(f"  {cap}: status={status_val}, reason={s.get('reason', '')}  {mark}")

    # ── 场景 2: 写入 TIER_LIMITED ──
    print("\n-- Scenario 2: Write TIER_LIMITED --")
    await set_capability_status(
        "cg_net_position",
        CapabilityStatus.TIER_LIMITED,
        reason="net-position not available for hobbyist",
    )
    caps = await get_all_capabilities()
    s = caps.get("cg_net_position", {})
    ok = s.get("status") == "tier-limited"
    mark = "[PASS]" if ok else "[FAIL] EXPECTED tier-limited"
    print(f"  cg_net_position: status={s.get('status')}, reason={s.get('reason')}  {mark}")

    # ── 场景 3: 写入 DISABLED ──
    print("\n-- Scenario 3: Write DISABLED --")
    await set_capability_status(
        "cg_cvd",
        CapabilityStatus.DISABLED,
        reason="datasource disabled by admin",
    )
    caps = await get_all_capabilities()
    s = caps.get("cg_cvd", {})
    ok = s.get("status") == "disabled"
    mark = "[PASS]" if ok else "[FAIL] EXPECTED disabled"
    print(f"  cg_cvd: status={s.get('status')}, reason={s.get('reason')}  {mark}")

    # ── 场景 4: 写入 AVAILABLE ──
    print("\n-- Scenario 4: Write AVAILABLE --")
    await set_capability_status(
        "cg_orderbook",
        CapabilityStatus.AVAILABLE,
        reason="",
    )
    caps = await get_all_capabilities()
    s = caps.get("cg_orderbook", {})
    ok = s.get("status") == "available"
    mark = "[PASS]" if ok else "[FAIL] EXPECTED available"
    print(f"  cg_orderbook: status={s.get('status')}, reason={s.get('reason')}  {mark}")

    # ── 写入 UNAVAILABLE (V4-removed) ──
    print("\n-- Scenario 5: Write V4-removed UNAVAILABLE --")
    await set_capability_status(
        "cg_oi",
        CapabilityStatus.UNAVAILABLE,
        reason="V4 API removed oi-ohlc-history",
    )
    caps = await get_all_capabilities()
    s = caps.get("cg_oi", {})
    ok = s.get("status") == "unavailable"
    mark = "[PASS]" if ok else "[FAIL] EXPECTED unavailable"
    print(f"  cg_oi: status={s.get('status')}, reason={s.get('reason')}  {mark}")

    # ── 完整矩阵输出 ──
    print("\n-- Full capability-matrix JSON --")
    final = await get_all_capabilities()
    print(json.dumps({"capabilities": final}, indent=2, ensure_ascii=False))

    # ── 汇总 ──
    status_counts: dict[str, int] = {}
    for cap_info in final.values():
        st = cap_info.get("status", "unknown")
        status_counts[st] = status_counts.get(st, 0) + 1

    print("\n-- Status Summary --")
    for st, cnt in sorted(status_counts.items()):
        print(f"  {st}: {cnt}")

    covered = {"available", "unavailable", "disabled", "tier-limited"}
    found = set(status_counts.keys())
    missing = covered - found
    if missing:
        print(f"\n[FAIL] Missing status coverage: {missing}")
    else:
        print(f"\n[PASS] All 4 statuses covered")

    # ── 清理测试写入（恢复到静态默认值语义） ──
    from app.core.redis import get_redis_pool
    redis = get_redis_pool()
    for test_cap in ("cg_net_position", "cg_cvd", "cg_orderbook", "cg_oi"):
        await redis.hdel("capability:state", test_cap)
    print("\n[CLEANUP] Test writes cleaned up")

    await close_redis()
    print("[DONE] Verification complete\n")


if __name__ == "__main__":
    asyncio.run(main())
