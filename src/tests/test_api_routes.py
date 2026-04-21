"""Endpoint-level integration tests for the API routes added in ui-v4/v5.

Covers:
    GET  /api/admin/cache-stats
    GET  /api/weights
    PUT  /api/weights
    GET  /api/tracks/{id}/audio

Run with:
    python -m pytest src/tests/test_api_routes.py -v
"""

import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.harmonic_mixing.cosine_cache import CosineCache, TransitionScoreCache


@pytest.fixture(autouse=True)
def _reset_weight_singleton():
    yield
    from src.harmonic_mixing.weight_service import WeightService
    WeightService._instance = None


@pytest.fixture()
def weight_patches():
    """Keep WeightService DB calls mocked for the duration of a test."""
    with patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"), \
         patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"):
        from src.harmonic_mixing.weight_service import WeightService
        WeightService._instance = None
        yield


@pytest.fixture()
def mock_finder():
    finder = MagicMock()
    finder.cosine_cache = None
    finder.transition_score_cache = None
    finder._sync_effective_weights = MagicMock()
    return finder


@pytest.fixture()
def client(mock_finder, weight_patches):
    """A TestClient with match finder and weight DB stubbed out."""
    with patch("src.api.routes._get_match_finder", return_value=mock_finder):
        from src.api.app import create_app
        app = create_app()
        yield TestClient(app)


# ---------------------------------------------------------------------------
# GET /api/admin/cache-stats
# ---------------------------------------------------------------------------


class TestCacheStatsEndpoint:
    def test_returns_200_with_no_cache(self):
        finder = MagicMock()
        finder.cosine_cache = None
        finder.transition_score_cache = None

        with patch("src.api.routes._get_match_finder", return_value=finder):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/admin/cache-stats")

        assert resp.status_code == 200
        data = resp.json()
        assert data["used"] == 0
        assert data["capacity"] == 0
        assert data["hit_rate"] == 0.0
        assert data["key_distribution"] == []
        assert data["bpm_distribution"] == []
        assert data["recent_entries"] == []
        assert data["recent_exits"] == []
        assert data["transition_score_cache"] is None

    def test_returns_200_with_populated_cache(self):
        cache = CosineCache(max_entries=100)
        cache.put(10, 20, 0.85)
        cache.put(10, 30, 0.70)
        cache.get(10, 20)  # hit
        cache.get(99, 100)  # miss

        finder = MagicMock()
        finder.cosine_cache = cache
        finder.transition_score_cache = None

        with patch("src.api.routes._get_match_finder", return_value=finder), \
             patch("src.api.routes._build_cache_distributions", return_value=([], [])):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/admin/cache-stats")

        assert resp.status_code == 200
        data = resp.json()
        assert data["used"] == 2
        assert data["capacity"] == 100
        assert data["hits"] == 1
        assert data["misses"] == 1
        assert data["hit_rate_basis"] == "process_lifetime"
        assert len(data["recent_entries"]) == 2

    def test_response_matches_schema(self):
        cache = CosineCache(max_entries=50)
        cache.put(1, 2, 0.5)

        finder = MagicMock()
        finder.cosine_cache = cache
        finder.transition_score_cache = None

        with patch("src.api.routes._get_match_finder", return_value=finder), \
             patch("src.api.routes._build_cache_distributions", return_value=([], [])):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/admin/cache-stats")

        data = resp.json()
        required_keys = {
            "used", "capacity", "usage_ratio",
            "hits", "misses", "hit_rate",
            "hit_rate_numerator", "hit_rate_denominator", "hit_rate_basis",
            "key_distribution", "bpm_distribution",
            "recent_entries", "recent_exits",
        }
        assert required_keys.issubset(data.keys())

    def test_transition_cache_stats_exposed(self):
        """Transition-score cache stats appear in the response when the
        cache is present and has recorded hits and misses."""
        ts_cache = TransitionScoreCache(max_entries=50)
        ts_cache.put(10, 20, 85.0)
        ts_cache.get(10, 20)  # hit
        ts_cache.get(10, 99)  # miss

        finder = MagicMock()
        finder.cosine_cache = None
        finder.transition_score_cache = ts_cache

        with patch("src.api.routes._get_match_finder", return_value=finder):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/admin/cache-stats")

        assert resp.status_code == 200
        data = resp.json()
        ts = data["transition_score_cache"]
        assert ts is not None
        assert ts["used"] == 1
        assert ts["capacity"] == 50
        assert ts["hits"] == 1
        assert ts["misses"] == 1
        assert ts["hit_rate"] == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# GET /api/track-traits
# ---------------------------------------------------------------------------


