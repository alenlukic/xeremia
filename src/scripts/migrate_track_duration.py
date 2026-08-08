"""Idempotent migration adding and backfilling track.duration_seconds.

The Sequencer needs a playable length for every block. This migration adds the
nullable column when it is absent, then reads the length from each audio header.
A missing or unreadable file is reported as a skip and keeps a null duration, so
the run is safe to repeat after the files are restored.

Usage::

    .venv/bin/python -m src.scripts.migrate_track_duration
    .venv/bin/python -m src.scripts.migrate_track_duration --verify-only
    .venv/bin/python -m src.scripts.migrate_track_duration --refresh-all
"""

from __future__ import annotations

import argparse
from typing import List, Optional, Tuple

from sqlalchemy import text

from src.config import PROCESSED_MUSIC_DIR
from src.data_management.audio_file import read_duration_seconds
from src.db import database
from src.models.track import Track
from src.scripts.migration_utils import (
    column_names,
    print_errors,
    run_migration_cli,
    table_exists,
)
from src.utils.audio_path import resolve_audio_path

_TABLE = "track"
_COLUMN = "duration_seconds"


def _table_exists() -> bool:
    return table_exists(database.engine, _TABLE)


def _column_names() -> set[str]:
    return column_names(database.engine, _TABLE)


def _add_column() -> None:
    with database.engine.begin() as conn:
        conn.execute(
            text(f"ALTER TABLE public.{_TABLE} ADD COLUMN {_COLUMN} numeric(7,2)")
        )


def backfill(session, refresh_all: bool = False) -> Tuple[int, List[str]]:
    """Fill duration_seconds from audio headers.

    Returns the number of updated rows and the file names that stayed
    unmeasured. Only null durations are read unless ``refresh_all`` is set.
    """
    query = session.query(Track)
    if not refresh_all:
        query = query.filter(Track.duration_seconds.is_(None))

    updated = 0
    skipped: List[str] = []
    for track in query.all():
        duration = _duration_for(track.file_name)
        if duration is None:
            skipped.append(track.file_name)
            continue
        track.duration_seconds = duration
        updated += 1
    session.commit()
    return updated, skipped


def _duration_for(file_name: str) -> Optional[float]:
    path = resolve_audio_path(PROCESSED_MUSIC_DIR, file_name)
    if path is None:
        return None
    return read_duration_seconds(path)


def apply(refresh_all: bool = False) -> Tuple[int, List[str]]:
    if not _table_exists():
        raise RuntimeError(
            "track table is missing. Run python -m src.scripts.init_db first."
        )
    if _COLUMN not in _column_names():
        _add_column()

    session = database.create_session()
    try:
        return backfill(session, refresh_all=refresh_all)
    finally:
        session.close()


def verify() -> list[str]:
    errors: list[str] = []
    if not _table_exists():
        errors.append(f"{_TABLE} table is missing")
        return errors
    if _COLUMN not in _column_names():
        errors.append(f"{_TABLE}.{_COLUMN} column is missing")
    return errors


def _configure_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--refresh-all",
        action="store_true",
        help="Re-read every track instead of only rows with a null duration.",
    )


def _apply_from_args(args: argparse.Namespace) -> Tuple[int, List[str]]:
    return apply(refresh_all=args.refresh_all)


def _on_apply_success(result: Tuple[int, List[str]]) -> None:
    updated, skipped = result
    print(f"track duration migration summary: {updated} updated, {len(skipped)} skipped")
    if skipped:
        print_errors(
            f"skipped (no readable duration): {file_name}" for file_name in skipped
        )


def main(argv: list[str] | None = None) -> int:
    return run_migration_cli(
        argv,
        description="Apply or verify the track duration migration.",
        verify_help="Exit 1 when the track duration column is absent.",
        verify_fn=verify,
        apply_fn=_apply_from_args,
        verified_message="track duration migration verified.",
        applied_message="track duration migration applied.",
        configure_parser=_configure_parser,
        on_apply_success=_on_apply_success,
    )


if __name__ == "__main__":
    raise SystemExit(main())
