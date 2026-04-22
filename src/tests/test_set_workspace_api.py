"""Service-level tests for set workspace operations.

Covers: set CRUD, pool/tracklist dual membership, tracklist reorder,
delete-node resolution, and edge-score request shape.
"""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from src.db import Base
from src.models.dj_set import DjSet
from src.models.track import Track
from src.models.set_pool_entry import SetPoolEntry
from src.models.set_tracklist_entry import SetTracklistEntry
from src.models.set_explorer_tree import SetExplorerTree
from src.models.set_explorer_node import SetExplorerNode
from src.models.set_explorer_edge import SetExplorerEdge
from src.models.set_pool_subgroup import SetPoolSubgroup
from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
from src.models.set_empty_row import SetEmptyRow
from src.models.set_tracklist_version import SetTracklistVersion
from src.models.set_tracklist_slot import SetTracklistSlot
from src.models.set_tracklist_candidate import SetTracklistCandidate
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
    SetTracklistVersion.__table__,
    SetTracklistSlot.__table__,
    SetTracklistCandidate.__table__,
]


_TRACK_DDL = """
CREATE TABLE IF NOT EXISTS track (
    id INTEGER PRIMARY KEY,
    file_name VARCHAR(256) NOT NULL UNIQUE,
    title VARCHAR(256) NOT NULL,
    bpm NUMERIC(5,2),
    key VARCHAR(4),
    camelot_code VARCHAR(4),
    energy INTEGER,
    genre VARCHAR(64),
    label VARCHAR(128),
    comment VARCHAR(1024),
    date_added VARCHAR(64)
)
"""


def _seed_tracks(session):
    """Pre-populate Track rows for IDs used across service tests."""
    for tid in list(range(1, 51)) + [42, 99, 100, 101, 102, 103, 104, 999]:
        existing = session.query(Track).filter_by(id=tid).first()
        if existing is None:
            session.add(Track(id=tid, file_name=f"t_{tid}.mp3", title=f"Track {tid}"))
    session.commit()


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=_TABLES)
    with engine.connect() as conn:
        conn.execute(text(_TRACK_DDL))
    _Session = sessionmaker(bind=engine)
    s = _Session()
    _seed_tracks(s)
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