class TestTrackTraitsEndpoint:
    def test_returns_200_with_expected_shape(self):
        mock_trait = MagicMock()
        mock_trait.track_id = 1
        mock_trait.voice_instrumental = 0.2
        mock_trait.danceability = 0.8
        mock_trait.bright_dark = 0.5
        mock_trait.acoustic_electronic = None
        mock_trait.tonal_atonal = None
        mock_trait.reverb = None
        mock_trait.onset_density = 3.5
        mock_trait.spectral_flatness = 0.12
        mock_trait.mood_theme = None
        mock_trait.genre = None
        mock_trait.instruments = None

        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.all.return_value = [
            mock_trait
        ]

        finder = MagicMock()
        finder.cosine_cache = None
        finder._sync_effective_weights = MagicMock()

        with patch("src.api.routes._get_match_finder", return_value=finder), \
             patch("src.api.routes._get_session", return_value=mock_session), \
             patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"), \
             patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/track-traits")

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["track_id"] == 1
        assert "traits" in data[0]
        assert data[0]["traits"]["voice_instrumental"] == pytest.approx(0.2)
        assert "danceability" not in data[0]["traits"]
        assert "bright_dark" not in data[0]["traits"]
        assert "acoustic_electronic" not in data[0]["traits"]
        assert "tonal_atonal" not in data[0]["traits"]
        assert "reverb" not in data[0]["traits"]

    def test_returns_empty_list_when_no_traits(self):
        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.all.return_value = []

        finder = MagicMock()
        finder.cosine_cache = None
        finder._sync_effective_weights = MagicMock()

        with patch("src.api.routes._get_match_finder", return_value=finder), \
             patch("src.api.routes._get_session", return_value=mock_session), \
             patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"), \
             patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/track-traits")

        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# GET /api/weights
# ---------------------------------------------------------------------------


class TestGetWeightsEndpoint:
    def test_returns_200_with_expected_shape(self, client):
        resp = client.get("/api/weights")

        assert resp.status_code == 200
        data = resp.json()
        assert "raw_weights" in data
        assert "effective_weights" in data
        assert "raw_sum" in data
        assert "target_sum" in data
        assert "is_sum_valid" in data
        assert "message" in data

    def test_effective_weights_sum_to_target(self, client):
        data = client.get("/api/weights").json()
        eff_sum = sum(data["effective_weights"].values())
        assert eff_sum == pytest.approx(100.0, abs=0.1)

    def test_raw_weights_contains_all_factors(self, client):
        from src.harmonic_mixing.config import MatchFactors
        data = client.get("/api/weights").json()
        for factor in MatchFactors:
            assert factor.name in data["raw_weights"]


# ---------------------------------------------------------------------------
# GET /api/weights/defaults
# ---------------------------------------------------------------------------


class TestGetWeightDefaultsEndpoint:
    def test_returns_200_with_all_factors(self, client):
        from src.harmonic_mixing.config import MatchFactors
        resp = client.get("/api/weights/defaults")
        assert resp.status_code == 200
        data = resp.json()
        for factor in MatchFactors:
            assert factor.name in data

    def test_returns_fusion_keys(self, client):
        resp = client.get("/api/weights/defaults")
        assert resp.status_code == 200
        data = resp.json()
        for key in ("FUSION_HARMONIC", "FUSION_RHYTHM", "FUSION_TIMBRE", "FUSION_ENERGY"):
            assert key in data

    def test_defaults_unchanged_after_update(self, client, mock_finder):
        defaults_before = client.get("/api/weights/defaults").json()
        client.put("/api/weights", json={"weights": {"BPM": 99}})
        defaults_after = client.get("/api/weights/defaults").json()
        assert defaults_before == defaults_after


# ---------------------------------------------------------------------------
# PUT /api/weights
# ---------------------------------------------------------------------------


