"""Check if FRED API key is configured."""
import sqlite3

conn = sqlite3.connect("test.db")
cursor = conn.execute(
    "SELECT config_key, encrypted_value FROM system_configs WHERE config_key LIKE ?",
    ("%fred%",),
)
rows = cursor.fetchall()
for r in rows:
    val = r[1] or ""
    display = val[:20] + "..." if len(val) > 20 else val
    print(f"  {r[0]}: {display}")
if not rows:
    print("  No fred keys in DB")
conn.close()
