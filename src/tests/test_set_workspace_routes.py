"""HTTP-layer tests for set workspace CRUD endpoints.

Uses FastAPI TestClient to exercise the route layer directly,
verifying status codes, response shapes, and error-detail formatting.
"""

import pytest
from unittest.mock import patch
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from src.db import Base
from src.api.app import create_app
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


class _FakeSessionProxy:
    """Mimics the database proxy returned by _get_session() in routes.py."""

    def __init__(self, real_session):
        self._session = real_session
        self.session = real_session

    def query(self, *a, **kw):
        return self._session.query(*a, **kw)

    def add(self, *a, **kw):
        return self._session.add(*a, **kw)

    def commit(self):
        self._session.commit()

    def rollback(self):
        self._session.rollback()

    def flush(self):
        self._session.flush()

    def close(self):
        pass

    def delete(self, *a, **kw):
        return self._session.delete(*a, **kw)


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


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=_TABLES)
    with engine.connect() as conn:
        conn.execute(text(_TRACK_DDL))
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def client(db):
    app = create_app()
    proxy = _FakeSessionProxy(db)
    with patch("src.api.routes._get_session", return_value=proxy):
        yield TestClient(app)


@pytest.fixture
def seed_set(client):
    """Create a set and return its id."""
    resp = client.post("/api/sets", json={"name": "Test Set"})
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.fixture
def seed_tracks(db):
    """Insert sample tracks and return their ids."""
    ids = []
    for i in range(1, 8):
        t = Track(id=i, file_name=f"track_{i}.mp3", title=f"Track {i}")
        db.add(t)
        ids.append(i)
    db.commit()
    return ids


# =========================================================================
# Version endpoints
# =========================================================================


class TestVersionRoutes:
    def test_create_version_201(self, client, seed_set):
        resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "v1"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["name"] == "v1"
        assert "display_order" in body

    def test_create_version_409_limit(self, client, seed_set):
        for i in range(10):
            r = client.post(
                f"/api/sets/{seed_set}/versions",
                json={"name": f"v{i}"},
            )
            assert r.status_code == 201

        resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "overflow"},
        )
        assert resp.status_code == 409
        assert "Maximum" in resp.json()["detail"]

    def test_list_versions_via_hydrate(self, client, seed_set):
        client.post(f"/api/sets/{seed_set}/versions", json={"name": "v1"})
        resp = client.get(f"/api/sets/{seed_set}")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["versions"]) == 1

    def test_delete_version_204(self, client, seed_set):
        create_resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "ephemeral"},
        )
        vid = create_resp.json()["id"]
        resp = client.delete(f"/api/sets/{seed_set}/versions/{vid}")
        assert resp.status_code == 204

    def test_delete_version_404(self, client, seed_set):
        resp = client.delete(f"/api/sets/{seed_set}/versions/99999")
        assert resp.status_code == 404

    def test_rename_version_200(self, client, seed_set):
        create_resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "original"},
        )
        vid = create_resp.json()["id"]
        resp = client.patch(
            f"/api/sets/{seed_set}/versions/{vid}",
            json={"name": "renamed"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "renamed"
        assert body["id"] == vid

    def test_rename_version_404(self, client, seed_set):
        resp = client.patch(
            f"/api/sets/{seed_set}/versions/99999",
            json={"name": "nope"},
        )
        assert resp.status_code == 404

    def test_reorder_versions_200(self, client, seed_set):
        v1 = client.post(
            f"/api/sets/{seed_set}/versions", json={"name": "v1"},
        ).json()["id"]
        v2 = client.post(
            f"/api/sets/{seed_set}/versions", json={"name": "v2"},
        ).json()["id"]
        resp = client.post(
            f"/api/sets/{seed_set}/versions/reorder",
            json={"version_ids": [v2, v1]},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_reorder_versions_400_mismatch(self, client, seed_set):
        client.post(
            f"/api/sets/{seed_set}/versions", json={"name": "v1"},
        )
        resp = client.post(
            f"/api/sets/{seed_set}/versions/reorder",
            json={"version_ids": [99999]},
        )
        assert resp.status_code == 400


# =========================================================================
# Slot endpoints
# =========================================================================


class TestSlotRoutes:
    def _make_version(self, client, set_id):
        resp = client.post(
            f"/api/sets/{set_id}/versions",
            json={"name": "v1"},
        )
        return resp.json()["id"]

    def test_create_slot_201(self, client, seed_set):
        vid = self._make_version(client, seed_set)
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots",
            json={},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["position"] == 0

    def test_create_slot_409_limit(self, client, seed_set):
        vid = self._make_version(client, seed_set)
        for _ in range(250):
            r = client.post(
                f"/api/sets/{seed_set}/versions/{vid}/slots",
                json={},
            )
            assert r.status_code == 201

        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots",
            json={},
        )
        assert resp.status_code == 409
        assert "Maximum" in resp.json()["detail"]

    def test_delete_slot_204(self, client, seed_set):
        vid = self._make_version(client, seed_set)
        slot_resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots",
            json={},
        )
        slot_id = slot_resp.json()["id"]
        resp = client.delete(
            f"/api/sets/{seed_set}/versions/{vid}/slots/{slot_id}",
        )
        assert resp.status_code == 204

    def test_reorder_slots_200(self, client, seed_set):
        vid = self._make_version(client, seed_set)
        s0 = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots", json={},
        ).json()["id"]
        client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots", json={},
        )
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots/reorder",
            json={"slot_id": s0, "new_position": 1},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_reorder_slots_400_bad_slot(self, client, seed_set):
        vid = self._make_version(client, seed_set)
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots/reorder",
            json={"slot_id": 99999, "new_position": 0},
        )
        assert resp.status_code == 400


