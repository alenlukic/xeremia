"""Tests for the set-builder API endpoints.

Covers:
    POST /api/sets/transition-scores
    POST /api/sets/export-m3u8

Run with:
    python -m pytest tests/test_set_builder.py -v
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _reset_weight_singleton():
    yield
    from src.harmonic_mixing.weight_service import WeightService
    WeightService._instance = None


@pytest.fixture()
def weight_patches():
    with patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"), \
         patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"):
        from src.harmonic_mixing.weight_service import WeightService
        WeightService._instance = None
        yield


@pytest.fixture()
def mock_finder():
    finder = MagicMock()
    finder.cosine_cache = None
    finder._sync_effective_weights = MagicMock()
    return finder


@pytest.fixture()
def client(mock_finder, weight_patches):
    with patch("src.api.routes._get_match_finder", return_value=mock_finder):
        from src.api.app import create_app
        app = create_app()
        yield TestClient(app)


class TestTransitionScores:
    def test_returns_scores_for_valid_pairs(self, client, mock_finder):
        from src.data_management.config import TrackDBCols

        mock_match = MagicMock()
        mock_match.metadata = {TrackDBCols.ID: 2}
        mock_match.get_score.return_value = 82.5

        mock_finder.get_transition_matches.return_value = (
            ([mock_match], [], []),
            None,
        )

        mock_track = MagicMock()
        mock_track.id = 1

        with patch("src.api.routes._get_session") as mock_session_fn:
            session = MagicMock()
            session.query.return_value.filter_by.return_value.first.return_value = mock_track
            mock_session_fn.return_value = session

            resp = client.post("/api/sets/transition-scores", json={
                "pairs": [[1, 2]],
            })

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["scores"]) == 1
        assert data["scores"][0] == 82.5

    def test_returns_null_when_candidate_not_in_matches(self, client, mock_finder):
        mock_finder.get_transition_matches.return_value = (
            ([], [], []),
            None,
        )

        mock_track = MagicMock()
        mock_track.id = 1

        with patch("src.api.routes._get_session") as mock_session_fn:
            session = MagicMock()
            session.query.return_value.filter_by.return_value.first.return_value = mock_track
            mock_session_fn.return_value = session

            resp = client.post("/api/sets/transition-scores", json={
                "pairs": [[1, 99]],
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["scores"] == [None]

    def test_returns_null_when_source_not_found(self, client, mock_finder):
        with patch("src.api.routes._get_session") as mock_session_fn:
            session = MagicMock()
            session.query.return_value.filter_by.return_value.first.return_value = None
            mock_session_fn.return_value = session

            resp = client.post("/api/sets/transition-scores", json={
                "pairs": [[999, 1]],
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["scores"] == [None]

    def test_handles_empty_pairs(self, client, mock_finder):
        resp = client.post("/api/sets/transition-scores", json={
            "pairs": [],
        })
        assert resp.status_code == 200
        assert resp.json()["scores"] == []


class TestExportM3u8:
    def test_returns_valid_m3u8_content(self, client, mock_finder):
        mock_track1 = MagicMock()
        mock_track1.id = 1
        mock_track1.title = "Alpha"
        mock_track1.file_name = "/music/alpha.mp3"

        mock_track2 = MagicMock()
        mock_track2.id = 2
        mock_track2.title = "Beta"
        mock_track2.file_name = "/music/beta.mp3"

        with patch("src.api.routes._get_session") as mock_session_fn:
            session = MagicMock()
            session.query.return_value.filter.return_value.all.return_value = [
                mock_track1, mock_track2
            ]
            mock_session_fn.return_value = session

            resp = client.post("/api/sets/export-m3u8", json={
                "track_ids": [1, 2],
                "name": "My Set",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["filename"] == "My Set.m3u8"
        content = data["content"]
        assert content.startswith("#EXTM3U\n")
        assert "#EXTINF:-1,Alpha" in content
        assert "/music/alpha.mp3" in content
        assert "#EXTINF:-1,Beta" in content
        assert "/music/beta.mp3" in content

    def test_preserves_track_order(self, client, mock_finder):
        mock_track1 = MagicMock()
        mock_track1.id = 1
        mock_track1.title = "First"
        mock_track1.file_name = "/music/first.mp3"

        mock_track2 = MagicMock()
        mock_track2.id = 2
        mock_track2.title = "Second"
        mock_track2.file_name = "/music/second.mp3"

        with patch("src.api.routes._get_session") as mock_session_fn:
            session = MagicMock()
            session.query.return_value.filter.return_value.all.return_value = [
                mock_track2, mock_track1,
            ]
            mock_session_fn.return_value = session

            resp = client.post("/api/sets/export-m3u8", json={
                "track_ids": [1, 2],
                "name": "Ordered",
            })

        data = resp.json()
        lines = data["content"].strip().split("\n")
        assert lines[1] == "#EXTINF:-1,First"
        assert lines[2] == "/music/first.mp3"
        assert lines[3] == "#EXTINF:-1,Second"
        assert lines[4] == "/music/second.mp3"

    def test_sanitizes_filename(self, client, mock_finder):
        with patch("src.api.routes._get_session") as mock_session_fn:
            session = MagicMock()
            session.query.return_value.filter.return_value.all.return_value = []
            mock_session_fn.return_value = session

            resp = client.post("/api/sets/export-m3u8", json={
                "track_ids": [],
                "name": "Bad/Name<>",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert "/" not in data["filename"].replace(".m3u8", "")
        assert "<" not in data["filename"]

    def test_handles_empty_track_ids(self, client, mock_finder):
        with patch("src.api.routes._get_session") as mock_session_fn:
            session = MagicMock()
            session.query.return_value.filter.return_value.all.return_value = []
            mock_session_fn.return_value = session

            resp = client.post("/api/sets/export-m3u8", json={
                "track_ids": [],
                "name": "Empty",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["content"] == "#EXTM3U\n"