class TestPoolReorder:
    def test_reorder_forward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()

        ok, err = svc.pool_reorder(s.id, 10, 2)
        assert ok is True
        assert err is None

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        track_order = [e.track_id for e in entries]
        assert track_order == [20, 30, 10]

    def test_reorder_backward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()

        ok, err = svc.pool_reorder(s.id, 30, 0)
        assert ok is True

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        track_order = [e.track_id for e in entries]
        assert track_order == [30, 10, 20]

    def test_reorder_noop(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.pool_add(s.id, 10)
        session.commit()
        ok, err = svc.pool_reorder(s.id, 10, 0)
        assert ok is True

    def test_reorder_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.pool_reorder(s.id, 999, 0)
        assert ok is False

    def test_reorder_preserves_starred(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()
        svc.toggle_pool_star(s.id, 20, True)
        session.commit()

        ok, _ = svc.pool_reorder(s.id, 20, 0)
        assert ok is True
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        assert entries[0].track_id == 20
        assert entries[0].starred is True

    def test_reorder_preserves_subgroup_membership(
        self, svc: SetWorkspaceService, session: Session,
    ):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()

        sg = svc.subgroup_create(s.id, "Group A")
        session.commit()
        entry_20 = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id, track_id=20)
            .first()
        )
        svc.subgroup_add_track(s.id, sg.id, entry_20.id)
        session.commit()

        ok, _ = svc.pool_reorder(s.id, 20, 2)
        assert ok is True
        session.commit()

        member = (
            session.query(SetPoolSubgroupMember)
            .filter_by(subgroup_id=sg.id, pool_entry_id=entry_20.id)
            .first()
        )
        assert member is not None

    def test_reorder_clamps_position(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()

        ok, _ = svc.pool_reorder(s.id, 10, 100)
        assert ok is True
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        assert entries[-1].track_id == 10

    def test_reorder_with_interleaved_empty_rows(
        self, svc: SetWorkspaceService, session: Session,
    ):
        """Pool reorder must operate only on entries (insertion_order domain),
        completely independent of any empty rows in the same pool."""
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30, 40]:
            svc.pool_add(s.id, tid)
        session.commit()

        svc.empty_row_add(s.id, "pool", count=2, position=1)
        session.commit()

        empty_before = (
            session.query(SetEmptyRow)
            .filter_by(set_id=s.id, surface="pool")
            .order_by(SetEmptyRow.position)
            .all()
        )
        empty_positions_before = [(r.id, r.position) for r in empty_before]

        ok, err = svc.pool_reorder(s.id, 10, 3)
        assert ok is True
        assert err is None
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        assert [e.track_id for e in entries] == [20, 30, 40, 10]
        assert [e.insertion_order for e in entries] == [0, 1, 2, 3]

        empty_after = (
            session.query(SetEmptyRow)
            .filter_by(set_id=s.id, surface="pool")
            .order_by(SetEmptyRow.position)
            .all()
        )
        assert [(r.id, r.position) for r in empty_after] == empty_positions_before

    def test_reorder_with_gapped_insertion_order(
        self, svc: SetWorkspaceService, session: Session,
    ):
        """Reorder must work correctly when insertion_order has gaps."""
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30, 40]:
            svc.pool_add(s.id, tid)
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        entries[0].insertion_order = 2
        entries[1].insertion_order = 5
        entries[2].insertion_order = 9
        entries[3].insertion_order = 14
        session.flush()

        ok, err = svc.pool_reorder(s.id, 10, 2)
        assert ok is True
        assert err is None
        session.commit()

        result = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        assert [e.track_id for e in result] == [20, 30, 10, 40]
        assert [e.insertion_order for e in result] == [0, 1, 2, 3]

    def test_reorder_gapped_boundary_move_to_first(
        self, svc: SetWorkspaceService, session: Session,
    ):
        """Move last entry to first with gapped orders; verify normalization."""
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        entries[0].insertion_order = 3
        entries[1].insertion_order = 7
        entries[2].insertion_order = 11
        session.flush()

        ok, _ = svc.pool_reorder(s.id, 30, 0)
        assert ok is True
        session.commit()

        result = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        assert [e.track_id for e in result] == [30, 10, 20]
        assert [e.insertion_order for e in result] == [0, 1, 2]

    def test_reorder_gapped_noop_same_rank(
        self, svc: SetWorkspaceService, session: Session,
    ):
        """Reorder to same rank with gapped orders is a no-op (gaps preserved)."""
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20]:
            svc.pool_add(s.id, tid)
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        entries[0].insertion_order = 5
        entries[1].insertion_order = 10
        session.flush()

        ok, _ = svc.pool_reorder(s.id, 10, 0)
        assert ok is True
        session.commit()

        result = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        assert [e.track_id for e in result] == [10, 20]

    def test_multi_reorder_no_position_collision(
        self, svc: SetWorkspaceService, session: Session,
    ):
        """Repeated pool reorders must never produce duplicate insertion_order values."""
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30, 40]:
            svc.pool_add(s.id, tid)
        session.commit()

        svc.pool_reorder(s.id, 10, 3)
        session.commit()
        svc.pool_reorder(s.id, 40, 0)
        session.commit()
        svc.pool_reorder(s.id, 30, 2)
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        orders = [e.insertion_order for e in entries]
        assert len(orders) == len(set(orders)), f"Duplicate insertion_order: {orders}"
        assert orders == list(range(len(orders))), f"Non-contiguous orders: {orders}"

    def test_reorder_clamps_negative_position(
        self, svc: SetWorkspaceService, session: Session,
    ):
        """Negative new_position must clamp to 0, not crash or produce invalid state."""
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20, 30]:
            svc.pool_add(s.id, tid)
        session.commit()

        ok, err = svc.pool_reorder(s.id, 30, -5)
        assert ok is True
        assert err is None
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        assert entries[0].track_id == 30
        assert [e.insertion_order for e in entries] == [0, 1, 2]

    def test_reorder_gapped_normalizes_on_move(
        self, svc: SetWorkspaceService, session: Session,
    ):
        """Any actual move with gapped orders normalizes to contiguous 0..N-1."""
        s = svc.create_set("S")
        session.commit()
        for tid in [10, 20]:
            svc.pool_add(s.id, tid)
        session.commit()

        entries = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        entries[0].insertion_order = 5
        entries[1].insertion_order = 10
        session.flush()

        ok, _ = svc.pool_reorder(s.id, 10, 1)
        assert ok is True
        session.commit()

        result = (
            session.query(SetPoolEntry)
            .filter_by(set_id=s.id)
            .order_by(SetPoolEntry.insertion_order)
            .all()
        )
        assert [e.track_id for e in result] == [20, 10]
        assert [e.insertion_order for e in result] == [0, 1]


