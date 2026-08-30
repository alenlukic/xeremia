from __future__ import annotations

from src.track_metadata.research import (
    ArtistGenreCounts,
    BeatportArtistGenreObservation,
    BeatportTrackLabelObservation,
    SqlAlchemyTrackRepository,
)


def test_stub_browser_research_client_returns_none():
    from src.track_metadata.pipeline.agent import StubBrowserResearchClient

    client = StubBrowserResearchClient()
    assert client.inspect_beatport_artist_genres("Artist") is None
    assert client.inspect_beatport_track_label("Artist", "Track") is None


def test_beatport_observation_dataclasses_hold_structured_fields():
    artist_obs = BeatportArtistGenreObservation(
        artist="Artist",
        page_url="https://beatport.com/artist",
        genre_counts={"Techno": 10, "House": 10},
        identity_confirmed=True,
    )
    assert artist_obs.genre_counts["Techno"] == 10

    track_obs = BeatportTrackLabelObservation(
        artist="Artist",
        title="Track",
        page_url="https://beatport.com/track",
        label="Label",
        identity_confirmed=True,
    )
    assert track_obs.label == "Label"


def test_artist_genre_counts_structure():
    counts = ArtistGenreCounts(
        artist="Artist",
        matched_track_count=3,
        genre_counts={"Techno": 2, "House": 1},
    )
    assert counts.matched_track_count == 3


class _GroupedQuery:
    def __init__(self, rows):
        self._rows = rows

    def join(self, *_args, **_kwargs):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def group_by(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._rows


class _GroupedSession:
    def __init__(self, rows):
        self._rows = rows

    def query(self, *_args, **_kwargs):
        return _GroupedQuery(self._rows)


def test_sqlalchemy_repository_excludes_current_track_and_dedupes_identities():
    rows = [
        ("Artist A", 10, "a.mp3", "Track One", "Techno"),
        ("Artist A", 11, "b.mp3", "Track Two", "House"),
        ("Artist A", 12, "current.mp3", "Current", "Trance"),
        ("Artist A", 13, "a.mp3", "Track One", "Techno"),
    ]
    repository = SqlAlchemyTrackRepository(_GroupedSession(rows))

    counts = repository.query_genres_for_artist(
        "Artist A", exclude_file_name="current.mp3"
    )

    assert counts.genre_counts == {"Techno": 1, "House": 1}
    assert counts.matched_track_count == 2
    assert "Trance" not in counts.genre_counts
