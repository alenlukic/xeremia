from __future__ import annotations

import pytest

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.queries import (
    build_search_terms,
    direct_label_album_query,
    direct_label_title_query,
    discogs_query_params,
    musicbrainz_query,
    web_search_query,
)

_SITE_RESTRICTION = "(site:beatport.com OR site:soundcloud.com OR site:bandcamp.com OR site:hypeddit.com)"


# ---------------------------------------------------------------------------
# build_search_terms — normalization
# ---------------------------------------------------------------------------


def test_build_search_terms_normalizes_whitespace_and_title() -> None:
    terms = build_search_terms(
        SimpleMetadata(
            artist="  Aphex   Twin ",
            title="Windowlicker (Original Mix)",
            album=" Windowlicker ",
        )
    )
    assert terms.artist == "Aphex Twin"
    assert terms.title == "Windowlicker"  # "(Original Mix)" stripped by title cleaning
    assert terms.album == "Windowlicker"


def test_build_search_terms_preserves_real_remix_names() -> None:
    terms = build_search_terms(
        SimpleMetadata(artist="Lady Gaga", title="Alejandro (Linds Trance Mix)")
    )
    assert terms.title == "Alejandro (Linds Trance Mix)"


def test_build_search_terms_empty_seed_is_empty() -> None:
    terms = build_search_terms(SimpleMetadata())
    assert terms.is_empty
    assert terms.artist is None and terms.title is None and terms.album is None


# ---------------------------------------------------------------------------
# musicbrainz_query
# ---------------------------------------------------------------------------


def test_musicbrainz_query_combines_artist_and_title() -> None:
    terms = build_search_terms(
        SimpleMetadata(artist="Aphex Twin", title="Windowlicker")
    )
    assert musicbrainz_query(terms) == "Aphex Twin Windowlicker"


def test_musicbrainz_query_title_only() -> None:
    terms = build_search_terms(SimpleMetadata(title="Windowlicker"))
    assert musicbrainz_query(terms) == "Windowlicker"


def test_musicbrainz_query_requires_title() -> None:
    terms = build_search_terms(SimpleMetadata(artist="Aphex Twin"))
    assert musicbrainz_query(terms) is None


# ---------------------------------------------------------------------------
# discogs_query_params
# ---------------------------------------------------------------------------


def test_discogs_query_params_full_seed() -> None:
    terms = build_search_terms(
        SimpleMetadata(
            artist="Aphex Twin", title="Windowlicker", album="Windowlicker EP"
        )
    )
    assert discogs_query_params(terms) == {
        "track": "Windowlicker",
        "artist": "Aphex Twin",
        "release_title": "Windowlicker EP",
    }


def test_discogs_query_params_title_only() -> None:
    terms = build_search_terms(SimpleMetadata(title="Windowlicker"))
    assert discogs_query_params(terms) == {"track": "Windowlicker"}


def test_discogs_query_params_requires_title() -> None:
    terms = build_search_terms(SimpleMetadata(artist="Aphex Twin"))
    assert discogs_query_params(terms) is None


# ---------------------------------------------------------------------------
# web_search_query
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("seed", "expected"),
    [
        (
            SimpleMetadata(artist="Aphex Twin", title="Windowlicker"),
            f"{_SITE_RESTRICTION} Aphex Twin Windowlicker",
        ),
        (SimpleMetadata(title="Windowlicker"), f"{_SITE_RESTRICTION} Windowlicker"),
        (SimpleMetadata(artist="Aphex Twin"), f"{_SITE_RESTRICTION} Aphex Twin"),
        (SimpleMetadata(), None),
    ],
)
def test_web_search_query(seed: SimpleMetadata, expected: str | None) -> None:
    assert web_search_query(build_search_terms(seed)) == expected


def test_direct_label_queries_include_site_restriction() -> None:
    terms = build_search_terms(
        SimpleMetadata(artist="Artist", title="Track", album="Album")
    )
    title_query = direct_label_title_query(terms)
    album_query = direct_label_album_query(terms)
    assert title_query is not None
    assert album_query is not None
    assert title_query.startswith(_SITE_RESTRICTION)
    assert album_query.startswith(_SITE_RESTRICTION)
