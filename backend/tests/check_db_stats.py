"""检查 SQLite 数据库各表的行数和基本状态。"""
import sqlite3
import os

db_path = "test.db"
if not os.path.exists(db_path):
    print(f"数据库文件不存在: {db_path}")
    exit(1)

print(f"数据库文件: {db_path} ({os.path.getsize(db_path) / 1024:.1f} KB)")
print()

conn = sqlite3.connect(db_path)
c = conn.cursor()

# 获取所有表
c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in c.fetchall()]

print(f"共 {len(tables)} 张表:\n")
print(f"{'表名':<30} {'行数':>8}  {'备注'}")
print("-" * 60)

for t in tables:
    try:
        c.execute(f"SELECT COUNT(*) FROM [{t}]")
        count = c.fetchone()[0]
        # 获取列信息
        c.execute(f"PRAGMA table_info([{t}])")
        cols = [r[1] for r in c.fetchall()]
        col_summary = ", ".join(cols[:5])
        if len(cols) > 5:
            col_summary += f" ... (+{len(cols)-5})"
        print(f"  {t:<28} {count:>8}  {col_summary}")
    except Exception as e:
        print(f"  {t:<28} {'ERROR':>8}  {e}")

print()

# 检查用户
print("== 用户列表 ==")
c.execute("SELECT id, email, role, is_admin, is_active, membership_level, created_at FROM users ORDER BY created_at")
for r in c.fetchall():
    uid, email, role, is_admin, is_active, level, created = r
    print(f"  {email:<35} role={role:<8} admin={is_admin} active={is_active} level={level} created={created}")

print()

# 检查策略快照
c.execute("SELECT COUNT(*) FROM strategy_snapshots")
ss_count = c.fetchone()[0]
print(f"== 策略快照 == {ss_count} 条")
if ss_count > 0:
    c.execute("SELECT symbol, COUNT(*) FROM strategy_snapshots GROUP BY symbol ORDER BY COUNT(*) DESC LIMIT 10")
    for r in c.fetchall():
        print(f"  {r[0]}: {r[1]} 条")

print()

# 检查共识报告
c.execute("SELECT COUNT(*) FROM consensus_reports")
cr_count = c.fetchone()[0]
print(f"== 共识报告 == {cr_count} 条")
if cr_count > 0:
    c.execute("SELECT symbol, COUNT(*) FROM consensus_reports GROUP BY symbol ORDER BY COUNT(*) DESC LIMIT 10")
    for r in c.fetchall():
        print(f"  {r[0]}: {r[1]} 条")

print()

# 检查系统配置
print("== 系统配置 ==")
c.execute("SELECT config_key, encrypted_value, is_secret FROM system_configs ORDER BY config_key")
for r in c.fetchall():
    val = "***" if r[2] else (r[1][:50] if r[1] else "(empty)")
    print(f"  {r[0]:<40} = {val}")

conn.close()
