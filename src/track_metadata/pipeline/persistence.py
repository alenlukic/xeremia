from __future__ import annotations

import re
from pathlib import Path
from time import ctime
from typing import Any

from src.data_management.audio_file import AudioFile, read_duration_seconds
from src.data_management.config import CANONICAL_KEY_MAP
from src.track_metadata.label import resolve_label
from src.track_metadata.sources.genre_lookups import is_beatport_encoded
from src.track_metadata.genre import normalize_genre_value
from src.models.artist import Artist
from src.models.artist_track import ArtistTrack
from src.models.track import Track
from src.data_management.utils import transform_artist
from src.track_metadata.matching import _format_artist_display
from src.track_metadata.models import SimpleMetadata
from src.utils.file_operations import get_file_creation_time

_ARTIST_SPLIT = re.compile(r"\s*(?:,|&| and )\s*", re.IGNORECASE)


def _artist_tokens(value: str | None) -> list[str]:
    if not value:
        return []
    return [token.strip() for token in _ARTIST_SPLIT.split(value) if token.strip()]


def _canonical_key(value: str | None) -> str | None:
    if not value:
        return None
    canonical = CANONICAL_KEY_MAP.get(value.lower())
    return None if canonical is None else canonical.capitalize()


def _track_file_details(file_ref: str | Path) -> tuple[str, str | None]:
    if isinstance(file_ref, Path):
        return file_ref.name, ctime(get_file_creation_time(str(file_ref)))
    return str(file_ref), None


def _resolve_artist_names(metadata: SimpleMetadata) -> list[str]:
    names: list[str] = []
    for field in (metadata.artist, metadata.remixer):
        if not field:
            continue
        for token in _artist_tokens(field):
            canonical = transform_artist(token)
            display = _format_artist_display(canonical) or canonical
            if display and display not in names:
                names.append(display)
    return names


def _ensure_artist(session: Any, name: str) -> Artist:
    artist = session.query(Artist).filter_by(name=name).first()
    if artist is None:
        artist = Artist(name=name, track_count=0)
        session.add(artist)
        session.commit()
        artist = session.query(Artist).filter_by(name=name).first()
    return artist


def upsert_track_records(
    session: Any, file_ref: str | Path, metadata: SimpleMetadata
) -> dict[str, Any]:
    title = (metadata.title or "").strip()
    if not title:
        raise ValueError("title is required for persistence")

    file_name, date_added = _track_file_details(file_ref)
    key = _canonical_key(metadata.key)
    camelot_code = AudioFile.format_camelot_code(key)
    genre = normalize_genre_value(metadata.genre)
    authoritative = isinstance(file_ref, Path) and is_beatport_encoded(file_ref)
    label = resolve_label(
        metadata.label,
        album=metadata.album,
        title=title,
        session=session,
        authoritative=authoritative,
    )

    track = session.query(Track).filter_by(file_name=file_name).first()
    created = track is None
    if track is None:
        track = Track(file_name=file_name, title=title)
        session.add(track)

    track.title = title
    track.bpm = metadata.bpm
    track.key = key
    track.camelot_code = camelot_code
    track.genre = genre
    track.label = label
    if date_added is not None:
        track.date_added = date_added
    duration_seconds = read_duration_seconds(file_ref)
    if duration_seconds is not None:
        track.duration_seconds = duration_seconds

    session.commit()
    if created or getattr(track, "id", None) is None:
        track = session.query(Track).filter_by(file_name=file_name).first()

    track_id = track.id
    link_updates = 0
    artist_names = _resolve_artist_names(metadata)

    for artist_name in artist_names:
        artist = _ensure_artist(session, artist_name)

        existing_link = (
            session.query(ArtistTrack)
            .filter_by(track_id=track_id, artist_id=artist.id)
            .first()
        )
        if existing_link is not None:
            continue

        artist.track_count = int(getattr(artist, "track_count", 0) or 0) + 1
        session.add(ArtistTrack(track_id=track_id, artist_id=artist.id))
        session.commit()
        link_updates += 1

    return {
        "track_id": track_id,
        "track_created": created,
        "artist_track_links_added": link_updates,
        "camelot_code": camelot_code,
    }
