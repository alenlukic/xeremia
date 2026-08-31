from __future__ import annotations

from src.db.database import Database
from src.track_metadata import research
from src.track_metadata.research import LegacyArtistGenreIndex, SqlAlchemyTrackRepository

LEGACY_CEILING_ROW_ID = 9600


def _column_key(column):
    element = column
    if hasattr(column, "__clause_element__"):
        element = column.__clause_element__()
    return f"{element.table.name}.{element.name}"


class _RecordingQuery:
    """Query stub that applies the production criteria to the seeded rows.

    The legacy ceiling lives in a SQL WHERE clause, so a stub that discards
    ``filter`` cannot observe it. This stub evaluates every criterion against
    the seeded tuples, which makes a dropped clause visible to a test.
    """

    def __init__(self, rows, column_keys):
        self._rows = rows
        self._column_keys = column_keys
        self._criteria = []
        self.call_count = 0

    def join(self, *_args, **_kwargs):
        return self

    def filter(self, *criteria):
        self._criteria.extend(criteria)
        return self

    def group_by(self, *_args, **_kwargs):
        return self

    def all(self):
        self.call_count += 1
        return [row for row in self._rows if self._row_passes(row)]

    def _row_passes(self, row) -> bool:
        return all(self._criterion_holds(item, row) for item in self._criteria)

    def _criterion_holds(self, criterion, row) -> bool:
        position = self._column_keys.index(_column_key(criterion.left))
        return bool(criterion.operator(row[position], criterion.right.value))


class _RecordingSession:
    def __init__(self, rows):
        self._rows = rows
        self.query_calls = 0
        self.last_query = None

    def query(self, *columns):
        self.query_calls += 1
        self.last_query = _RecordingQuery(
            self._rows, [_column_key(column) for column in columns]
        )
        return self.last_query


def _legacy_rows():
    return [
        ("Techno Duo", 100, "a.mp3", "Track One", "Techno"),
        ("Techno Duo", 101, "b.mp3", "Track Two", "Techno "),
        ("Legacy Artist", 9000, "legacy.mp3", "Legacy", "House"),
        ("New Artist", LEGACY_CEILING_ROW_ID, "new.mp3", "New", "Techno"),
    ]


def test_grouped_query_runs_once():
    session = _RecordingSession(_legacy_rows())
    repository = SqlAlchemyTrackRepository(session)

    repository.query_genres_for_artist("Techno Duo")
    repository.query_genres_for_artist("Legacy Artist")

    assert session.query_calls == 1


def test_legacy_ceiling_excludes_new_rows():
    index = LegacyArtistGenreIndex.build(_RecordingSession(_legacy_rows()))

    counts = index.genre_counts_for("New Artist")

    assert counts.matched_track_count == 0
    assert counts.genre_counts == {}
    assert index.legacy_genre_totals() == {"Techno": 2, "House": 1}


def test_vocabulary_normalizes_before_count():
    index = LegacyArtistGenreIndex.build(_RecordingSession(_legacy_rows()))
    counts = index.genre_counts_for("Techno Duo")
    assert counts.genre_counts == {"Techno": 2}
    assert counts.matched_track_count == 2


def test_legacy_presence_respects_ceiling():
    index = LegacyArtistGenreIndex.build(_RecordingSession(_legacy_rows()))

    assert index.artist_in_legacy_library("New Artist") is False
    assert index.artist_in_legacy_library("Legacy Artist") is True
    assert index.artist_in_legacy_library("Nobody") is False
    assert index.artist_in_legacy_library("") is False


def test_legacy_presence_ignores_empty_genre():
    for genre in (None, "", "   "):
        index = LegacyArtistGenreIndex.build(
            _RecordingSession([("Legacy Artist", 9000, "legacy.mp3", "Legacy", genre)])
        )

        assert index.artist_in_legacy_library("Legacy Artist") is True
        assert index.genre_counts_for("Legacy Artist").genre_counts == {}
        assert index.legacy_genre_totals() == {}


def test_artist_match_scores_each_distinct_name_once(monkeypatch):
    rows = [
        ("Shared Name", row_id, f"{row_id}.mp3", f"Track {row_id}", "Techno")
        for row_id in range(1, 51)
    ]
    rows.append(("Other Name", 200, "other.mp3", "Other", "House"))
    index = LegacyArtistGenreIndex.build(_RecordingSession(rows))

    scored: list[str] = []
    real_similarity = research._similarity

    def _counting_similarity(left, right):
        scored.append(right)
        return real_similarity(left, right)

    monkeypatch.setattr(research, "_similarity", _counting_similarity)

    counts = index.genre_counts_for("Shared Name")
    index.genre_counts_for("Shared Name")

    assert counts.matched_track_count == 50
    assert scored == ["Shared Name", "Other Name"]


def test_build_through_database_session_wrapper():
    """Production wires the Database session wrapper, whose query() must
    forward multi-column queries to the underlying session."""
    wrapper = Database._Database__Session(_RecordingSession(_legacy_rows()))

    index = LegacyArtistGenreIndex.build(wrapper)

    assert index.legacy_genre_totals() == {"Techno": 2, "House": 1}
