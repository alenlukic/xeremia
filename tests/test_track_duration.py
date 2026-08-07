"""Tests for track duration reading and the duration backfill migration."""

from unittest.mock import MagicMock, patch

import pytest

from src.data_management.audio_file import duration_from_audio, read_duration_seconds
from src.scripts import migrate_track_duration


class FakeTrack:
    """Minimal stand-in for a Track row."""

    def __init__(self, file_name, duration_seconds=None):
        self.file_name = file_name
        self.duration_seconds = duration_seconds


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self.filtered = False

    def filter(self, _criterion):
        self.filtered = True
        return FakeQuery([r for r in self._rows if r.duration_seconds is None])

    def all(self):
        return list(self._rows)


class FakeSession:
    def __init__(self, rows):
        self.rows = rows
        self.commits = 0
        self.last_query = None

    def query(self, _model):
        self.last_query = FakeQuery(self.rows)
        return self.last_query

    def commit(self):
        self.commits += 1


def _audio(length):
    audio = MagicMock()
    audio.info.length = length
    return audio


class TestDurationFromAudio:
    def test_reads_positive_length(self):
        assert duration_from_audio(_audio(390.256)) == pytest.approx(390.26)

    def test_returns_none_without_info(self):
        audio = MagicMock(spec=[])
        assert duration_from_audio(audio) is None

    def test_returns_none_for_missing_length(self):
        assert duration_from_audio(_audio(None)) is None

    def test_returns_none_for_zero_length(self):
        assert duration_from_audio(_audio(0)) is None

    def test_returns_none_for_unparsable_length(self):
        assert duration_from_audio(_audio("not-a-number")) is None

    def test_returns_none_for_unreadable_file(self):
        assert read_duration_seconds("/nonexistent/track.mp3") is None


class TestDurationBackfill:
    def test_fills_null_durations(self):
        rows = [FakeTrack("a.mp3"), FakeTrack("b.mp3")]
        session = FakeSession(rows)
        with patch.object(migrate_track_duration, "_duration_for", return_value=300.0):
            updated, skipped = migrate_track_duration.backfill(session)
        assert (updated, skipped) == (2, [])
        assert [r.duration_seconds for r in rows] == [300.0, 300.0]
        assert session.commits == 1

    def test_reports_unreadable_files_as_skips(self):
        rows = [FakeTrack("missing.mp3")]
        session = FakeSession(rows)
        with patch.object(migrate_track_duration, "_duration_for", return_value=None):
            updated, skipped = migrate_track_duration.backfill(session)
        assert (updated, skipped) == (0, ["missing.mp3"])
        assert rows[0].duration_seconds is None

    def test_rerun_skips_rows_that_already_have_a_duration(self):
        rows = [FakeTrack("a.mp3", duration_seconds=300.0)]
        session = FakeSession(rows)
        with patch.object(migrate_track_duration, "_duration_for", return_value=999.0):
            updated, skipped = migrate_track_duration.backfill(session)
        assert (updated, skipped) == (0, [])
        assert session.last_query.filtered is True
        assert rows[0].duration_seconds == pytest.approx(300.0)

    def test_refresh_all_rereads_measured_rows(self):
        rows = [FakeTrack("a.mp3", duration_seconds=300.0)]
        session = FakeSession(rows)
        with patch.object(migrate_track_duration, "_duration_for", return_value=420.0):
            updated, _ = migrate_track_duration.backfill(session, refresh_all=True)
        assert updated == 1
        assert session.last_query.filtered is False
        assert rows[0].duration_seconds == pytest.approx(420.0)


class TestDurationMigrationVerify:
    def test_reports_missing_table(self):
        with patch.object(migrate_track_duration, "_table_exists", return_value=False):
            assert migrate_track_duration.verify() == ["track table is missing"]

    def test_reports_missing_column(self):
        with (
            patch.object(migrate_track_duration, "_table_exists", return_value=True),
            patch.object(
                migrate_track_duration, "_column_names", return_value={"id", "title"}
            ),
        ):
            assert migrate_track_duration.verify() == [
                "track.duration_seconds column is missing"
            ]

    def test_passes_when_column_present(self):
        with (
            patch.object(migrate_track_duration, "_table_exists", return_value=True),
            patch.object(
                migrate_track_duration,
                "_column_names",
                return_value={"id", "title", "duration_seconds"},
            ),
        ):
            assert migrate_track_duration.verify() == []
