"""Migration: add starred boolean to set_pool_entry and set_tracklist_entry.

Run once:
    python -m src.scripts.migrations.20260412_add_starred_to_pool_and_tracklist

Adds a BOOLEAN column with default FALSE to both membership tables.
"""

import sys

from sqlalchemy import text

from src.db import database


TABLES = ["set_pool_entry", "set_tracklist_entry"]

VERIFY_SQL = text(
    "SELECT column_name FROM information_schema.columns "
    "WHERE table_schema = current_schema() AND table_name = :tbl AND column_name = 'starred'"
)


def run():
    engine = database.engine

    for tbl in TABLES:
        engine.execute("ALTER TABLE %s ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE" % tbl)

    missing = []
    for tbl in TABLES:
        result = engine.execute(VERIFY_SQL, tbl=tbl)
        if result.fetchone() is None:
            missing.append(tbl)

    if missing:
        print(
            "Migration FAILED verification: starred column missing from: %s"
            % ", ".join(missing),
            file=sys.stderr,
        )
        sys.exit(1)

    print("Migration complete: starred column verified on %s." % ", ".join(TABLES))


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
