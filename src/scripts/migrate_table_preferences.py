"""Idempotent migration for the table_preference table.

Usage::

    .venv/bin/python -m src.scripts.migrate_table_preferences
    .venv/bin/python -m src.scripts.migrate_table_preferences --verify-only
"""

from __future__ import annotations

import argparse
import sys

from src.db import database
from src.models.table_preference import TablePreference


def table_exists() -> bool:
    from sqlalchemy import inspect

    inspector = inspect(database.engine)
    return "table_preference" in inspector.get_table_names()


def apply() -> None:
    TablePreference.__table__.create(bind=database.engine, checkfirst=True)


def verify() -> list[str]:
    errors: list[str] = []
    if not table_exists():
        errors.append("table_preference table is missing")
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
