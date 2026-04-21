"""Tests for set_tracklist_version backfill migration correctness.

Covers: slot count matching, contiguous positions, empty-set handling,
idempotent reruns, and partial-state recovery.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from src.db import Base
from src.models.dj_set import DjSet
from src.models.set_tracklist_entry import SetTracklistEntry
from src.models.set_explorer_tree import SetExplorerTree
from src.models.set_explorer_node import SetExplorerNode
from src.models.set_explorer_edge import SetExplorerEdge
from src.models.set_pool_entry import SetPoolEntry
from src.models.set_tracklist_version import SetTracklistVersion
from src.models.set_tracklist_slot import SetTracklistSlot
from src.models.set_tracklist_candidate import SetTracklistCandidate


_TABLES = [
    DjSet.__table__,
    SetPoolEntry.__table__,
    SetTracklistEntry.__table__,
    SetExplorerTree.__table__,
    SetExplorerNode.__table__,
    SetExplorerEdge.__table__,
    SetTracklistVersion.__table__,
    SetTracklistSlot.__table__,
    SetTracklistCandidate.__table__,
]


@pytest.fixture
def engine():
    e = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(e, tables=_TABLES)
    return e


@pytest.fixture
def session(engine):
    _Session = sessionmaker(bind=engine)
    s = _Session()
    yield s
    s.close()


def _backfill(session: Session):
    """Reproduce backfill logic inline to test without db module dependency."""
    sets = session.query(DjSet).order_by(DjSet.id).all()
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

    session.commit()


class TestBackfillVersionPerSet:
    def test_every_set_gets_one_version(self, session: Session):
        for name in ["Set A", "Set B", "Set C"]:
            s = DjSet(name=name)
            session.add(s)
        session.commit()

        _backfill(session)

        for dj_set in session.query(DjSet).all():
            versions = (
                session.query(SetTracklistVersion)
                .filter_by(set_id=dj_set.id)
                .all()
            )
            assert len(versions) == 1, f"Set {dj_set.name} should have exactly 1 version"
            assert versions[0].name == "v1"
            assert versions[0].display_order == 0


class TestSlotCountMatches:
    def test_slot_count_equals_legacy_entry_count(self, session: Session):
        s = DjSet(name="Test")
        session.add(s)
        session.flush()
        for i in range(5):
            entry = SetTracklistEntry(set_id=s.id, track_id=100 + i, position=i)
            session.add(entry)
        session.commit()

        _backfill(session)

        version = session.query(SetTracklistVersion).filter_by(set_id=s.id).one()
        slot_count = session.query(SetTracklistSlot).filter_by(version_id=version.id).count()
        legacy_count = session.query(SetTracklistEntry).filter_by(set_id=s.id).count()
        assert slot_count == legacy_count == 5


class TestContiguousPositions:
    def test_gapped_positions_become_contiguous(self, session: Session):
        s = DjSet(name="Gapped")
        session.add(s)
        session.flush()
        for pos in [0, 3, 7, 10]:
            entry = SetTracklistEntry(set_id=s.id, track_id=200 + pos, position=pos)
            session.add(entry)
        session.commit()

        _backfill(session)

        version = session.query(SetTracklistVersion).filter_by(set_id=s.id).one()
        slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=version.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        positions = [sl.position for sl in slots]
        assert positions == [0, 1, 2, 3]

    def test_positions_are_zero_based(self, session: Session):
        s = DjSet(name="NonZero")
        session.add(s)
        session.flush()
        for pos in [5, 10]:
            entry = SetTracklistEntry(set_id=s.id, track_id=300 + pos, position=pos)
            session.add(entry)
        session.commit()

        _backfill(session)

        version = session.query(SetTracklistVersion).filter_by(set_id=s.id).one()
        slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=version.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        assert slots[0].position == 0


class TestEmptySetHandling:
    def test_empty_set_gets_version_with_zero_slots(self, session: Session):
        s = DjSet(name="Empty")
        session.add(s)
        session.commit()

        _backfill(session)

        version = session.query(SetTracklistVersion).filter_by(set_id=s.id).one()
        slot_count = session.query(SetTracklistSlot).filter_by(version_id=version.id).count()
        assert slot_count == 0


class TestIdempotence:
    def test_double_backfill_does_not_duplicate(self, session: Session):
        s = DjSet(name="Idem")
        session.add(s)
        session.flush()
        for i in range(3):
            entry = SetTracklistEntry(set_id=s.id, track_id=400 + i, position=i)
            session.add(entry)
        session.commit()

        _backfill(session)
        first_version_count = session.query(SetTracklistVersion).filter_by(set_id=s.id).count()
        first_slot_count = session.query(SetTracklistSlot).count()
        first_candidate_count = session.query(SetTracklistCandidate).count()

        _backfill(session)
        assert session.query(SetTracklistVersion).filter_by(set_id=s.id).count() == first_version_count
        assert session.query(SetTracklistSlot).count() == first_slot_count
        assert session.query(SetTracklistCandidate).count() == first_candidate_count

    def test_partial_state_recovery(self, session: Session):
        """If a previous run left a version with wrong slot count, rerunning fixes it."""
        s = DjSet(name="Partial")
        session.add(s)
        session.flush()
        for i in range(3):
            entry = SetTracklistEntry(set_id=s.id, track_id=500 + i, position=i)
            session.add(entry)
        session.commit()

        v = SetTracklistVersion(set_id=s.id, name="v1", display_order=0)
        session.add(v)
        session.flush()
        slot = SetTracklistSlot(version_id=v.id, position=0)
        session.add(slot)
        session.flush()
        cand = SetTracklistCandidate(slot_id=slot.id, track_id=500, is_selected=True)
        session.add(cand)
        session.commit()

        assert session.query(SetTracklistSlot).filter_by(version_id=v.id).count() == 1

        _backfill(session)

        version = session.query(SetTracklistVersion).filter_by(set_id=s.id).one()
        assert session.query(SetTracklistSlot).filter_by(version_id=version.id).count() == 3
