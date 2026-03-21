"""P1-A 超时结算诊断脚本 — 直接用后端数据库连接执行诊断 SQL。

使用方法:
  cd d:/aifenxi/backend
  python scripts/diagnose_timeout.py

需要环境变量:
  DATABASE_URL — PostgreSQL 连接字符串（与后端一致）
  
输出: 5 个诊断查询的表格化结果，直接复制发给开发者分析。
"""

import asyncio
import os
import sys

# 加载 .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("❌ 未设置 DATABASE_URL 环境变量")
    print("   请设置后重试，例如:")
    print("   set DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname")
    sys.exit(1)

# 将 asyncpg 转为 psycopg2 同步连接（更简单，无需异步）
sync_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("asyncpg://", "postgresql://")

QUERIES = [
    (
        "查询 1: 结算状态分布（按分析模式）",
        """
        SELECT status, analysis_mode,
               COUNT(*) AS cnt,
               ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY analysis_mode), 2) AS pct
        FROM strategy_snapshots
        WHERE status != 'pending'
        GROUP BY status, analysis_mode
        ORDER BY analysis_mode, status;
        """,
    ),
    (
        "查询 2: 超时结算的平均盈亏",
        """
        SELECT analysis_mode,
               ROUND(AVG(pnl_pct)::numeric, 4) AS avg_timeout_pnl,
               ROUND(STDDEV(pnl_pct)::numeric, 4) AS stddev_timeout_pnl,
               COUNT(*) AS cnt
        FROM strategy_snapshots
        WHERE status = 'timeout'
        GROUP BY analysis_mode;
        """,
    ),
    (
        "查询 3: 各结算方式的平均耗时",
        """
        SELECT analysis_mode, status,
               ROUND(AVG(EXTRACT(EPOCH FROM (settlement_time - created_at)) / 3600)::numeric, 2) AS avg_hours,
               ROUND(MIN(EXTRACT(EPOCH FROM (settlement_time - created_at)) / 3600)::numeric, 2) AS min_hours,
               ROUND(MAX(EXTRACT(EPOCH FROM (settlement_time - created_at)) / 3600)::numeric, 2) AS max_hours
        FROM strategy_snapshots
        WHERE status != 'pending' AND settlement_time IS NOT NULL
        GROUP BY analysis_mode, status
        ORDER BY analysis_mode, status;
        """,
    ),
    (
        "查询 4: Pending 堆积情况",
        """
        SELECT analysis_mode,
               COUNT(*) AS pending_count,
               ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600)::numeric, 2) AS avg_pending_hours,
               ROUND(MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600)::numeric, 2) AS max_pending_hours
        FROM strategy_snapshots
        WHERE status = 'pending'
        GROUP BY analysis_mode;
        """,
    ),
    (
        "查询 5: 近 7 天每日结算概况",
        """
        SELECT DATE(created_at) AS dt,
               analysis_mode,
               COUNT(*) AS total,
               SUM(CASE WHEN status = 'hit_target' THEN 1 ELSE 0 END) AS hits,
               SUM(CASE WHEN status = 'hit_stop_loss' THEN 1 ELSE 0 END) AS stops,
               SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) AS timeouts,
               SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendings
        FROM strategy_snapshots
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at), analysis_mode
        ORDER BY dt DESC, analysis_mode;
        """,
    ),
]


def run_diagnostics():
    try:
        import psycopg2
    except ImportError:
        print("❌ 需要安装 psycopg2: pip install psycopg2-binary")
        sys.exit(1)

    print("=" * 70)
    print("  P1-A 超时结算诊断报告")
    print("=" * 70)
    print(f"  数据库: {sync_url.split('@')[-1] if '@' in sync_url else '***'}")
    print()

    conn = psycopg2.connect(sync_url)
    cur = conn.cursor()

    for title, sql in QUERIES:
        print(f"\n{'─' * 60}")
        print(f"  {title}")
        print(f"{'─' * 60}")
        try:
            cur.execute(sql)
            rows = cur.fetchall()
            if not rows:
                print("  (无数据)")
                continue

            # 获取列名
            col_names = [desc[0] for desc in cur.description]
            
            # 计算列宽
            widths = [len(str(c)) for c in col_names]
            for row in rows:
                for i, val in enumerate(row):
                    widths[i] = max(widths[i], len(str(val)))

            # 打印表头
            header = " | ".join(str(c).ljust(widths[i]) for i, c in enumerate(col_names))
            print(f"  {header}")
            print(f"  {'-+-'.join('-' * w for w in widths)}")

            # 打印数据
            for row in rows:
                line = " | ".join(str(v).ljust(widths[i]) for i, v in enumerate(row))
                print(f"  {line}")

        except Exception as e:
            print(f"  ❌ 查询失败: {e}")

    cur.close()
    conn.close()
    print(f"\n{'=' * 70}")
    print("  诊断完成。请将以上结果发给开发者分析。")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    run_diagnostics()
