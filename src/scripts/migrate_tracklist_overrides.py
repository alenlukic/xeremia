"""Idempotent migration adding Sequencer override columns to tracklist entries.

The Sequencer stores three per-entry overrides: the played length in minutes, a
pinned end time in minutes since midnight, and the played BPM. All three are
nullable, and a null means the Sequencer derives the value.

Usage::

    .venv/bin/python -m src.scripts.migrate_tracklist_overrides
    .venv/bin/python -m src.scripts.migrate_tracklist_overrides --verify-only
"""

from __future__ import annotations

from argparse import Namespace
from sqlalchemy import text

from src.db import database
from src.models.set_tracklist_entry import SetTracklistEntry
from src.scripts.migration_utils import (
    column_names,
    run_migration_cli,
    table_exists,
)

_TABLE = "set_tracklist_entry"

# Column name -> PostgreSQL type, mirroring the ORM Numeric precisions.
_COLUMNS = {
    "play_minutes": "numeric(6,2)",
    "pinned_end_minutes": "numeric(7,2)",
    "bpm_override": "numeric(5,2)",
}


def _table_exists() -> bool:
    return table_exists(database.engine, _TABLE)


def _column_names() -> set[str]:
    return column_names(database.engine, _TABLE)


def apply() -> None:
    if not _table_exists():
        SetTracklistEntry.__table__.create(bind=database.engine, checkfirst=True)
        return

    existing = _column_names()
    missing = {name: ddl for name, ddl in _COLUMNS.items() if name not in existing}
    if not missing:
        return
    with database.engine.begin() as conn:
        for name, ddl in missing.items():
            conn.execute(
                text(f"ALTER TABLE public.{_TABLE} ADD COLUMN {name} {ddl}")
            )


def verify() -> list[str]:
    errors: list[str] = []
    if not _table_exists():
        errors.append(f"{_TABLE} table is missing")
        return errors
    existing = _column_names()
    for name in _COLUMNS:
        if name not in existing:
            errors.append(f"{_TABLE}.{name} column is missing")
    return errors


def _apply_from_args(_: Namespace) -> None:
    apply()


def main(argv: list[str] | None = None) -> int:
    return run_migration_cli(
        argv,
        description="Apply or verify the tracklist override migration.",
        verify_help="Exit 1 when the tracklist override columns are absent.",
        verify_fn=verify,
        apply_fn=_apply_from_args,
        verified_message="tracklist override migration verified.",
        applied_message="tracklist override migration applied.",
    )


if __name__ == "__main__":
    raise SystemExit(main())
