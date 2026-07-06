from __future__ import annotations

from src.track_metadata.genre import (
    aggregate_artist_history,
    extract_usable_artists,
    resolve_artist_history_genre,
    resolve_beatport_artist_genre,
    resolve_dynamic_genre,
    resolve_genre_fallback,
    resolve_ravevival,
    resolve_single_genre,
)
from src.track_metadata.research import ArtistGenreCounts, BeatportArtistGenreObservation


def test_resolve_ravevival_boundary_values():
    assert resolve_ravevival(free_download=True, bpm=140.0) == "Ravevival"
    assert resolve_ravevival(free_download=True, bpm=139.0) is None
    assert resolve_ravevival(free_download=False, bpm=150.0) is None
    assert resolve_ravevival(free_download=True, bpm=None) is None


def test_resolve_single_genre_prefers_beatport_then_lastfm():
    genre = resolve_single_genre(
        [
            ("discogs", "House | Deep House", 0.7),
            ("lastfm", "Techno", 0.9),
            ("beatport", "Deep House", 0.8),
        ]
    )
    assert genre == "Deep House"


def test_resolve_dynamic_genre_uses_lookup_hooks():
    genre = resolve_dynamic_genre(
        artist="Artist",
        title="Track",
        beatport_lookup=lambda _artist, _title: "Techno",
        lastfm_lookup=lambda _artist, _title: "House",
    )
    assert genre == "Techno"


class _StubRepository:
    def __init__(self, mapping: dict[str, ArtistGenreCounts]):
        self.mapping = mapping

    def query_genres_for_artist(self, artist, **_kwargs):
        return self.mapping[artist]


class _StubBrowser:
    def __init__(self, observation):
        self.observation = observation

    def inspect_beatport_artist_genres(self, artist):
        return self.observation


def test_extract_usable_artists_splits_and_filters_placeholders():
    assert extract_usable_artists("Artist A, Artist B") == ["Artist A", "Artist B"]
    assert extract_usable_artists("Unknown") == []


def test_aggregate_artist_history_picks_unambiguous_winner():
    winner, evidence = aggregate_artist_history(
        [
            ArtistGenreCounts("A", 2, {"Techno": 2}),
            ArtistGenreCounts("B", 1, {"Techno": 1}),
        ]
    )
    assert winner == "Techno"
    assert "A" in evidence["artists"]


def test_aggregate_artist_history_returns_none_on_tie():
    winner, _evidence = aggregate_artist_history(
        [
            ArtistGenreCounts("A", 2, {"Techno": 2, "House": 2}),
        ]
    )
    assert winner is None


def test_resolve_artist_history_queries_each_artist_separately():
    repo = _StubRepository(
        {
            "Artist A": ArtistGenreCounts("Artist A", 2, {"Techno": 2}),
            "Artist B": ArtistGenreCounts("Artist B", 1, {"Techno": 1}),
        }
    )
    genre, event = resolve_artist_history_genre(["Artist A", "Artist B"], repo)
    assert genre == "Techno"
    assert event.method == "artist_history"
    assert "Artist A" in event.evidence["artists"]
    assert "Artist B" in event.evidence["artists"]


def test_beatport_genre_fallthrough_on_tie():
    browser = _StubBrowser(
        BeatportArtistGenreObservation(
            artist="Artist",
            page_url="https://beatport.com/artist",
            genre_counts={"Techno": 5, "House": 5},
            identity_confirmed=True,
        )
    )
    genre, event = resolve_beatport_artist_genre(["Artist"], browser)
    assert genre is None
    assert event.outcome == "unresolved"


def test_resolve_genre_fallback_short_circuits_on_artist_history():
    repo = _StubRepository({"Artist": ArtistGenreCounts("Artist", 1, {"House": 1})})
    browser = _StubBrowser(None)

    genre, events = resolve_genre_fallback(
        artist="Artist",
        title="Track",
        repository=repo,
        browser=browser,
        enable_beatport=True,
    )
    assert genre == "House"
    assert events[0].method == "artist_history"
    assert all(event.method != "beatport_artist_genres" for event in events)


def test_resolve_genre_fallback_uses_beatport_after_db_tie():
    repo = _StubRepository({"Artist": ArtistGenreCounts("Artist", 2, {"A": 1, "B": 1})})
    browser = _StubBrowser(
        BeatportArtistGenreObservation(
            artist="Artist",
            page_url="url",
            genre_counts={"Techno": 9},
            identity_confirmed=True,
        )
    )
    genre, events = resolve_genre_fallback(
        artist="Artist",
        title="Track",
        repository=repo,
        browser=browser,
    )
    assert genre == "Techno"
    assert events[-1].method == "beatport_artist_genres"