class TestPutWeightsEndpoint:
    def test_update_returns_200_with_new_values(self, client, mock_finder):
        resp = client.put("/api/weights", json={"weights": {"BPM": 50, "CAMELOT": 50}})

        assert resp.status_code == 200
        data = resp.json()
        assert data["raw_weights"]["BPM"] == 50.0
        assert data["raw_weights"]["CAMELOT"] == 50.0
        mock_finder._sync_effective_weights.assert_called_once()

    def test_non_100_sum_returns_warning(self, client):
        resp = client.put("/api/weights", json={"weights": {"BPM": 10, "CAMELOT": 10}})

        assert resp.status_code == 200
        data = resp.json()
        assert data["is_sum_valid"] is False
        assert data["message"] is not None
        assert "normalized" in data["message"].lower()

    def test_non_100_sum_update_then_get_round_trip(self, client):
        """PUT with non-100 sum, then GET, verifying consistency."""
        put_resp = client.put(
            "/api/weights",
            json={"weights": {"BPM": 10, "CAMELOT": 10}},
        )
        assert put_resp.status_code == 200
        put_data = put_resp.json()
        assert put_data["is_sum_valid"] is False

        get_resp = client.get("/api/weights")
        assert get_resp.status_code == 200
        get_data = get_resp.json()

        assert get_data["raw_weights"]["BPM"] == put_data["raw_weights"]["BPM"]
        assert get_data["raw_weights"]["CAMELOT"] == put_data["raw_weights"]["CAMELOT"]
        assert get_data["is_sum_valid"] is False

        eff_sum = sum(get_data["effective_weights"].values())
        assert eff_sum == pytest.approx(100.0, abs=0.1)

    def test_unknown_keys_ignored(self, client):
        resp = client.put(
            "/api/weights",
            json={"weights": {"NONEXISTENT": 99}},
        )
        assert resp.status_code == 200

    def test_empty_body_returns_422(self, client):
        resp = client.put("/api/weights", json={})
        assert resp.status_code == 422

    def test_weight_update_clears_transition_score_cache(self, weight_patches):
        """PUT /api/weights must clear the transition-score cache so stale
        scores computed under the old weights are not reused."""
        ts_cache = TransitionScoreCache()
        ts_cache.put(10, 20, 85.0)
        ts_cache.put(30, 40, 72.0)
        assert ts_cache.size() == 2

        finder = MagicMock()
        finder.cosine_cache = None
        finder.transition_score_cache = ts_cache
        finder._sync_effective_weights = MagicMock()

        with patch("src.api.routes._get_match_finder", return_value=finder), \
             patch("src.api.routes._clear_similarity_cache"):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.put("/api/weights", json={"weights": {"BPM": 50}})

        assert resp.status_code == 200
        assert ts_cache.size() == 0, "transition cache must be empty after weight update"


# ---------------------------------------------------------------------------
# GET /api/tracks/{track_id}/audio
# ---------------------------------------------------------------------------


class TestTrackAudioEndpoint:
    @pytest.fixture()
    def audio_dir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def _make_client(self, mock_session, audio_dir):
        finder = MagicMock()
        finder.cosine_cache = None
        finder.transition_score_cache = None
        finder._sync_effective_weights = MagicMock()

        with patch("src.api.routes._get_match_finder", return_value=finder), \
             patch("src.api.routes._get_session", return_value=mock_session), \
             patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"), \
             patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"), \
             patch("src.config.PROCESSED_MUSIC_DIR", audio_dir):
            from src.api.app import create_app
            yield TestClient(create_app())

    def _mock_track(self, track_id, file_name):
        t = MagicMock()
        t.id = track_id
        t.file_name = file_name
        return t

    def test_streams_mp3(self, audio_dir):
        file_name = "song.mp3"
        with open(os.path.join(audio_dir, file_name), "wb") as f:
            f.write(b"\xff\xfb\x90\x00" + b"\x00" * 100)

        mock_session = MagicMock()
        mock_track = self._mock_track(1, file_name)
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_track

        for tc in self._make_client(mock_session, audio_dir):
            resp = tc.get("/api/tracks/1/audio")
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "audio/mpeg"

    def test_streams_wav(self, audio_dir):
        file_name = "song.wav"
        with open(os.path.join(audio_dir, file_name), "wb") as f:
            f.write(b"RIFF" + b"\x00" * 100)

        mock_session = MagicMock()
        mock_track = self._mock_track(1, file_name)
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_track

        for tc in self._make_client(mock_session, audio_dir):
            resp = tc.get("/api/tracks/1/audio")
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "audio/wav"

    def test_404_for_unknown_track(self, audio_dir):
        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None

        for tc in self._make_client(mock_session, audio_dir):
            resp = tc.get("/api/tracks/999/audio")
            assert resp.status_code == 404
            assert "not found" in resp.json()["detail"].lower()

    def test_streams_aiff(self, audio_dir):
        file_name = "song.aiff"
        with open(os.path.join(audio_dir, file_name), "wb") as f:
            f.write(b"FORM" + b"\x00" * 100)

        mock_session = MagicMock()
        mock_track = self._mock_track(1, file_name)
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_track

        for tc in self._make_client(mock_session, audio_dir):
            resp = tc.get("/api/tracks/1/audio")
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "audio/aiff"

    def test_streams_aif(self, audio_dir):
        file_name = "song.aif"
        with open(os.path.join(audio_dir, file_name), "wb") as f:
            f.write(b"FORM" + b"\x00" * 100)

        mock_session = MagicMock()
        mock_track = self._mock_track(1, file_name)
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_track

        for tc in self._make_client(mock_session, audio_dir):
            resp = tc.get("/api/tracks/1/audio")
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "audio/aiff"

    def test_415_for_unsupported_format(self, audio_dir):
        file_name = "song.ogg"
        with open(os.path.join(audio_dir, file_name), "wb") as f:
            f.write(b"\x00" * 100)

        mock_session = MagicMock()
        mock_track = self._mock_track(1, file_name)
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_track

        for tc in self._make_client(mock_session, audio_dir):
            resp = tc.get("/api/tracks/1/audio")
            assert resp.status_code == 415
            assert "unsupported" in resp.json()["detail"].lower()

    def test_404_for_missing_file(self, audio_dir):
        mock_session = MagicMock()
        mock_track = self._mock_track(1, "missing.mp3")
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_track

        for tc in self._make_client(mock_session, audio_dir):
            resp = tc.get("/api/tracks/1/audio")
            assert resp.status_code == 404
            assert "not found" in resp.json()["detail"].lower()

    def test_head_returns_headers_without_body(self, audio_dir):
        file_name = "song.mp3"
        with open(os.path.join(audio_dir, file_name), "wb") as f:
            f.write(b"\xff\xfb\x90\x00" + b"\x00" * 100)

        mock_session = MagicMock()
        mock_track = self._mock_track(1, file_name)
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_track

        for tc in self._make_client(mock_session, audio_dir):
            resp = tc.head("/api/tracks/1/audio")
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "audio/mpeg"
            assert len(resp.content) == 0


