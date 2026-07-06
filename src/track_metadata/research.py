from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from src.track_metadata.matching import _normalize_for_match, _similarity


@dataclass
class ResolutionProvenance:
    """Structured provenance for a single field-resolution heuristic attempt."""

    field: str
    method: str
    outcome: str
    source: str | None = None
    confidence: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    inputs: dict[str, Any] = field(default_factory=dict)

    def to_event(self) -> dict[str, Any]:
        return {
            "type": "field_resolution",
            "field": self.field,
            "method": self.method,
            "outcome": self.outcome,
            "resolution_source": self.source,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "timestamp": self.timestamp,
            "inputs": self.inputs,
        }


@dataclass
class ArtistGenreCounts:
    artist: str
    matched_track_count: int
    genre_counts: dict[str, int]


@dataclass
class BeatportArtistGenreObservation:
    artist: str
    page_url: str
    genre_counts: dict[str, int]
    identity_confirmed: bool


@dataclass
class BeatportTrackLabelObservation:
    artist: str
    title: str
    page_url: str
    label: str | None
    identity_confirmed: bool


@dataclass
class CatalogNumberObservation:
    catalog_number: str
    source_url: str
    identity_confirmed: bool
    snippet: str = ""


@dataclass
class LabelSearchObservation:
    label: str | None
    source_url: str
    identity_confirmed: bool
    is_distributor: bool = False
    snippet: str = ""


@dataclass
class CdrEvidence:
    track_identity_confirmed: bool
    free_download: bool = False
    artist_controlled_source: str | None = None
    catalog_number_found: bool = False
    label_found: bool = False
    indicators: list[str] = field(default_factory=list)


class TrackRepository(Protocol):
    def query_genres_for_artist(
        self,
        artist: str,
        *,
        exclude_track_id: int | None = None,
        exclude_file_name: str | None = None,
    ) -> ArtistGenreCounts:
        ...


class WebSearchClient(Protocol):
    def search_label_by_title(
        self, artist: str | None, title: str | None
    ) -> list[LabelSearchObservation]:
        ...

    def search_label_by_album(
        self, artist: str | None, album: str | None
    ) -> list[LabelSearchObservation]:
        ...

    def detect_free_download(self, artist: str | None, title: str | None) -> bool:
        ...


class BrowserResearchClient(Protocol):
    def inspect_beatport_artist_genres(
        self, artist: str
    ) -> BeatportArtistGenreObservation | None:
        ...

    def inspect_beatport_track_label(
        self, artist: str, title: str
    ) -> BeatportTrackLabelObservation | None:
        ...


_ARTIST_MATCH_THRESHOLD = 0.82


class SqlAlchemyTrackRepository:
    """DB-backed genre history queries using soft artist matching."""

    def __init__(self, session: Any) -> None:
        self._session = session

    def query_genres_for_artist(
        self,
        artist: str,
        *,
        exclude_track_id: int | None = None,
        exclude_file_name: str | None = None,
    ) -> ArtistGenreCounts:
        from src.models.artist import Artist
        from src.models.artist_track import ArtistTrack
        from src.models.track import Track

        genre_counts: dict[str, int] = {}
        matched = 0
        seen_identities: set[str] = set()

        matching_artist_ids: list[int] = []
        for row in self._session.query(Artist).all():
            name = getattr(row, "name", None)
            if not isinstance(name, str) or not name.strip():
                continue
            if _similarity(artist, name) >= _ARTIST_MATCH_THRESHOLD:
                matching_artist_ids.append(int(row.id))

        if not matching_artist_ids:
            return ArtistGenreCounts(
                artist=artist, matched_track_count=0, genre_counts={}
            )

        links = (
            self._session.query(ArtistTrack)
            .filter(ArtistTrack.artist_id.in_(matching_artist_ids))
            .all()
        )
        track_ids = {int(link.track_id) for link in links if getattr(link, "track_id", None)}
        for track_id in track_ids:
            track = self._session.query(Track).filter_by(id=track_id).first()
            if track is None:
                continue
            if exclude_track_id is not None and track.id == exclude_track_id:
                continue
            if exclude_file_name and track.file_name == exclude_file_name:
                continue

            identity = _track_identity_key(track)
            if identity and identity in seen_identities:
                continue
            if identity:
                seen_identities.add(identity)

            genre = getattr(track, "genre", None)
            if not genre or not str(genre).strip():
                continue
            matched += 1
            normalized = str(genre).strip()
            genre_counts[normalized] = genre_counts.get(normalized, 0) + 1

        return ArtistGenreCounts(
            artist=artist,
            matched_track_count=matched,
            genre_counts=genre_counts,
        )


def _track_identity_key(row: Any) -> str | None:
    file_name = getattr(row, "file_name", None)
    title = getattr(row, "title", None)
    if file_name and title:
        return f"{file_name}|{_normalize_for_match(title)}"
    return None
