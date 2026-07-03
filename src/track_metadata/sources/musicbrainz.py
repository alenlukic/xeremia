from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from typing import Any

from src.track_metadata.matching import _similarity
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.base import LookupContext
from src.track_metadata.sources.constants import (
    MUSICBRAINZ_ARTIST_WEIGHT,
    MUSICBRAINZ_BASE_URL,
    MUSICBRAINZ_MATCH_THRESHOLD,
    MUSICBRAINZ_MIN_INTERVAL_SECONDS,
    MUSICBRAINZ_MISSING_ARTIST_SCORE,
    MUSICBRAINZ_MISSING_RELEASE_SCORE,
    MUSICBRAINZ_RELEASE_WEIGHT,
    MUSICBRAINZ_SEARCH_LIMIT,
    MUSICBRAINZ_TITLE_WEIGHT,
)
from src.track_metadata.sources.discogs import _first_non_empty
from src.track_metadata.sources.queries import build_search_terms, musicbrainz_query
from src.utils.http import RateLimitedHttpClient


def _format_artist_credit(artist_credit: Any) -> str | None:
    if not isinstance(artist_credit, list):
        return None

    parts: list[str] = []
    for item in artist_credit:
        if isinstance(item, str):
            parts.append(item)
            continue

        if not isinstance(item, dict):
            continue

        name = item.get("name")
        if isinstance(name, str) and name.strip():
            parts.append(name.strip())

        joinphrase = item.get("joinphrase")
        if isinstance(joinphrase, str) and joinphrase:
            parts.append(joinphrase)

    text = "".join(parts).strip()
    return text or None


def _first_release_id(payload: Mapping[str, Any]) -> str | None:
    releases = payload.get("releases")
    if not isinstance(releases, list) or not releases:
        return None

    first = releases[0]
    if not isinstance(first, dict):
        return None

    release_id = first.get("id")
    if isinstance(release_id, str) and release_id:
        return release_id

    return None


def _extract_year_from_date(value: Any) -> int | None:
    if not value:
        return None

    text = str(value)
    match = re.search(r"(19|20)\d{2}", text)
    if not match:
        return None

    try:
        return int(match.group())
    except ValueError:
        return None


def _first_genre_name(value: Any) -> str | None:
    if not isinstance(value, list):
        return None

    for item in value:
        if isinstance(item, dict):
            name = item.get("name")
            if isinstance(name, str) and name.strip():
                return name.strip()
    return None


def _musicbrainz_payload_to_metadata(
    recording_payload: Mapping[str, Any],
    release_payload: Mapping[str, Any] | None,
) -> SimpleMetadata:
    recording_title = recording_payload.get("title")
    recording_artist = _format_artist_credit(recording_payload.get("artist-credit"))

    release_title = None
    release_year = None
    release_genre = None
    release_label = None

    if release_payload is not None:
        release_title = _first_non_empty(release_payload.get("title"))
        release_year = _extract_year_from_date(release_payload.get("date"))
        release_genre = _first_genre_name(release_payload.get("genres"))
        label_info = release_payload.get("label-info")
        if isinstance(label_info, list) and label_info:
            first_label_info = label_info[0]
            if isinstance(first_label_info, dict):
                label = first_label_info.get("label")
                if isinstance(label, dict):
                    label_name = label.get("name")
                    if isinstance(label_name, str) and label_name.strip():
                        release_label = label_name.strip()

    recording_year = _extract_year_from_date(
        recording_payload.get("first-release-date")
    )
    recording_genre = _first_genre_name(recording_payload.get("genres"))

    return SimpleMetadata(
        title=(
            recording_title.strip()
            if isinstance(recording_title, str) and recording_title.strip()
            else None
        ),
        artist=recording_artist,
        album=release_title,
        label=release_label,
        genre=release_genre or recording_genre,
        year=release_year or recording_year,
    )


def _musicbrainz_get(
    http: RateLimitedHttpClient, path: str, *, params: Mapping[str, Any]
) -> dict[str, Any]:
    return http.get_json(
        f"{MUSICBRAINZ_BASE_URL}{path}",
        params=params,
        rate_key="musicbrainz",
        min_interval=MUSICBRAINZ_MIN_INTERVAL_SECONDS,
    )


