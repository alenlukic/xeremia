from __future__ import annotations

import re
from typing import Any

from src.data_management.audio_file import AudioFile
from src.data_management.config import CANONICAL_KEY_MAP
from src.data_management.utils import extract_unformatted_title
from src.models.artist import Artist
from src.models.artist_track import ArtistTrack
from src.models.track import Track
from src.track_metadata.models import SimpleMetadata

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


def upsert_track_records(session: Any, file_name: str, metadata: SimpleMetadata) -> dict[str, Any]:
    title = (metadata.title or "").strip()
    if not title:
        raise ValueError("title is required for persistence")

    key = _canonical_key(metadata.key)
    camelot_code = AudioFile.format_camelot_code(key)
    track_title = extract_unformatted_title(title)

    track = session.query(Track).filter_by(file_name=file_name).first()
    created = track is None
    if track is None:
        track = Track(file_name=file_name, title=track_title)
        session.add(track)

    track.title = track_title
    track.bpm = metadata.bpm
    track.key = key
    track.camelot_code = camelot_code
    track.genre = metadata.genre
    track.label = metadata.label

    session.commit()
    if created or getattr(track, "id", None) is None:
        track = session.query(Track).filter_by(file_name=file_name).first()

    track_id = track.id
    link_updates = 0
    artist_names = _artist_tokens(metadata.artist) + _artist_tokens(metadata.remixer)

    for artist_name in artist_names:
        artist = session.query(Artist).filter_by(name=artist_name).first()
        if artist is None:
            artist = Artist(name=artist_name, track_count=0)
            session.add(artist)
            session.commit()
            artist = session.query(Artist).filter_by(name=artist_name).first()

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
