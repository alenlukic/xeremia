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
    ) -> ArtistGenreCounts: ...

    def artist_in_legacy_library(self, artist: str) -> bool: ...

    def legacy_genre_totals(self) -> dict[str, int]: ...


class WebSearchClient(Protocol):
    def search_label_by_title(
        self, artist: str | None, title: str | None
    ) -> list[LabelSearchObservation]: ...

    def search_label_by_album(
        self, artist: str | None, album: str | None
    ) -> list[LabelSearchObservation]: ...

    def detect_free_download(self, artist: str | None, title: str | None) -> bool: ...


class BrowserResearchClient(Protocol):
    def inspect_beatport_artist_genres(
        self, artist: str
    ) -> BeatportArtistGenreObservation | None: ...

    def inspect_beatport_track_label(
        self, artist: str, title: str
    ) -> BeatportTrackLabelObservation | None: ...


_ARTIST_MATCH_THRESHOLD = 0.82
_LEGACY_INDEX_CONTEXT = "legacy_artist_genre_index"


@dataclass(frozen=True)
class _LegacyTrackRow:
    artist_name: str
    track_id: int
    file_name: str
    title: str
    genre: str


class LegacyArtistGenreIndex:
    """Run-scoped legacy library index built from one grouped query."""

    def __init__(
        self,
        rows: list[_LegacyTrackRow],
        genre_normalization: dict[str, str | None],
    ) -> None:
        self._rows = rows
        self._genre_normalization = genre_normalization
        self._legacy_totals: dict[str, int] | None = None
        self._artist_names = list(dict.fromkeys(row.artist_name for row in rows))
        self._matched_names: dict[str, frozenset[str]] = {}

    @classmethod
    def build(cls, session: Any) -> LegacyArtistGenreIndex:
        from src.data_management.genre_vocabulary import resolve_canonical_genre
        from src.models.artist import Artist
        from src.models.artist_track import ArtistTrack
        from src.models.track import Track
        from src.track_metadata.underground import LEGACY_TRACK_ID_CEILING

        query = (
            session.query(
                Artist.name,
                Track.id,
                Track.file_name,
                Track.title,
                Track.genre,
            )
            .join(ArtistTrack, ArtistTrack.artist_id == Artist.id)
            .join(Track, Track.id == ArtistTrack.track_id)
            .filter(Track.id < LEGACY_TRACK_ID_CEILING)
            .group_by(
                Artist.name,
                Track.id,
                Track.file_name,
                Track.title,
                Track.genre,
            )
        )

        rows: list[_LegacyTrackRow] = []
        genre_normalization: dict[str, str | None] = {}
        for artist_name, track_id, file_name, title, genre in query.all():
            if not isinstance(artist_name, str) or not artist_name.strip():
                continue
            # A legacy row with an empty genre still proves that the artist is
            # in the legacy library, so the row stays and only the genre
            # aggregates ignore it.
            raw_genre = "" if genre is None else str(genre).strip()
            rows.append(
                _LegacyTrackRow(
                    artist_name=artist_name,
                    track_id=int(track_id),
                    file_name=str(file_name or ""),
                    title=str(title or ""),
                    genre=raw_genre,
                )
            )
            if raw_genre and raw_genre not in genre_normalization:
                genre_normalization[raw_genre] = resolve_canonical_genre(
                    raw_genre, context=_LEGACY_INDEX_CONTEXT
                )

        return cls(rows, genre_normalization)

    def legacy_genre_totals(self) -> dict[str, int]:
        if self._legacy_totals is not None:
            return self._legacy_totals

        totals: dict[str, int] = {}
        seen_by_genre: dict[str, set[int]] = {}
        for row in self._rows:
            normalized = self._genre_normalization.get(row.genre)
            if normalized is None:
                continue
            seen = seen_by_genre.setdefault(normalized, set())
            if row.track_id in seen:
                continue
            seen.add(row.track_id)
            totals[normalized] = totals.get(normalized, 0) + 1

        self._legacy_totals = totals
        return totals

    def _names_matching(self, artist: str) -> frozenset[str]:
        """Score every distinct legacy artist name once for one queried artist.

        The index holds one row per artist and legacy track pair, so a shared
        name repeats across many rows. Scoring by name rather than by row keeps
        the fuzzy pass proportional to the distinct names.
        """
        cached = self._matched_names.get(artist)
        if cached is None:
            cached = frozenset(
                name
                for name in self._artist_names
                if _similarity(artist, name) >= _ARTIST_MATCH_THRESHOLD
            )
            self._matched_names[artist] = cached
        return cached

    def genre_counts_for(
        self,
        artist: str,
        *,
        exclude_track_id: int | None = None,
        exclude_file_name: str | None = None,
    ) -> ArtistGenreCounts:
        genre_counts: dict[str, int] = {}
        matched = 0
        seen_identities: set[str] = set()
        matched_names = self._names_matching(artist)

        for row in self._rows:
            if row.artist_name not in matched_names:
                continue
            if exclude_track_id is not None and row.track_id == exclude_track_id:
                continue
            if exclude_file_name and row.file_name == exclude_file_name:
                continue

            identity = _track_identity_key_from_parts(row.file_name, row.title)
            if identity and identity in seen_identities:
                continue
            if identity:
                seen_identities.add(identity)

            normalized = self._genre_normalization.get(row.genre)
            if normalized is None:
                continue
            matched += 1
            genre_counts[normalized] = genre_counts.get(normalized, 0) + 1

        return ArtistGenreCounts(
            artist=artist,
            matched_track_count=matched,
            genre_counts=genre_counts,
        )

    def artist_in_legacy_library(self, artist: str) -> bool:
        if not artist or not artist.strip():
            return False
        return bool(self._names_matching(artist))


class SqlAlchemyTrackRepository:
    """DB-backed genre history queries using soft artist matching."""

    def __init__(self, session: Any) -> None:
        self._session = session
        self._index: LegacyArtistGenreIndex | None = None

    def _get_index(self) -> LegacyArtistGenreIndex:
        if self._index is None:
            self._index = LegacyArtistGenreIndex.build(self._session)
        return self._index

    def query_genres_for_artist(
        self,
        artist: str,
        *,
        exclude_track_id: int | None = None,
        exclude_file_name: str | None = None,
    ) -> ArtistGenreCounts:
        return self._get_index().genre_counts_for(
            artist,
            exclude_track_id=exclude_track_id,
            exclude_file_name=exclude_file_name,
        )

    def artist_in_legacy_library(self, artist: str) -> bool:
        return self._get_index().artist_in_legacy_library(artist)

    def legacy_genre_totals(self) -> dict[str, int]:
        return self._get_index().legacy_genre_totals()


def _track_identity_key(row: Any) -> str | None:
    file_name = getattr(row, "file_name", None)
    title = getattr(row, "title", None)
    return _track_identity_key_from_parts(file_name, title)


def _track_identity_key_from_parts(
    file_name: str | None, title: str | None
) -> str | None:
    if file_name and title:
        return f"{file_name}|{_normalize_for_match(title)}"
    return None
