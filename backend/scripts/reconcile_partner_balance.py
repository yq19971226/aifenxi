"""合伙人余额对账脚本 — 比对 Redis 余额与 DB 理论余额，发现不一致时告警。

理论余额 = SUM(confirmed commissions) - SUM(completed withdrawals) - SUM(pending/frozen withdrawals)

用法:
    python -m scripts.reconcile_partner_balance          # 仅检查，打印不一致
    python -m scripts.reconcile_partner_balance --fix    # 检查并修复 Redis 余额
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.core.redis import init_redis, close_redis, get_redis_pool


async def reconcile(fix: bool = False) -> int:
    await init_redis()
    redis = get_redis_pool()
    mismatches = 0

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(
                """
                SELECT
                    u.id AS user_id,
                    u.email,
                    COALESCE(c.total_earned, 0) AS total_earned,
                    COALESCE(w_done.total_withdrawn, 0) AS total_withdrawn,
                    COALESCE(w_pending.total_frozen, 0) AS total_frozen
                FROM users u
                LEFT JOIN (
                    SELECT partner_id, SUM(commission_amount) AS total_earned
                    FROM commissions WHERE status != 'cancelled'
                    GROUP BY partner_id
                ) c ON c.partner_id = u.id
                LEFT JOIN (
                    SELECT user_id, SUM(amount) AS total_withdrawn
                    FROM withdrawals WHERE status = 'completed'
                    GROUP BY user_id
                ) w_done ON w_done.user_id = u.id
                LEFT JOIN (
                    SELECT user_id, SUM(amount) AS total_frozen
                    FROM withdrawals WHERE status = 'pending'
                    GROUP BY user_id
                ) w_pending ON w_pending.user_id = u.id
                WHERE u.referral_code IS NOT NULL
                  AND (COALESCE(c.total_earned, 0) > 0
                       OR COALESCE(w_done.total_withdrawn, 0) > 0
                       OR COALESCE(w_pending.total_frozen, 0) > 0)
                """
            )
        )
        rows = result.mappings().all()

    for row in rows:
        uid = str(row["user_id"])
        expected_balance = float(row["total_earned"]) - float(row["total_withdrawn"]) - float(row["total_frozen"])
        expected_frozen = float(row["total_frozen"])

        raw_balance = await redis.get(f"partner_balance:{uid}")
        raw_frozen = await redis.get(f"partner_frozen:{uid}")
        redis_balance = float(raw_balance or "0")
        redis_frozen = float(raw_frozen or "0")

        balance_diff = abs(redis_balance - expected_balance)
        frozen_diff = abs(redis_frozen - expected_frozen)

        if balance_diff > 0.01 or frozen_diff > 0.01:
            mismatches += 1
            print(
                f"[MISMATCH] {row['email']} ({uid[:8]}...)\n"
                f"  balance: Redis={redis_balance:.2f}  DB={expected_balance:.2f}  diff={balance_diff:.2f}\n"
                f"  frozen:  Redis={redis_frozen:.2f}  DB={expected_frozen:.2f}  diff={frozen_diff:.2f}"
            )
            if fix:
                await redis.set(f"partner_balance:{uid}", str(round(expected_balance, 2)))
                await redis.set(f"partner_frozen:{uid}", str(round(expected_frozen, 2)))
                print(f"  -> FIXED: balance={expected_balance:.2f}, frozen={expected_frozen:.2f}")

    if mismatches == 0:
        print(f"[OK] All {len(rows)} partner balances match.")
    else:
        print(f"\n[SUMMARY] {mismatches}/{len(rows)} partners have balance mismatches.")

    await close_redis()
    return mismatches


def main():
    parser = argparse.ArgumentParser(description="合伙人余额对账")
    parser.add_argument("--fix", action="store_true", help="自动修复 Redis 余额为 DB 理论值")
    args = parser.parse_args()
    mismatches = asyncio.run(reconcile(fix=args.fix))
    sys.exit(1 if mismatches > 0 and not args.fix else 0)


if __name__ == "__main__":
    main()
