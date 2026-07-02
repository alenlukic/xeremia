from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any, Optional

from src.data_management.utils import transform_genre

_UNKNOWN_GENRE_VALUES = frozenset({"", "unknown", "n/a", "na", "none", "misc", "other"})
_SOURCE_PRIORITY = (
    "beatport",
    "lastfm",
    "musicbrainz",
    "discogs",
    "web_search",
    "acoustid",
)


BeatportGenreLookup = Callable[[Optional[str], Optional[str]], Optional[str]]
LastFmGenreLookup = Callable[[Optional[str], Optional[str]], Optional[str]]


def is_unknown_genre(genre: Optional[str]) -> bool:
    if genre is None:
        return True
    normalized = genre.strip().lower()
    return normalized in _UNKNOWN_GENRE_VALUES


def normalize_genre_value(genre: Optional[str]) -> Optional[str]:
    if is_unknown_genre(genre):
        return None
    transformed = transform_genre(genre.strip())
    if is_unknown_genre(transformed):
        return None
    return transformed.strip() or None


def resolve_single_genre(
    candidates: Iterable[tuple[str, Optional[str], float]],
) -> Optional[str]:
    ranked: list[tuple[int, float, str]] = []
    for source, raw_genre, confidence in candidates:
        normalized = normalize_genre_value(raw_genre)
        if normalized is None:
            continue
        try:
            priority = _SOURCE_PRIORITY.index(source)
        except ValueError:
            priority = len(_SOURCE_PRIORITY)
        ranked.append((priority, -confidence, normalized))

    if not ranked:
        return None

    ranked.sort()
    return ranked[0][2]


def collect_genre_candidates_from_sources(
    sources: list[dict[str, Any]],
) -> list[tuple[str, Optional[str], float]]:
    candidates: list[tuple[str, str | None, float]] = []
    for entry in sources:
        source = str(entry.get("source", ""))
        metadata = entry.get("metadata")
        if not isinstance(metadata, dict):
            continue
        genre = metadata.get("genre")
        if isinstance(genre, str) and genre.strip():
            confidence = float(entry.get("confidence", 0.75))
            candidates.append((source, genre, confidence))
    return candidates


def resolve_dynamic_genre(
    *,
    artist: str | None,
    title: str | None,
    source_candidates: Optional[Iterable[tuple[str, Optional[str], float]]] = None,
    beatport_lookup: Optional[BeatportGenreLookup] = None,
    lastfm_lookup: Optional[LastFmGenreLookup] = None,
) -> Optional[str]:
    candidates: list[tuple[str, Optional[str], float]] = []
    if beatport_lookup is not None:
        beatport_genre = beatport_lookup(artist, title)
        if beatport_genre:
            candidates.append(("beatport", beatport_genre, 0.95))
    if lastfm_lookup is not None:
        lastfm_genre = lastfm_lookup(artist, title)
        if lastfm_genre:
            candidates.append(("lastfm", lastfm_genre, 0.85))
    if source_candidates is not None:
        candidates.extend(source_candidates)
    return resolve_single_genre(candidates)
