from __future__ import annotations

from src.track_metadata.underground import is_underground_release


def test_underground_at_140_with_unknown_artist():
    assert (
        is_underground_release(
            bpm=140.0, title="Track", artist_in_legacy_library=False
        )
        is True
    )


def test_underground_below_140_with_unknown_artist():
    assert (
        is_underground_release(
            bpm=139.0, title="Track", artist_in_legacy_library=False
        )
        is False
    )


def test_underground_known_artist_plain_title():
    assert (
        is_underground_release(
            bpm=145.0, title="Plain Title", artist_in_legacy_library=True
        )
        is False
    )


def test_underground_known_artist_bootleg_title():
    assert (
        is_underground_release(
            bpm=145.0, title="Artist Bootleg Mix", artist_in_legacy_library=True
        )
        is True
    )
