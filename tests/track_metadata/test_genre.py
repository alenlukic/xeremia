from __future__ import annotations

from src.track_metadata.genre import resolve_dynamic_genre, resolve_single_genre


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
