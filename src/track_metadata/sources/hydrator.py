from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

from src.track_metadata.genre import (
    collect_genre_candidates_from_sources,
    resolve_dynamic_genre,
)
from src.track_metadata.label import WebLabelVerifier, apply_label_resolution
from src.track_metadata.matching import (
    _best_year,
    _extract_remixer,
    _merge_missing,
    _parse_filename_seed,
)
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.acoustid_source import AcoustIdSource
from src.track_metadata.sources.base import LookupContext, MetadataSource
from src.track_metadata.sources.cache import MetadataCache
from src.track_metadata.sources.constants import (
    BEATPORT_TAG_CONFIDENCE,
    DEFAULT_USER_AGENT,
    HTTP_TIMEOUT_SECONDS,
)
from src.track_metadata.sources.discogs import DiscogsSource
from src.track_metadata.sources.genre_lookups import (
    is_beatport_encoded,
    lookup_beatport_genre,
    lookup_lastfm_genre,
    read_beatport_genre_from_tags,
)
from src.track_metadata.sources.musicbrainz import MusicBrainzSource
from src.track_metadata.sources.web_search import WebSearchSource
from src.utils.http import RateLimitedHttpClient

CandidateResolver = Callable[
    [Path, SimpleMetadata, "list[dict[str, Any]]", "list[str]"],
    Optional[SimpleMetadata],
]

# Fields the orchestrator considers "resolvable" from external sources.
_RESOLVABLE_FIELDS = frozenset(
    {"title", "artist", "album", "label", "genre", "remixer", "year"}
)


