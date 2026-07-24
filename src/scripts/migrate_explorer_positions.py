"""Idempotent migration adding free-canvas x/y positions to explorer nodes.

The Explorer moved from a level/column tree layout to a free-form graph on an
infinite canvas. Nodes now store `x`/`y` coordinates directly. This migration
adds those columns and backfills them from the legacy `level`/`col_index` grid
so existing graphs keep a sensible layout.

Usage::

    .venv/bin/python -m src.scripts.migrate_explorer_positions
    .venv/bin/python -m src.scripts.migrate_explorer_positions --verify-only
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import inspect, text

from src.db import database
from src.models.set_explorer_node import SetExplorerNode

# Backfill spacing (mirrors the legacy tree layout so migrated sets stay
# recognizable): one column every SLOT_W px, one level every ROW_H px.
_SLOT_W = 390.0
_ROW_H = 224.0


def _node_table_exists() -> bool:
    inspector = inspect(database.engine)
    return "set_explorer_node" in inspector.get_table_names()


def _node_column_names() -> set[str]:
    inspector = inspect(database.engine)
    return {col["name"] for col in inspector.get_columns("set_explorer_node")}


def _backfill_positions(conn) -> None:
    """Set x/y from level/col_index for any node still at the origin."""
    conn.execute(
        text(
            "UPDATE public.set_explorer_node "
            "SET x = col_index * :slot_w, y = level * :row_h "
            "WHERE x = 0 AND y = 0"
        ),
        {"slot_w": _SLOT_W, "row_h": _ROW_H},
    )


def apply() -> None:
    if not _node_table_exists():
        SetExplorerNode.__table__.create(bind=database.engine, checkfirst=True)
        return

    columns = _node_column_names()
    with database.engine.begin() as conn:
        if "x" not in columns:
            conn.execute(
                text(
                    "ALTER TABLE public.set_explorer_node "
                    "ADD COLUMN x double precision DEFAULT 0 NOT NULL"
                )
            )
        if "y" not in columns:
            conn.execute(
                text(
                    "ALTER TABLE public.set_explorer_node "
                    "ADD COLUMN y double precision DEFAULT 0 NOT NULL"
                )
            )
        if "x" not in columns or "y" not in columns:
            _backfill_positions(conn)


def verify() -> list[str]:
    errors: list[str] = []
    if not _node_table_exists():
        errors.append("set_explorer_node table is missing")
        return errors
    columns = _node_column_names()
    for col in ("x", "y"):
        if col not in columns:
            errors.append(f"set_explorer_node.{col} column is missing")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Apply or verify the explorer position migration."
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Exit 1 when explorer position columns are absent.",
    )
    args = parser.parse_args(argv)

    if args.verify_only:
        errors = verify()
        if errors:
            for err in errors:
                print(err, file=sys.stderr)
            return 1
        print("explorer position migration verified.")
        return 0

    apply()
    errors = verify()
    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        return 1
    print("explorer position migration applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
