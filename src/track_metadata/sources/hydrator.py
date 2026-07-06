from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

from src.track_metadata.genre import (
    collect_genre_candidates_from_sources,
    is_unknown_genre,
    resolve_dynamic_genre,
    resolve_genre_fallback,
    resolve_ravevival,
    RAVEVIVAL_MIN_BPM,
)
from src.track_metadata.label import (
    WebLabelVerifier,
    apply_label_resolution,
    is_unresolved_label,
    resolve_label_fallback,
)
from src.track_metadata.matching import (
    _best_year,
    _extract_remixer,
    _merge_missing,
    _parse_filename_seed,
)
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.config import (
    RESOLUTION_CDR_MIN_SOUNDCLOUD_FOLLOWERS,
    RESOLUTION_GENRE_ARTIST_HISTORY,
    RESOLUTION_GENRE_BEATPORT,
    RESOLUTION_LABEL_BEATPORT,
    RESOLUTION_LABEL_CDR,
    RESOLUTION_LABEL_WEB_SEARCH,
)
from src.track_metadata.research import (
    ResolutionProvenance,
    SqlAlchemyTrackRepository,
    TrackRepository,
)
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
from src.track_metadata.sources.web_search import WebSearchResearchClient, WebSearchSource
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
        track_repository: TrackRepository | None = None,
        session_factory: Callable[[], Any] | None = None,
        web_research_client: WebSearchResearchClient | None = None,
        browser_research_client: Any | None = None,
        enable_genre_artist_history: bool = RESOLUTION_GENRE_ARTIST_HISTORY,
        enable_genre_beatport: bool = RESOLUTION_GENRE_BEATPORT,
        enable_label_web_search: bool = RESOLUTION_LABEL_WEB_SEARCH,
        enable_label_beatport: bool = RESOLUTION_LABEL_BEATPORT,
        enable_label_cdr: bool = RESOLUTION_LABEL_CDR,
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
        self._catalog_sources = (
            catalog_sources
            if catalog_sources is not None
            else [AcoustIdSource(), MusicBrainzSource(), DiscogsSource()]
        )
        self._web_source = web_source if web_source is not None else WebSearchSource()
        self.session_factory = session_factory
        self.track_repository = track_repository
        self.web_research_client = web_research_client
        self.browser_research_client = browser_research_client
        self.enable_genre_artist_history = enable_genre_artist_history
        self.enable_genre_beatport = enable_genre_beatport
        self.enable_label_web_search = enable_label_web_search
        self.enable_label_beatport = enable_label_beatport
        self.enable_label_cdr = enable_label_cdr

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
            seed = replace(seed, key=None, bpm=None)
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
        self._apply_field_resolution(
            resolved,
            file_path=file_path,
            agent_events=agent_events,
        )

        self.cache.store_final(cache_key, resolved)
        return resolved

    def _apply_field_resolution(
        self,
        resolved: SimpleMetadata,
        *,
        file_path: Path,
        agent_events: list[dict[str, Any]] | None,
    ) -> None:
        events: list[ResolutionProvenance] = []
        repository = self._resolve_track_repository()
        web_client = self._resolve_web_research_client()
        browser = self.browser_research_client

        if is_unknown_genre(resolved.genre):
            genre, genre_events = resolve_genre_fallback(
                artist=resolved.artist,
                title=resolved.title,
                repository=repository,
                browser=browser,
                enable_artist_history=self.enable_genre_artist_history,
                enable_beatport=self.enable_genre_beatport,
                exclude_file_name=file_path.name,
            )
            events.extend(genre_events)
            if genre:
                resolved.genre = genre

        if is_unresolved_label(resolved.label):
            label, label_events = resolve_label_fallback(
                artist=resolved.artist,
                title=resolved.title,
                album=resolved.album,
                web_client=web_client,
                browser=browser,
                enable_web_search=self.enable_label_web_search,
                enable_beatport=self.enable_label_beatport,
                enable_cdr=self.enable_label_cdr,
                cdr_min_soundcloud_followers=RESOLUTION_CDR_MIN_SOUNDCLOUD_FOLLOWERS,
            )
            events.extend(label_events)
            if label:
                resolved.label = label

        if agent_events is not None:
            for event in events:
                payload = event.to_event()
                payload["file"] = file_path.name
                agent_events.append(payload)

    def _resolve_track_repository(self) -> TrackRepository | None:
        if self.track_repository is not None:
            return self.track_repository
        if self.session_factory is None:
            return None
        try:
            session = self.session_factory()
            return SqlAlchemyTrackRepository(session)
        except Exception as exc:
            logging.warning("Failed to open track repository session: %s", exc)
            return None

    def _resolve_web_research_client(self) -> WebSearchResearchClient | None:
        if self.web_research_client is not None:
            return self.web_research_client
        if not self.enable_label_web_search:
            return None
        return WebSearchResearchClient(self.http)

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

    def classify_free_download_genre(self, metadata: SimpleMetadata) -> str | None:
        if metadata.bpm is None or metadata.bpm < RAVEVIVAL_MIN_BPM:
            return None
        web_client = self._resolve_web_research_client()
        if web_client is None or not metadata.artist or not metadata.title:
            return None
        free_download = web_client.detect_free_download(
            metadata.artist, metadata.title
        )
        return resolve_ravevival(free_download=free_download, bpm=metadata.bpm)


def build_metadata_agent(
    *,
    candidate_resolver: CandidateResolver | None = None,
    skip_beatport_hydration: bool = True,
    web_label_verifier: WebLabelVerifier | None = None,
    session_factory: Callable[[], Any] | None = None,
    browser_research_client: Any | None = None,
) -> MetadataHydrator:
    if browser_research_client is None:
        from src.track_metadata.pipeline.agent import build_browser_research_client

        browser_research_client = build_browser_research_client()
    return MetadataHydrator(
        candidate_resolver=candidate_resolver,
        skip_beatport_hydration=skip_beatport_hydration,
        web_label_verifier=web_label_verifier,
        session_factory=session_factory,
        browser_research_client=browser_research_client,
    )
