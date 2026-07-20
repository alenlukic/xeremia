"""Tests for installation-global table preference API endpoints."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.api.app import create_app


@pytest.fixture
def client():
    with (
        patch("src.api.routes._get_match_finder"),
        patch("src.harmonic_mixing.weight_service.WeightService"),
    ):
        with TestClient(create_app()) as tc:
            yield tc


class TestTablePreferencesApi:
    def test_get_returns_empty_list_when_no_rows(self, client):
        mock_session = MagicMock()
        mock_session.query.return_value.all.return_value = []
        with patch("src.api.routes._get_session", return_value=mock_session):
            response = client.get("/api/admin/table-preferences")
        assert response.status_code == 200
        assert response.json() == {"preferences": []}
        mock_session.close.assert_called_once()

    def test_put_rejects_unknown_table_id(self, client):
        payload = {
            "column_order": ["title"],
            "column_visibility": {"title": True},
            "column_widths": {"title": 120},
        }
        response = client.put("/api/admin/table-preferences/unknown", json=payload)
        assert response.status_code == 400

    def test_put_upserts_valid_config(self, client):
        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None
        mock_row = MagicMock()
        mock_row.table_id = "search"
        mock_row.column_order = ["title"]
        mock_row.column_visibility = {"title": True}
        mock_row.column_widths = {"title": 120.0}
        mock_row.updated_at = None

        def refresh(row):
            row.table_id = "search"
            row.column_order = ["title"]
            row.column_visibility = {"title": True}
            row.column_widths = {"title": 120.0}
            row.updated_at = None

        mock_session.refresh.side_effect = refresh

        payload = {
            "column_order": ["title"],
            "column_visibility": {"title": True},
            "column_widths": {"title": 120},
        }
        with patch("src.api.routes._get_session", return_value=mock_session):
            response = client.put("/api/admin/table-preferences/search", json=payload)
        assert response.status_code == 200
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

    def test_missing_table_returns_service_unavailable(self, client):
        from sqlalchemy.exc import ProgrammingError

        mock_session = MagicMock()
        mock_session.query.side_effect = ProgrammingError("stmt", {}, Exception("missing"))
        with patch("src.api.routes._get_session", return_value=mock_session):
            response = client.get("/api/admin/table-preferences")
        assert response.status_code == 503
        assert "migrate_table_preferences" in response.json()["detail"]
