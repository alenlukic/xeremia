from __future__ import annotations

from src.track_metadata.pipeline.agent import StubBrowserResearchClient
from src.track_metadata.research import (
    ArtistGenreCounts,
    BeatportArtistGenreObservation,
    BeatportTrackLabelObservation,
    SqlAlchemyTrackRepository,
)


def test_stub_browser_research_client_returns_none():
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


class _FakeRow:
    def __init__(self, **fields):
        for key, value in fields.items():
            setattr(self, key, value)


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def filter(self, *_args, **_kwargs):
        return self

    def filter_by(self, **kwargs):
        wanted = kwargs.get("id")
        return _FakeQuery([row for row in self._rows if row.id == wanted])

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeSession:
    def __init__(self, artists, links, tracks):
        self._by_model = {
            "Artist": artists,
            "ArtistTrack": links,
            "Track": tracks,
        }

    def query(self, model):
        return _FakeQuery(self._by_model.get(model.__name__, []))


def test_sqlalchemy_repository_excludes_current_track_and_dedupes_identities():
    artists = [
        _FakeRow(id=1, name="Artist A"),
        _FakeRow(id=2, name="Someone Else"),
    ]
    links = [_FakeRow(track_id=tid) for tid in (10, 11, 12, 13)]
    tracks = [
        _FakeRow(id=10, file_name="a.mp3", title="Track One", genre="Techno"),
        _FakeRow(id=11, file_name="b.mp3", title="Track Two", genre="House"),
        _FakeRow(id=12, file_name="current.mp3", title="Current", genre="Trance"),
        # Same identity as track 10 -> must be de-duplicated, not double counted.
        _FakeRow(id=13, file_name="a.mp3", title="Track One", genre="Techno"),
    ]
    repository = SqlAlchemyTrackRepository(_FakeSession(artists, links, tracks))

    counts = repository.query_genres_for_artist(
        "Artist A", exclude_file_name="current.mp3"
    )

    assert counts.genre_counts == {"Techno": 1, "House": 1}
    assert counts.matched_track_count == 2
    assert "Trance" not in counts.genre_counts
