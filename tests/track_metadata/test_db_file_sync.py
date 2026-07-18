from __future__ import annotations

from ast import literal_eval
from decimal import Decimal

import pytest

from src.data_management.config import DBUpdateType, TrackDBCols
from src.data_management.db_file_sync import (
    build_comment,
    format_tag_value,
    parse_track_id_args,
    sync_tracks_to_files,
)
from src.models.track import Track


def _make_track(**overrides) -> Track:
    values = {
        "id": 9400,
        "file_name": "[01A - Abm - 110.00] Nova - Kalaallit Nunaat.aiff",
        "title": "[01A - Abm - 110.00] Nova - Kalaallit Nunaat",
        "bpm": Decimal("110.00"),
        "key": "Abm",
        "camelot_code": "01A",
        "energy": 5,
        "genre": "Ambient",
        "label": "Ultimae Records",
        "comment": None,
    }
    values.update(overrides)
    track = Track()
    for attr, value in values.items():
        setattr(track, attr, value)
    return track


class _FakeQuery:
    def __init__(self, tracks, criteria=None):
        self.tracks = tracks
        self.criteria = criteria or {}

    def filter_by(self, **kwargs):
        merged = dict(self.criteria)
        merged.update(kwargs)
        return _FakeQuery(self.tracks, merged)

    def first(self):
        for track in self.tracks:
            if all(
                getattr(track, key, None) == value
                for key, value in self.criteria.items()
            ):
                return track
        return None


class _FakeSession:
    def __init__(self, tracks):
        self.tracks = tracks
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def query(self, model):
        assert model is Track
        return _FakeQuery(self.tracks)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


# ======================
# parse_track_id_args
# ======================


def test_parse_explicit_ids():
    assert parse_track_id_args(["9400", "9410", "9385"]) == [9400, 9410, 9385]


def test_parse_range_is_inclusive():
    assert parse_track_id_args(["9400...9403"]) == [9400, 9401, 9402, 9403]


def test_parse_single_item_range():
    assert parse_track_id_args(["9400...9400"]) == [9400]


def test_parse_empty_args_rejected():
    with pytest.raises(ValueError, match="No track ids"):
        parse_track_id_args([])


def test_parse_non_numeric_id_rejected():
    with pytest.raises(ValueError, match="ids must be integers"):
        parse_track_id_args(["9400", "abc"])


def test_parse_malformed_range_rejected():
    with pytest.raises(ValueError, match="Malformed range"):
        parse_track_id_args(["9400...9410...9420"])


def test_parse_inverted_range_rejected():
    with pytest.raises(ValueError, match="min id is greater"):
        parse_track_id_args(["9410...9400"])


def test_parse_non_numeric_range_bound_rejected():
    with pytest.raises(ValueError, match="ids must be integers"):
        parse_track_id_args(["9400...abc"])


# ======================
# format_tag_value
# ======================


def test_format_bpm_drops_trailing_zeros():
    assert format_tag_value(TrackDBCols.BPM, Decimal("136.00")) == "136"


def test_format_bpm_keeps_significant_fraction():
    assert format_tag_value(TrackDBCols.BPM, Decimal("128.50")) == "128.5"


def test_format_energy_and_text_columns():
    assert format_tag_value(TrackDBCols.ENERGY, 7) == "7"
    assert format_tag_value(TrackDBCols.TITLE, "A - B") == "A - B"


# ======================
# build_comment
# ======================


def test_build_comment_round_trips_and_orders_fields():
    track = _make_track()
    comment = build_comment(track, "Nova", None, "Wed Apr 15 15:59:11 2026")

    parsed = literal_eval(comment)
    assert parsed == {
        "artists": "Nova",
        "file_name": track.file_name,
        "title": track.title,
        "bpm": 110.0,
        "key": "Abm",
        "camelot_code": "01A",
        "energy": 5,
        "genre": "Ambient",
        "label": "Ultimae Records",
        "date_added": "Wed Apr 15 15:59:11 2026",
    }
    assert list(parsed.keys())[:3] == ["artists", "file_name", "title"]
    assert isinstance(parsed["bpm"], float)


def test_build_comment_omits_empty_fields():
    track = _make_track(energy=None, genre=None, label="")
    comment = build_comment(track, "Nova", "Remixer", None)

    parsed = literal_eval(comment)
    assert "energy" not in parsed
    assert "genre" not in parsed
    assert "label" not in parsed
    assert "date_added" not in parsed
    assert parsed["remixers"] == "Remixer"


# ======================
# sync_tracks_to_files
# ======================


def test_sync_reports_missing_track_and_continues(monkeypatch, tmp_path):
    synced = _make_track(id=2)
    session = _FakeSession([synced])
    monkeypatch.setattr(
        "src.data_management.db_file_sync.sync_track_to_file",
        lambda track, music_dir: {"genre": "Ambient"},
    )

    results = sync_tracks_to_files([1, 2], music_dir=str(tmp_path), session=session)

    assert results[1]["status"] == DBUpdateType.FAILURE.value
    assert "no track row" in results[1]["error"]
    assert results[2] == {
        "status": DBUpdateType.UPDATE.value,
        "changes": {"genre": "Ambient"},
    }
    assert session.commits == 1


def test_sync_failure_rolls_back_and_continues(monkeypatch, tmp_path):
    failing = _make_track(id=1)
    clean = _make_track(id=2)
    session = _FakeSession([failing, clean])

    def fake_sync(track, music_dir):
        if track.id == 1:
            raise FileNotFoundError("No audio file found for track 1")
        return {}

    monkeypatch.setattr(
        "src.data_management.db_file_sync.sync_track_to_file", fake_sync
    )

    results = sync_tracks_to_files([1, 2], music_dir=str(tmp_path), session=session)

    assert results[1]["status"] == DBUpdateType.FAILURE.value
    assert session.rollbacks == 1
    assert results[2]["status"] == DBUpdateType.NOOP.value
    assert session.commits == 1


def test_sync_leaves_injected_session_open(monkeypatch, tmp_path):
    session = _FakeSession([_make_track(id=1)])
    monkeypatch.setattr(
        "src.data_management.db_file_sync.sync_track_to_file",
        lambda track, music_dir: {},
    )

    sync_tracks_to_files([1], music_dir=str(tmp_path), session=session)

    assert session.closed is False
