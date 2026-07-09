"""Reconcile artist.track_count with the actual number of artist_track rows.

Historical ingest/deletion paths have left artist.track_count drifted from the
true link count. This script recomputes track_count for every artist from the
surviving artist_track rows in a single pass, and reports what changed.

Usage:
    # Dry run (default) — prints discrepancies, changes nothing
    python -m src.scripts.recompute_artist_counts

    # Apply
    python -m src.scripts.recompute_artist_counts --apply
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import text

from src.db import database


def _exec(session, clause, params=None):
    return session.session.execute(clause, params or {})


def run(apply: bool) -> None:
    print(
        "Mode: APPLY (counts will be reconciled)\n" if apply else "Mode: DRY RUN\n"
    )

    session = database.create_session()
    try:
        rows = _exec(
            session,
            text(
                """
                SELECT a.id, a.name, a.track_count AS stored,
                       COALESCE(c.actual, 0) AS actual
                FROM artist a
                LEFT JOIN (
                    SELECT artist_id, COUNT(*) AS actual
                    FROM artist_track
                    GROUP BY artist_id
                ) c ON c.artist_id = a.id
                WHERE a.track_count IS DISTINCT FROM COALESCE(c.actual, 0)
                ORDER BY a.id
                """
            ),
        ).fetchall()

        print("Artists with drifted track_count: %d\n" % len(rows))
        if not rows:
            print("All artist.track_count values already match. Nothing to do.")
            return

        decrements = 0
        increments = 0
        zeroed = 0
        for artist_id, name, stored, actual in rows:
            delta = actual - stored
            if actual == 0:
                zeroed += 1
            elif delta > 0:
                increments += 1
            else:
                decrements += 1
            print(
                "  id=%-6d %-40s stored=%-4d actual=%-4d delta=%+d"
                % (artist_id, (name or "")[:40], stored, actual, delta)
            )

        print(
            "\nSummary: %d to decrement, %d to increment, %d to zero out (no links)."
            % (decrements, increments, zeroed)
        )

        if not apply:
            print(
                "\nDry run only. Re-run with --apply to reconcile %d artist(s)."
                % len(rows)
            )
            return

        result = _exec(
            session,
            text(
                """
                UPDATE artist a
                SET track_count = COALESCE(
                    (SELECT COUNT(*) FROM artist_track at WHERE at.artist_id = a.id),
                    0
                )
                WHERE a.track_count IS DISTINCT FROM COALESCE(
                    (SELECT COUNT(*) FROM artist_track at WHERE at.artist_id = a.id),
                    0
                )
                """
            ),
        )
        session.commit()
        print(
            "\nReconciled %d artist row(s) (UPDATE rowcount=%d)."
            % (len(rows), result.rowcount)
        )

    finally:
        session.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reconcile artist.track_count with actual artist_track counts."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute the reconciliation. Without this flag, runs as a dry run.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run(apply=args.apply)
