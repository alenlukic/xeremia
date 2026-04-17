"""Service-level tests for set workspace operations.

Covers: set CRUD, pool/tracklist dual membership, tracklist reorder,
delete-node resolution, and edge-score request shape.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from src.db import Base
from src.models.dj_set import DjSet
from src.models.set_pool_entry import SetPoolEntry
from src.models.set_tracklist_entry import SetTracklistEntry
from src.models.set_explorer_tree import SetExplorerTree
from src.models.set_explorer_node import SetExplorerNode
from src.models.set_explorer_edge import SetExplorerEdge
from src.models.set_pool_subgroup import SetPoolSubgroup
from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
from src.models.set_empty_row import SetEmptyRow
from src.set_workspace.service import SetWorkspaceService


_TABLES = [
    DjSet.__table__,
    SetPoolEntry.__table__,
    SetTracklistEntry.__table__,
    SetExplorerTree.__table__,
    SetExplorerNode.__table__,
    SetExplorerEdge.__table__,
    SetPoolSubgroup.__table__,
    SetPoolSubgroupMember.__table__,
    SetEmptyRow.__table__,
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


class TestPoolTracklistDualMembership:
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

    def test_pool_add_succeeds_when_in_tracklist(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()
        entry, err = svc.pool_add(s.id, 10)
        assert err is None
        assert entry is not None
        assert entry.track_id == 10
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).count() == 1
        assert session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=10).count() == 1

    def test_tracklist_add_succeeds_when_in_pool(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 20)
        session.commit()
        entry, err = svc.tracklist_add(s.id, 20)
        assert err is None
        assert entry is not None
        assert entry.track_id == 20
        assert session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=20).count() == 1
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=20).count() == 1

    def test_dual_membership_both_orders(self, svc: SetWorkspaceService, session: Session):
        """Add pool-then-tracklist and tracklist-then-pool for different tracks."""
        s = svc.create_set("S")
        session.commit()

        svc.pool_add(s.id, 10)
        session.commit()
        tl_entry, tl_err = svc.tracklist_add(s.id, 10)
        assert tl_err is None
        assert tl_entry is not None

        svc.tracklist_add(s.id, 20)
        session.commit()
        pool_entry, pool_err = svc.pool_add(s.id, 20)
        assert pool_err is None
        assert pool_entry is not None

        assert session.query(SetPoolEntry).filter_by(set_id=s.id).count() == 2
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id).count() == 2

    def test_pool_move_to_tracklist(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        session.commit()
        ok, err = svc.pool_move_to_tracklist(s.id, 10)
        assert ok is True
        assert err is None
        assert session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=10).count() == 0
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).count() == 1

    def test_tracklist_move_to_pool(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()
        ok, err = svc.tracklist_move_to_pool(s.id, 10)
        assert ok is True
        assert err is None
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).count() == 0
        assert session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=10).count() == 1


class TestPoolClear:
    def test_pool_clear_empties_pool(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        svc.pool_add(s.id, 20)
        svc.pool_add(s.id, 30)
        session.commit()
        removed = svc.pool_clear(s.id)
        session.commit()
        assert removed == 3
        assert session.query(SetPoolEntry).filter_by(set_id=s.id).count() == 0

    def test_pool_clear_leaves_tracklist_intact(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        svc.tracklist_add(s.id, 20)
        session.commit()
        svc.pool_clear(s.id)
        session.commit()
        assert session.query(SetPoolEntry).filter_by(set_id=s.id).count() == 0
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id).count() == 1
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id).first().track_id == 20

    def test_pool_clear_empty_returns_zero(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        removed = svc.pool_clear(s.id)
        assert removed == 0


class TestTracklistClear:
    def test_tracklist_clear_empties_tracklist(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        svc.tracklist_add(s.id, 20)
        session.commit()
        removed = svc.tracklist_clear(s.id)
        session.commit()
        assert removed == 2
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id).count() == 0

    def test_tracklist_clear_leaves_pool_intact(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        svc.tracklist_add(s.id, 20)
        session.commit()
        svc.tracklist_clear(s.id)
        session.commit()
        assert session.query(SetTracklistEntry).filter_by(set_id=s.id).count() == 0
        assert session.query(SetPoolEntry).filter_by(set_id=s.id).count() == 1
        assert session.query(SetPoolEntry).filter_by(set_id=s.id).first().track_id == 10

    def test_tracklist_clear_empty_returns_zero(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        removed = svc.tracklist_clear(s.id)
        assert removed == 0


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
        node_b, _ = svc.explorer_add_node(s.id, 2, parent_node_id=node_a.node_id, level=1)
        node_c, _ = svc.explorer_add_node(s.id, 3, parent_node_id=node_b.node_id, level=2)
        session.commit()
        return s.id, node_a.node_id, node_b.node_id, node_c.node_id

    def test_delete_leaf_node(self, svc: SetWorkspaceService, session: Session):
        sid, a, b, c = self._build_chain(svc, session)
        ok, err = svc.explorer_delete_node(sid, c)
        assert ok is True
        assert err is None
        assert session.query(SetExplorerNode).filter_by(set_id=sid, node_id=c).count() == 0

    def test_delete_middle_orphan_children(self, svc: SetWorkspaceService, session: Session):
        sid, a, b, c = self._build_chain(svc, session)
        ok, err = svc.explorer_delete_node(sid, b)
        assert ok is True
        remaining_edges = session.query(SetExplorerEdge).filter_by(set_id=sid).all()
        child_ids = {e.child_node_id for e in remaining_edges}
        assert c not in child_ids

    def test_delete_middle_rewire_to_parent(self, svc: SetWorkspaceService, session: Session):
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

    def test_delete_invalid_rewire_parent(self, svc: SetWorkspaceService, session: Session):
        sid, a, b, c = self._build_chain(svc, session)
        rewire = [{"parent_node_id": "nonexistent", "child_node_id": c}]
        ok, err = svc.explorer_delete_node(sid, b, rewire_edges=rewire)
        assert ok is False
        assert "parent" in err.lower()

    def test_delete_invalid_rewire_child(self, svc: SetWorkspaceService, session: Session):
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

    def test_selective_rewire_multiple_children(self, svc: SetWorkspaceService, session: Session):
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

        ac_edge = session.query(SetExplorerEdge).filter_by(
            set_id=s.id, parent_node_id=a.node_id, child_node_id=c.node_id
        ).first()
        assert ac_edge is not None

        ad_edge = session.query(SetExplorerEdge).filter_by(
            set_id=s.id, parent_node_id=a.node_id, child_node_id=d.node_id
        ).first()
        assert ad_edge is None


class TestDeleteExplorerEdge:
    def test_delete_edge_success(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        a, _ = svc.explorer_add_node(s.id, 1, level=0)
        b, _ = svc.explorer_add_node(s.id, 2, parent_node_id=a.node_id, level=1)
        session.commit()
        edge = session.query(SetExplorerEdge).filter_by(
            set_id=s.id, parent_node_id=a.node_id, child_node_id=b.node_id
        ).first()
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
        edge = session.query(SetExplorerEdge).filter_by(
            set_id=s1.id, parent_node_id=a.node_id, child_node_id=b.node_id
        ).first()
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

        refreshed_root = session.query(SetExplorerNode).filter_by(
            set_id=s.id, node_id=root.node_id
        ).first()
        refreshed_leaf = session.query(SetExplorerNode).filter_by(
            set_id=s.id, node_id=leaf.node_id
        ).first()
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
        assert session.query(SetExplorerNode).filter_by(set_id=s.id, node_id=right.node_id).first() is not None

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
        entry = session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).first()
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

    def test_note_persists_through_hydration(self, svc: SetWorkspaceService, session: Session):
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


class TestStarToggle:
    def test_pool_star_toggle(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        session.commit()

        ok, err = svc.toggle_pool_star(s.id, 10, True)
        assert ok is True
        assert err is None
        entry = session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=10).first()
        assert entry.starred is True

    def test_pool_star_unstar(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        session.commit()
        svc.toggle_pool_star(s.id, 10, True)
        svc.toggle_pool_star(s.id, 10, False)
        entry = session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=10).first()
        assert entry.starred is False

    def test_pool_star_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.toggle_pool_star(s.id, 999, True)
        assert ok is False
        assert "not found" in err.lower()

    def test_tracklist_star_toggle(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()

        ok, err = svc.toggle_tracklist_star(s.id, 10, True)
        assert ok is True
        assert err is None
        entry = session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).first()
        assert entry.starred is True

    def test_tracklist_star_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.toggle_tracklist_star(s.id, 999, True)
        assert ok is False
        assert "not found" in err.lower()

    def test_starred_default_false(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        entry, _ = svc.pool_add(s.id, 10)
        assert entry.starred is False
        tl, _ = svc.tracklist_add(s.id, 20)
        assert tl.starred is False

    def test_starred_preserved_pool_to_tracklist(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        session.commit()
        svc.toggle_pool_star(s.id, 10, True)
        session.commit()

        ok, err = svc.pool_move_to_tracklist(s.id, 10)
        assert ok is True
        assert err is None
        session.commit()

        tl = session.query(SetTracklistEntry).filter_by(set_id=s.id, track_id=10).first()
        assert tl is not None
        assert tl.starred is True

    def test_starred_preserved_tracklist_to_pool(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()
        svc.toggle_tracklist_star(s.id, 10, True)
        session.commit()

        ok, err = svc.tracklist_move_to_pool(s.id, 10)
        assert ok is True
        assert err is None
        session.commit()

        pool = session.query(SetPoolEntry).filter_by(set_id=s.id, track_id=10).first()
        assert pool is not None
        assert pool.starred is True

    def test_starred_persists_through_hydration(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        svc.tracklist_add(s.id, 20)
        session.commit()
        svc.toggle_pool_star(s.id, 10, True)
        svc.toggle_tracklist_star(s.id, 20, True)
        session.commit()

        h = svc.hydrate_set(s.id)
        assert h is not None
        assert h["pool"][0].starred is True
        assert h["tracklist"][0].starred is True


class TestEdgeScoreRequestShape:
    """Verify the add-edge service method validates properly."""

    def test_add_edge_creates_connection(self, svc: SetWorkspaceService, session: Session):
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
        assert session.query(SetExplorerEdge).filter_by(
            set_id=s.id, parent_node_id=a.node_id, child_node_id=b.node_id
        ).count() == 1

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


class TestExplorerTrees:
    def test_default_tree_created_on_add_node(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        node, err = svc.explorer_add_node(s.id, 1, level=0)
        assert err is None
        session.commit()

        trees = svc.list_explorer_trees(s.id)
        assert len(trees) == 1
        assert trees[0].name == "Main"
        assert node.tree_id == trees[0].id

    def test_hydrate_returns_trees(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.explorer_add_node(s.id, 1, level=0)
        session.commit()

        h = svc.hydrate_set(s.id)
        assert "explorer_trees" in h
        assert len(h["explorer_trees"]) == 1
        assert h["explorer_trees"][0].name == "Main"

    def test_nodes_scoped_to_tree(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        tree = svc.get_or_create_default_tree(s.id)
        session.commit()

        n1, _ = svc.explorer_add_node(s.id, 1, level=0, tree_id=tree.id)
        session.commit()

        t2, err = svc.create_explorer_tree(s.id, "Alt")
        assert err is None
        session.commit()

        n2, _ = svc.explorer_add_node(s.id, 2, level=0, tree_id=t2.id)
        session.commit()

        main_nodes, _, _, _ = svc._get_explorer_state(s.id, tree.id)
        alt_nodes, _, _, _ = svc._get_explorer_state(s.id, t2.id)
        assert len(main_nodes) == 1
        assert main_nodes[0].track_id == 1
        assert len(alt_nodes) == 1
        assert alt_nodes[0].track_id == 2

    def test_create_empty_tree(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        tree, err = svc.create_explorer_tree(s.id, "Empty", mode="empty")
        assert err is None
        assert tree is not None
        session.commit()

        nodes = session.query(SetExplorerNode).filter_by(tree_id=tree.id).all()
        assert len(nodes) == 0

    def test_create_full_copy(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        main = svc.get_or_create_default_tree(s.id)
        session.commit()

        root, _ = svc.explorer_add_node(s.id, 10, level=0, tree_id=main.id)
        child, _ = svc.explorer_add_node(s.id, 20, parent_node_id=root.node_id, level=1, tree_id=main.id)
        session.commit()

        copy, err = svc.create_explorer_tree(s.id, "Copy", mode="full_copy", source_tree_id=main.id)
        assert err is None
        session.commit()

        copy_nodes = session.query(SetExplorerNode).filter_by(tree_id=copy.id).all()
        copy_edges = session.query(SetExplorerEdge).filter_by(tree_id=copy.id).all()
        assert len(copy_nodes) == 2
        assert len(copy_edges) == 1
        track_ids = {n.track_id for n in copy_nodes}
        assert track_ids == {10, 20}

    def test_create_subtree_copy(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        main = svc.get_or_create_default_tree(s.id)
        session.commit()

        root, _ = svc.explorer_add_node(s.id, 10, level=0, tree_id=main.id)
        child, _ = svc.explorer_add_node(s.id, 20, parent_node_id=root.node_id, level=1, tree_id=main.id)
        grandchild, _ = svc.explorer_add_node(s.id, 30, parent_node_id=child.node_id, level=2, tree_id=main.id)
        session.commit()

        sub, err = svc.create_explorer_tree(
            s.id, "SubCopy", mode="subtree_copy",
            source_tree_id=main.id, source_node_id=child.node_id,
        )
        assert err is None
        session.commit()

        sub_nodes = session.query(SetExplorerNode).filter_by(tree_id=sub.id).all()
        sub_edges = session.query(SetExplorerEdge).filter_by(tree_id=sub.id).all()
        assert len(sub_nodes) == 2
        track_ids = {n.track_id for n in sub_nodes}
        assert track_ids == {20, 30}

        copied_root_ids = {n.node_id for n in sub_nodes if n.track_id == child.track_id}
        assert len(copied_root_ids) == 1
        copied_root_id = copied_root_ids.pop()
        incoming = session.query(SetExplorerEdge).filter_by(
            tree_id=sub.id, child_node_id=copied_root_id,
        ).count()
        assert incoming == 0, "Copied root must have zero parent edges"

        assert len(sub_edges) == 1

    def test_duplicate_tree_name_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.create_explorer_tree(s.id, "Foo")
        session.commit()

        t2, err = svc.create_explorer_tree(s.id, "Foo")
        assert t2 is None
        assert err is not None
        assert "already exists" in err

    def test_delete_set_cascades_trees(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.get_or_create_default_tree(s.id)
        svc.explorer_add_node(s.id, 1, level=0)
        session.commit()

        svc.delete_set(s.id)
        session.commit()

        assert session.query(SetExplorerTree).count() == 0
        assert session.query(SetExplorerNode).count() == 0
        assert session.query(SetExplorerEdge).count() == 0

    def test_all_nodes_have_tree_id_after_creation(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()

        svc.explorer_add_node(s.id, 1, level=0)
        svc.explorer_add_node(s.id, 2, level=0)
        session.commit()

        null_tree_nodes = session.query(SetExplorerNode).filter(
            SetExplorerNode.tree_id.is_(None)
        ).count()
        assert null_tree_nodes == 0


class TestSubgroupMembershipIntegrity:
    """Cross-set mutation guard for subgroup member add/remove."""

    def _two_sets_with_pool(self, svc, session):
        s1 = svc.create_set("Set A")
        s2 = svc.create_set("Set B")
        session.commit()
        e1, _ = svc.pool_add(s1.id, 10)
        e2, _ = svc.pool_add(s2.id, 20)
        session.commit()
        sg1 = svc.subgroup_create(s1.id, "Group A")
        sg2 = svc.subgroup_create(s2.id, "Group B")
        session.commit()
        return s1, s2, e1, e2, sg1, sg2

    def test_add_member_valid(self, svc: SetWorkspaceService, session: Session):
        s1, _, e1, _, sg1, _ = self._two_sets_with_pool(svc, session)
        member, err = svc.subgroup_add_track(s1.id, sg1.id, e1.id)
        assert err is None
        assert member is not None

    def test_add_member_cross_set_subgroup_rejected(self, svc: SetWorkspaceService, session: Session):
        s1, s2, e1, _, _, sg2 = self._two_sets_with_pool(svc, session)
        member, err = svc.subgroup_add_track(s1.id, sg2.id, e1.id)
        assert member is None
        assert err is not None
        assert "does not belong" in err.lower()

    def test_add_member_cross_set_pool_entry_rejected(self, svc: SetWorkspaceService, session: Session):
        s1, s2, _, e2, sg1, _ = self._two_sets_with_pool(svc, session)
        member, err = svc.subgroup_add_track(s1.id, sg1.id, e2.id)
        assert member is None
        assert err is not None
        assert "pool entry" in err.lower()

    def test_remove_member_valid(self, svc: SetWorkspaceService, session: Session):
        s1, _, e1, _, sg1, _ = self._two_sets_with_pool(svc, session)
        svc.subgroup_add_track(s1.id, sg1.id, e1.id)
        session.commit()
        removed, err = svc.subgroup_remove_track(s1.id, sg1.id, e1.id)
        assert removed is True
        assert err is None

    def test_remove_member_wrong_set_rejected(self, svc: SetWorkspaceService, session: Session):
        s1, s2, e1, _, sg1, _ = self._two_sets_with_pool(svc, session)
        svc.subgroup_add_track(s1.id, sg1.id, e1.id)
        session.commit()
        removed, err = svc.subgroup_remove_track(s2.id, sg1.id, e1.id)
        assert removed is False
        assert err is not None
        assert "does not belong" in err.lower()

    def test_remove_member_nonexistent_set(self, svc: SetWorkspaceService, session: Session):
        s1, _, e1, _, sg1, _ = self._two_sets_with_pool(svc, session)
        svc.subgroup_add_track(s1.id, sg1.id, e1.id)
        session.commit()
        removed, err = svc.subgroup_remove_track(9999, sg1.id, e1.id)
        assert removed is False
        assert err is not None

    def test_add_member_idempotent(self, svc: SetWorkspaceService, session: Session):
        s1, _, e1, _, sg1, _ = self._two_sets_with_pool(svc, session)
        m1, err1 = svc.subgroup_add_track(s1.id, sg1.id, e1.id)
        session.commit()
        m2, err2 = svc.subgroup_add_track(s1.id, sg1.id, e1.id)
        assert err1 is None
        assert err2 is None
        assert m1.id == m2.id


class TestSubgroupReorderValidation:
    """Reorder must require exact match of current subgroup IDs."""

    def test_reorder_valid_full_set(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        sg_a = svc.subgroup_create(s.id, "A")
        sg_b = svc.subgroup_create(s.id, "B")
        sg_c = svc.subgroup_create(s.id, "C")
        session.commit()
        ok, err = svc.subgroup_reorder(s.id, [sg_c.id, sg_a.id, sg_b.id])
        assert ok is True
        assert err is None
        session.commit()
        reloaded = (
            session.query(SetPoolSubgroup)
            .filter_by(set_id=s.id)
            .order_by(SetPoolSubgroup.display_order)
            .all()
        )
        assert [sg.id for sg in reloaded] == [sg_c.id, sg_a.id, sg_b.id]
        assert [sg.display_order for sg in reloaded] == [0, 1, 2]

    def test_reorder_partial_list_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        sg_a = svc.subgroup_create(s.id, "A")
        svc.subgroup_create(s.id, "B")
        session.commit()
        ok, err = svc.subgroup_reorder(s.id, [sg_a.id])
        assert ok is False
        assert err is not None
        assert "do not match" in err.lower()

    def test_reorder_duplicate_ids_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        sg_a = svc.subgroup_create(s.id, "A")
        session.commit()
        ok, err = svc.subgroup_reorder(s.id, [sg_a.id, sg_a.id])
        assert ok is False
        assert err is not None
        assert "duplicate" in err.lower()

    def test_reorder_foreign_ids_rejected(self, svc: SetWorkspaceService, session: Session):
        s1 = svc.create_set("S1")
        s2 = svc.create_set("S2")
        session.commit()
        sg_1 = svc.subgroup_create(s1.id, "A")
        sg_foreign = svc.subgroup_create(s2.id, "B")
        session.commit()
        ok, err = svc.subgroup_reorder(s1.id, [sg_1.id, sg_foreign.id])
        assert ok is False
        assert err is not None
        assert "do not match" in err.lower()

    def test_reorder_empty_set_with_empty_list(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.subgroup_reorder(s.id, [])
        assert ok is True
        assert err is None


class TestExplorerExactSlotPlacement:
    def test_explicit_col_index_places_at_requested_slot(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        node, err = svc.explorer_add_node(s.id, 1, level=0, col_index=3)
        assert err is None
        session.commit()
        assert node.col_index == 3

    def test_occupied_slot_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.explorer_add_node(s.id, 1, level=0, col_index=2)
        session.commit()
        node, err = svc.explorer_add_node(s.id, 2, level=0, col_index=2)
        assert node is None
        assert "occupied" in err.lower()

    def test_out_of_range_col_index_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        node, err = svc.explorer_add_node(s.id, 1, level=0, col_index=5)
        assert node is None
        assert err is not None

    def test_omitted_col_index_uses_first_free(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.explorer_add_node(s.id, 1, level=0, col_index=0)
        session.commit()
        node, err = svc.explorer_add_node(s.id, 2, level=0)
        assert err is None
        session.commit()
        assert node.col_index == 1


class TestSubgroupMembershipHydration:
    """Regression tests for subgroup membership visibility through hydration.

    Validates the bug fix: adding a track to a subgroup must persist and
    appear in the hydrated payload so subgroup-tab filtering works.
    """

    def test_add_member_visible_in_hydration(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        pe, _ = svc.pool_add(s.id, 10)
        sg = svc.subgroup_create(s.id, "Warmup")
        session.commit()

        member, err = svc.subgroup_add_track(s.id, sg.id, pe.id)
        assert err is None
        assert member is not None
        session.commit()

        h = svc.hydrate_set(s.id)
        assert h is not None
        memberships = h["pool_subgroup_memberships"]
        assert len(memberships) == 1
        assert memberships[0].subgroup_id == sg.id
        assert memberships[0].pool_entry_id == pe.id

    def test_multi_subgroup_membership_survives_hydration(self, svc: SetWorkspaceService, session: Session):
        """One pool entry in two subgroups must appear twice in hydration."""
        s = svc.create_set("S")
        session.commit()
        pe, _ = svc.pool_add(s.id, 10)
        sg_a = svc.subgroup_create(s.id, "A")
        sg_b = svc.subgroup_create(s.id, "B")
        session.commit()

        m1, err1 = svc.subgroup_add_track(s.id, sg_a.id, pe.id)
        m2, err2 = svc.subgroup_add_track(s.id, sg_b.id, pe.id)
        assert err1 is None
        assert err2 is None
        session.commit()

        h = svc.hydrate_set(s.id)
        memberships = h["pool_subgroup_memberships"]
        assert len(memberships) == 2
        sg_ids = {m.subgroup_id for m in memberships}
        assert sg_ids == {sg_a.id, sg_b.id}
        assert all(m.pool_entry_id == pe.id for m in memberships)

    def test_hydrated_membership_has_correct_pool_entry_id(self, svc: SetWorkspaceService, session: Session):
        """Membership pool_entry_id must match the pool entry row id
        (not track_id) so frontend subgroup filtering works."""
        s = svc.create_set("S")
        session.commit()
        pe, _ = svc.pool_add(s.id, 42)
        sg = svc.subgroup_create(s.id, "Peak")
        session.commit()

        svc.subgroup_add_track(s.id, sg.id, pe.id)
        session.commit()

        h = svc.hydrate_set(s.id)
        pool_entry_ids = {e.id for e in h["pool"]}
        membership_pe_ids = {m.pool_entry_id for m in h["pool_subgroup_memberships"]}
        assert membership_pe_ids.issubset(pool_entry_ids)

    def test_no_silent_failure_on_valid_add(self, svc: SetWorkspaceService, session: Session):
        """A valid add must return the member object without error."""
        s = svc.create_set("S")
        session.commit()
        pe, _ = svc.pool_add(s.id, 99)
        sg = svc.subgroup_create(s.id, "Chill")
        session.commit()

        member, err = svc.subgroup_add_track(s.id, sg.id, pe.id)
        assert member is not None
        assert err is None
        assert member.subgroup_id == sg.id
        assert member.pool_entry_id == pe.id


class TestEmptyRowAdd:
    def test_add_single_to_tracklist(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        svc.tracklist_add(s.id, 20)
        session.commit()

        rows = svc.empty_row_add(s.id, "tracklist", count=1, position=-1)
        session.commit()
        assert len(rows) == 1
        assert rows[0].surface == "tracklist"
        assert rows[0].position == 2

    def test_add_multiple_to_top(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()

        rows = svc.empty_row_add(s.id, "tracklist", count=3, position=0)
        session.commit()
        assert len(rows) == 3
        positions = [r.position for r in rows]
        assert positions == [0, 1, 2]

    def test_add_shifts_existing_empty_rows(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()

        first = svc.empty_row_add(s.id, "tracklist", count=1, position=0)
        session.commit()
        assert first[0].position == 0

        second = svc.empty_row_add(s.id, "tracklist", count=1, position=0)
        session.commit()
        assert second[0].position == 0

        session.refresh(first[0])
        assert first[0].position == 1

    def test_add_to_pool(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        session.commit()

        rows = svc.empty_row_add(s.id, "pool", count=2, position=-1)
        session.commit()
        assert len(rows) == 2
        assert all(r.surface == "pool" for r in rows)

    def test_add_invalid_surface(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        rows = svc.empty_row_add(s.id, "invalid", count=1)
        assert rows == []

    def test_add_visible_in_hydration(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.empty_row_add(s.id, "tracklist", count=2, position=0)
        session.commit()

        h = svc.hydrate_set(s.id)
        assert len(h["empty_rows"]) == 2


class TestEmptyRowDelete:
    def test_delete_single(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        rows = svc.empty_row_add(s.id, "tracklist", count=1, position=0)
        session.commit()
        rid = rows[0].id

        ok = svc.empty_row_delete(s.id, rid)
        session.commit()
        assert ok is True
        assert session.query(SetEmptyRow).filter_by(id=rid).count() == 0

    def test_delete_compacts_positions(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        rows = svc.empty_row_add(s.id, "tracklist", count=3, position=0)
        session.commit()
        ids = [r.id for r in rows]

        svc.empty_row_delete(s.id, ids[0])
        session.commit()

        remaining = (
            session.query(SetEmptyRow)
            .filter_by(set_id=s.id)
            .order_by(SetEmptyRow.position)
            .all()
        )
        assert len(remaining) == 2
        assert [r.position for r in remaining] == [0, 1]

    def test_delete_last_row(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        rows = svc.empty_row_add(s.id, "tracklist", count=3, position=0)
        session.commit()

        svc.empty_row_delete(s.id, rows[2].id)
        session.commit()

        remaining = (
            session.query(SetEmptyRow)
            .filter_by(set_id=s.id)
            .order_by(SetEmptyRow.position)
            .all()
        )
        assert len(remaining) == 2
        assert [r.position for r in remaining] == [0, 1]

    def test_delete_nonexistent(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok = svc.empty_row_delete(s.id, 9999)
        assert ok is False


class TestEmptyRowReorder:
    def test_reorder_forward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        rows = svc.empty_row_add(s.id, "tracklist", count=3, position=0)
        session.commit()
        ids = [r.id for r in rows]

        ok, err = svc.empty_row_reorder(s.id, ids[0], 2)
        assert ok is True
        assert err is None
        session.commit()

        reloaded = (
            session.query(SetEmptyRow)
            .filter_by(set_id=s.id)
            .order_by(SetEmptyRow.position)
            .all()
        )
        order = [(r.id, r.position) for r in reloaded]
        assert order == [(ids[1], 0), (ids[2], 1), (ids[0], 2)]

    def test_reorder_backward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        rows = svc.empty_row_add(s.id, "tracklist", count=3, position=0)
        session.commit()
        ids = [r.id for r in rows]

        ok, err = svc.empty_row_reorder(s.id, ids[2], 0)
        assert ok is True
        assert err is None
        session.commit()

        reloaded = (
            session.query(SetEmptyRow)
            .filter_by(set_id=s.id)
            .order_by(SetEmptyRow.position)
            .all()
        )
        order = [(r.id, r.position) for r in reloaded]
        assert order == [(ids[2], 0), (ids[0], 1), (ids[1], 2)]

    def test_reorder_noop(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        rows = svc.empty_row_add(s.id, "tracklist", count=1, position=0)
        session.commit()

        ok, err = svc.empty_row_reorder(s.id, rows[0].id, 0)
        assert ok is True
        assert err is None

    def test_reorder_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.empty_row_reorder(s.id, 9999, 0)
        assert ok is False
        assert "not found" in err.lower()

    def test_reorder_clamps_to_max(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        session.commit()
        rows = svc.empty_row_add(s.id, "tracklist", count=2, position=0)
        session.commit()

        ok, err = svc.empty_row_reorder(s.id, rows[0].id, 100)
        assert ok is True
        session.commit()

        session.refresh(rows[0])
        assert rows[0].position == 2

    def test_multi_reorder_no_position_collision(self, svc: SetWorkspaceService, session: Session):
        """Repeated reorders must never produce duplicate positions."""
        s = svc.create_set("S")
        session.commit()
        svc.tracklist_add(s.id, 10)
        svc.tracklist_add(s.id, 20)
        session.commit()
        rows = svc.empty_row_add(s.id, "tracklist", count=3, position=0)
        session.commit()
        ids = [r.id for r in rows]

        svc.empty_row_reorder(s.id, ids[0], 4)
        session.commit()
        svc.empty_row_reorder(s.id, ids[2], 0)
        session.commit()
        svc.empty_row_reorder(s.id, ids[1], 3)
        session.commit()

        all_rows = (
            session.query(SetEmptyRow)
            .filter_by(set_id=s.id)
            .order_by(SetEmptyRow.position)
            .all()
        )
        positions = [r.position for r in all_rows]
        assert len(positions) == len(set(positions)), f"Duplicate positions found: {positions}"

    def test_reorder_pool_surface(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        session.commit()
        rows = svc.empty_row_add(s.id, "pool", count=2, position=0)
        session.commit()

        ok, err = svc.empty_row_reorder(s.id, rows[0].id, 2)
        assert ok is True
        session.commit()

        reloaded = (
            session.query(SetEmptyRow)
            .filter_by(set_id=s.id)
            .order_by(SetEmptyRow.position)
            .all()
        )
        assert [r.id for r in reloaded] == [rows[1].id, rows[0].id]


class TestEmptyRowCascade:
    def test_delete_set_cascades_empty_rows(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.empty_row_add(s.id, "tracklist", count=2, position=0)
        session.commit()

        svc.delete_set(s.id)
        session.commit()
        assert session.query(SetEmptyRow).filter_by(set_id=s.id).count() == 0

    def test_empty_row_clear(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.empty_row_add(s.id, "tracklist", count=3, position=0)
        svc.empty_row_add(s.id, "pool", count=2, position=0)
        session.commit()

        cleared = svc.empty_row_clear(s.id, "tracklist")
        session.commit()
        assert cleared == 3
        assert session.query(SetEmptyRow).filter_by(set_id=s.id, surface="tracklist").count() == 0
        assert session.query(SetEmptyRow).filter_by(set_id=s.id, surface="pool").count() == 2