class MetadataHydrator:
    """Orchestrates ordered metadata sources and merges their contributions.

    The hydrator owns no provider-specific logic itself: it delegates each
    lookup to a :class:`MetadataSource` and is responsible only for ordering,
    merging, caching, and the post-merge resolution of year, genre, and label.
    """

    def __init__(
        self,
        *,
        candidate_resolver: CandidateResolver | None = None,
        skip_beatport_hydration: bool = True,
        web_label_verifier: WebLabelVerifier | None = None,
        beatport_genre_lookup: Callable[[str | None, str | None], str | None]
        | None = None,
        lastfm_genre_lookup: Callable[[str | None, str | None], str | None]
        | None = None,
        http: RateLimitedHttpClient | None = None,
        cache: MetadataCache | None = None,
        catalog_sources: list[MetadataSource] | None = None,
        web_source: MetadataSource | None = None,
    ) -> None:
        self.http = http or RateLimitedHttpClient(
            user_agent=DEFAULT_USER_AGENT, default_timeout=HTTP_TIMEOUT_SECONDS
        )
        self.cache = cache or MetadataCache()
        self.candidate_resolver = candidate_resolver
        self.skip_beatport_hydration = skip_beatport_hydration
        self.web_label_verifier = web_label_verifier
        self.beatport_genre_lookup = beatport_genre_lookup or (
            lambda artist, title: lookup_beatport_genre(self.http, artist, title)
        )
        self.lastfm_genre_lookup = lastfm_genre_lookup or (
            lambda artist, title: lookup_lastfm_genre(self.http, artist, title)
        )
        self._catalog_sources = catalog_sources or [
            AcoustIdSource(),
            MusicBrainzSource(),
            DiscogsSource(),
        ]
        self._web_source = web_source or WebSearchSource()

    def hydrate(
        self,
        file_path: Path,
        existing: SimpleMetadata,
        *,
        agent_events: list[dict[str, Any]] | None = None,
    ) -> SimpleMetadata:
        cache_key = self.cache.file_key(file_path)
        cached = self.cache.get_final(cache_key)
        if cached is not None:
            logging.info("Using cached metadata for %s", file_path.name)
            return cached

        seed = _merge_missing(existing, _parse_filename_seed(file_path))
        if self.skip_beatport_hydration and is_beatport_encoded(file_path):
            logging.info(
                "Skipping remote hydration for Beatport-encoded file %s", file_path.name
            )
            self.cache.store_final(cache_key, seed)
            return seed

        context = LookupContext(file_path=file_path, http=self.http)
        candidates: dict[str, SimpleMetadata] = {}
        sources: list[dict[str, Any]] = []
        resolved = replace(seed)

        for source in self._catalog_sources:
            candidate = source.lookup(seed, context)
            if candidate is None:
                continue
            candidates[source.name] = candidate
            sources.append({"source": source.name, "metadata": candidate.to_dict()})
            resolved = _merge_missing(resolved, candidate, fields=source.merge_fields)

        if self._needs_web_fallback(resolved):
            web_candidate = self._web_source.lookup(resolved, context)
            if web_candidate is not None:
                sources.append(
                    {
                        "source": self._web_source.name,
                        "metadata": web_candidate.to_dict(),
                    }
                )
                resolved = _merge_missing(resolved, web_candidate)

        llm_candidate = self._resolve_from_candidates(
            file_path, resolved, sources, agent_events=agent_events
        )
        if llm_candidate is not None:
            resolved = _merge_missing(resolved, llm_candidate)

        if resolved.remixer is None:
            resolved.remixer = _extract_remixer(resolved.title)
        if resolved.year is None:
            resolved.year = _best_year(
                existing.year, *(candidate.year for candidate in candidates.values())
            )

        self._apply_source_catalog_ids(resolved, candidates)
        resolved.genre = (
            self._resolve_genre(resolved, sources, file_path) or resolved.genre
        )
        apply_label_resolution(resolved, web_verifier=self.web_label_verifier)

        self.cache.store_final(cache_key, resolved)
        return resolved

    def _needs_web_fallback(self, resolved: SimpleMetadata) -> bool:
        return any(getattr(resolved, field) is None for field in _RESOLVABLE_FIELDS)

    @staticmethod
    def _apply_source_catalog_ids(
        resolved: SimpleMetadata, candidates: dict[str, SimpleMetadata]
    ) -> None:
        for name in ("musicbrainz", "discogs"):
            candidate = candidates.get(name)
            if candidate is None:
                continue
            if resolved.source_catalog_id is None and candidate.source_catalog_id:
                resolved.source_catalog_id = candidate.source_catalog_id
                resolved.source_provider = candidate.source_provider

    def _resolve_from_candidates(
        self,
        file_path: Path,
        current: SimpleMetadata,
        sources: list[dict[str, Any]],
        *,
        agent_events: list[dict[str, Any]] | None = None,
    ) -> SimpleMetadata | None:
        if self.candidate_resolver is None or not sources:
            return None

        missing_fields = [
            field
            for field, value in current.to_dict().items()
            if value is None and field in _RESOLVABLE_FIELDS
        ]
        if not missing_fields:
            return None

        event: dict[str, Any] = {
            "type": "metadata_fallback",
            "timestamp": datetime.now().isoformat(),
            "file": file_path.name,
            "missing_fields": missing_fields,
            "source_count": len(sources),
        }
        try:
            resolved = self.candidate_resolver(
                file_path, current, sources, missing_fields
            )
        except Exception as exc:
            logging.warning(
                "Metadata fallback resolver failed for %s: %s", file_path.name, exc
            )
            event["outcome"] = "error"
            event["error"] = str(exc)
            if agent_events is not None:
                agent_events.append(event)
            return None

        event["outcome"] = "no_match" if resolved is None else "resolved"
        if resolved is not None:
            event["resolved_metadata"] = resolved.to_dict()
        if agent_events is not None:
            agent_events.append(event)
        return resolved

    def _resolve_genre(
        self,
        resolved: SimpleMetadata,
        sources: list[dict[str, Any]],
        file_path: Path,
    ) -> str | None:
        source_candidates = collect_genre_candidates_from_sources(sources)
        if is_beatport_encoded(file_path):
            beatport_genre = read_beatport_genre_from_tags(file_path)
            if beatport_genre:
                source_candidates.insert(
                    0, ("beatport", beatport_genre, BEATPORT_TAG_CONFIDENCE)
                )
        return resolve_dynamic_genre(
            artist=resolved.artist,
            title=resolved.title,
            source_candidates=source_candidates,
            beatport_lookup=self.beatport_genre_lookup,
            lastfm_lookup=self.lastfm_genre_lookup,
        )


def build_metadata_agent(
    *,
    candidate_resolver: CandidateResolver | None = None,
    skip_beatport_hydration: bool = True,
    web_label_verifier: WebLabelVerifier | None = None,
) -> MetadataHydrator:
    return MetadataHydrator(
        candidate_resolver=candidate_resolver,
        skip_beatport_hydration=skip_beatport_hydration,
        web_label_verifier=web_label_verifier,
    )
