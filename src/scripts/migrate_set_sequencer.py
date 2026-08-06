"""Idempotent migration adding the per-set Sequencer settings column.

The Sequencer's start and end times, ruler tick, zoom and active view belong to
the set rather than the device, so they live on ``dj_set`` as one JSON blob. A
null means the Sequencer falls back to its defaults.

Usage::

    .venv/bin/python -m src.scripts.migrate_set_sequencer
    .venv/bin/python -m src.scripts.migrate_set_sequencer --verify-only
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import inspect, text

from src.db import database
from src.models.dj_set import DjSet

_TABLE = "dj_set"
_COLUMN = "sequencer"


def _table_exists() -> bool:
    return _TABLE in inspect(database.engine).get_table_names()


def _column_names() -> set[str]:
    return {col["name"] for col in inspect(database.engine).get_columns(_TABLE)}


def apply() -> None:
    if not _table_exists():
        DjSet.__table__.create(bind=database.engine, checkfirst=True)
        return
    if _COLUMN in _column_names():
        return
    with database.engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE public.{_TABLE} ADD COLUMN {_COLUMN} jsonb"))


def verify() -> list[str]:
    errors: list[str] = []
    if not _table_exists():
        errors.append(f"{_TABLE} table is missing")
        return errors
    if _COLUMN not in _column_names():
        errors.append(f"{_TABLE}.{_COLUMN} column is missing")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Apply or verify the set Sequencer settings migration."
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Exit 1 when the sequencer column is absent.",
    )
    args = parser.parse_args(argv)

    if args.verify_only:
        errors = verify()
        if errors:
            for err in errors:
                print(err, file=sys.stderr)
            return 1
        print("set sequencer migration verified.")
        return 0

    apply()
    errors = verify()
    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        return 1
    print("set sequencer migration applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