# ---------------------------------------------------------------------------
# POST /api/sets/{set_id}/explorer/trees — mode validation
# ---------------------------------------------------------------------------


class TestCorsAndSchemaValidation:
    """CORS allowlist behavior and pair-payload size limit validation."""

    def test_allowed_origin_receives_cors_header(self):
        port = os.environ.get("CLIENT_PORT", "5174")
        origin = f"http://localhost:{port}"
        with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/weights", headers={"Origin": origin})
        assert resp.headers.get("access-control-allow-origin") == origin

    def test_disallowed_origin_no_cors_header(self):
        with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/weights", headers={"Origin": "http://evil.example.com"})
        assert resp.headers.get("access-control-allow-origin") != "http://evil.example.com"

    def test_patch_preflight_allowed(self):
        port = os.environ.get("CLIENT_PORT", "5174")
        origin = f"http://localhost:{port}"
        with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.options(
                    "/api/weights",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "PATCH",
                    },
                )
        assert resp.status_code == 200
        allowed = resp.headers.get("access-control-allow-methods", "")
        assert "PATCH" in allowed

    def test_env_override_replaces_defaults(self):
        port = os.environ.get("CLIENT_PORT", "5174")
        default_origin = f"http://localhost:{port}"
        os.environ["CORS_ALLOWED_ORIGINS"] = "http://myapp.com"
        try:
            with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)):
                from src.api.app import create_app
                with TestClient(create_app()) as tc:
                    allowed = tc.get("/api/weights", headers={"Origin": "http://myapp.com"})
                    denied = tc.get("/api/weights", headers={"Origin": default_origin})
            assert allowed.headers.get("access-control-allow-origin") == "http://myapp.com"
            assert denied.headers.get("access-control-allow-origin") != default_origin
        finally:
            del os.environ["CORS_ALLOWED_ORIGINS"]

    def test_transition_score_rejects_over_100_pairs(self, client):
        pairs = [[i, i + 1] for i in range(101)]
        resp = client.post("/api/sets/transition-scores", json={"pairs": pairs})
        assert resp.status_code == 422
        body = resp.json()
        assert any("pairs" in str(e).lower() for e in body.get("detail", []))

    def test_explorer_edge_score_rejects_over_100_pairs(self, client):
        pairs = [[i, i + 1] for i in range(101)]
        resp = client.post("/api/sets/1/explorer/edge-scores", json={"pairs": pairs})
        assert resp.status_code == 422
        body = resp.json()
        assert any("pairs" in str(e).lower() for e in body.get("detail", []))

    def test_transition_score_accepts_100_pairs(self, client):
        pairs = [[i, i + 1] for i in range(100)]
        resp = client.post("/api/sets/transition-scores", json={"pairs": pairs})
        assert resp.status_code != 422

    def test_explorer_edge_score_accepts_100_pairs(self, client):
        pairs = [[i, i + 1] for i in range(100)]
        resp = client.post("/api/sets/1/explorer/edge-scores", json={"pairs": pairs})
        assert resp.status_code != 422


class TestExplorerTreeCreateModeValidation:
    def test_invalid_mode_returns_422(self):
        with patch("src.api.routes._get_session") as mock_get_session:
            mock_session = MagicMock()
            mock_get_session.return_value = mock_session

            from src.api.app import create_app
            app = create_app()
            tc = TestClient(app)
            resp = tc.post("/api/sets/1/explorer/trees", json={"name": "Bad", "mode": "bogus"})
            assert resp.status_code == 422

    def test_valid_modes_accepted(self):
        for mode in ("empty", "full_copy", "subtree_copy"):
            from src.api.schemas import ExplorerTreeCreateRequest
            req = ExplorerTreeCreateRequest(name="Test", mode=mode)
            assert req.mode == mode


