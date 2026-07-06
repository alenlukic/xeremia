from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from typing import Any, Optional

from src.data_management.utils import split_artist_string, transform_genre
from src.track_metadata.research import (
    ArtistGenreCounts,
    BeatportArtistGenreObservation,
    BrowserResearchClient,
    ResolutionProvenance,
    TrackRepository,
)

RAVEVIVAL_MIN_BPM = 140.0

_UNKNOWN_GENRE_VALUES = frozenset({"", "unknown", "n/a", "na", "none", "misc", "other"})
_PLACEHOLDER_ARTISTS = frozenset(
    {"unknown", "various artists", "va", "n/a", "none", "artist unknown"}
)
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


def resolve_ravevival(*, free_download: bool, bpm: float | None) -> str | None:
    if not free_download or bpm is None or bpm < RAVEVIVAL_MIN_BPM:
        return None
    return "Ravevival"


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


def extract_usable_artists(artist: str | None) -> list[str]:
    if not artist or not artist.strip():
        return []
    tokens: list[str] = []
    for part in split_artist_string(artist):
        for token in re.split(r"\s*(?:&| and | feat\.?| ft\.?)\s*", part, flags=re.IGNORECASE):
            cleaned = token.strip()
            if not cleaned:
                continue
            if cleaned.casefold() in _PLACEHOLDER_ARTISTS:
                continue
            tokens.append(cleaned)
    return tokens


def _pick_unambiguous_winner(counts: dict[str, int]) -> str | None:
    if not counts:
        return None
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    top_genre, top_count = ranked[0]
    if top_count <= 0:
        return None
    if len(ranked) > 1 and ranked[1][1] == top_count:
        return None
    return top_genre


def aggregate_artist_history(
    per_artist: list[ArtistGenreCounts],
) -> tuple[str | None, dict[str, Any]]:
    aggregate: dict[str, int] = {}
    artist_evidence: dict[str, Any] = {}
    for entry in per_artist:
        artist_evidence[entry.artist] = {
            "matched_track_count": entry.matched_track_count,
            "genre_counts": dict(entry.genre_counts),
        }
        for genre, count in entry.genre_counts.items():
            normalized = normalize_genre_value(genre)
            if normalized is None:
                continue
            aggregate[normalized] = aggregate.get(normalized, 0) + count

    winner = _pick_unambiguous_winner(aggregate)
    return winner, {"artists": artist_evidence, "aggregate_counts": aggregate}


def resolve_artist_history_genre(
    artists: list[str],
    repository: TrackRepository,
    *,
    exclude_track_id: int | None = None,
    exclude_file_name: str | None = None,
) -> tuple[str | None, ResolutionProvenance]:
    per_artist = [
        repository.query_genres_for_artist(
            artist,
            exclude_track_id=exclude_track_id,
            exclude_file_name=exclude_file_name,
        )
        for artist in artists
    ]
    selected, evidence = aggregate_artist_history(per_artist)
    outcome = "resolved" if selected else "unresolved"
    confidence = "high" if selected else "ambiguous" if evidence.get("aggregate_counts") else "no_match"
    return selected, ResolutionProvenance(
        field="genre",
        method="artist_history",
        outcome=outcome,
        source="track_repository",
        confidence=confidence,
        evidence={**evidence, "selected_genre": selected},
        inputs={"artists": artists},
    )


def resolve_beatport_artist_genre(
    artists: list[str],
    browser: BrowserResearchClient,
) -> tuple[str | None, ResolutionProvenance]:
    last_observation: BeatportArtistGenreObservation | None = None
    for artist in artists:
        try:
            observation = browser.inspect_beatport_artist_genres(artist)
        except Exception as exc:
            return None, ResolutionProvenance(
                field="genre",
                method="beatport_artist_genres",
                outcome="error",
                source="beatport",
                confidence="error",
                evidence={"error": str(exc), "artist": artist},
                inputs={"artists": artists},
            )
        if observation is None or not observation.identity_confirmed:
            continue
        last_observation = observation
        winner = _pick_unambiguous_winner(observation.genre_counts)
        if winner:
            return winner, ResolutionProvenance(
                field="genre",
                method="beatport_artist_genres",
                outcome="resolved",
                source=observation.page_url,
                confidence="high",
                evidence={
                    "artist": observation.artist,
                    "genre_counts": observation.genre_counts,
                    "selected_genre": winner,
                },
                inputs={"artists": artists},
            )

    evidence: dict[str, Any] = {}
    if last_observation is not None:
        evidence = {
            "artist": last_observation.artist,
            "genre_counts": last_observation.genre_counts,
        }
    return None, ResolutionProvenance(
        field="genre",
        method="beatport_artist_genres",
        outcome="unresolved",
        source="beatport",
        confidence="ambiguous",
        evidence=evidence,
        inputs={"artists": artists},
    )


def resolve_genre_fallback(
    *,
    artist: str | None,
    title: str | None,
    repository: TrackRepository | None = None,
    browser: BrowserResearchClient | None = None,
    enable_artist_history: bool = True,
    enable_beatport: bool = True,
    exclude_track_id: int | None = None,
    exclude_file_name: str | None = None,
) -> tuple[str | None, list[ResolutionProvenance]]:
    events: list[ResolutionProvenance] = []
    artists = extract_usable_artists(artist)
    if not artists:
        events.append(
            ResolutionProvenance(
                field="genre",
                method="artist_history",
                outcome="skipped",
                confidence="no_artists",
                evidence={},
                inputs={"artist": artist, "title": title},
            )
        )
        return None, events

    if enable_artist_history and repository is not None:
        genre, event = resolve_artist_history_genre(
            artists,
            repository,
            exclude_track_id=exclude_track_id,
            exclude_file_name=exclude_file_name,
        )
        events.append(event)
        if genre:
            return genre, events

    if enable_beatport and browser is not None:
        genre, event = resolve_beatport_artist_genre(artists, browser)
        events.append(event)
        if genre:
            return genre, events

    return None, events
