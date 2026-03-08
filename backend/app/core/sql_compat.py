"""SQL 兼容层 — 让同一份代码同时兼容 PostgreSQL 和 SQLite。

用法:
    from app.core.sql_compat import is_sqlite, age_filter, cast_int, count_filter
    from app.core.sql_compat import insert_returning, update_returning

PostgreSQL 特有语法对照:
    COUNT(*)::int           → cast_int("COUNT(*)")
    FILTER (WHERE cond)     → count_filter("pnl_pct > 0")
    NOW() - MAKE_INTERVAL(days => :days) → age_filter("created_at", ":days", "day")
    INSERT ... RETURNING    → insert_returning(session, sql, params, table=..., id_col=...)
    UPDATE ... RETURNING    → update_returning(session, sql, params, table=..., where=...)
"""

from sqlalchemy import text as _sa_text

from app.core.config import settings

is_sqlite: bool = settings.database_url.startswith("sqlite")


# ── RETURNING 兼容辅助 ────────────────────────────────────────


async def insert_returning(session, sql: str, params: dict, *,
                           table: str, id_col: str = "id"):
    """INSERT ... RETURNING 兼容 PostgreSQL 和 SQLite。

    PostgreSQL: 直接执行带 RETURNING 的 SQL。
    SQLite: 去掉 RETURNING 子句，执行 INSERT，再用 last_insert_rowid() SELECT 返回行。

    Args:
        session: AsyncSession
        sql: 完整 INSERT SQL（含 RETURNING 子句）
        params: 绑定参数
        table: 表名（SQLite 回退 SELECT 用）
        id_col: 主键列名（默认 "id"）

    Returns:
        与 session.execute() 相同的 Result 对象
    """
    if not is_sqlite:
        return await session.execute(_sa_text(sql), params)

    parts = sql.split("RETURNING", 1)
    bare_sql = parts[0].strip()
    ret_cols = parts[1].strip() if len(parts) > 1 else "*"

    await session.execute(_sa_text(bare_sql), params)
    rid = await session.execute(_sa_text("SELECT last_insert_rowid()"))
    new_rowid = rid.scalar()
    return await session.execute(
        _sa_text(f"SELECT {ret_cols} FROM {table} WHERE rowid = :_compat_rowid"),
        {"_compat_rowid": new_rowid},
    )


async def update_returning(session, sql: str, params: dict, *,
                           table: str, where: str):
    """UPDATE ... RETURNING 兼容 PostgreSQL 和 SQLite。

    PostgreSQL: 直接执行带 RETURNING 的 SQL。
    SQLite: 去掉 RETURNING 子句，执行 UPDATE，再用相同 WHERE 条件 SELECT 返回行。

    Args:
        session: AsyncSession
        sql: 完整 UPDATE SQL（含 RETURNING 子句）
        params: 绑定参数
        table: 表名（SQLite 回退 SELECT 用）
        where: WHERE 条件（不含 WHERE 关键字），使用与原 SQL 相同的绑定参数

    Returns:
        与 session.execute() 相同的 Result 对象
    """
    if not is_sqlite:
        return await session.execute(_sa_text(sql), params)

    parts = sql.split("RETURNING", 1)
    bare_sql = parts[0].strip()
    ret_cols = parts[1].strip() if len(parts) > 1 else "*"

    await session.execute(_sa_text(bare_sql), params)
    return await session.execute(
        _sa_text(f"SELECT {ret_cols} FROM {table} WHERE {where}"),
        params,
    )


def cast_int(expr: str) -> str:
    """PostgreSQL `expr::int` → SQLite `CAST(expr AS INTEGER)`."""
    if is_sqlite:
        return f"CAST({expr} AS INTEGER)"
    return f"({expr})::int"


def count_filter(condition: str) -> str:
    """PostgreSQL `COUNT(*) FILTER (WHERE cond)` → SQLite `SUM(CASE WHEN cond THEN 1 ELSE 0 END)`."""
    if is_sqlite:
        return f"SUM(CASE WHEN {condition} THEN 1 ELSE 0 END)"
    return f"COUNT(*) FILTER (WHERE {condition})"


def avg_filter(expr: str, condition: str) -> str:
    """PostgreSQL `AVG(expr) FILTER (WHERE cond)` → SQLite equivalent."""
    if is_sqlite:
        return f"AVG(CASE WHEN {condition} THEN {expr} ELSE NULL END)"
    return f"AVG({expr}) FILTER (WHERE {condition})"


def sum_filter(expr: str, condition: str) -> str:
    """PostgreSQL `SUM(expr) FILTER (WHERE cond)` → SQLite equivalent."""
    if is_sqlite:
        return f"SUM(CASE WHEN {condition} THEN {expr} ELSE 0 END)"
    return f"SUM({expr}) FILTER (WHERE {condition})"


