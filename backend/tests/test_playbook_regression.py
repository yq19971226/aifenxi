"""剧本功能闭环回归测试 — 验证本次修复的 7 个问题。"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import httpx

API = "http://127.0.0.1:8010"
results = []

def log(name, ok, detail=""):
    tag = "[OK]" if ok else "[FAIL]"
    results.append({"name": name, "ok": ok, "detail": detail})
    print(f"  {tag} {name}" + (f"  -- {detail}" if detail else ""))

# ── Login ──
print("\n=== 剧本闭环回归测试 ===\n")

# 登录获取 token
try:
    r = httpx.post(f"{API}/api/auth/login", data={
        "username": "test_admin@axiom.dev", "password": "TestAdmin2025!"
    }, timeout=10)
    if r.status_code != 200:
        r = httpx.post(f"{API}/api/auth/login", data={
            "username": "test_user@axiom.dev", "password": "TestUser2025!"
        }, timeout=10)
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    log("Login", True, f"token obtained")
except Exception as e:
    print(f"  [FATAL] 无法登录: {e}")
    sys.exit(1)

# ── T1: Playbook Simulate ──
print("\n-- T1: Playbook Simulate --")
try:
    r = httpx.get(f"{API}/api/playbook-sim/simulate/BTCUSDT", headers=h, timeout=60)
    data = r.json()
    has_matches = bool(data.get("top_matches"))
    has_phase = bool(data.get("current_phase"))
    match_pct = data["top_matches"][0]["match_pct"] if has_matches else 0
    log("simulate 返回 200", r.status_code == 200, f"status={r.status_code}")
    log("top_matches 非空", has_matches, f"count={len(data.get('top_matches', []))}")
    log("current_phase 非空", has_phase, f"phase={data.get('current_phase')}")
    log("match_pct > 0 (phase fallback 生效)", match_pct > 0, f"match_pct={match_pct}")
except Exception as e:
    log("simulate 请求", False, str(e))

# ── T2: Playbook Latest ──
print("\n-- T2: Playbook Latest --")
try:
    r = httpx.get(f"{API}/api/playbook/latest/BTCUSDT", headers=h, timeout=60)
    if r.status_code == 200:
        data = r.json()
        log("latest 返回 200", True, f"playbook={data.get('matched_playbook')}")
        log("has counter_strategy", bool(data.get("counter_strategy")))
    elif r.status_code == 404:
        log("latest 返回 404 (无数据)", True, "暂无数据，预期行为")
    else:
        log("latest 返回", False, f"status={r.status_code} body={r.text[:200]}")
except Exception as e:
    log("latest 请求", False, str(e))

# ── T3: Phase History (ts 字段) ──
print("\n-- T3: Phase History --")
try:
    r = httpx.get(f"{API}/api/playbook/phase-history/BTCUSDT", headers=h, timeout=15)
    if r.status_code == 200:
        data = r.json()
        transitions = data.get("transitions", [])
        log("phase-history 返回 200", True, f"transitions={len(transitions)}")
        if transitions:
            first = transitions[0]
            has_ts = "ts" in first
            log("transitions[0] 有 ts 字段", has_ts, f"keys={list(first.keys())}")
        else:
            log("transitions 为空 (新环境预期)", True, "无历史转换数据")
    elif r.status_code == 404:
        log("phase-history 返回 404 (无阶段数据)", True, "新环境预期")
    else:
        log("phase-history 返回", False, f"status={r.status_code}")
except Exception as e:
    log("phase-history 请求", False, str(e))

# ── T4: Counter Strategy ──
print("\n-- T4: Counter Strategy --")
try:
    r = httpx.get(f"{API}/api/playbook/counter-strategy/BTCUSDT", headers=h, timeout=60)
    if r.status_code == 200:
        data = r.json()
        log("counter-strategy 返回 200", True)
        log("has counter_strategy obj", bool(data.get("counter_strategy")))
    elif r.status_code == 404:
        log("counter-strategy 返回 404", True, "无数据，预期行为")
    else:
        log("counter-strategy", False, f"status={r.status_code}")
except Exception as e:
    log("counter-strategy 请求", False, str(e))

# ── T5: Plaza Feed (created_at 兼容) ──
print("\n-- T5: Plaza Feed --")
try:
    r = httpx.get(f"{API}/api/playbook-sim/plaza/feed?page=1&page_size=10", headers=h, timeout=15)
    data = r.json()
    log("plaza/feed 返回 200", r.status_code == 200, f"total={data.get('total')}")
    # 如果有 items，检查 created_at 格式
    items = data.get("items", [])
    if items:
        ca = items[0].get("created_at")
        log("created_at 格式正常", ca is not None and isinstance(ca, str), f"value={ca}")
    else:
        log("plaza 暂无已发布记录", True, "预期行为")
except Exception as e:
    log("plaza/feed 请求", False, str(e))

# ── T6: Plaza Stats ──
print("\n-- T6: Plaza Stats --")
try:
    r = httpx.get(f"{API}/api/playbook-sim/plaza/stats", headers=h, timeout=15)
    data = r.json()
    log("plaza/stats 返回 200", r.status_code == 200, f"total={data.get('total_predictions')}")
except Exception as e:
    log("plaza/stats 请求", False, str(e))

# ── T7: Admin Predictions List ──
print("\n-- T7: Admin Predictions --")
try:
    r = httpx.get(f"{API}/api/admin/playbook-sim/predictions?page=1&page_size=5", headers=h, timeout=15)
    if r.status_code == 200:
        data = r.json()
        log("admin predictions 返回 200", True, f"total={data.get('total')}")
        items = data.get("items", [])
        if items:
            ca = items[0].get("created_at")
            log("admin created_at 格式正常", isinstance(ca, str), f"value={ca}")
    elif r.status_code == 403:
        log("admin predictions 需管理员权限", True, "非管理员预期 403")
    else:
        log("admin predictions", False, f"status={r.status_code} body={r.text[:200]}")
except Exception as e:
    log("admin predictions 请求", False, str(e))

# ── Summary ──
print("\n" + "=" * 50)
passed = sum(1 for r in results if r["ok"])
failed = sum(1 for r in results if not r["ok"])
total = len(results)
print(f"  结果: {passed}/{total} 通过, {failed} 失败")
if failed:
    print("  失败项:")
    for r in results:
        if not r["ok"]:
            print(f"    - {r['name']}: {r['detail']}")
print("=" * 50)
