"""Additive-only migrations for columns on tables that already existed
before this pass (master prompt Part 2, Section 0.3): never drop or recreate
`accounts`/`personas`/`profiles`/`events`, only ADD COLUMN IF NOT EXISTS with
a safe default. Wholly new tables (`stars`, `recent_searches`) are created by
`Base.metadata.create_all()` in main.py instead, since those have no
pre-existing rows to preserve.

Every statement here is idempotent, so this is safe to run on every startup.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine

_ALTER_STATEMENTS = [
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'",
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS forked_from_profile_id TEXT REFERENCES profiles(profile_id)",
    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS forked_from_version INT",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS behaviour_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE personas ADD COLUMN IF NOT EXISTS global_exclusions JSON",
]


def run_migrations(engine: Engine) -> None:
    with engine.begin() as conn:
        for stmt in _ALTER_STATEMENTS:
            conn.execute(text(stmt))
