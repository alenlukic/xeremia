from __future__ import annotations

from src.track_metadata.sources.base import LookupContext, MetadataSource
from src.track_metadata.sources.cache import CACHE_PATH, MetadataCache
from src.track_metadata.sources.constants import (
    DEFAULT_USER_AGENT,
    DISCOGS_BASE_URL,
    DISCOGS_MIN_INTERVAL_SECONDS,
    HTTP_TIMEOUT_SECONDS,
    MUSICBRAINZ_BASE_URL,
    MUSICBRAINZ_MIN_INTERVAL_SECONDS,
)
from src.track_metadata.sources.hydrator import MetadataHydrator, build_metadata_agent

__all__ = [
    "CACHE_PATH",
    "DEFAULT_USER_AGENT",
    "DISCOGS_BASE_URL",
    "DISCOGS_MIN_INTERVAL_SECONDS",
    "HTTP_TIMEOUT_SECONDS",
    "LookupContext",
    "MUSICBRAINZ_BASE_URL",
    "MUSICBRAINZ_MIN_INTERVAL_SECONDS",
    "MetadataCache",
    "MetadataHydrator",
    "MetadataSource",
    "build_metadata_agent",
]