def fetch_recording_metadata(
    http: RateLimitedHttpClient, recording_id: str
) -> SimpleMetadata | None:
    """Fetch a recording (and its primary release) and fold it into metadata."""
    try:
        payload = _musicbrainz_get(
            http,
            f"/recording/{recording_id}",
            params={"fmt": "json", "inc": "artists+releases+genres"},
        )
    except Exception as exc:
        logging.warning(
            "MusicBrainz recording lookup failed for %s: %s", recording_id, exc
        )
        return None

    release_id = _first_release_id(payload)
    release_payload: dict[str, Any] | None = None
    if release_id:
        try:
            release_payload = _musicbrainz_get(
                http,
                f"/release/{release_id}",
                params={"fmt": "json", "inc": "labels+genres"},
            )
        except Exception as exc:
            logging.warning(
                "MusicBrainz release lookup failed for %s: %s", release_id, exc
            )

    metadata = _musicbrainz_payload_to_metadata(payload, release_payload)
    if release_id:
        metadata.source_catalog_id = release_id
        metadata.source_provider = "musicbrainz"
    return metadata


def _first_release_title(recording: Mapping[str, Any]) -> str | None:
    releases = recording.get("releases")
    if isinstance(releases, list) and releases:
        first = releases[0]
        if isinstance(first, dict):
            title = first.get("title")
            if isinstance(title, str) and title.strip():
                return title
    return None


def select_best_recording(
    recordings: list[dict[str, Any]], seed: SimpleMetadata
) -> dict[str, Any] | None:
    """Rank recordings against the seed and return the best above threshold."""
    scored: list[tuple[float, dict[str, Any]]] = []
    for recording in recordings:
        title_score = _similarity(seed.title, recording.get("title"))
        artist = _format_artist_credit(recording.get("artist-credit"))
        artist_score = (
            _similarity(seed.artist, artist)
            if seed.artist
            else MUSICBRAINZ_MISSING_ARTIST_SCORE
        )
        release_score = (
            _similarity(seed.album, _first_release_title(recording))
            if seed.album
            else MUSICBRAINZ_MISSING_RELEASE_SCORE
        )
        total = (
            title_score * MUSICBRAINZ_TITLE_WEIGHT
            + artist_score * MUSICBRAINZ_ARTIST_WEIGHT
            + release_score * MUSICBRAINZ_RELEASE_WEIGHT
        )
        scored.append((total, recording))

    scored.sort(key=lambda item: item[0], reverse=True)
    if not scored or scored[0][0] < MUSICBRAINZ_MATCH_THRESHOLD:
        return None
    return scored[0][1]


class MusicBrainzSource:
    """Recording search against MusicBrainz with release enrichment."""

    name = "musicbrainz"
    merge_fields: frozenset[str] | None = None

    def lookup(
        self, seed: SimpleMetadata, context: LookupContext
    ) -> SimpleMetadata | None:
        query = musicbrainz_query(build_search_terms(seed))
        if query is None:
            return None

        try:
            payload = _musicbrainz_get(
                context.http,
                "/recording",
                params={
                    "query": query,
                    "fmt": "json",
                    "limit": MUSICBRAINZ_SEARCH_LIMIT,
                    "dismax": "true",
                },
            )
        except Exception as exc:
            logging.warning(
                "MusicBrainz search failed for %s: %s", context.file_path.name, exc
            )
            return None

        recordings = payload.get("recordings")
        if not isinstance(recordings, list) or not recordings:
            return None

        best = select_best_recording(recordings, seed)
        if best is None:
            return None

        recording_id = best.get("id")
        if not isinstance(recording_id, str) or not recording_id:
            return None

        metadata = fetch_recording_metadata(context.http, recording_id)
        if metadata is None:
            return None

        logging.info(
            "MusicBrainz matched %s -> %s / %s",
            context.file_path.name,
            metadata.artist or seed.artist,
            metadata.title or seed.title,
        )
        return metadata
