import sqlite3
conn = sqlite3.connect("test.db")
c = conn.cursor()
c.execute("UPDATE users SET is_admin=1, role='admin' WHERE email='test_admin@axiom.dev'")
print(f"Updated {c.rowcount} rows")
conn.commit()
conn.close()
