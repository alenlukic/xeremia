from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

from src.track_metadata.models import SimpleMetadata
from src.utils.http import RateLimitedHttpClient


@dataclass
class LookupContext:
    """Ambient state a source needs beyond the track seed itself."""

    file_path: Path
    http: RateLimitedHttpClient


@runtime_checkable
class MetadataSource(Protocol):
    """A single external provider of track metadata.

    Each source owns exactly one lookup responsibility. ``merge_fields``
    restricts which fields the orchestrator accepts from this source (``None``
    means every field is eligible); this lets, for example, Discogs contribute
    only release-level fields without leaking a low-confidence title/artist.
    """

    name: str
    merge_fields: frozenset[str] | None

    def lookup(
        self, seed: SimpleMetadata, context: LookupContext
    ) -> SimpleMetadata | None: ...