# =========================================================================
# Candidate endpoints
# =========================================================================


class TestCandidateRoutes:
    def _make_slot(self, client, set_id):
        v_resp = client.post(
            f"/api/sets/{set_id}/versions",
            json={"name": "v1"},
        )
        vid = v_resp.json()["id"]
        s_resp = client.post(
            f"/api/sets/{set_id}/versions/{vid}/slots",
            json={},
        )
        return vid, s_resp.json()["id"]

    def test_add_candidate_201(self, client, seed_set, seed_tracks):
        _, slot_id = self._make_slot(client, seed_set)
        resp = client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": seed_tracks[0]},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["track_id"] == seed_tracks[0]
        assert body["is_selected"] is True

    def test_add_candidate_409_limit(self, client, seed_set, seed_tracks):
        _, slot_id = self._make_slot(client, seed_set)
        for i in range(5):
            r = client.post(
                f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
                json={"track_id": seed_tracks[i]},
            )
            assert r.status_code == 201

        resp = client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": seed_tracks[5]},
        )
        assert resp.status_code == 409
        assert "Maximum" in resp.json()["detail"]

    def test_add_candidate_404_missing_track(self, client, seed_set):
        _, slot_id = self._make_slot(client, seed_set)
        resp = client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": 99999},
        )
        assert resp.status_code == 404
        assert "Track not found" in resp.json()["detail"]

    def test_add_candidate_409_duplicate(self, client, seed_set, seed_tracks):
        _, slot_id = self._make_slot(client, seed_set)
        resp1 = client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": seed_tracks[0]},
        )
        assert resp1.status_code == 201

        resp2 = client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": seed_tracks[0]},
        )
        assert resp2.status_code == 409
        assert "already exists" in resp2.json()["detail"].lower()

    def test_delete_candidate_204(self, client, seed_set, seed_tracks):
        _, slot_id = self._make_slot(client, seed_set)
        add_resp = client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": seed_tracks[0]},
        )
        cand_id = add_resp.json()["id"]
        resp = client.delete(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates/{cand_id}",
        )
        assert resp.status_code == 204

    def test_select_candidate_200(self, client, seed_set, seed_tracks):
        _, slot_id = self._make_slot(client, seed_set)
        client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": seed_tracks[0]},
        )
        c2 = client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": seed_tracks[1]},
        ).json()["id"]
        resp = client.patch(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates/{c2}/select",
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_select_candidate_404_not_found(self, client, seed_set, seed_tracks):
        _, slot_id = self._make_slot(client, seed_set)
        resp = client.patch(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates/99999/select",
        )
        assert resp.status_code == 404


# =========================================================================
# Branch endpoint
# =========================================================================


class TestBranchRoutes:
    def _make_version_with_slots(self, client, db, set_id, seed_tracks, slot_count=3):
        v_resp = client.post(
            f"/api/sets/{set_id}/versions",
            json={"name": "main"},
        )
        vid = v_resp.json()["id"]
        for i in range(slot_count):
            s_resp = client.post(
                f"/api/sets/{set_id}/versions/{vid}/slots",
                json={},
            )
            slot_id = s_resp.json()["id"]
            client.post(
                f"/api/sets/{set_id}/slots/{slot_id}/candidates",
                json={"track_id": seed_tracks[i]},
            )
        return vid

    def test_branch_201(self, client, db, seed_set, seed_tracks):
        vid = self._make_version_with_slots(client, db, seed_set, seed_tracks)
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/branch",
            json={"branch_point": 1, "name": "branch-v2"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["explorer_tree_id"] is not None

    def test_branch_response_shape(self, client, db, seed_set, seed_tracks):
        vid = self._make_version_with_slots(client, db, seed_set, seed_tracks)
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/branch",
            json={"branch_point": 2, "name": "shape-test"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert "set_id" in body
        assert "name" in body
        assert "display_order" in body
        assert "explorer_tree_id" in body
        assert "slots" in body
        assert len(body["slots"]) == 3

    def test_branch_409_version_limit(self, client, db, seed_set, seed_tracks):
        vid = self._make_version_with_slots(client, db, seed_set, seed_tracks)
        for i in range(9):
            client.post(
                f"/api/sets/{seed_set}/versions",
                json={"name": f"filler-{i}"},
            )
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/branch",
            json={"branch_point": 0, "name": "overflow"},
        )
        assert resp.status_code == 409
        assert "Maximum" in resp.json()["detail"]


# =========================================================================
# Slot note update
# =========================================================================


class TestSlotNoteRoutes:
    def _make_slot(self, client, set_id):
        v_resp = client.post(
            f"/api/sets/{set_id}/versions",
            json={"name": "v1"},
        )
        vid = v_resp.json()["id"]
        s_resp = client.post(
            f"/api/sets/{set_id}/versions/{vid}/slots",
            json={},
        )
        return vid, s_resp.json()["id"]

    def test_update_note_200(self, client, seed_set):
        vid, slot_id = self._make_slot(client, seed_set)
        resp = client.patch(
            f"/api/sets/{seed_set}/versions/{vid}/slots/{slot_id}/note",
            json={"note": "opener energy"},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        hydrate = client.get(f"/api/sets/{seed_set}")
        assert hydrate.status_code == 200
        version = next(
            v for v in hydrate.json()["versions"] if v["id"] == vid
        )
        slot = next(s for s in version["slots"] if s["id"] == slot_id)
        assert slot["note"] == "opener energy"

    def test_update_note_422_exceeds_max_length(self, client, seed_set):
        vid, slot_id = self._make_slot(client, seed_set)
        long_note = "x" * 10001
        resp = client.patch(
            f"/api/sets/{seed_set}/versions/{vid}/slots/{slot_id}/note",
            json={"note": long_note},
        )
        assert resp.status_code == 422

    def test_update_note_10000_chars_ok(self, client, seed_set):
        vid, slot_id = self._make_slot(client, seed_set)
        note = "y" * 10000
        resp = client.patch(
            f"/api/sets/{seed_set}/versions/{vid}/slots/{slot_id}/note",
            json={"note": note},
        )
        assert resp.status_code == 200


# =========================================================================
# Explorer tree endpoints
# =========================================================================


class TestExplorerTreeRoutes:
    def test_list_trees_200(self, client, seed_set):
        resp = client.get(f"/api/sets/{seed_set}/explorer/trees")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_trees_404_bad_set(self, client):
        resp = client.get("/api/sets/99999/explorer/trees")
        assert resp.status_code == 404

    def test_create_tree_201(self, client, seed_set):
        resp = client.post(
            f"/api/sets/{seed_set}/explorer/trees",
            json={"name": "New Tree"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["name"] == "New Tree"
        assert body["set_id"] == seed_set

    def test_create_tree_400_duplicate_name(self, client, seed_set):
        client.post(
            f"/api/sets/{seed_set}/explorer/trees",
            json={"name": "Dupe"},
        )
        resp = client.post(
            f"/api/sets/{seed_set}/explorer/trees",
            json={"name": "Dupe"},
        )
        assert resp.status_code == 400

    def test_rename_tree_200(self, client, seed_set):
        tree_id = client.post(
            f"/api/sets/{seed_set}/explorer/trees",
            json={"name": "Old Name"},
        ).json()["id"]
        resp = client.patch(
            f"/api/sets/{seed_set}/explorer/trees/{tree_id}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_rename_tree_404(self, client, seed_set):
        resp = client.patch(
            f"/api/sets/{seed_set}/explorer/trees/99999",
            json={"name": "Nope"},
        )
        assert resp.status_code == 404

    def test_delete_tree_204(self, client, seed_set):
        tree_id = client.post(
            f"/api/sets/{seed_set}/explorer/trees",
            json={"name": "Disposable"},
        ).json()["id"]
        resp = client.delete(
            f"/api/sets/{seed_set}/explorer/trees/{tree_id}",
        )
        assert resp.status_code == 204

    def test_delete_tree_404(self, client, seed_set):
        resp = client.delete(
            f"/api/sets/{seed_set}/explorer/trees/99999",
        )
        assert resp.status_code == 404


# =========================================================================
# Tracklist note validation (DO-5)
# =========================================================================


class TestTracklistNoteRoutes:
    def _seed_tracklist_entry(self, client, db, set_id, seed_tracks):
        from src.models.set_tracklist_entry import SetTracklistEntry

        entry = SetTracklistEntry(
            set_id=set_id, track_id=seed_tracks[0], position=0,
        )
        db.add(entry)
        db.commit()
        return seed_tracks[0]

    def test_tracklist_note_422_exceeds_max_length(
        self, client, db, seed_set, seed_tracks,
    ):
        track_id = self._seed_tracklist_entry(client, db, seed_set, seed_tracks)
        resp = client.patch(
            f"/api/sets/{seed_set}/tracklist/{track_id}/note",
            json={"note": "x" * 10001},
        )
        assert resp.status_code == 422

    def test_tracklist_note_10000_chars_ok(
        self, client, db, seed_set, seed_tracks,
    ):
        track_id = self._seed_tracklist_entry(client, db, seed_set, seed_tracks)
        resp = client.patch(
            f"/api/sets/{seed_set}/tracklist/{track_id}/note",
            json={"note": "y" * 10000},
        )
        assert resp.status_code == 200


# =========================================================================
# Version delete cleans up explorer tree (DO 7)
# =========================================================================


class TestVersionDeleteExplorerTreeCleanup:
    def test_delete_branched_version_removes_explorer_tree(
        self, client, db, seed_set, seed_tracks,
    ):
        v_resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "main"},
        )
        vid = v_resp.json()["id"]
        s_resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots",
            json={},
        )
        slot_id = s_resp.json()["id"]
        client.post(
            f"/api/sets/{seed_set}/slots/{slot_id}/candidates",
            json={"track_id": seed_tracks[0]},
        )

        branch_resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/branch",
            json={"branch_point": 0, "name": "branch"},
        )
        assert branch_resp.status_code == 201
        branch_data = branch_resp.json()
        branch_vid = branch_data["id"]
        tree_id = branch_data["explorer_tree_id"]
        assert tree_id is not None

        assert db.query(SetExplorerTree).filter_by(id=tree_id).count() == 1

        del_resp = client.delete(
            f"/api/sets/{seed_set}/versions/{branch_vid}",
        )
        assert del_resp.status_code == 204

        assert db.query(SetExplorerTree).filter_by(id=tree_id).count() == 0


# =========================================================================
# Branch-point boundary tests (DO 8)
# =========================================================================


class TestBranchPointBoundaries:
    def _setup_version(self, client, db, set_id, seed_tracks, n_slots=3):
        v_resp = client.post(
            f"/api/sets/{set_id}/versions",
            json={"name": "main"},
        )
        vid = v_resp.json()["id"]
        for i in range(n_slots):
            s_resp = client.post(
                f"/api/sets/{set_id}/versions/{vid}/slots",
                json={},
            )
            slot_id = s_resp.json()["id"]
            client.post(
                f"/api/sets/{set_id}/slots/{slot_id}/candidates",
                json={"track_id": seed_tracks[i]},
            )
        return vid

    def test_branch_point_negative_rejected_422(self, client, seed_set, seed_tracks):
        """branch_point = -1 is rejected by Pydantic validation (ge=0)."""
        v_resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "main"},
        )
        vid = v_resp.json()["id"]
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/branch",
            json={"branch_point": -1, "name": "neg-branch"},
        )
        assert resp.status_code == 422

    def test_branch_point_beyond_last_copies_all(
        self, client, db, seed_set, seed_tracks,
    ):
        """branch_point=100 with 3 slots copies all 3 slots."""
        vid = self._setup_version(client, db, seed_set, seed_tracks, n_slots=3)
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/branch",
            json={"branch_point": 100, "name": "beyond-branch"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert len(body["slots"]) == 3

    def test_branch_from_empty_version(self, client, db, seed_set, seed_tracks):
        """Branching from a version with 0 slots produces 0 slots + a new tree."""
        v_resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "empty-main"},
        )
        vid = v_resp.json()["id"]
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/branch",
            json={"branch_point": 0, "name": "empty-branch"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["slots"] == []
        assert body["explorer_tree_id"] is not None

    def test_branch_point_zero_copies_first_slot_only(
        self, client, db, seed_set, seed_tracks,
    ):
        """branch_point=0 copies slots with position <= 0, i.e. the first slot."""
        vid = self._setup_version(client, db, seed_set, seed_tracks, n_slots=3)
        resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/branch",
            json={"branch_point": 0, "name": "zero-branch"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert len(body["slots"]) == 1
        assert body["slots"][0]["position"] == 0
        assert body["slots"][0]["is_inherited"] is True
        assert len(body["slots"][0]["candidates"]) >= 1
        assert body["slots"][0]["candidates"][0]["track_id"] == seed_tracks[0]


# =========================================================================
# Error detail format consistency
# =========================================================================


class TestErrorDetailFormat:
    def test_404_has_detail_field(self, client, seed_set):
        resp = client.delete(f"/api/sets/{seed_set}/versions/99999")
        assert resp.status_code == 404
        body = resp.json()
        assert "detail" in body
        assert isinstance(body["detail"], str)

    def test_409_has_detail_field(self, client, seed_set):
        for i in range(10):
            client.post(
                f"/api/sets/{seed_set}/versions",
                json={"name": f"v{i}"},
            )
        resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "overflow"},
        )
        assert resp.status_code == 409
        body = resp.json()
        assert "detail" in body
        assert isinstance(body["detail"], str)

    def test_422_has_detail_array(self, client, seed_set):
        v_resp = client.post(
            f"/api/sets/{seed_set}/versions",
            json={"name": "v1"},
        )
        vid = v_resp.json()["id"]
        s_resp = client.post(
            f"/api/sets/{seed_set}/versions/{vid}/slots",
            json={},
        )
        slot_id = s_resp.json()["id"]
        resp = client.patch(
            f"/api/sets/{seed_set}/versions/{vid}/slots/{slot_id}/note",
            json={"note": "x" * 10001},
        )
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body
        assert isinstance(body["detail"], list)
