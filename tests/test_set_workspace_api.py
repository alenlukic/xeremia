"""Service-level tests for set workspace operations.

Covers: set CRUD, pool/tracklist mutual exclusivity, tracklist reorder,
delete-node resolution, and edge-score request shape.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from src.db import Base
from src.models.dj_set import DjSet
from src.models.set_pool_entry import SetPoolEntry
from src.models.set_pool_subgroup import SetPoolSubgroup
from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
from src.models.set_tracklist_entry import SetTracklistEntry
from src.models.set_explorer_node import SetExplorerNode
from src.models.set_explorer_edge import SetExplorerEdge
from src.set_workspace.service import SetWorkspaceService


_TABLES = [
    DjSet.__table__,
    SetPoolEntry.__table__,
    SetPoolSubgroup.__table__,
    SetPoolSubgroupMember.__table__,
    SetTracklistEntry.__table__,
    SetExplorerNode.__table__,
    SetExplorerEdge.__table__,
]


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=_TABLES)
    _Session = sessionmaker(bind=engine)
    s = _Session()
    yield s
    s.close()


@pytest.fixture
def svc(session):
    return SetWorkspaceService(session)


class TestSetCRUD:
    def test_create_and_list(self, svc: SetWorkspaceService, session: Session):
        created = svc.create_set("Friday Night")
        session.commit()
        assert created.name == "Friday Night"
        assert created.id is not None

        sets = svc.list_sets()
        assert len(sets) == 1
        assert sets[0].id == created.id

    def test_get_set(self, svc: SetWorkspaceService, session: Session):
        created = svc.create_set("Test Set")
        session.commit()
        fetched = svc.get_set(created.id)
        assert fetched is not None
        assert fetched.name == "Test Set"

    def test_get_set_not_found(self, svc: SetWorkspaceService):
        assert svc.get_set(9999) is None

    def test_update_set(self, svc: SetWorkspaceService, session: Session):
        created = svc.create_set("Old Name")
        session.commit()
        updated = svc.update_set(created.id, "New Name")
        assert updated is not None
        assert updated.name == "New Name"

    def test_update_nonexistent(self, svc: SetWorkspaceService):
        assert svc.update_set(9999, "Nope") is None

    def test_delete_set(self, svc: SetWorkspaceService, session: Session):
        created = svc.create_set("Ephemeral")
        session.commit()
        assert svc.delete_set(created.id) is True
        session.commit()
        assert svc.get_set(created.id) is None

    def test_delete_nonexistent(self, svc: SetWorkspaceService):
        assert svc.delete_set(9999) is False

    def test_hydrate_set(self, svc: SetWorkspaceService, session: Session):
        created = svc.create_set("Hydrate Me")
        session.commit()
        h = svc.hydrate_set(created.id)
        assert h is not None
        assert h["set"].id == created.id
        assert h["pool"] == []
        assert h["tracklist"] == []
        assert h["explorer_nodes"] == []
        assert h["explorer_edges"] == []

    def test_hydrate_nonexistent(self, svc: SetWorkspaceService):
        assert svc.hydrate_set(9999) is None

    def test_delete_cascades_children(self, svc: SetWorkspaceService, session: Session):
        created = svc.create_set("Cascade")
        session.commit()
        sid = created.id
        svc.pool_add(sid, 1)
        svc.tracklist_add(sid, 2)
        svc.explorer_add_node(sid, 3)
        session.commit()
        assert svc.delete_set(sid) is True
        session.commit()
        assert session.query(SetPoolEntry).filter_by(set_id=sid).count() == 0
        assert session.query(SetTracklistEntry).filter_by(set_id=sid).count() == 0
        assert session.query(SetExplorerNode).filter_by(set_id=sid).count() == 0


class TestPoolTracklistExclusivity:
    def test_pool_add_basic(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        entry, err = svc.pool_add(s.id, 10)
        assert err is None
        assert entry is not None
        assert entry.track_id == 10

    def test_pool_add_dedup(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        entry2, err2 = svc.pool_add(s.id, 10)
        assert err2 is None
        assert entry2.track_id == 10

    def test_pool_blocked_by_tracklist(
        self, svc: SetWorkspaceService, session: Session
    ):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        entry, err = svc.pool_add(s.id, 10)
        assert entry is None
        assert err is not None
        assert "tracklist" in err.lower()

    def test_tracklist_blocked_by_pool(
        self, svc: SetWorkspaceService, session: Session
    ):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 20)
        entry, err = svc.tracklist_add(s.id, 20)
        assert entry is None
        assert err is not None
        assert "pool" in err.lower()

    def test_pool_move_to_tracklist(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        session.commit()
        ok, err = svc.pool_move_to_tracklist(s.id, 10)
        assert ok is True
        assert err is None
        assert (
            session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=10).count() == 0
        )
        assert (
            session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).count()
            == 1
        )

    def test_tracklist_move_to_pool(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()
        ok, err = svc.tracklist_move_to_pool(s.id, 10)
        assert ok is True
        assert err is None
        assert (
            session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).count()
            == 0
        )
        assert (
            session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=10).count() == 1
        )


class TestPoolSubgroups:
    def _set_with_pool(self, svc, session, track_ids=(10, 20)):
        s = svc.create_set("S")
        session.commit()
        entries = {}
        for tid in track_ids:
            entry, _ = svc.pool_add(s.id, tid)
            entries[tid] = entry
        session.commit()
        return s, entries

    def test_create_assigns_incrementing_display_order(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, _ = self._set_with_pool(svc, session)
        sg1 = svc.subgroup_create(s.id, "Warmup")
        sg2 = svc.subgroup_create(s.id, "Peak")
        session.commit()
        assert sg1.display_order == 0
        assert sg2.display_order == 1

    def test_rename(self, svc: SetWorkspaceService, session: Session):
        s, _ = self._set_with_pool(svc, session)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        renamed = svc.subgroup_rename(s.id, sg.id, "Openers")
        assert renamed is not None
        assert renamed.name == "Openers"

    def test_rename_wrong_set_returns_none(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, _ = self._set_with_pool(svc, session)
        other = svc.create_set("Other")
        session.commit()
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        assert svc.subgroup_rename(other.id, sg.id, "Nope") is None

    def test_delete_compacts_display_order(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, _ = self._set_with_pool(svc, session)
        sg1 = svc.subgroup_create(s.id, "A")
        sg2 = svc.subgroup_create(s.id, "B")
        sg3 = svc.subgroup_create(s.id, "C")
        session.commit()
        assert svc.subgroup_delete(s.id, sg1.id) is True
        session.commit()
        assert sg2.display_order == 0
        assert sg3.display_order == 1

    def test_reorder(self, svc: SetWorkspaceService, session: Session):
        s, _ = self._set_with_pool(svc, session)
        sg1 = svc.subgroup_create(s.id, "A")
        sg2 = svc.subgroup_create(s.id, "B")
        session.commit()
        ok, err = svc.subgroup_reorder(s.id, [sg2.id, sg1.id])
        assert ok is True
        assert err is None
        assert sg2.display_order == 0
        assert sg1.display_order == 1

    def test_reorder_rejects_mismatched_ids(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, _ = self._set_with_pool(svc, session)
        sg1 = svc.subgroup_create(s.id, "A")
        session.commit()
        ok, err = svc.subgroup_reorder(s.id, [sg1.id, 9999])
        assert ok is False
        assert err is not None

    def test_reorder_rejects_duplicates(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, _ = self._set_with_pool(svc, session)
        sg1 = svc.subgroup_create(s.id, "A")
        session.commit()
        ok, err = svc.subgroup_reorder(s.id, [sg1.id, sg1.id])
        assert ok is False
        assert "duplicate" in err.lower()

    def test_add_and_remove_member(self, svc: SetWorkspaceService, session: Session):
        s, entries = self._set_with_pool(svc, session)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        member, err = svc.subgroup_add_track(s.id, sg.id, entries[10].id)
        assert err is None
        assert member is not None
        ok, err = svc.subgroup_remove_track(s.id, sg.id, entries[10].id)
        assert ok is True
        assert err is None

    def test_add_member_dedup(self, svc: SetWorkspaceService, session: Session):
        s, entries = self._set_with_pool(svc, session)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        m1, _ = svc.subgroup_add_track(s.id, sg.id, entries[10].id)
        m2, err = svc.subgroup_add_track(s.id, sg.id, entries[10].id)
        assert err is None
        assert m1.id == m2.id

    def test_add_member_rejects_foreign_pool_entry(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, _ = self._set_with_pool(svc, session)
        other = svc.create_set("Other")
        session.commit()
        other_entry, _ = svc.pool_add(other.id, 30)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        member, err = svc.subgroup_add_track(s.id, sg.id, other_entry.id)
        assert member is None
        assert err is not None

    def test_delete_subgroup_removes_memberships(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, entries = self._set_with_pool(svc, session)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        svc.subgroup_add_track(s.id, sg.id, entries[10].id)
        session.commit()
        assert svc.subgroup_delete(s.id, sg.id) is True
        session.commit()
        assert session.query(SetPoolSubgroupMember).count() == 0
        # Pool entries survive subgroup deletion.
        assert session.query(SetPoolEntry).filter_by(set_id=s.id).count() == 2

    def test_pool_remove_cleans_memberships(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, entries = self._set_with_pool(svc, session)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        svc.subgroup_add_track(s.id, sg.id, entries[10].id)
        session.commit()
        assert svc.pool_remove(s.id, 10) is True
        session.commit()
        assert session.query(SetPoolSubgroupMember).count() == 0

    def test_pool_move_to_tracklist_cleans_memberships(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, entries = self._set_with_pool(svc, session)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        svc.subgroup_add_track(s.id, sg.id, entries[10].id)
        session.commit()
        ok, err = svc.pool_move_to_tracklist(s.id, 10)
        assert ok is True
        assert err is None
        assert session.query(SetPoolSubgroupMember).count() == 0

    def test_delete_set_cascades_subgroups(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, entries = self._set_with_pool(svc, session)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        svc.subgroup_add_track(s.id, sg.id, entries[10].id)
        session.commit()
        assert svc.delete_set(s.id) is True
        session.commit()
        assert session.query(SetPoolSubgroup).count() == 0
        assert session.query(SetPoolSubgroupMember).count() == 0

    def test_hydrate_includes_subgroups_and_memberships(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, entries = self._set_with_pool(svc, session)
        sg2 = svc.subgroup_create(s.id, "Peak")
        sg1 = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        svc.subgroup_reorder(s.id, [sg1.id, sg2.id])
        svc.subgroup_add_track(s.id, sg1.id, entries[10].id)
        session.commit()
        hydration = svc.hydrate_set(s.id)
        assert [sg.name for sg in hydration["pool_subgroups"]] == ["Warmup", "Peak"]
        memberships = hydration["pool_subgroup_memberships"]
        assert len(memberships) == 1
        assert memberships[0].subgroup_id == sg1.id
        assert memberships[0].pool_entry_id == entries[10].id


class TestSubgroupDrop:
    def _set_with_subgroup(self, svc, session):
        s = svc.create_set("S")
        session.commit()
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()
        return s, sg

    def test_drop_from_browse_adds_pool_and_membership(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, sg = self._set_with_subgroup(svc, session)
        member, err = svc.subgroup_drop_track(s.id, sg.id, 42, "browse")
        assert err is None
        assert member is not None
        pool = session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=42).one()
        assert (
            session.query(SetPoolSubgroupMember)
            .filter_by(subgroup_id=sg.id, pool_entry_id=pool.id)
            .count()
            == 1
        )

    def test_drop_from_tracklist_moves_and_assigns(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, sg = self._set_with_subgroup(svc, session)
        svc.tracklist_add(s.id, 55)
        session.commit()
        member, err = svc.subgroup_drop_track(s.id, sg.id, 55, "tracklist")
        assert err is None
        assert member is not None
        assert (
            session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=55).count()
            == 0
        )
        pool = session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=55).one()
        assert member.pool_entry_id == pool.id

    def test_drop_already_pooled_is_membership_only(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, sg = self._set_with_subgroup(svc, session)
        entry, _ = svc.pool_add(s.id, 77)
        session.commit()
        original_order = entry.insertion_order
        member, err = svc.subgroup_drop_track(s.id, sg.id, 77, "pool")
        assert err is None
        assert member is not None
        session.refresh(entry)
        assert entry.insertion_order == original_order
        m2, err2 = svc.subgroup_drop_track(s.id, sg.id, 77, "pool")
        assert err2 is None
        assert m2.id == member.id

    def test_drop_rejects_tracklist_source_when_not_in_tracklist(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, sg = self._set_with_subgroup(svc, session)
        member, err = svc.subgroup_drop_track(s.id, sg.id, 88, "tracklist")
        assert member is None
        assert err is not None
        assert "tracklist" in err.lower()

    def test_drop_rejects_pool_source_when_not_in_pool(
        self, svc: SetWorkspaceService, session: Session
    ):
        s, sg = self._set_with_subgroup(svc, session)
        member, err = svc.subgroup_drop_track(s.id, sg.id, 99, "pool")
        assert member is None
        assert err is not None
        assert "pool" in err.lower()


class TestPoolReorder:
    def _pool_track_order(self, session, set_id):
        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=set_id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        return [e.track_id for e in entries]

    def test_reorder_forward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()

        ok, err = svc.pool_reorder(s.id, 10, 2)
        assert ok is True
        assert err is None
        assert self._pool_track_order(session, s.id) == [20, 30, 10]

    def test_reorder_backward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()

        ok, err = svc.pool_reorder(s.id, 30, 0)
        assert ok is True
        assert self._pool_track_order(session, s.id) == [30, 10, 20]

    def test_reorder_clamps_position(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20]:
            svc.pool_add(s.id, tid)
        session.commit()

        ok, err = svc.pool_reorder(s.id, 10, 99)
        assert ok is True
        assert self._pool_track_order(session, s.id) == [20, 10]

    def test_reorder_normalizes_gaps(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()
        # pool_remove leaves a gap in insertion_order
        svc.pool_remove(s.id, 20)
        session.commit()

        ok, err = svc.pool_reorder(s.id, 30, 0)
        assert ok is True
        assert self._pool_track_order(session, s.id) == [30, 10]
        orders = [
            e.insertion_order
            for e in session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        ]
        assert orders == [0, 1]

    def test_reorder_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.pool_reorder(s.id, 999, 0)
        assert ok is False
        assert err is not None


class TestTracklistReorder:
    def test_reorder_forward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.tracklist_add(s.id, tid)
        session.commit()

        ok, err = svc.tracklist_reorder(s.id, 10, 2)
        assert ok is True
        assert err is None

        entries = (
            session.query(SetTracklistEntry)
            .filter_by(set_id=s.id)
            .order_by(SetTracklistEntry.position)
            .all()
        )
        track_order = [e.track_id for e in entries]
        assert track_order == [20, 30, 10]

    def test_reorder_backward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.tracklist_add(s.id, tid)
        session.commit()

        ok, err = svc.tracklist_reorder(s.id, 30, 0)
        assert ok is True

        entries = (
            session.query(SetTracklistEntry)
            .filter_by(set_id=s.id)
            .order_by(SetTracklistEntry.position)
            .all()
        )
        track_order = [e.track_id for e in entries]
        assert track_order == [30, 10, 20]

    def test_reorder_noop(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()
        ok, err = svc.tracklist_reorder(s.id, 10, 0)
        assert ok is True

    def test_reorder_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.tracklist_reorder(s.id, 999, 0)
        assert ok is False

    def test_tracklist_dedup(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        entry2, err2 = svc.tracklist_add(s.id, 10)
        assert err2 is None
        assert entry2.track_id == 10
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id).count() == 1


class TestDeleteNodeResolution:
    def _build_chain(self, svc, session):
        """Build A -> B -> C chain and return (set_id, node_ids)."""
        s = svc.create_set("S")
        session.commit()
        node_a, _ = svc.explorer_add_node(s.id, 1, level=0)
        node_b, _ = svc.explorer_add_node(
            s.id, 2, parent_node_id=node_a.node_id, level=1
        )
        node_c, _ = svc.explorer_add_node(
            s.id, 3, parent_node_id=node_b.node_id, level=2
        )
        session.commit()
        return s.id, node_a.node_id, node_b.node_id, node_c.node_id

    def test_delete_leaf_node(self, svc: SetWorkspaceService, session: Session):
        sid, a, b, c = self._build_chain(svc, session)
        ok, err = svc.explorer_delete_node(sid, c)
        assert ok is True
        assert err is None
        assert (
            session.query(SetExplorerNode).filter_by(set_id=sid, node_id=c).count() == 0
        )

    def test_delete_middle_orphan_children(
        self, svc: SetWorkspaceService, session: Session
    ):
        sid, a, b, c = self._build_chain(svc, session)
        ok, err = svc.explorer_delete_node(sid, b)
        assert ok is True
        remaining_edges = session.query(SetExplorerEdge).filter_by(set_id=sid).all()
        child_ids = {e.child_node_id for e in remaining_edges}
        assert c not in child_ids

    def test_delete_middle_rewire_to_parent(
        self, svc: SetWorkspaceService, session: Session
    ):
        sid, a, b, c = self._build_chain(svc, session)
        rewire = [{"parent_node_id": a, "child_node_id": c}]
        ok, err = svc.explorer_delete_node(sid, b, rewire_edges=rewire)
        assert ok is True
        edge = (
            session.query(SetExplorerEdge)
            .filter_by(set_id=sid, parent_node_id=a, child_node_id=c)
            .first()
        )
        assert edge is not None

    def test_delete_invalid_rewire_parent(
        self, svc: SetWorkspaceService, session: Session
    ):
        sid, a, b, c = self._build_chain(svc, session)
        rewire = [{"parent_node_id": "nonexistent", "child_node_id": c}]
        ok, err = svc.explorer_delete_node(sid, b, rewire_edges=rewire)
        assert ok is False
        assert "parent" in err.lower()

    def test_delete_invalid_rewire_child(
        self, svc: SetWorkspaceService, session: Session
    ):
        sid, a, b, c = self._build_chain(svc, session)
        rewire = [{"parent_node_id": a, "child_node_id": "nonexistent"}]
        ok, err = svc.explorer_delete_node(sid, b, rewire_edges=rewire)
        assert ok is False
        assert "child" in err.lower()

    def test_delete_nonexistent_node(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.explorer_delete_node(s.id, "nope")
        assert ok is False

    def test_selective_rewire_multiple_children(
        self, svc: SetWorkspaceService, session: Session
    ):
        """A -> B, B -> C, B -> D. Delete B, rewire only C to A, orphan D."""
        s = svc.create_set("S")
        session.commit()
        a, _ = svc.explorer_add_node(s.id, 1, level=0)
        b, _ = svc.explorer_add_node(s.id, 2, parent_node_id=a.node_id, level=1)
        c, _ = svc.explorer_add_node(s.id, 3, parent_node_id=b.node_id, level=2)
        d, _ = svc.explorer_add_node(s.id, 4, parent_node_id=b.node_id, level=2)
        session.commit()

        rewire = [{"parent_node_id": a.node_id, "child_node_id": c.node_id}]
        ok, err = svc.explorer_delete_node(s.id, b.node_id, rewire_edges=rewire)
        assert ok is True

        ac_edge = (
            session.query(SetExplorerEdge)
            .filter_by(set_id=s.id, parent_node_id=a.node_id, child_node_id=c.node_id)
            .first()
        )
        assert ac_edge is not None

        ad_edge = (
            session.query(SetExplorerEdge)
            .filter_by(set_id=s.id, parent_node_id=a.node_id, child_node_id=d.node_id)
            .first()
        )
        assert ad_edge is None


class TestDeleteExplorerEdge:
    def test_delete_edge_success(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        a, _ = svc.explorer_add_node(s.id, 1, level=0)
        b, _ = svc.explorer_add_node(s.id, 2, parent_node_id=a.node_id, level=1)
        session.commit()
        edge = (
            session.query(SetExplorerEdge)
            .filter_by(set_id=s.id, parent_node_id=a.node_id, child_node_id=b.node_id)
            .first()
        )
        assert edge is not None

        ok, err = svc.delete_explorer_edge(s.id, edge.id)
        assert ok is True
        assert err is None
        assert session.query(SetExplorerEdge).filter_by(id=edge.id).count() == 0

    def test_delete_edge_nonexistent(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.delete_explorer_edge(s.id, 99999)
        assert ok is False
        assert err is not None

    def test_delete_edge_wrong_set(self, svc: SetWorkspaceService, session: Session):
        s1 = svc.create_set("S1")
        s2 = svc.create_set("S2")
        session.commit()
        a, _ = svc.explorer_add_node(s1.id, 1, level=0)
        b, _ = svc.explorer_add_node(s1.id, 2, parent_node_id=a.node_id, level=1)
        session.commit()
        edge = (
            session.query(SetExplorerEdge)
            .filter_by(set_id=s1.id, parent_node_id=a.node_id, child_node_id=b.node_id)
            .first()
        )
        assert edge is not None

        ok, err = svc.delete_explorer_edge(s2.id, edge.id)
        assert ok is False
        assert err is not None
        assert session.query(SetExplorerEdge).filter_by(id=edge.id).count() == 1


class TestExplorerSwap:
    def test_swap_non_adjacent_nodes_swaps_only_track_ids(
        self, svc: SetWorkspaceService, session: Session
    ):
        s = svc.create_set("S")
        session.commit()
        root, _ = svc.explorer_add_node(s.id, 101, level=0)
        left, _ = svc.explorer_add_node(s.id, 202, parent_node_id=root.node_id, level=1)
        right, _ = svc.explorer_add_node(s.id, 303, level=1)
        leaf, _ = svc.explorer_add_node(s.id, 404, parent_node_id=left.node_id, level=2)
        session.commit()

        ok, err = svc.explorer_swap(s.id, root.node_id, leaf.node_id)
        assert ok is True
        assert err is None

        refreshed_root = (
            session.query(SetExplorerNode)
            .filter_by(set_id=s.id, node_id=root.node_id)
            .first()
        )
        refreshed_leaf = (
            session.query(SetExplorerNode)
            .filter_by(set_id=s.id, node_id=leaf.node_id)
            .first()
        )
        assert refreshed_root is not None
        assert refreshed_leaf is not None
        assert refreshed_root.track_id == 404
        assert refreshed_leaf.track_id == 101
        assert refreshed_root.level == 0
        assert refreshed_leaf.level == 2

        edges = session.query(SetExplorerEdge).filter_by(set_id=s.id).all()
        edge_pairs = {(edge.parent_node_id, edge.child_node_id) for edge in edges}
        assert edge_pairs == {
            (root.node_id, left.node_id),
            (left.node_id, leaf.node_id),
        }
        assert (
            session.query(SetExplorerNode)
            .filter_by(set_id=s.id, node_id=right.node_id)
            .first()
            is not None
        )

    def test_swap_rejects_same_node(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        node, _ = svc.explorer_add_node(s.id, 101, level=0)
        session.commit()

        ok, err = svc.explorer_swap(s.id, node.node_id, node.node_id)
        assert ok is False
        assert err is not None
        assert "itself" in err.lower()


class TestTracklistNote:
    def test_update_note(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()
        ok, err = svc.update_tracklist_note(s.id, 10, "Great opener")
        assert ok is True
        assert err is None
        entry = (
            session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).first()
        )
        assert entry.note == "Great opener"

    def test_update_note_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.update_tracklist_note(s.id, 999, "nope")
        assert ok is False
        assert "not found" in err.lower()

    def test_note_default_empty(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        entry, _ = svc.tracklist_add(s.id, 10)
        session.commit()
        assert entry.note == ""

    def test_note_persists_through_hydration(
        self, svc: SetWorkspaceService, session: Session
    ):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()
        svc.update_tracklist_note(s.id, 10, "Energy peak")
        session.commit()
        h = svc.hydrate_set(s.id)
        assert h is not None
        tl = h["tracklist"]
        assert len(tl) == 1
        assert tl[0].note == "Energy peak"


class TestEdgeScoreRequestShape:
    """Verify the add-edge service method validates properly."""

    def test_add_edge_creates_connection(
        self, svc: SetWorkspaceService, session: Session
    ):
        s = svc.create_set("S")
        session.commit()
        a, _ = svc.explorer_add_node(s.id, 1, level=0)
        b, _ = svc.explorer_add_node(s.id, 2, level=0)
        session.commit()

        edge, err = svc.explorer_add_edge(s.id, a.node_id, b.node_id)
        assert err is None
        assert edge is not None

    def test_add_edge_dedup(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        a, _ = svc.explorer_add_node(s.id, 1, level=0)
        b, _ = svc.explorer_add_node(s.id, 2, parent_node_id=a.node_id, level=1)
        session.commit()

        edge, err = svc.explorer_add_edge(s.id, a.node_id, b.node_id)
        assert err is None
        assert edge is not None
        assert (
            session.query(SetExplorerEdge)
            .filter_by(set_id=s.id, parent_node_id=a.node_id, child_node_id=b.node_id)
            .count()
            == 1
        )

    def test_add_edge_cycle_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        a, _ = svc.explorer_add_node(s.id, 1, level=0)
        b, _ = svc.explorer_add_node(s.id, 2, parent_node_id=a.node_id, level=1)
        session.commit()

        edge, err = svc.explorer_add_edge(s.id, b.node_id, a.node_id)
        assert edge is None
        assert err is not None
        assert "cycle" in err.lower()