def age_filter(column: str, param: str, unit: str = "day") -> str:
    """PostgreSQL `column >= NOW() - MAKE_INTERVAL(days => :param)`
    → SQLite `column >= datetime('now', '-' || :param || ' days')`.
    """
    if is_sqlite:
        return f"{column} >= datetime('now', '-' || {param} || ' {unit}s')"
    return f"{column} >= NOW() - MAKE_INTERVAL({unit}s => {param})"


def date_trunc(column: str) -> str:
    """PostgreSQL `DATE(column)` — works on both, but just in case."""
    return f"DATE({column})"


def cast_bigint(expr: str) -> str:
    """PostgreSQL `expr::bigint` → SQLite `CAST(expr AS INTEGER)`."""
    if is_sqlite:
        return f"CAST({expr} AS INTEGER)"
    return f"({expr})::bigint"


def now_minus_interval(value: str, unit: str = "hours") -> str:
    """PostgreSQL `NOW() - INTERVAL ':value hours'`
    → SQLite `datetime('now', '-:value hours')`.

    *value* can be a literal like ``'4'`` or a bind-parameter like ``:days``.
    """
    if is_sqlite:
        return f"datetime('now', '-' || {value} || ' {unit}')"
    return f"NOW() - INTERVAL '{value} {unit}'"


def now_minus_interval_literal(value: int, unit: str = "hours") -> str:
    """Same as now_minus_interval but for hard-coded integer literals.

    E.g. ``NOW() - INTERVAL '4 hours'`` → ``datetime('now', '-4 hours')``.
    """
    if is_sqlite:
        return f"datetime('now', '-{value} {unit}')"
    return f"NOW() - INTERVAL '{value} {unit}'"


def interval_add(column: str, value: int, unit: str = "hours") -> str:
    """PostgreSQL ``column + INTERVAL '24 hours'``
    → SQLite ``datetime(column, '+24 hours')``.
    """
    if is_sqlite:
        return f"datetime({column}, '+{value} {unit}')"
    return f"{column} + INTERVAL '{value} {unit}'"


def interval_sub(column: str, value: int, unit: str = "hours") -> str:
    """PostgreSQL ``column - INTERVAL '1 hour'``
    → SQLite ``datetime(column, '-1 hours')``.
    """
    if is_sqlite:
        return f"datetime({column}, '-{value} {unit}')"
    return f"{column} - INTERVAL '{value} {unit}'"


def now_func() -> str:
    """PostgreSQL ``NOW()`` → SQLite ``datetime('now')``."""
    if is_sqlite:
        return "datetime('now')"
    return "NOW()"


def jsonb_cast(param: str) -> str:
    """PostgreSQL ``:param::jsonb`` → SQLite just ``:param`` (stored as TEXT)."""
    if is_sqlite:
        return param
    return f"{param}::jsonb"


def jsonb_func_cast(param: str) -> str:
    """PostgreSQL ``CAST(:param AS jsonb)`` → SQLite just ``:param``."""
    if is_sqlite:
        return param
    return f"CAST({param} AS jsonb)"


def jsonb_contains(column: str, param: str) -> str:
    """PostgreSQL ``column @> :param::jsonb``
    → SQLite ``instr(column, :search_str) > 0`` (simplified JSON contains).

    NOTE: The caller must pass a *scalar search value* (e.g. event type string)
    as an extra bind parameter named by *param* + ``_search`` for the SQLite path.
    For PostgreSQL the original jsonb array containment semantics are used.
    """
    if is_sqlite:
        # In SQLite, events are stored as plain text JSON arrays.
        # Use instr() for a basic substring check.  Callers should also pass
        # the bare event key string as :param value.
        return f"instr({column}, {param}) > 0"
    return f"{column} @> {param}::jsonb"


# ── DDL helpers ──────────────────────────────────────────────


def serial_pk() -> str:
    """Primary key with auto-increment: PG ``SERIAL`` → SQLite ``INTEGER``."""
    if is_sqlite:
        return "INTEGER PRIMARY KEY AUTOINCREMENT"
    return "SERIAL PRIMARY KEY"


def timestamptz_default() -> str:
    """Column type + default for timestamps."""
    if is_sqlite:
        return "TEXT DEFAULT (datetime('now'))"
    return "TIMESTAMPTZ DEFAULT NOW()"


def varchar(length: int) -> str:
    """PG ``VARCHAR(n)`` → SQLite ``TEXT``."""
    if is_sqlite:
        return "TEXT"
    return f"VARCHAR({length})"