# ---------------------------------------------------------------------------
# PATCH/DELETE /api/sets/{set_id}/explorer/trees/{tree_id}
# ---------------------------------------------------------------------------


class TestExplorerTreeRenameDelete:
    """Route-level tests for explorer tree rename and delete endpoints."""

    @pytest.fixture()
    def _db(self):
        from sqlalchemy import Column, Integer, String, Table, MetaData, create_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool
        from src.models.dj_set import DjSet
        from src.models.set_explorer_tree import SetExplorerTree
        from src.models.set_explorer_node import SetExplorerNode
        from src.models.set_explorer_edge import SetExplorerEdge

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        meta = MetaData()
        Table("track", meta, Column("id", Integer, primary_key=True), Column("title", String))
        meta.create_all(engine)
        for t in [DjSet.__table__, SetExplorerTree.__table__,
                   SetExplorerNode.__table__, SetExplorerEdge.__table__]:
            t.create(engine, checkfirst=True)
        return sessionmaker(bind=engine)

    @pytest.fixture()
    def _tc(self, _db):
        with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)), \
             patch("src.api.routes._get_session", side_effect=lambda: _db()), \
             patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"), \
             patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"):
            from src.api.app import create_app
            yield TestClient(create_app())

    def _seed_set_and_trees(self, _db):
        from src.set_workspace.service import SetWorkspaceService
        s = _db()
        s.expire_on_commit = False
        svc = SetWorkspaceService(s)
        dj_set = svc.create_set("Test Set")
        tree_a, _ = svc.create_explorer_tree(dj_set.id, "Tree A")
        tree_b, _ = svc.create_explorer_tree(dj_set.id, "Tree B")
        s.commit()
        ids = (dj_set.id, tree_a.id, tree_b.id)
        s.close()
        return ids

    def _seed_nodes_and_edges(self, _db, set_id, tree_id):
        from src.models.set_explorer_node import SetExplorerNode
        from src.models.set_explorer_edge import SetExplorerEdge
        s = _db()
        s.add(SetExplorerNode(set_id=set_id, tree_id=tree_id, node_id="n1", track_id=1, level=0, col_index=0))
        s.add(SetExplorerNode(set_id=set_id, tree_id=tree_id, node_id="n2", track_id=2, level=1, col_index=0))
        s.add(SetExplorerEdge(set_id=set_id, tree_id=tree_id, parent_node_id="n1", child_node_id="n2"))
        s.commit()
        s.close()

    def test_rename_success(self, _db, _tc):
        set_id, tree_a_id, _ = self._seed_set_and_trees(_db)
        resp = _tc.patch(f"/api/sets/{set_id}/explorer/trees/{tree_a_id}", json={"name": "Renamed"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Renamed"
        assert body["id"] == tree_a_id

    def test_rename_duplicate_name_rejected(self, _db, _tc):
        set_id, tree_a_id, _ = self._seed_set_and_trees(_db)
        resp = _tc.patch(f"/api/sets/{set_id}/explorer/trees/{tree_a_id}", json={"name": "Tree B"})
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"]

    def test_rename_missing_set_returns_404(self, _db, _tc):
        resp = _tc.patch("/api/sets/9999/explorer/trees/1", json={"name": "X"})
        assert resp.status_code == 404

    def test_rename_missing_tree_returns_404(self, _db, _tc):
        set_id, _, _ = self._seed_set_and_trees(_db)
        resp = _tc.patch(f"/api/sets/{set_id}/explorer/trees/9999", json={"name": "X"})
        assert resp.status_code == 404

    def test_delete_success(self, _db, _tc):
        set_id, tree_a_id, _ = self._seed_set_and_trees(_db)
        resp = _tc.delete(f"/api/sets/{set_id}/explorer/trees/{tree_a_id}")
        assert resp.status_code == 204

    def test_delete_missing_set_returns_404(self, _db, _tc):
        resp = _tc.delete("/api/sets/9999/explorer/trees/1")
        assert resp.status_code == 404

    def test_delete_missing_tree_returns_404(self, _db, _tc):
        set_id, _, _ = self._seed_set_and_trees(_db)
        resp = _tc.delete(f"/api/sets/{set_id}/explorer/trees/9999")
        assert resp.status_code == 404

    def test_delete_cascade_removes_nodes_and_edges(self, _db, _tc):
        from src.models.set_explorer_node import SetExplorerNode
        from src.models.set_explorer_edge import SetExplorerEdge

        set_id, tree_a_id, _ = self._seed_set_and_trees(_db)
        self._seed_nodes_and_edges(_db, set_id, tree_a_id)

        s = _db()
        assert s.query(SetExplorerNode).filter_by(tree_id=tree_a_id).count() == 2
        assert s.query(SetExplorerEdge).filter_by(tree_id=tree_a_id).count() == 1
        s.close()

        resp = _tc.delete(f"/api/sets/{set_id}/explorer/trees/{tree_a_id}")
        assert resp.status_code == 204

        s2 = _db()
        assert s2.query(SetExplorerNode).filter_by(tree_id=tree_a_id).count() == 0
        assert s2.query(SetExplorerEdge).filter_by(tree_id=tree_a_id).count() == 0
        s2.close()


# ---------------------------------------------------------------------------
# date_added serialization coverage
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Pool subgroup endpoints
# ---------------------------------------------------------------------------


class TestPoolSubgroupEndpoints:
    """Tests for the pool subgroup CRUD and membership endpoints."""

    @pytest.fixture()
    def _db_session(self):
        """Create an in-memory SQLite session with workspace tables."""
        from sqlalchemy import Column, Integer, String, Table, MetaData, create_engine
        from sqlalchemy.orm import sessionmaker

        from src.models.dj_set import DjSet
        from src.models.set_pool_entry import SetPoolEntry
        from src.models.set_pool_subgroup import SetPoolSubgroup
        from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
        from src.models.set_tracklist_entry import SetTracklistEntry
        from src.models.set_explorer_tree import SetExplorerTree
        from src.models.set_explorer_node import SetExplorerNode
        from src.models.set_explorer_edge import SetExplorerEdge
        from src.models.set_empty_row import SetEmptyRow

        engine = create_engine("sqlite:///:memory:")
        meta = MetaData()
        Table("track", meta, Column("id", Integer, primary_key=True), Column("title", String))
        meta.create_all(engine)
        from src.models.set_tracklist_version import SetTracklistVersion
        from src.models.set_tracklist_slot import SetTracklistSlot
        from src.models.set_tracklist_candidate import SetTracklistCandidate

        tables = [
            DjSet.__table__, SetPoolEntry.__table__,
            SetPoolSubgroup.__table__, SetPoolSubgroupMember.__table__,
            SetTracklistEntry.__table__, SetExplorerTree.__table__,
            SetExplorerNode.__table__, SetExplorerEdge.__table__,
            SetEmptyRow.__table__,
            SetTracklistVersion.__table__, SetTracklistSlot.__table__,
            SetTracklistCandidate.__table__,
        ]
        for t in tables:
            t.create(engine, checkfirst=True)
        Session = sessionmaker(bind=engine)
        return Session()

    @pytest.fixture()
    def svc(self, _db_session):
        from src.set_workspace.service import SetWorkspaceService
        return SetWorkspaceService(_db_session)

    def test_create_subgroup(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        sg = svc.subgroup_create(dj_set.id, "Warmup")
        assert sg.name == "Warmup"
        assert sg.display_order == 0

    def test_create_multiple_subgroups_ordered(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        sg1 = svc.subgroup_create(dj_set.id, "Warmup")
        sg2 = svc.subgroup_create(dj_set.id, "Peak")
        assert sg1.display_order == 0
        assert sg2.display_order == 1

    def test_rename_subgroup(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        sg = svc.subgroup_create(dj_set.id, "Warmup")
        result = svc.subgroup_rename(dj_set.id, sg.id, "Intro")
        assert result is not None
        assert result.name == "Intro"

    def test_rename_nonexistent_returns_none(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        result = svc.subgroup_rename(dj_set.id, 999, "Nope")
        assert result is None

    def test_delete_subgroup_preserves_pool_tracks(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        pool_entry, _ = svc.pool_add(dj_set.id, 1)
        sg = svc.subgroup_create(dj_set.id, "Warmup")
        svc.subgroup_add_track(dj_set.id, sg.id, pool_entry.id)

        deleted = svc.subgroup_delete(dj_set.id, sg.id)
        assert deleted is True

        pool_list = svc.pool_list(dj_set.id)
        assert len(pool_list) == 1
        assert pool_list[0].track_id == 1

    def test_delete_subgroup_reorders_remaining(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        sg1 = svc.subgroup_create(dj_set.id, "A")
        sg2 = svc.subgroup_create(dj_set.id, "B")
        sg3 = svc.subgroup_create(dj_set.id, "C")

        svc.subgroup_delete(dj_set.id, sg1.id)
        _db_session.expire_all()

        from src.models.set_pool_subgroup import SetPoolSubgroup
        remaining = (
            _db_session.query(SetPoolSubgroup)
            .filter_by(set_id=dj_set.id)
            .order_by(SetPoolSubgroup.display_order)
            .all()
        )
        assert len(remaining) == 2
        assert remaining[0].id == sg2.id
        assert remaining[0].display_order == 0
        assert remaining[1].id == sg3.id
        assert remaining[1].display_order == 1

    def test_reorder_subgroups(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        sg1 = svc.subgroup_create(dj_set.id, "A")
        sg2 = svc.subgroup_create(dj_set.id, "B")
        sg3 = svc.subgroup_create(dj_set.id, "C")

        svc.subgroup_reorder(dj_set.id, [sg3.id, sg1.id, sg2.id])
        _db_session.expire_all()

        from src.models.set_pool_subgroup import SetPoolSubgroup
        ordered = (
            _db_session.query(SetPoolSubgroup)
            .filter_by(set_id=dj_set.id)
            .order_by(SetPoolSubgroup.display_order)
            .all()
        )
        assert [sg.id for sg in ordered] == [sg3.id, sg1.id, sg2.id]

    def test_many_to_many_membership(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        pe1, _ = svc.pool_add(dj_set.id, 1)
        pe2, _ = svc.pool_add(dj_set.id, 2)
        sg1 = svc.subgroup_create(dj_set.id, "A")
        sg2 = svc.subgroup_create(dj_set.id, "B")

        svc.subgroup_add_track(dj_set.id, sg1.id, pe1.id)
        svc.subgroup_add_track(dj_set.id, sg1.id, pe2.id)
        svc.subgroup_add_track(dj_set.id, sg2.id, pe1.id)

        from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
        all_members = _db_session.query(SetPoolSubgroupMember).all()
        assert len(all_members) == 3

        sg1_members = _db_session.query(SetPoolSubgroupMember).filter_by(subgroup_id=sg1.id).all()
        assert len(sg1_members) == 2
        sg2_members = _db_session.query(SetPoolSubgroupMember).filter_by(subgroup_id=sg2.id).all()
        assert len(sg2_members) == 1

    def test_duplicate_membership_is_idempotent(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        pe, _ = svc.pool_add(dj_set.id, 1)
        sg = svc.subgroup_create(dj_set.id, "A")

        m1, err1 = svc.subgroup_add_track(dj_set.id, sg.id, pe.id)
        m2, err2 = svc.subgroup_add_track(dj_set.id, sg.id, pe.id)
        assert err1 is None
        assert err2 is None
        assert m1.id == m2.id

    def test_remove_membership(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        pe, _ = svc.pool_add(dj_set.id, 1)
        sg = svc.subgroup_create(dj_set.id, "A")
        svc.subgroup_add_track(dj_set.id, sg.id, pe.id)

        removed, err = svc.subgroup_remove_track(dj_set.id, sg.id, pe.id)
        assert removed is True
        assert err is None

        from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
        remaining = _db_session.query(SetPoolSubgroupMember).filter_by(subgroup_id=sg.id).all()
        assert len(remaining) == 0

    def test_pool_remove_cleans_memberships(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        pe, _ = svc.pool_add(dj_set.id, 1)
        sg = svc.subgroup_create(dj_set.id, "A")
        svc.subgroup_add_track(dj_set.id, sg.id, pe.id)

        svc.pool_remove(dj_set.id, 1)

        from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
        remaining = _db_session.query(SetPoolSubgroupMember).all()
        assert len(remaining) == 0

    def test_hydrate_includes_subgroups(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        pe, _ = svc.pool_add(dj_set.id, 1)
        sg = svc.subgroup_create(dj_set.id, "Warmup")
        svc.subgroup_add_track(dj_set.id, sg.id, pe.id)

        hydration = svc.hydrate_set(dj_set.id)
        assert "pool_subgroups" in hydration
        assert len(hydration["pool_subgroups"]) == 1
        assert hydration["pool_subgroups"][0].name == "Warmup"
        assert "pool_subgroup_memberships" in hydration
        assert len(hydration["pool_subgroup_memberships"]) == 1

    def test_delete_set_cleans_subgroups(self, svc, _db_session):
        dj_set = svc.create_set("Test Set")
        _db_session.flush()
        pe, _ = svc.pool_add(dj_set.id, 1)
        sg = svc.subgroup_create(dj_set.id, "Warmup")
        svc.subgroup_add_track(dj_set.id, sg.id, pe.id)

        svc.delete_set(dj_set.id)

        from src.models.set_pool_subgroup import SetPoolSubgroup
        from src.models.set_pool_subgroup_member import SetPoolSubgroupMember
        assert _db_session.query(SetPoolSubgroup).count() == 0
        assert _db_session.query(SetPoolSubgroupMember).count() == 0


class TestDateAddedSerialization:
    """Verify the date_added field flows through serializer, schema, and API."""

    def test_serialize_track_row_includes_date_added(self):
        from src.api.serializers import serialize_track_row

        track = MagicMock()
        track.id = 1
        track.title = "Test"
        track.bpm = 128.0
        track.key = "C"
        track.camelot_code = "01A"
        track.genre = "House"
        track.label = "Label"
        track.energy = 7
        track.date_added = "2025-06-15T12:00:00"

        result = serialize_track_row(track)
        assert result["date_added"] == "2025-06-15T12:00:00"

    def test_serialize_track_row_date_added_null(self):
        from src.api.serializers import serialize_track_row

        track = MagicMock()
        track.id = 2
        track.title = "No Date"
        track.bpm = None
        track.key = None
        track.camelot_code = None
        track.genre = None
        track.label = None
        track.energy = None
        track.date_added = None

        result = serialize_track_row(track)
        assert result["date_added"] is None

    def test_track_response_schema_accepts_date_added(self):
        from src.api.schemas import TrackResponse

        resp = TrackResponse(
            id=1, title="Test", date_added="2025-01-01T00:00:00",
        )
        assert resp.date_added == "2025-01-01T00:00:00"

    def test_track_response_schema_date_added_optional(self):
        from src.api.schemas import TrackResponse

        resp = TrackResponse(id=1, title="Test")
        assert resp.date_added is None

    def test_tracks_endpoint_returns_date_added(self):
        track = MagicMock()
        track.id = 1
        track.title = "With Date"
        track.bpm = 130.0
        track.key = "Am"
        track.camelot_code = "08A"
        track.genre = "Techno"
        track.label = "Drumcode"
        track.energy = 8
        track.date_added = "2025-03-20"

        mock_session = MagicMock()

        finder = MagicMock()
        finder.cosine_cache = None
        finder.transition_score_cache = None
        finder._sync_effective_weights = MagicMock()

        with patch("src.api.routes._get_match_finder", return_value=finder), \
             patch("src.api.routes._get_session", return_value=mock_session), \
             patch("src.api.routes.get_tracks", return_value=[track]), \
             patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"), \
             patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/tracks")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["date_added"] == "2025-03-20"


# ---------------------------------------------------------------------------
# POST /api/sets/{set_id}/pool/reorder
# ---------------------------------------------------------------------------


class TestPoolReorderEndpoint:
    """Route-level tests for pool reorder endpoint."""

    @pytest.fixture()
    def _db(self):
        from sqlalchemy import Column, Integer, String, Table, MetaData, create_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool
        from src.models.dj_set import DjSet
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

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        meta = MetaData()
        Table("track", meta, Column("id", Integer, primary_key=True), Column("title", String))
        meta.create_all(engine)
        tables = [
            DjSet.__table__, SetPoolEntry.__table__,
            SetTracklistEntry.__table__, SetExplorerTree.__table__,
            SetExplorerNode.__table__, SetExplorerEdge.__table__,
            SetPoolSubgroup.__table__, SetPoolSubgroupMember.__table__,
            SetEmptyRow.__table__,
            SetTracklistVersion.__table__, SetTracklistSlot.__table__,
            SetTracklistCandidate.__table__,
        ]
        for t in tables:
            t.create(engine, checkfirst=True)
        return sessionmaker(bind=engine)

    @pytest.fixture()
    def _tc(self, _db):
        with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)), \
             patch("src.api.routes._get_session", side_effect=lambda: _db()), \
             patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"), \
             patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"):
            from src.api.app import create_app
            yield TestClient(create_app())

    def _seed_set_with_pool(self, _db, track_ids=(10, 20, 30)):
        from src.set_workspace.service import SetWorkspaceService
        s = _db()
        s.expire_on_commit = False
        svc = SetWorkspaceService(s)
        dj_set = svc.create_set("Reorder Set")
        for tid in track_ids:
            svc.pool_add(dj_set.id, tid)
        s.commit()
        set_id = dj_set.id
        s.close()
        return set_id

    def test_happy_path_returns_ok(self, _db, _tc):
        set_id = self._seed_set_with_pool(_db)
        resp = _tc.post(f"/api/sets/{set_id}/pool/reorder", json={"track_id": 10, "new_position": 2})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_malformed_body_returns_422(self, _db, _tc):
        set_id = self._seed_set_with_pool(_db)
        resp = _tc.post(f"/api/sets/{set_id}/pool/reorder", json={"bad_field": 1})
        assert resp.status_code == 422

    def test_nonexistent_set_returns_404(self, _db, _tc):
        resp = _tc.post("/api/sets/99999/pool/reorder", json={"track_id": 10, "new_position": 0})
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Set not found"

    def test_nonexistent_track_returns_400(self, _db, _tc):
        set_id = self._seed_set_with_pool(_db)
        resp = _tc.post(f"/api/sets/{set_id}/pool/reorder", json={"track_id": 999, "new_position": 0})
        assert resp.status_code == 400
