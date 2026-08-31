from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from typing import Any, Optional

from src.data_management.genre_vocabulary import resolve_canonical_genre
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
    "beatport_tag",
    "musicbrainz",
    "discogs",
    "artist_history",
    "beatport_artist",
    "lastfm",
    "beatport_search",
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
    return resolve_canonical_genre(
        transformed.strip() or None, context="normalize_genre_value"
    )


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
            candidates.append(("beatport_search", beatport_genre, 0.5))
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
        for token in re.split(
            r"\s*(?:&| and | feat\.?| ft\.?)\s*", part, flags=re.IGNORECASE
        ):
            cleaned = token.strip()
            if not cleaned:
                continue
            if cleaned.casefold() in _PLACEHOLDER_ARTISTS:
                continue
            tokens.append(cleaned)
    return tokens


def _pick_unambiguous_winner(
    counts: dict[str, int],
    legacy_totals: dict[str, int] | None = None,
) -> str | None:
    if not counts:
        return None
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    top_genre, top_count = ranked[0]
    if top_count <= 0:
        return None
    if len(ranked) > 1 and ranked[1][1] == top_count:
        tied = [genre for genre, count in ranked if count == top_count]
        if legacy_totals is not None:
            tied_with_totals = [
                (genre, legacy_totals.get(genre, 0)) for genre in tied
            ]
            tied_with_totals.sort(key=lambda item: (-item[1], item[0]))
            if tied_with_totals[0][1] > tied_with_totals[1][1]:
                return tied_with_totals[0][0]
        return None
    return top_genre


def aggregate_artist_history(
    per_artist: list[ArtistGenreCounts],
    legacy_totals: dict[str, int] | None = None,
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

    winner = _pick_unambiguous_winner(aggregate, legacy_totals)
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
    legacy_totals_fn = getattr(repository, "legacy_genre_totals", None)
    legacy_totals = legacy_totals_fn() if callable(legacy_totals_fn) else None
    selected, evidence = aggregate_artist_history(per_artist, legacy_totals)
    outcome = "resolved" if selected else "unresolved"
    confidence = (
        "high"
        if selected
        else "ambiguous"
        if evidence.get("aggregate_counts")
        else "no_match"
    )
    provenance_evidence = {**evidence, "selected_genre": selected}
    if legacy_totals is not None and selected is not None:
        # Record only the genres the tie-break weighed. The whole legacy map
        # holds about 40 values and would serialize once for every track.
        provenance_evidence["legacy_totals"] = {
            genre: legacy_totals[genre]
            for genre in evidence.get("aggregate_counts", {})
            if genre in legacy_totals
        }
    return selected, ResolutionProvenance(
        field="genre",
        method="artist_history",
        outcome=outcome,
        source="track_repository",
        confidence=confidence,
        evidence=provenance_evidence,
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
    underground: bool = False,
    scraped_candidates: Optional[Iterable[tuple[str, Optional[str], float]]] = None,
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

    if artists and enable_artist_history and repository is not None:
        genre, event = resolve_artist_history_genre(
            artists,
            repository,
            exclude_track_id=exclude_track_id,
            exclude_file_name=exclude_file_name,
        )
        events.append(event)
        if genre:
            return genre, events

    if artists and enable_beatport and browser is not None:
        genre, event = resolve_beatport_artist_genre(artists, browser)
        events.append(event)
        if genre:
            return genre, events

    if scraped_candidates is not None:
        genre = resolve_single_genre(scraped_candidates)
        if genre:
            events.append(
                ResolutionProvenance(
                    field="genre",
                    method="scraped_candidates",
                    outcome="resolved",
                    source="hydrator",
                    confidence="medium",
                    evidence={"selected_genre": genre},
                    inputs={"artist": artist, "title": title},
                )
            )
            return genre, events

    if underground:
        events.append(
            ResolutionProvenance(
                field="genre",
                method="underground_default",
                outcome="resolved",
                source="underground_predicate",
                confidence="medium",
                evidence={"selected_genre": "Ravevival"},
                inputs={"artist": artist, "title": title},
            )
        )
        return "Ravevival", events

    return None, events
