"""Migration: backfill set_tracklist_version, slot, and candidate from legacy SetTracklistEntry.

Run once (idempotent — safe to rerun):
    python -m src.scripts.migrations.20260421_backfill_set_tracklist_versions

For each DjSet:
  1. Creates one SetTracklistVersion (name='v1', display_order=0).
  2. For each SetTracklistEntry (ordered by position, then id), creates one
     SetTracklistSlot with contiguous 0-based positions and one selected
     SetTracklistCandidate.
  3. Links the version to the first SetExplorerTree (by id) if one exists.
  4. Handles empty sets (version with 0 slots) and sets with no tree.
  5. Skips sets that already have a version (per-set idempotence).
  6. Does NOT drop or modify SetTracklistEntry.
  7. Does NOT migrate the starred field.
"""

import sys

from src.db import database
from src.models.dj_set import DjSet
from src.models.set_tracklist_entry import SetTracklistEntry
from src.models.set_explorer_tree import SetExplorerTree
from src.models.set_tracklist_version import SetTracklistVersion
from src.models.set_tracklist_slot import SetTracklistSlot
from src.models.set_tracklist_candidate import SetTracklistCandidate


def run():
    session = database.create_session()
    try:
        sets = session.query(DjSet).order_by(DjSet.id).all()
        created_count = 0
        skipped_count = 0

        for dj_set in sets:
            existing_version = (
                session.query(SetTracklistVersion)
                .filter_by(set_id=dj_set.id, name="v1")
                .first()
            )
            if existing_version is not None:
                legacy_count = (
                    session.query(SetTracklistEntry)
                    .filter_by(set_id=dj_set.id)
                    .count()
                )
                slot_count = (
                    session.query(SetTracklistSlot)
                    .filter_by(version_id=existing_version.id)
                    .count()
                )
                if slot_count == legacy_count:
                    skipped_count += 1
                    continue
                session.query(SetTracklistCandidate).filter(
                    SetTracklistCandidate.slot_id.in_(
                        session.query(SetTracklistSlot.id)
                        .filter_by(version_id=existing_version.id)
                    )
                ).delete(synchronize_session="fetch")
                session.query(SetTracklistSlot).filter_by(
                    version_id=existing_version.id,
                ).delete()
                session.delete(existing_version)
                session.flush()

            first_tree = (
                session.query(SetExplorerTree)
                .filter_by(set_id=dj_set.id)
                .order_by(SetExplorerTree.id)
                .first()
            )

            version = SetTracklistVersion(
                set_id=dj_set.id,
                name="v1",
                display_order=0,
                explorer_tree_id=first_tree.id if first_tree else None,
            )
            session.add(version)
            session.flush()

            entries = (
                session.query(SetTracklistEntry)
                .filter_by(set_id=dj_set.id)
                .order_by(SetTracklistEntry.position, SetTracklistEntry.id)
                .all()
            )

            for idx, entry in enumerate(entries):
                slot = SetTracklistSlot(
                    version_id=version.id,
                    position=idx,
                    note=entry.note or "",
                    is_inherited=False,
                )
                session.add(slot)
                session.flush()

                candidate = SetTracklistCandidate(
                    slot_id=slot.id,
                    track_id=entry.track_id,
                    is_selected=True,
                )
                session.add(candidate)

            created_count += 1

        session.commit()
        print(
            "Backfill complete: %d sets migrated, %d skipped (already had v1)."
            % (created_count, skipped_count)
        )
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Backfill migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