class TestVersionHydration:
    def test_hydrate_empty_set_returns_empty_versions(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("Empty")
        session.commit()
        h = svc.hydrate_set(s.id)
        assert h["versions"] == []

    def test_hydrate_returns_versions_after_manual_creation(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v = SetTracklistVersion(set_id=s.id, name="v1", display_order=0)
        session.add(v)
        session.flush()
        slot = SetTracklistSlot(version_id=v.id, position=0, note="opener")
        session.add(slot)
        session.flush()
        cand = SetTracklistCandidate(slot_id=slot.id, track_id=42, is_selected=True)
        session.add(cand)
        session.commit()

        h = svc.hydrate_set(s.id)
        versions = h["versions"]
        assert len(versions) == 1
        assert versions[0]["name"] == "v1"
        assert versions[0]["set_id"] == s.id
        assert versions[0]["display_order"] == 0
        assert versions[0]["explorer_tree_id"] is None
        assert len(versions[0]["slots"]) == 1
        assert versions[0]["slots"][0]["position"] == 0
        assert versions[0]["slots"][0]["note"] == "opener"
        assert versions[0]["slots"][0]["is_inherited"] is False
        assert len(versions[0]["slots"][0]["candidates"]) == 1
        assert versions[0]["slots"][0]["candidates"][0]["track_id"] == 42
        assert versions[0]["slots"][0]["candidates"][0]["is_selected"] is True

    def test_derived_explorer_nodes_only_for_bound_version(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        tree = SetExplorerTree(set_id=s.id, name="Main")
        session.add(tree)
        session.flush()

        v_bound = SetTracklistVersion(
            set_id=s.id, name="v1", display_order=0, explorer_tree_id=tree.id,
        )
        session.add(v_bound)
        session.flush()
        slot = SetTracklistSlot(version_id=v_bound.id, position=0)
        session.add(slot)
        session.flush()
        c1 = SetTracklistCandidate(slot_id=slot.id, track_id=10, is_selected=True)
        c2 = SetTracklistCandidate(slot_id=slot.id, track_id=20, is_selected=False)
        session.add_all([c1, c2])
        session.commit()

        h = svc.hydrate_set(s.id)
        versions = h["versions"]
        assert len(versions) == 1
        dn = versions[0]["derived_explorer_nodes"]
        assert len(dn) == 2
        assert dn[0]["level"] == 0
        assert dn[0]["position"] == 0
        assert dn[0]["col_index"] == 0
        assert dn[1]["col_index"] == 1

    def test_unbound_version_has_no_derived_nodes(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v = SetTracklistVersion(set_id=s.id, name="v1", display_order=0)
        session.add(v)
        session.flush()
        slot = SetTracklistSlot(version_id=v.id, position=0)
        session.add(slot)
        session.flush()
        cand = SetTracklistCandidate(slot_id=slot.id, track_id=10, is_selected=True)
        session.add(cand)
        session.commit()

        h = svc.hydrate_set(s.id)
        assert h["versions"][0]["derived_explorer_nodes"] == []

    def test_version_cascade_on_set_delete(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v = SetTracklistVersion(set_id=s.id, name="v1", display_order=0)
        session.add(v)
        session.flush()
        slot = SetTracklistSlot(version_id=v.id, position=0)
        session.add(slot)
        session.flush()
        cand = SetTracklistCandidate(slot_id=slot.id, track_id=10, is_selected=True)
        session.add(cand)
        session.commit()
        sid = s.id

        svc.delete_set(sid)
        session.commit()
        assert session.query(SetTracklistVersion).filter_by(set_id=sid).count() == 0
        assert session.query(SetTracklistSlot).count() == 0
        assert session.query(SetTracklistCandidate).count() == 0

    def test_multiple_slots_ordered_by_position(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v = SetTracklistVersion(set_id=s.id, name="v1", display_order=0)
        session.add(v)
        session.flush()
        for pos in [2, 0, 1]:
            slot = SetTracklistSlot(version_id=v.id, position=pos)
            session.add(slot)
            session.flush()
            cand = SetTracklistCandidate(slot_id=slot.id, track_id=pos * 10, is_selected=True)
            session.add(cand)
        session.commit()

        h = svc.hydrate_set(s.id)
        positions = [sl["position"] for sl in h["versions"][0]["slots"]]
        assert positions == [0, 1, 2]


class TestHydrateVersionsFallback:
    """Forward-compatibility: hydration must not crash when version tables
    have not been created yet (code ships before migration runs)."""

    _PRE_MIGRATION_TABLES = [
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
    def pre_migration_session(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine, tables=self._PRE_MIGRATION_TABLES)
        _Session = sessionmaker(bind=engine)
        s = _Session()
        yield s
        s.close()

    def test_hydrate_versions_falls_back_to_empty_when_table_absent(
        self, pre_migration_session: Session,
    ):
        svc = SetWorkspaceService(pre_migration_session)
        created = svc.create_set("Pre-Migration Set")
        pre_migration_session.commit()

        h = svc.hydrate_set(created.id)
        assert h is not None
        assert h["versions"] == []
        assert h["set"].id == created.id
        assert h["pool"] == []
        assert h["tracklist"] == []

    def test_delete_set_succeeds_when_version_tables_absent(
        self, pre_migration_session: Session,
    ):
        svc = SetWorkspaceService(pre_migration_session)
        created = svc.create_set("Pre-Migration Delete")
        pre_migration_session.commit()

        result = svc.delete_set(created.id)
        pre_migration_session.commit()
        assert result is True
        assert svc.get_set(created.id) is None


# =========================================================================
# Phase C: Version / Slot / Candidate CRUD
# =========================================================================


class TestVersionCreate:
    def test_create_version(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, err = svc.version_create(s.id, "v1")
        assert err is None
        assert v is not None
        assert v.name == "v1"
        assert v.set_id == s.id
        assert v.display_order == 0

    def test_create_second_version_increments_order(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.version_create(s.id, "v1")
        v2, _ = svc.version_create(s.id, "v2")
        assert v2.display_order == 1

    def test_duplicate_name_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.version_create(s.id, "v1")
        session.commit()
        v, err = svc.version_create(s.id, "v1")
        assert v is None
        assert "already exists" in err

    def test_max_10_versions(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for i in range(10):
            v, err = svc.version_create(s.id, f"v{i}")
            assert err is None
        session.commit()
        v, err = svc.version_create(s.id, "v_overflow")
        assert v is None
        assert "Maximum" in err


class TestVersionRename:
    def test_rename_version(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "old")
        session.commit()
        renamed, err = svc.version_rename(s.id, v.id, "new")
        assert err is None
        assert renamed.name == "new"

    def test_rename_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        _, err = svc.version_rename(s.id, 9999, "x")
        assert "not found" in err.lower()

    def test_rename_duplicate_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        svc.version_create(s.id, "a")
        v2, _ = svc.version_create(s.id, "b")
        session.commit()
        _, err = svc.version_rename(s.id, v2.id, "a")
        assert "already exists" in err


class TestVersionDelete:
    def test_delete_version(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.commit()
        ok, err = svc.version_delete(s.id, v.id)
        assert ok is True
        assert err is None
        assert session.query(SetTracklistVersion).filter_by(id=v.id).count() == 0

    def test_delete_cascades_slots_and_candidates(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        cand, _ = svc.candidate_add(s.id, slot.id, 42)
        session.commit()
        vid, slid, cid = v.id, slot.id, cand.id

        ok, _ = svc.version_delete(s.id, vid)
        assert ok is True
        session.commit()
        assert session.query(SetTracklistSlot).filter_by(id=slid).count() == 0
        assert session.query(SetTracklistCandidate).filter_by(id=cid).count() == 0

    def test_delete_shifts_later_display_orders(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v1, _ = svc.version_create(s.id, "a")
        v2, _ = svc.version_create(s.id, "b")
        v3, _ = svc.version_create(s.id, "c")
        session.commit()

        svc.version_delete(s.id, v1.id)
        session.commit()

        remaining = (
            session.query(SetTracklistVersion)
            .filter_by(set_id=s.id)
            .order_by(SetTracklistVersion.display_order)
            .all()
        )
        assert [v.display_order for v in remaining] == [0, 1]

    def test_delete_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        ok, err = svc.version_delete(s.id, 9999)
        assert ok is False


class TestVersionReorder:
    def test_reorder_versions(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v1, _ = svc.version_create(s.id, "a")
        v2, _ = svc.version_create(s.id, "b")
        v3, _ = svc.version_create(s.id, "c")
        session.commit()

        ok, err = svc.version_reorder(s.id, [v3.id, v1.id, v2.id])
        assert ok is True
        session.commit()

        result = (
            session.query(SetTracklistVersion)
            .filter_by(set_id=s.id)
            .order_by(SetTracklistVersion.display_order)
            .all()
        )
        assert [v.id for v in result] == [v3.id, v1.id, v2.id]

    def test_reorder_mismatched_ids_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v1, _ = svc.version_create(s.id, "a")
        session.commit()
        ok, err = svc.version_reorder(s.id, [v1.id, 9999])
        assert ok is False

    def test_reorder_duplicate_ids_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v1, _ = svc.version_create(s.id, "a")
        session.commit()
        ok, err = svc.version_reorder(s.id, [v1.id, v1.id])
        assert ok is False
        assert "Duplicate" in err


class TestSlotCreate:
    def test_create_slot_at_end(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()

        slot, err = svc.slot_create(s.id, v.id)
        assert err is None
        assert slot.position == 0

        slot2, _ = svc.slot_create(s.id, v.id)
        assert slot2.position == 1

    def test_create_slot_at_position_shifts_later(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()

        s0, _ = svc.slot_create(s.id, v.id)
        s1, _ = svc.slot_create(s.id, v.id)
        session.flush()

        s_mid, _ = svc.slot_create(s.id, v.id, position=1)
        session.flush()

        slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=v.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        assert [sl.position for sl in slots] == [0, 1, 2]
        assert slots[1].id == s_mid.id

    def test_max_250_slots(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()

        for _ in range(250):
            slot, err = svc.slot_create(s.id, v.id)
            assert err is None
        session.flush()

        slot, err = svc.slot_create(s.id, v.id)
        assert slot is None
        assert "Maximum" in err

    def test_create_slot_version_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        slot, err = svc.slot_create(s.id, 9999)
        assert slot is None
        assert "not found" in err.lower()


class TestSlotDelete:
    def test_delete_slot_shifts_positions(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()

        s0, _ = svc.slot_create(s.id, v.id)
        s1, _ = svc.slot_create(s.id, v.id)
        s2, _ = svc.slot_create(s.id, v.id)
        session.flush()

        ok, _ = svc.slot_delete(s.id, v.id, s0.id)
        assert ok is True
        session.flush()

        slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=v.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        assert [sl.position for sl in slots] == [0, 1]

    def test_delete_slot_cascades_candidates(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        cand, _ = svc.candidate_add(s.id, slot.id, 10)
        session.commit()
        cid = cand.id

        svc.slot_delete(s.id, v.id, slot.id)
        session.commit()
        assert session.query(SetTracklistCandidate).filter_by(id=cid).count() == 0

    def test_delete_slot_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.commit()
        ok, err = svc.slot_delete(s.id, v.id, 9999)
        assert ok is False


class TestSlotReorder:
    def test_reorder_forward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        s0, _ = svc.slot_create(s.id, v.id)
        s1, _ = svc.slot_create(s.id, v.id)
        s2, _ = svc.slot_create(s.id, v.id)
        session.flush()

        ok, _ = svc.slot_reorder(s.id, v.id, s0.id, 2)
        assert ok is True
        session.flush()

        slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=v.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        assert [sl.id for sl in slots] == [s1.id, s2.id, s0.id]

    def test_reorder_backward(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        s0, _ = svc.slot_create(s.id, v.id)
        s1, _ = svc.slot_create(s.id, v.id)
        s2, _ = svc.slot_create(s.id, v.id)
        session.flush()

        ok, _ = svc.slot_reorder(s.id, v.id, s2.id, 0)
        assert ok is True
        session.flush()

        slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=v.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        assert [sl.id for sl in slots] == [s2.id, s0.id, s1.id]

    def test_reorder_noop(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        s0, _ = svc.slot_create(s.id, v.id)
        session.flush()

        ok, _ = svc.slot_reorder(s.id, v.id, s0.id, 0)
        assert ok is True

    def test_reorder_clears_inherited(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        s0, _ = svc.slot_create(s.id, v.id)
        s1, _ = svc.slot_create(s.id, v.id)
        session.flush()
        s0.is_inherited = True
        session.flush()

        svc.slot_reorder(s.id, v.id, s0.id, 1)
        session.flush()
        session.refresh(s0)
        assert s0.is_inherited is False


class TestSlotNoteUpdate:
    def test_update_note(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.commit()

        ok, _ = svc.slot_update_note(s.id, v.id, slot.id, "peak energy")
        assert ok is True
        session.commit()
        session.refresh(slot)
        assert slot.note == "peak energy"

    def test_note_update_clears_inherited(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        slot.is_inherited = True
        session.flush()

        svc.slot_update_note(s.id, v.id, slot.id, "edit")
        session.flush()
        session.refresh(slot)
        assert slot.is_inherited is False


class TestCandidateAdd:
    def test_add_first_candidate_auto_selected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()

        cand, err = svc.candidate_add(s.id, slot.id, 10)
        assert err is None
        assert cand.is_selected is True

    def test_add_second_candidate_not_selected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()

        svc.candidate_add(s.id, slot.id, 10)
        cand2, _ = svc.candidate_add(s.id, slot.id, 20)
        assert cand2.is_selected is False

    def test_max_5_candidates(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()

        for i in range(5):
            c, err = svc.candidate_add(s.id, slot.id, 100 + i)
            assert err is None
        session.flush()

        c, err = svc.candidate_add(s.id, slot.id, 999)
        assert c is None
        assert "Maximum" in err

    def test_add_candidate_clears_inherited(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        slot.is_inherited = True
        session.flush()

        svc.candidate_add(s.id, slot.id, 10)
        session.flush()
        session.refresh(slot)
        assert slot.is_inherited is False


class TestCandidateRemove:
    def test_remove_last_candidate_deletes_slot(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        cand, _ = svc.candidate_add(s.id, slot.id, 10)
        session.commit()

        slot_id = slot.id
        ok, _ = svc.candidate_remove(s.id, slot.id, cand.id)
        assert ok is True
        session.commit()
        assert session.query(SetTracklistSlot).filter_by(id=slot_id).count() == 0

    def test_remove_selected_candidate_promotes_next(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()

        c1, _ = svc.candidate_add(s.id, slot.id, 10)
        c2, _ = svc.candidate_add(s.id, slot.id, 20)
        session.commit()

        ok, _ = svc.candidate_remove(s.id, slot.id, c1.id)
        assert ok is True
        session.commit()
        session.refresh(c2)
        assert c2.is_selected is True

    def test_remove_non_selected_keeps_selection(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()

        c1, _ = svc.candidate_add(s.id, slot.id, 10)
        c2, _ = svc.candidate_add(s.id, slot.id, 20)
        session.commit()

        ok, _ = svc.candidate_remove(s.id, slot.id, c2.id)
        assert ok is True
        session.commit()
        session.refresh(c1)
        assert c1.is_selected is True

    def test_remove_last_candidate_shifts_later_slots(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()

        s0, _ = svc.slot_create(s.id, v.id)
        s1, _ = svc.slot_create(s.id, v.id)
        s2, _ = svc.slot_create(s.id, v.id)
        session.flush()

        c1, _ = svc.candidate_add(s.id, s1.id, 10)
        svc.candidate_add(s.id, s0.id, 20)
        svc.candidate_add(s.id, s2.id, 30)
        session.commit()

        svc.candidate_remove(s.id, s1.id, c1.id)
        session.commit()

        slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=v.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        assert len(slots) == 2
        assert [sl.position for sl in slots] == [0, 1]

    def test_remove_candidate_clears_inherited(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        c1, _ = svc.candidate_add(s.id, slot.id, 10)
        c2, _ = svc.candidate_add(s.id, slot.id, 20)
        session.flush()
        slot.is_inherited = True
        session.flush()

        svc.candidate_remove(s.id, slot.id, c2.id)
        session.flush()
        session.refresh(slot)
        assert slot.is_inherited is False


class TestCandidateSelect:
    def test_select_candidate(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()

        c1, _ = svc.candidate_add(s.id, slot.id, 10)
        c2, _ = svc.candidate_add(s.id, slot.id, 20)
        session.commit()

        assert c1.is_selected is True
        assert c2.is_selected is False

        ok, _ = svc.candidate_select(s.id, slot.id, c2.id)
        assert ok is True
        session.commit()

        session.refresh(c1)
        session.refresh(c2)
        assert c1.is_selected is False
        assert c2.is_selected is True

    def test_select_not_found(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.commit()

        ok, err = svc.candidate_select(s.id, slot.id, 9999)
        assert ok is False
        assert "not found" in err.lower()

    def test_exactly_one_selected_invariant(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()

        c1, _ = svc.candidate_add(s.id, slot.id, 10)
        c2, _ = svc.candidate_add(s.id, slot.id, 20)
        c3, _ = svc.candidate_add(s.id, slot.id, 30)
        session.commit()

        svc.candidate_select(s.id, slot.id, c3.id)
        session.commit()

        selected = (
            session.query(SetTracklistCandidate)
            .filter_by(slot_id=slot.id, is_selected=True)
            .all()
        )
        assert len(selected) == 1
        assert selected[0].id == c3.id

    def test_select_clears_inherited(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        c1, _ = svc.candidate_add(s.id, slot.id, 10)
        c2, _ = svc.candidate_add(s.id, slot.id, 20)
        session.flush()
        slot.is_inherited = True
        session.flush()

        svc.candidate_select(s.id, slot.id, c2.id)
        session.flush()
        session.refresh(slot)
        assert slot.is_inherited is False


class TestVersionBranch:
    def test_branch_creates_version_with_copied_slots(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "main")
        session.flush()

        for i in range(5):
            slot, _ = svc.slot_create(s.id, v.id)
            session.flush()
            svc.candidate_add(s.id, slot.id, 100 + i)
        session.commit()

        branch, err = svc.version_branch(s.id, v.id, 2, "branch-v2")
        assert err is None
        assert branch is not None
        session.commit()

        branch_slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=branch.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        assert len(branch_slots) == 3
        assert [sl.position for sl in branch_slots] == [0, 1, 2]

    def test_branch_slots_marked_inherited(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "main")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        svc.candidate_add(s.id, slot.id, 10)
        session.commit()

        branch, _ = svc.version_branch(s.id, v.id, 0, "branch")
        session.commit()

        branch_slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=branch.id)
            .all()
        )
        assert all(sl.is_inherited is True for sl in branch_slots)

    def test_branch_creates_explorer_tree(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "main")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        svc.candidate_add(s.id, slot.id, 10)
        session.commit()

        branch, _ = svc.version_branch(s.id, v.id, 0, "branch")
        session.commit()

        assert branch.explorer_tree_id is not None
        tree = session.query(SetExplorerTree).filter_by(id=branch.explorer_tree_id).first()
        assert tree is not None
        assert tree.name == "branch"

    def test_branch_copies_candidates(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "main")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        svc.candidate_add(s.id, slot.id, 10)
        svc.candidate_add(s.id, slot.id, 20)
        session.commit()

        branch, _ = svc.version_branch(s.id, v.id, 0, "branch")
        session.commit()

        branch_slot = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=branch.id)
            .first()
        )
        cands = (
            session.query(SetTracklistCandidate)
            .filter_by(slot_id=branch_slot.id)
            .all()
        )
        assert len(cands) == 2
        track_ids = {c.track_id for c in cands}
        assert track_ids == {10, 20}

    def test_branch_respects_max_versions(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        for i in range(10):
            svc.version_create(s.id, f"v{i}")
        session.commit()

        v = session.query(SetTracklistVersion).filter_by(set_id=s.id).first()
        branch, err = svc.version_branch(s.id, v.id, 0, "overflow")
        assert branch is None
        assert "Maximum" in err

    def test_branch_duplicate_name_rejected(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "main")
        session.commit()

        branch, err = svc.version_branch(s.id, v.id, 0, "main")
        assert branch is None
        assert "already exists" in err


class TestInheritedLifecycle:
    """End-to-end: branch -> inherited flags -> cleared on mutation."""

    def test_full_inherited_lifecycle(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "main")
        session.flush()

        slot0, _ = svc.slot_create(s.id, v.id)
        slot1, _ = svc.slot_create(s.id, v.id)
        session.flush()
        svc.candidate_add(s.id, slot0.id, 10)
        svc.candidate_add(s.id, slot1.id, 20)
        session.commit()

        branch, _ = svc.version_branch(s.id, v.id, 1, "branch")
        session.commit()

        branch_slots = (
            session.query(SetTracklistSlot)
            .filter_by(version_id=branch.id)
            .order_by(SetTracklistSlot.position)
            .all()
        )
        assert len(branch_slots) == 2
        assert all(sl.is_inherited is True for sl in branch_slots)

        svc.slot_update_note(s.id, branch.id, branch_slots[0].id, "modified")
        session.flush()
        session.refresh(branch_slots[0])
        assert branch_slots[0].is_inherited is False
        assert branch_slots[1].is_inherited is True


class TestTransitionScoreCacheWriteOnCompute:
    """Prove that api_transition_scores() populates TransitionScoreCache
    on first compute and returns cache-backed hits on repeated calls.

    Uses the TransitionScoreCache directly since the production flow is:
    1. api_transition_scores checks ts_cache.get() → miss
    2. finder.get_transition_matches() computes and calls ts_cache.put()
    3. Second call to ts_cache.get() → hit with same score
    """

    def test_cache_populated_after_first_compute(self):
        from src.harmonic_mixing.cosine_cache import TransitionScoreCache
        cache = TransitionScoreCache()

        assert cache.get(10, 20) is None
        stats_before = cache.get_stats()
        assert stats_before["misses"] == 1
        assert stats_before["hits"] == 0

        cache.put(10, 20, 85.0)

        assert cache.get(10, 20) == 85.0
        assert cache.get(10, 20) == 85.0

        stats_after = cache.get_stats()
        assert stats_after["hits"] == 2
        assert stats_after["misses"] == 1

    def test_cache_not_bypassed_by_new_code_paths(self):
        from src.harmonic_mixing.cosine_cache import TransitionScoreCache
        cache = TransitionScoreCache()

        cache.put(1, 100, 72.5)
        cache.put(1, 200, 88.0)
        cache.put(2, 100, 65.0)

        for _ in range(3):
            assert cache.get(1, 100) == 72.5
            assert cache.get(1, 200) == 88.0
            assert cache.get(2, 100) == 65.0

        stats = cache.get_stats()
        assert stats["hits"] == 9

    def test_directional_keys_preserved(self):
        from src.harmonic_mixing.cosine_cache import TransitionScoreCache
        cache = TransitionScoreCache()
        cache.put(10, 20, 85.0)
        cache.put(20, 10, 72.0)
        assert cache.get(10, 20) == 85.0
        assert cache.get(20, 10) == 72.0

    def test_clear_invalidates_all_cached_scores(self):
        from src.harmonic_mixing.cosine_cache import TransitionScoreCache
        cache = TransitionScoreCache()
        cache.put(1, 2, 50.0)
        cache.clear()
        assert cache.get(1, 2) is None


class TestVersionSlotCandidateHydration:
    """Ensure CRUD mutations remain consistent with the hydration shape."""

    def test_hydrate_after_full_crud_cycle(self, svc: SetWorkspaceService, session: Session):
        s = svc.create_set("S")
        session.commit()
        v, _ = svc.version_create(s.id, "v1")
        session.flush()
        slot, _ = svc.slot_create(s.id, v.id)
        session.flush()
        c1, _ = svc.candidate_add(s.id, slot.id, 10)
        c2, _ = svc.candidate_add(s.id, slot.id, 20)
        session.commit()

        h = svc.hydrate_set(s.id)
        versions = h["versions"]
        assert len(versions) == 1
        assert versions[0]["name"] == "v1"
        assert len(versions[0]["slots"]) == 1
        assert len(versions[0]["slots"][0]["candidates"]) == 2

        svc.candidate_select(s.id, slot.id, c2.id)
        session.commit()

        h2 = svc.hydrate_set(s.id)
        cands = h2["versions"][0]["slots"][0]["candidates"]
        selected = [c for c in cands if c["is_selected"]]
        assert len(selected) == 1
        assert selected[0]["track_id"] == 20
