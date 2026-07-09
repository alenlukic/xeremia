"""Reconcile track.file_name with the actual audio filenames on disk.

Historical ingestion left some track rows with file_name values that don't
match the on-disk filename byte-for-byte. Common causes:

  - ``?`` placeholders standing in for non-ASCII characters that were lost
    during an ingest charset mismatch (e.g. ``DJ Bo?f`` for ``DJ Boïf``).
  - Unicode normalization drift (NFC vs NFD) on accented names such as
    ``Tiësto`` or ``Rêverie``.
  - Other minor filename drift.

For every track whose file_name does not exist under PROCESSED_MUSIC_DIR, this
script attempts to find the unique on-disk file that corresponds to it, in this
order:

  1. Unicode-normalized exact match (NFC and NFD).
  2. ``?`` treated as a single-character wildcard, anchored regex match.
  3. Prefix match up to the first ``?`` or non-ASCII character in the DB name.

A match is only accepted when it resolves to exactly one on-disk file. When the
resolved filename differs from the DB file_name, the script updates:

  - track.file_name -> on-disk filename
  - track.title      -> on-disk filename without extension, BUT only when the
                        current title already equals the old file_name without
                        extension (so manually-edited titles are preserved).

Ambiguous (multiple candidates) and unresolved (zero candidates) tracks are
reported and skipped.

Usage:
    # Dry run (default) — prints a report, changes nothing
    python -m src.scripts.reconcile_track_filenames

    # Apply
    python -m src.scripts.reconcile_track_filenames --apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from os.path import join, splitext
from typing import Dict, List, Optional, Tuple

from sqlalchemy import text

from src.config import PROCESSED_MUSIC_DIR
from src.db import database
from src.utils.file_operations import AUDIO_TYPES

# Files on disk are enumerated once and indexed several ways for fast lookup.
DISK_EXACT: set = set()
DISK_BY_NFC: Dict[str, str] = {}
DISK_BY_NFD: Dict[str, str] = {}
DISK_BY_LOWER: Dict[str, str] = {}
DISK_LOWER_COLLISIONS: set = set()
DISK_ALL: List[str] = []


def _load_disk_index() -> None:
    DISK_EXACT.clear()
    DISK_BY_NFC.clear()
    DISK_BY_NFD.clear()
    DISK_BY_LOWER.clear()
    DISK_LOWER_COLLISIONS.clear()
    DISK_ALL.clear()
    for f in os.listdir(PROCESSED_MUSIC_DIR):
        if not os.path.isfile(join(PROCESSED_MUSIC_DIR, f)):
            continue
        if splitext(f)[1].lower() not in AUDIO_TYPES:
            continue
        DISK_EXACT.add(f)
        DISK_ALL.append(f)
        DISK_BY_NFC.setdefault(unicodedata.normalize("NFC", f), f)
        DISK_BY_NFD.setdefault(unicodedata.normalize("NFD", f), f)
        key = f.lower()
        if key in DISK_BY_LOWER:
            DISK_LOWER_COLLISIONS.add(key)
        else:
            DISK_BY_LOWER[key] = f


def _norm_match(file_name: str) -> Optional[str]:
    """Match via Unicode normalization (NFC/NFD)."""
    nfc = unicodedata.normalize("NFC", file_name)
    nfd = unicodedata.normalize("NFD", file_name)
    candidates = set()
    if nfc in DISK_BY_NFC:
        candidates.add(DISK_BY_NFC[nfc])
    if nfd in DISK_BY_NFD:
        candidates.add(DISK_BY_NFD[nfd])
    if len(candidates) == 1:
        return next(iter(candidates))
    return None


def _wildcard_match(file_name: str) -> Optional[str]:
    """Treat each ``?`` as a single arbitrary character, anchor the regex."""
    # Escape regex metachars except '?', then turn '?' into '.'.
    pattern = re.escape(file_name).replace("\\?", ".")
    regex = re.compile("^" + pattern + "$")
    matches = [f for f in DISK_ALL if regex.match(f)]
    if len(matches) == 1:
        return matches[0]
    return None


def _case_match(file_name: str) -> Optional[str]:
    """Case-insensitive full-filename match (unique only)."""
    key = file_name.lower()
    if key in DISK_LOWER_COLLISIONS:
        return None
    return DISK_BY_LOWER.get(key)


def _prefix_match(file_name: str) -> Optional[str]:
    """Match on the prefix up to the first ``?`` or non-ASCII character."""
    trigger = None
    for i, c in enumerate(file_name):
        if ord(c) > 127 or c == "?":
            trigger = i
            break
    if trigger is None:
        return None
    prefix = file_name[:trigger]
    matches = [f for f in DISK_ALL if f.startswith(prefix)]
    if len(matches) == 1:
        return matches[0]
    return None


def resolve(file_name: str) -> Tuple[Optional[str], Optional[str]]:
    """Return (resolved_disk_filename, strategy). (None, reason) if unresolved."""
    if file_name in DISK_EXACT:
        return file_name, "exact"
    m = _norm_match(file_name)
    if m is not None:
        return m, "unicode-normalize"
    if "?" in file_name:
        m = _wildcard_match(file_name)
        if m is not None:
            return m, "wildcard"
    m = _case_match(file_name)
    if m is not None:
        return m, "case-insensitive"
    m = _prefix_match(file_name)
    if m is not None:
        return m, "prefix"
    return None, "no-match"


def _exec(session, clause, params=None):
    return session.session.execute(clause, params or {})


def run(apply: bool) -> None:
    if not PROCESSED_MUSIC_DIR or not os.path.isdir(PROCESSED_MUSIC_DIR):
        print("ERROR: PROCESSED_MUSIC_DIR not set or not mounted: %r" % PROCESSED_MUSIC_DIR)
        sys.exit(1)

    print(
        "Scanning disk under %s ...\n" % PROCESSED_MUSIC_DIR
        + ("Mode: APPLY (updates will be committed)\n" if apply else "Mode: DRY RUN\n")
    )
    _load_disk_index()
    print("Disk audio files: %d\n" % len(DISK_ALL))

    session = database.create_session()
    try:
        rows = _exec(
            session, text("SELECT id, file_name, title FROM track ORDER BY id")
        ).fetchall()

        exact = 0
        resolved: List[dict] = []
        ambiguous: List[dict] = []
        unresolved: List[dict] = []

        for tid, fn, title in rows:
            if fn in DISK_EXACT:
                exact += 1
                continue
            disk_name, strategy = resolve(fn)
            if disk_name is None:
                unresolved.append({"id": tid, "file_name": fn, "title": title})
                continue
            # Ambiguous only surfaces as no-match above (resolve returns None on
            # multiple candidates). A resolved name that equals an existing DB
            # file_name would create a PK collision — guard against that.
            collides = _exec(
                session,
                text("SELECT id FROM track WHERE file_name = :fn AND id <> :tid"),
                {"fn": disk_name, "tid": tid},
            ).first()
            if collides is not None:
                ambiguous.append(
                    {
                        "id": tid,
                        "file_name": fn,
                        "title": title,
                        "candidate": disk_name,
                        "strategy": strategy,
                        "reason": "resolved name already used by track id=%d" % collides[0],
                    }
                )
                continue
            update_title = title == splitext(fn)[0]
            resolved.append(
                {
                    "id": tid,
                    "old_file_name": fn,
                    "new_file_name": disk_name,
                    "title": title,
                    "update_title": update_title,
                    "strategy": strategy,
                }
            )

        print("DB tracks: %d" % len(rows))
        print("Already exact on disk: %d" % exact)
        print("Resolved uniquely: %d" % len(resolved))
        print("Ambiguous / colliding: %d" % len(ambiguous))
        print("Unresolved: %d\n" % len(unresolved))

        if resolved:
            print("-" * 70)
            print("RESOLVED (will update file_name)")
            print("-" * 70)
            for r in resolved:
                title_note = " [title will update]" if r["update_title"] else ""
                print(
                    "  id=%-6d (%s)%s\n    old: %s\n    new: %s"
                    % (r["id"], r["strategy"], title_note, r["old_file_name"], r["new_file_name"])
                )
            print("")

        if ambiguous:
            print("-" * 70)
            print("AMBIGUOUS / COLLIDING (skipped)")
            print("-" * 70)
            for a in ambiguous:
                print(
                    "  id=%-6d %s\n    candidate: %s (%s)\n    reason: %s"
                    % (a["id"], a["file_name"], a["candidate"], a["strategy"], a["reason"])
                )
            print("")

        if unresolved:
            print("-" * 70)
            print("UNRESOLVED (no on-disk candidate — skipped)")
            print("-" * 70)
            for u in unresolved:
                print("  id=%-6d %s" % (u["id"], u["file_name"]))
            print("")

        if not resolved:
            print("Nothing to update. Exiting.")
            return

        if not apply:
            print("Dry run only. Re-run with --apply to update %d track(s)." % len(resolved))
            return

        print("=" * 70)
        print("APPLYING UPDATES")
        print("=" * 70)
        updated = 0
        for r in resolved:
            try:
                if r["update_title"]:
                    _exec(
                        session,
                        text(
                            "UPDATE track SET file_name = :fn, title = :t WHERE id = :tid"
                        ),
                        {
                            "fn": r["new_file_name"],
                            "t": splitext(r["new_file_name"])[0],
                            "tid": r["id"],
                        },
                    )
                else:
                    _exec(
                        session,
                        text("UPDATE track SET file_name = :fn WHERE id = :tid"),
                        {"fn": r["new_file_name"], "tid": r["id"]},
                    )
                session.commit()
                updated += 1
                print(
                    "  updated id=%-6d %s -> %s%s"
                    % (
                        r["id"],
                        r["old_file_name"],
                        r["new_file_name"],
                        " (+title)" if r["update_title"] else "",
                    )
                )
            except Exception as exc:
                handle_exc(exc, "Failed to update id=%d" % r["id"])
                session.rollback()

        print("\nDone. Updated %d track row(s)." % updated)
        print("Skipped: %d ambiguous, %d unresolved." % (len(ambiguous), len(unresolved)))

    finally:
        session.close()


def handle_exc(exc, msg):
    print("  ERROR: %s — %s" % (msg, exc))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reconcile track.file_name with on-disk audio filenames."
    )
    parser.add_argument("--apply", action="store_true", help="Apply updates.")
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    run(apply=args.apply)
