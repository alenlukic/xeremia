"""Idempotent migration adding the per-set Sequencer settings column.

The Sequencer's start and end times, ruler tick, zoom and active view belong to
the set rather than the device, so they live on ``dj_set`` as one JSON blob. A
null means the Sequencer falls back to its defaults.

Usage::

    .venv/bin/python -m src.scripts.migrate_set_sequencer
    .venv/bin/python -m src.scripts.migrate_set_sequencer --verify-only
"""

from __future__ import annotations

from argparse import Namespace
from sqlalchemy import text

from src.db import database
from src.models.dj_set import DjSet
from src.scripts.migration_utils import (
    column_names,
    run_migration_cli,
    table_exists,
)

_TABLE = "dj_set"
_COLUMN = "sequencer"


def _table_exists() -> bool:
    return table_exists(database.engine, _TABLE)


def _column_names() -> set[str]:
    return column_names(database.engine, _TABLE)


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


def _apply_from_args(_: Namespace) -> None:
    apply()


def main(argv: list[str] | None = None) -> int:
    return run_migration_cli(
        argv,
        description="Apply or verify the set Sequencer settings migration.",
        verify_help="Exit 1 when the sequencer column is absent.",
        verify_fn=verify,
        apply_fn=_apply_from_args,
        verified_message="set sequencer migration verified.",
        applied_message="set sequencer migration applied.",
    )


if __name__ == "__main__":
    raise SystemExit(main())
