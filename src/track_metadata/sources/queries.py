"""Centralized search-query generation for external metadata catalogs.

All external lookups derive their query text from a single normalized
:class:`SearchTerms` view of a track seed. Keeping query construction in one
tested place ensures every catalog searches with consistent, cleaned inputs
(for example, mastering/mix cruft stripped from the title) rather than each
source re-deriving its own query shape.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.track_metadata.matching import _clean_title_seed, _normalize_whitespace
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.constants import (
    FREE_DOWNLOAD_SEARCH_SITES,
    METADATA_SEARCH_SITES,
)


@dataclass(frozen=True)
class SearchTerms:
    artist: str | None
    title: str | None
    album: str | None

    @property
    def is_empty(self) -> bool:
        return not (self.artist or self.title or self.album)


def build_search_terms(seed: SimpleMetadata) -> SearchTerms:
    """Normalize a metadata seed into the query terms shared by all catalogs."""
    return SearchTerms(
        artist=_normalize_whitespace(seed.artist),
        title=_clean_title_seed(seed.title),
        album=_normalize_whitespace(seed.album),
    )


def _site_restriction(sites: tuple[str, ...] = METADATA_SEARCH_SITES) -> str:
    clauses = " OR ".join(f"site:{site}" for site in sites)
    return f"({clauses})"


def _with_site_restriction(query: str, *, sites: tuple[str, ...] = METADATA_SEARCH_SITES) -> str:
    return f"{_site_restriction(sites)} {query}"


def musicbrainz_query(terms: SearchTerms) -> str | None:
    """Free-text query for the MusicBrainz recording search endpoint."""
    if not terms.title:
        return None
    parts = [part for part in (terms.artist, terms.title) if part]
    return " ".join(parts)


def discogs_query_params(terms: SearchTerms) -> dict[str, str] | None:
    """Seed-derived query parameters for the Discogs database search endpoint."""
    if not terms.title:
        return None
    params: dict[str, str] = {"track": terms.title}
    if terms.artist:
        params["artist"] = terms.artist
    if terms.album:
        params["release_title"] = terms.album
    return params


def web_search_query(terms: SearchTerms) -> str | None:
    """Free-text query for the web-search fallback source."""
    parts = [part for part in (terms.artist, terms.title) if part]
    if not parts:
        return None
    return _with_site_restriction(" ".join(parts))


def direct_label_title_query(terms: SearchTerms) -> str | None:
    if not terms.artist or not terms.title:
        return None
    return _with_site_restriction(f'"{terms.artist}" "{terms.title}" "record label"')


def direct_label_album_query(terms: SearchTerms) -> str | None:
    if not terms.artist or not terms.album:
        return None
    return _with_site_restriction(f'"{terms.artist}" "{terms.album}" "record label"')


def free_download_query(terms: SearchTerms) -> str | None:
    if not terms.artist or not terms.title:
        return None
    core = f'"{terms.artist}" "{terms.title}" "free download"'
    return _with_site_restriction(core, sites=FREE_DOWNLOAD_SEARCH_SITES)


def beatport_artist_discovery_query(artist: str) -> str:
    return f"site:beatport.com {artist}"


def beatport_track_discovery_query(artist: str, title: str) -> str:
    return f'site:beatport.com "{artist}" "{title}"'
