"""Idempotent migration for the table_preference table.

Usage::

    .venv/bin/python -m src.scripts.migrate_table_preferences
    .venv/bin/python -m src.scripts.migrate_table_preferences --verify-only
"""

from __future__ import annotations

import argparse
import sys

from src.db import database
from src.models.table_preference import GLOBAL_DEVICE_HASH, TablePreference


def table_exists() -> bool:
    from sqlalchemy import inspect

    inspector = inspect(database.engine)
    return "table_preference" in inspector.get_table_names()


def _column_names() -> set[str]:
    from sqlalchemy import inspect

    inspector = inspect(database.engine)
    return {col["name"] for col in inspector.get_columns("table_preference")}


def _add_device_scope() -> None:
    """Migrate a legacy installation-global table to the device-scoped shape.

    Existing rows keep their configuration under the sentinel global device
    hash, so the first device to load inherits them (see the GET route).
    """
    from sqlalchemy import text

    with database.engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE public.table_preference "
                "ADD COLUMN device_hash character varying(64) "
                "DEFAULT :global NOT NULL"
            ),
            {"global": GLOBAL_DEVICE_HASH},
        )
        conn.execute(
            text(
                "ALTER TABLE public.table_preference "
                "DROP CONSTRAINT IF EXISTS table_preference_pkey"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE public.table_preference "
                "ADD CONSTRAINT table_preference_pkey "
                "PRIMARY KEY (device_hash, table_id)"
            )
        )


def apply() -> None:
    if not table_exists():
        TablePreference.__table__.create(bind=database.engine, checkfirst=True)
        return
    if "device_hash" not in _column_names():
        _add_device_scope()


def verify() -> list[str]:
    errors: list[str] = []
    if not table_exists():
        errors.append("table_preference table is missing")
        return errors
    if "device_hash" not in _column_names():
        errors.append("table_preference.device_hash column is missing")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Apply or verify the table_preference migration."
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Exit 1 when the table_preference table is absent.",
    )
    args = parser.parse_args(argv)

    if args.verify_only:
        errors = verify()
        if errors:
            for err in errors:
                print(err, file=sys.stderr)
            return 1
        print("table_preference migration verified.")
        return 0

    apply()
    errors = verify()
    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        return 1
    print("table_preference migration applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
