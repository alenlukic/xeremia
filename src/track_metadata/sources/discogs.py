from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

from src.track_metadata.matching import _similarity
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.base import LookupContext
from src.track_metadata.sources.constants import (
    DEFAULT_USER_AGENT,
    DISCOGS_ARTIST_WEIGHT,
    DISCOGS_BASE_URL,
    DISCOGS_MATCH_THRESHOLD,
    DISCOGS_MIN_INTERVAL_SECONDS,
    DISCOGS_MISSING_ARTIST_SCORE,
    DISCOGS_PER_PAGE,
    DISCOGS_TITLE_WEIGHT,
)
from src.track_metadata.sources.queries import build_search_terms, discogs_query_params


def _coerce_year(value: Any) -> int | None:
    if value is None:
        return None

    try:
        return int(str(value)[:4])
    except (TypeError, ValueError):
        return None


def _first_non_empty(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _first_list_item(value: Any) -> str | None:
    if not isinstance(value, list):
        return None

    for item in value:
        if isinstance(item, str) and item.strip():
            return item.strip()
    return None


def _split_discogs_title(value: Any) -> tuple[str | None, str | None]:
    if not isinstance(value, str) or not value.strip():
        return None, None

    if " - " not in value:
        return None, value.strip()

    artist, title = value.split(" - ", 1)
    return artist.strip() or None, title.strip() or None


@dataclass(frozen=True)
class _DiscogsCredentials:
    token: str | None
    key: str | None
    secret: str | None


def _read_credentials() -> _DiscogsCredentials | None:
    token = os.getenv("DISCOGS_TOKEN")
    key = os.getenv("DISCOGS_KEY")
    secret = os.getenv("DISCOGS_SECRET")
    if token or (key and secret):
        return _DiscogsCredentials(token=token, key=key, secret=secret)
    return None


def _apply_credentials(
    credentials: _DiscogsCredentials,
    params: dict[str, Any],
    headers: dict[str, str],
) -> None:
    if credentials.token:
        headers["Authorization"] = f"Discogs token={credentials.token}"
    elif credentials.key and credentials.secret:
        params["key"] = credentials.key
        params["secret"] = credentials.secret


def select_best_result(
    results: list[dict[str, Any]], seed: SimpleMetadata
) -> tuple[dict[str, Any] | None, float]:
    """Rank Discogs release results against the seed; return best and score."""
    best: dict[str, Any] | None = None
    best_score = 0.0
    for result in results:
        title = result.get("title")
        artist_guess, release_guess = _split_discogs_title(title)
        title_score = _similarity(seed.title, release_guess or title)
        artist_score = (
            _similarity(seed.artist, artist_guess)
            if seed.artist
            else DISCOGS_MISSING_ARTIST_SCORE
        )
        total = title_score * DISCOGS_TITLE_WEIGHT + artist_score * DISCOGS_ARTIST_WEIGHT
        if total > best_score:
            best_score = total
            best = result
    return best, best_score


def _result_to_metadata(result: dict[str, Any], seed: SimpleMetadata) -> SimpleMetadata:
    metadata = SimpleMetadata(
        album=_first_non_empty(result.get("title"), seed.album),
        year=_coerce_year(result.get("year")),
        genre=_first_list_item(result.get("genre")),
        label=_first_list_item(result.get("label")),
    )

    release_id = result.get("id")
    if isinstance(release_id, int):
        release_id = str(release_id)
    if isinstance(release_id, str) and release_id:
        metadata.source_catalog_id = release_id
        metadata.source_provider = "discogs"

    if metadata.album and " - " in metadata.album:
        _, release_title = _split_discogs_title(metadata.album)
        metadata.album = release_title or metadata.album
    return metadata


class DiscogsSource:
    """Release search against Discogs, contributing release-level fields only."""

    name = "discogs"
    merge_fields: frozenset[str] | None = frozenset({"album", "label", "genre", "year"})

    def lookup(
        self, seed: SimpleMetadata, context: LookupContext
    ) -> SimpleMetadata | None:
        credentials = _read_credentials()
        seed_params = discogs_query_params(build_search_terms(seed))
        if credentials is None or seed_params is None:
            return None

        params: dict[str, Any] = {
            "type": "release",
            "per_page": DISCOGS_PER_PAGE,
            **seed_params,
        }
        headers = {"User-Agent": DEFAULT_USER_AGENT}
        _apply_credentials(credentials, params, headers)

        try:
            data = context.http.get_json(
                f"{DISCOGS_BASE_URL}/database/search",
                params=params,
                headers=headers,
                rate_key="discogs",
                min_interval=DISCOGS_MIN_INTERVAL_SECONDS,
            )
        except Exception as exc:
            logging.warning(
                "Discogs lookup failed for %s - %s: %s", seed.artist, seed.title, exc
            )
            return None

        results = data.get("results")
        if not isinstance(results, list) or not results:
            return None

        best, score = select_best_result(results, seed)
        if best is None or score < DISCOGS_MATCH_THRESHOLD:
            return None

        metadata = _result_to_metadata(best, seed)
        logging.info("Discogs matched %s / %s (score=%.3f)", seed.artist, seed.title, score)
        return metadata
