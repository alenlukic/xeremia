"""Detect and remove duplicate track rows caused by a historical re-key ingest error.

Some tracks were ingested twice under different `[CC - Key - BPM]` metadata prefixes
(e.g. `[12A - C#m - 139.00] Blenk - Shaders.mp3` and
`[06A - Gm - 139.00] Blenk - Shaders.mp3`). Only one of the underlying files still
exists on the processed-music volume; the other DB rows are stale duplicates whose
audio file was never (or is no longer) present on disk.

This script:
  1. Groups track rows by their filename with the leading `[...] ` prefix stripped.
  2. For each group with more than one row, checks which `file_name` values actually
     exist on disk under `PROCESSED_MUSIC_DIR`.
  3. When exactly one row's file exists on disk, treats the others as orphans and
     deletes them (plus their dependent rows). Groups with zero or multiple on-disk
     matches are reported and skipped as ambiguous.
  4. Merges the orphan's `artist_track` associations into the keeper before deleting,
     then recomputes `artist.track_count` for every affected artist so the counts
     stay consistent with the surviving `artist_track` rows.

Usage:
    # Dry run (default) — prints a report, changes nothing
    python -m src.scripts.dedupe_prefix_tracks

    # Apply deletions
    python -m src.scripts.dedupe_prefix_tracks --apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from os.path import join, splitext
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy import text

from src.config import PROCESSED_MUSIC_DIR
from src.db import database
from src.errors import handle

# Strips a leading `[CC - Key - BPM] ` prefix where CC is a Camelot code (e.g. 12A).
# Lenient about BPM formatting: accepts `139.00`, `138`, etc.
PREFIX_REGEX = re.compile(r"^\[\d{2}[AB][^\]]*\]\s*")


def strip_prefix(file_name: str) -> str:
    return PREFIX_REGEX.sub("", file_name, count=1)


def file_exists_on_disk(file_name: str) -> bool:
    return os.path.isfile(join(PROCESSED_MUSIC_DIR, file_name))


def _exec(session, clause, params: Optional[dict] = None):
    """Run SQL through the underlying SQLAlchemy session (the wrapper exposes
    .session rather than .execute)."""
    return session.session.execute(clause, params or {})


def load_tracks(session) -> List[dict]:
    rows = _exec(
        session,
        text(
            "SELECT id, file_name, title, bpm, key, camelot_code, energy "
            "FROM track ORDER BY id"
        ),
    ).fetchall()
    return [
        {
            "id": r[0],
            "file_name": r[1],
            "title": r[2],
            "bpm": r[3],
            "key": r[4],
            "camelot_code": r[5],
            "energy": r[6],
        }
        for r in rows
    ]


def load_artist_links(session) -> Dict[int, Set[int]]:
    """track_id -> set of artist_id."""
    links: Dict[int, Set[int]] = defaultdict(set)
    for track_id, artist_id in _exec(
        session, text("SELECT track_id, artist_id FROM artist_track")
    ).fetchall():
        links[track_id].add(artist_id)
    return links


def classify_groups(
    tracks: List[dict],
) -> Tuple[List[dict], List[dict]]:
    """Return (duplicate_groups, singletons_with_missing_file).

    duplicate_groups: lists of track dicts sharing a stripped core filename.
    """
    by_core: Dict[str, List[dict]] = defaultdict(list)
    for t in tracks:
        core = strip_prefix(t["file_name"])
        by_core[core].append(t)

    dup_groups = [g for g in by_core.values() if len(g) > 1]
    return dup_groups


def build_plan(
    dup_groups: List[List[dict]],
    artist_links: Dict[int, Set[int]],
) -> Tuple[List[dict], List[dict]]:
    """Return (deletions, ambiguous_groups).

    Each deletion entry: {"keeper": track, "orphans": [track, ...]}
    Each ambiguous entry: {"core": str, "tracks": [...], "reason": str}
    """
    deletions: List[dict] = []
    ambiguous: List[dict] = []

    for group in dup_groups:
        core = strip_prefix(group[0]["file_name"])
        keepers = [t for t in group if file_exists_on_disk(t["file_name"])]
        orphans = [t for t in group if not file_exists_on_disk(t["file_name"])]

        if len(keepers) == 1 and orphans:
            deletions.append({"keeper": keepers[0], "orphans": orphans})
        elif len(keepers) == 0:
            ambiguous.append(
                {
                    "core": core,
                    "tracks": group,
                    "reason": "no file on disk for any row — manual review needed",
                }
            )
        elif len(keepers) > 1:
            ambiguous.append(
                {
                    "core": core,
                    "tracks": group,
                    "reason": "multiple files on disk — manual review needed",
                }
            )
        # If len(keepers) == 1 and no orphans: nothing to do (not a dup group w/ orphans)

    return deletions, ambiguous


def print_report(
    deletions: List[dict],
    ambiguous: List[dict],
    artist_links: Dict[int, Set[int]],
) -> None:
    print("\n" + "=" * 70)
    print("DUPLICATE PREFIX TRACKS — DEDUPE REPORT")
    print("=" * 70)

    total_orphans = sum(len(d["orphans"]) for d in deletions)
    print(
        "Duplicate groups with a clear on-disk keeper: %d  (orphans to delete: %d)"
        % (len(deletions), total_orphans)
    )
    print("Ambiguous groups (skipped): %d\n" % len(ambiguous))

    for d in deletions:
        keeper = d["keeper"]
        keeper_artists = artist_links.get(keeper["id"], set())
        print("Core: %s" % strip_prefix(keeper["file_name"]))
        print(
            "  KEEP  id=%-6d %s  [on disk]  artists=%s"
            % (keeper["id"], keeper["file_name"], sorted(keeper_artists) or "none")
        )
        for orphan in d["orphans"]:
            oa = artist_links.get(orphan["id"], set())
            missing_in_keeper = oa - keeper_artists
            print(
                "  DROP  id=%-6d %s  [no file]  artists=%s  merge_into_keeper=%s"
                % (
                    orphan["id"],
                    orphan["file_name"],
                    sorted(oa) or "none",
                    sorted(missing_in_keeper) or "none",
                )
            )
        print("")

    if ambiguous:
        print("-" * 70)
        print("AMBIGUOUS GROUPS (not deleted — need manual review)")
        print("-" * 70)
        for a in ambiguous:
            print("Core: %s" % a["core"])
            print("  reason: %s" % a["reason"])
            for t in a["tracks"]:
                on_disk = "on-disk" if file_exists_on_disk(t["file_name"]) else "MISSING"
                print(
                    "  id=%-6d [%s] %s"
                    % (t["id"], on_disk, t["file_name"])
                )
            print("")


def collect_dependent_counts(session, track_id: int) -> Dict[str, int]:
    """Count dependent rows that will be removed for reporting."""
    counts: Dict[str, int] = {}
    queries = {
        "artist_track": "SELECT COUNT(*) FROM artist_track WHERE track_id = :tid",
        "initial_tags": "SELECT COUNT(*) FROM initial_tags WHERE track_id = :tid",
        "post_mik_tags": "SELECT COUNT(*) FROM post_mik_tags WHERE track_id = :tid",
        "post_rekordbox_tags": (
            "SELECT COUNT(*) FROM post_rekordbox_tags WHERE track_id = :tid"
        ),
        "final_tags": "SELECT COUNT(*) FROM final_tags WHERE track_id = :tid",
        "track_descriptor": "SELECT COUNT(*) FROM track_descriptor WHERE track_id = :tid",
        "track_trait": "SELECT COUNT(*) FROM track_trait WHERE track_id = :tid",
        "track_attribute": "SELECT COUNT(*) FROM track_attribute WHERE track_id = :tid",
        "track_marked_for_deletion": (
            "SELECT COUNT(*) FROM track_marked_for_deletion WHERE track_id = :tid"
        ),
        "track_cosine_similarity": (
            "SELECT COUNT(*) FROM track_cosine_similarity "
            "WHERE id1 = :tid OR id2 = :tid"
        ),
    }
    for name, q in queries.items():
        counts[name] = _exec(session, text(q), {"tid": track_id}).scalar()
    return counts


def delete_orphan(session, orphan_id: int) -> None:
    """Remove an orphan track row and all RESTRICT-FK dependents.

    CASCADE/SET NULL dependents (set_explorer_node, set_pool_entry,
    set_tracklist_entry, set_tracklist_candidate) are handled by Postgres
    automatically and are not touched here.
    """
    # RESTRICT dependents — delete explicitly in dependency order.
    _exec(
        session,
        text(
            "DELETE FROM track_cosine_similarity WHERE id1 = :tid OR id2 = :tid"
        ),
        {"tid": orphan_id},
    )
    _exec(
        session,
        text("DELETE FROM track_descriptor WHERE track_id = :tid"),
        {"tid": orphan_id},
    )
    _exec(
        session,
        text("DELETE FROM track_trait WHERE track_id = :tid"),
        {"tid": orphan_id},
    )
    _exec(
        session,
        text("DELETE FROM track_attribute WHERE track_id = :tid"),
        {"tid": orphan_id},
    )
    _exec(
        session,
        text(
            "DELETE FROM track_marked_for_deletion WHERE track_id = :tid"
        ),
        {"tid": orphan_id},
    )
    _exec(
        session,
        text("DELETE FROM final_tags WHERE track_id = :tid"),
        {"tid": orphan_id},
    )
    _exec(
        session,
        text("DELETE FROM post_rekordbox_tags WHERE track_id = :tid"),
        {"tid": orphan_id},
    )
    _exec(
        session,
        text("DELETE FROM post_mik_tags WHERE track_id = :tid"),
        {"tid": orphan_id},
    )
    _exec(
        session,
        text("DELETE FROM initial_tags WHERE track_id = :tid"),
        {"tid": orphan_id},
    )
    # artist_track handled by the merge step (deletes orphan links after merging
    # any missing artists into the keeper).
    _exec(session, text("DELETE FROM track WHERE id = :tid"), {"tid": orphan_id})


def merge_orphan_artists_into_keeper(
    session, keeper_id: int, orphan_id: int
) -> Set[int]:
    """Add artist_track rows to the keeper for any artist the orphan had that the
    keeper does not. Returns the set of artist_ids that were added."""
    keeper_artists = {
        r[0]
        for r in _exec(
            session,
            text("SELECT artist_id FROM artist_track WHERE track_id = :tid"),
            {"tid": keeper_id},
        ).fetchall()
    }
    orphan_artists = {
        r[0]
        for r in _exec(
            session,
            text("SELECT artist_id FROM artist_track WHERE track_id = :tid"),
            {"tid": orphan_id},
        ).fetchall()
    }
    to_add = orphan_artists - keeper_artists
    for artist_id in to_add:
        _exec(
            session,
            text(
                "INSERT INTO artist_track (artist_id, track_id) "
                "VALUES (:aid, :tid)"
            ),
            {"aid": artist_id, "tid": keeper_id},
        )
    return to_add


def delete_orphan_artist_links(session, orphan_id: int) -> None:
    _exec(
        session,
        text("DELETE FROM artist_track WHERE track_id = :tid"),
        {"tid": orphan_id},
    )


def recompute_artist_counts(session, artist_ids: Set[int]) -> None:
    """Set artist.track_count = actual number of artist_track rows for each id."""
    for artist_id in artist_ids:
        actual = _exec(
            session,
            text("SELECT COUNT(*) FROM artist_track WHERE artist_id = :aid"),
            {"aid": artist_id},
        ).scalar()
        _exec(
            session,
            text("UPDATE artist SET track_count = :c WHERE id = :aid"),
            {"c": actual, "aid": artist_id},
        )


def run(apply: bool) -> None:
    if not PROCESSED_MUSIC_DIR or not os.path.isdir(PROCESSED_MUSIC_DIR):
        print(
            "ERROR: PROCESSED_MUSIC_DIR is not set or not mounted: %r"
            % PROCESSED_MUSIC_DIR
        )
        sys.exit(1)

    print(
        "Scanning tracks against %s ...\n" % PROCESSED_MUSIC_DIR
        + ("Mode: APPLY (deletions will be committed)\n" if apply else "Mode: DRY RUN\n")
    )

    session = database.create_session()
    try:
        tracks = load_tracks(session)
        artist_links = load_artist_links(session)
        dup_groups = classify_groups(tracks)
        deletions, ambiguous = build_plan(dup_groups, artist_links)
        print_report(deletions, ambiguous, artist_links)

        if not deletions:
            print("No deletable orphan rows found. Nothing to do.")
            return

        if not apply:
            print(
                "\nDry run only. Re-run with --apply to execute the %d deletion(s)."
                % len(deletions)
            )
            return

        print("=" * 70)
        print("APPLYING DELETIONS")
        print("=" * 70)

        affected_artists: Set[int] = set()
        deleted = 0
        for d in deletions:
            keeper_id = d["keeper"]["id"]
            for orphan in d["orphans"]:
                orphan_id = orphan["id"]
                try:
                    # Report dependent counts before deletion.
                    dep_counts = collect_dependent_counts(session, orphan_id)
                    merged = merge_orphan_artists_into_keeper(
                        session, keeper_id, orphan_id
                    )
                    if merged:
                        affected_artists.update(merged)
                    # Track all artists touched by either row for count recompute.
                    affected_artists.update(artist_links.get(orphan_id, set()))
                    affected_artists.update(artist_links.get(keeper_id, set()))

                    delete_orphan_artist_links(session, orphan_id)
                    delete_orphan(session, orphan_id)
                    session.commit()
                    deleted += 1
                    print(
                        "  deleted orphan id=%d %s | dependents removed=%s | "
                        "artists merged into keeper=%s"
                        % (
                            orphan_id,
                            orphan["file_name"],
                            {
                                k: v
                                for k, v in dep_counts.items()
                                if v
                            } or "none",
                            sorted(merged) or "none",
                        )
                    )
                except Exception as exc:
                    handle(exc, "Failed to delete orphan id=%d" % orphan_id)
                    session.rollback()

        # Recompute track_count for every affected artist so counts match reality.
        if affected_artists:
            recompute_artist_counts(session, affected_artists)
            session.commit()
            print(
                "\nRecomputed artist.track_count for %d artist(s)."
                % len(affected_artists)
            )

        print("\nDone. Deleted %d orphan track row(s)." % deleted)
        if ambiguous:
            print(
                "Skipped %d ambiguous group(s) — see report above for manual review."
                % len(ambiguous)
            )

    finally:
        session.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Detect and remove duplicate prefix track rows."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute deletions. Without this flag, runs as a dry run.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run(apply=args.apply)
