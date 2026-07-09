"""Delete orphan track rows by ID, cleaning up DB dependents without touching disk.

Unlike src.data_management.service.delete_tracks, this script does NOT remove any
on-disk audio files — it only removes the DB row and its dependent rows. This is
required when the orphan's file_name differs only by casing/normalization from a
keeper's file that DOES exist on disk: deleting the orphan's "file" on a
case-insensitive volume would remove the keeper's real audio file.

Cleanup covers all RESTRICT-FK dependents (artist_track, tag records,
track_descriptor, track_trait, track_attribute, track_marked_for_deletion,
track_cosine_similarity). CASCADE/SET NULL dependents (set_* tables) are handled
by Postgres automatically. artist.track_count is recomputed for every affected
artist after all deletions.

Usage:
    # Dry run (default)
    python -m src.scripts.delete_orphan_tracks 7763 8415 8815

    # Apply
    python -m src.scripts.delete_orphan_tracks 7763 8415 8815 --apply
"""

from __future__ import annotations

import argparse
import sys
from typing import Set

from sqlalchemy import text

from src.db import database


def _exec(session, clause, params=None):
    return session.session.execute(clause, params or {})


DEPENDENT_TABLES = [
    "track_cosine_similarity",  # id1/id2
    "track_descriptor",
    "track_trait",
    "track_attribute",
    "track_marked_for_deletion",
    "final_tags",
    "post_rekordbox_tags",
    "post_mik_tags",
    "initial_tags",
]

COSINE_SQL = "DELETE FROM track_cosine_similarity WHERE id1 = :tid OR id2 = :tid"


def _count_dependents(session, track_id: int) -> dict:
    counts = {}
    queries = {
        "artist_track": "SELECT COUNT(*) FROM artist_track WHERE track_id = :tid",
        "track_descriptor": "SELECT COUNT(*) FROM track_descriptor WHERE track_id = :tid",
        "track_trait": "SELECT COUNT(*) FROM track_trait WHERE track_id = :tid",
        "track_attribute": "SELECT COUNT(*) FROM track_attribute WHERE track_id = :tid",
        "track_marked_for_deletion": "SELECT COUNT(*) FROM track_marked_for_deletion WHERE track_id = :tid",
        "initial_tags": "SELECT COUNT(*) FROM initial_tags WHERE track_id = :tid",
        "post_mik_tags": "SELECT COUNT(*) FROM post_mik_tags WHERE track_id = :tid",
        "post_rekordbox_tags": "SELECT COUNT(*) FROM post_rekordbox_tags WHERE track_id = :tid",
        "final_tags": "SELECT COUNT(*) FROM final_tags WHERE track_id = :tid",
        "track_cosine_similarity": "SELECT COUNT(*) FROM track_cosine_similarity WHERE id1 = :tid OR id2 = :tid",
    }
    for name, q in queries.items():
        counts[name] = _exec(session, text(q), {"tid": track_id}).scalar()
    return counts


def _delete_orphan(session, track_id: int) -> None:
    _exec(session, text(COSINE_SQL), {"tid": track_id})
    for tbl in DEPENDENT_TABLES[1:]:  # cosine already handled
        _exec(
            session,
            text("DELETE FROM %s WHERE track_id = :tid" % tbl),
            {"tid": track_id},
        )
    _exec(
        session,
        text("DELETE FROM artist_track WHERE track_id = :tid"),
        {"tid": track_id},
    )
    _exec(session, text("DELETE FROM track WHERE id = :tid"), {"tid": track_id})


def run(track_ids: Set[int], apply: bool) -> None:
    print(
        "Mode: APPLY (deletions will be committed)\n" if apply else "Mode: DRY RUN\n"
    )
    print("Target orphan track IDs: %s\n" % sorted(track_ids))

    session = database.create_session()
    try:
        # Validate and collect affected artists.
        targets = []
        for tid in sorted(track_ids):
            row = _exec(
                session,
                text("SELECT id, file_name FROM track WHERE id = :tid"),
                {"tid": tid},
            ).first()
            if row is None:
                print("  id=%d NOT FOUND in track table — skipping" % tid)
                continue
            artists = {
                r[0]
                for r in _exec(
                    session,
                    text("SELECT artist_id FROM artist_track WHERE track_id = :tid"),
                    {"tid": tid},
                ).fetchall()
            }
            targets.append({"id": tid, "file_name": row[1], "artists": artists})

        if not targets:
            print("Nothing to delete.")
            return

        affected_artists: Set[int] = set()
        for t in targets:
            affected_artists.update(t["artists"])
            dep = _count_dependents(session, t["id"])
            dep_nonzero = {k: v for k, v in dep.items() if v}
            print(
                "  id=%-6d %s\n    dependents=%s  artists=%s"
                % (t["id"], t["file_name"], dep_nonzero or "none", sorted(t["artists"]) or "none")
            )

        if not apply:
            print(
                "\nDry run only. Re-run with --apply to delete %d track row(s)."
                % len(targets)
            )
            return

        print("\nAPPLYING DELETIONS")
        deleted = 0
        for t in targets:
            try:
                _delete_orphan(session, t["id"])
                session.commit()
                deleted += 1
                print("  deleted id=%d %s" % (t["id"], t["file_name"]))
            except Exception as exc:
                print("  ERROR deleting id=%d: %s" % (t["id"], exc))
                session.rollback()

        if affected_artists:
            for aid in affected_artists:
                actual = _exec(
                    session,
                    text("SELECT COUNT(*) FROM artist_track WHERE artist_id = :aid"),
                    {"aid": aid},
                ).scalar()
                _exec(
                    session,
                    text("UPDATE artist SET track_count = :c WHERE id = :aid"),
                    {"c": actual, "aid": aid},
                )
            session.commit()
            print(
                "\nRecomputed artist.track_count for %d artist(s)." % len(affected_artists)
            )

        print("\nDone. Deleted %d track row(s)." % deleted)

    finally:
        session.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Delete orphan track rows by ID (DB only; no on-disk file removal)."
    )
    parser.add_argument("ids", nargs="+", type=int, help="Track IDs to delete")
    parser.add_argument("--apply", action="store_true", help="Execute deletions.")
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run(set(args.ids), apply=args.apply)
