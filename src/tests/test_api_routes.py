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
        with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/weights", headers={"Origin": "http://localhost:5173"})
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_disallowed_origin_no_cors_header(self):
        with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)):
            from src.api.app import create_app
            with TestClient(create_app()) as tc:
                resp = tc.get("/api/weights", headers={"Origin": "http://evil.example.com"})
        assert resp.headers.get("access-control-allow-origin") != "http://evil.example.com"

    def test_env_override_replaces_defaults(self):
        os.environ["CORS_ALLOWED_ORIGINS"] = "http://myapp.com"
        try:
            with patch("src.api.routes._get_match_finder", return_value=MagicMock(cosine_cache=None, transition_score_cache=None)):
                from src.api.app import create_app
                with TestClient(create_app()) as tc:
                    allowed = tc.get("/api/weights", headers={"Origin": "http://myapp.com"})
                    denied = tc.get("/api/weights", headers={"Origin": "http://localhost:5173"})
            assert allowed.headers.get("access-control-allow-origin") == "http://myapp.com"
            assert denied.headers.get("access-control-allow-origin") != "http://localhost:5173"
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
# date_added serialization coverage
# ---------------------------------------------------------------------------


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
