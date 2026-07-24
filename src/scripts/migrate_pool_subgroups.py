"""Idempotent migration for pool subgroup storage and membership order.

Usage::

    .venv/bin/python -m src.scripts.migrate_pool_subgroups
    .venv/bin/python -m src.scripts.migrate_pool_subgroups --verify-only
"""

from __future__ import annotations

import argparse
import sys
from typing import List, Optional

from sqlalchemy import inspect, text

from src.db import database
from src.models.set_pool_subgroup import SetPoolSubgroup
from src.models.set_pool_subgroup_member import SetPoolSubgroupMember


def subgroup_table_exists() -> bool:
    inspector = inspect(database.engine)
    return "set_pool_subgroup" in inspector.get_table_names()


def member_table_exists() -> bool:
    inspector = inspect(database.engine)
    return "set_pool_subgroup_member" in inspector.get_table_names()


def _member_column_names() -> set[str]:
    inspector = inspect(database.engine)
    return {
        col["name"] for col in inspector.get_columns("set_pool_subgroup_member")
    }


def _backfill_member_order_with_connection(
    conn,
    subgroup_ids: Optional[List[int]] = None,
) -> None:
    if subgroup_ids is None:
        subgroup_ids = [
            row[0]
            for row in conn.execute(
                text("SELECT id FROM public.set_pool_subgroup ORDER BY id")
            )
        ]
    for subgroup_id in subgroup_ids:
        rows = conn.execute(
            text(
                "SELECT id FROM public.set_pool_subgroup_member "
                "WHERE subgroup_id = :subgroup_id "
                "ORDER BY added_at ASC, id ASC"
            ),
            {"subgroup_id": subgroup_id},
        ).fetchall()
        for idx, (member_id,) in enumerate(rows):
            conn.execute(
                text(
                    "UPDATE public.set_pool_subgroup_member "
                    "SET display_order = :display_order "
                    "WHERE id = :member_id"
                ),
                {"display_order": idx, "member_id": member_id},
            )


def _backfill_member_order(subgroup_ids: Optional[List[int]] = None) -> None:
    with database.engine.begin() as conn:
        _backfill_member_order_with_connection(conn, subgroup_ids)


def _invalid_member_order_subgroup_ids() -> List[int]:
    with database.engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT subgroup_id, display_order "
                "FROM public.set_pool_subgroup_member "
                "ORDER BY subgroup_id, display_order, added_at, id"
            )
        ).fetchall()

    invalid: set[int] = set()
    expected_by_subgroup: dict[int, int] = {}
    for subgroup_id, display_order in rows:
        expected = expected_by_subgroup.get(subgroup_id, 0)
        if display_order != expected:
            invalid.add(subgroup_id)
        expected_by_subgroup[subgroup_id] = expected + 1
    return sorted(invalid)


def apply() -> None:
    if not subgroup_table_exists():
        SetPoolSubgroup.__table__.create(bind=database.engine, checkfirst=True)
    if not member_table_exists():
        SetPoolSubgroupMember.__table__.create(
            bind=database.engine,
            checkfirst=True,
        )
        return
    if "display_order" not in _member_column_names():
        with database.engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE public.set_pool_subgroup_member "
                    "ADD COLUMN display_order integer DEFAULT 0 NOT NULL"
                )
            )
            _backfill_member_order_with_connection(conn)
        return

    invalid_subgroup_ids = _invalid_member_order_subgroup_ids()
    if invalid_subgroup_ids:
        _backfill_member_order(invalid_subgroup_ids)


def verify() -> list[str]:
    errors: list[str] = []
    if not subgroup_table_exists():
        errors.append("set_pool_subgroup table is missing")
    if not member_table_exists():
        errors.append("set_pool_subgroup_member table is missing")
    if errors:
        return errors
    if "display_order" not in _member_column_names():
        errors.append("set_pool_subgroup_member.display_order column is missing")
        return errors
    invalid_subgroup_ids = _invalid_member_order_subgroup_ids()
    if invalid_subgroup_ids:
        ids = ", ".join(str(subgroup_id) for subgroup_id in invalid_subgroup_ids)
        errors.append(
            "set_pool_subgroup_member.display_order is not dense for "
            f"subgroups: {ids}"
        )
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Apply or verify the pool subgroup migration."
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Exit 1 when subgroup storage is absent or incomplete.",
    )
    args = parser.parse_args(argv)

    if args.verify_only:
        errors = verify()
        if errors:
            for err in errors:
                print(err, file=sys.stderr)
            return 1
        print("pool subgroup migration verified.")
        return 0

    apply()
    errors = verify()
    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        return 1
    print("pool subgroup migration applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
