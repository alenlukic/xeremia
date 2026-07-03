from __future__ import annotations

import logging
import os

from src.track_metadata.matching import _merge_missing
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.base import LookupContext
from src.track_metadata.sources.constants import ACOUSTID_MIN_SCORE
from src.track_metadata.sources.musicbrainz import fetch_recording_metadata


class AcoustIdSource:
    """Acoustic-fingerprint identification via AcoustID.

    ``acoustid.match`` fingerprints the audio file at the given path (using
    Chromaprint / the ``fpcalc`` binary) and resolves it to MusicBrainz
    recordings; the file path is the fingerprint source, not a text query.
    """

    name = "acoustid"
    merge_fields: frozenset[str] | None = None

    def lookup(
        self, seed: SimpleMetadata, context: LookupContext
    ) -> SimpleMetadata | None:
        api_key = os.getenv("ACOUSTID_API_KEY")
        if not api_key:
            return None

        try:
            import acoustid
        except ImportError:
            logging.info("Skipping AcoustID lookup; pyacoustid is not installed.")
            return None

        audio_path = context.file_path
        try:
            matches = list(acoustid.match(api_key, str(audio_path)))
        except Exception as exc:
            logging.warning("AcoustID lookup failed for %s: %s", audio_path.name, exc)
            return None

        if not matches:
            return None

        best_score, recording_id, title, artist = max(
            matches, key=lambda item: float(item[0])
        )
        if float(best_score) < ACOUSTID_MIN_SCORE:
            logging.info(
                "Ignoring low-confidence AcoustID match for %s (%.3f)",
                audio_path.name,
                best_score,
            )
            return None

        metadata = SimpleMetadata(title=title or None, artist=artist or None)
        metadata = _merge_missing(
            metadata, fetch_recording_metadata(context.http, recording_id)
        )
        logging.info(
            "AcoustID matched %s -> %s / %s (score=%.3f)",
            audio_path.name,
            metadata.artist or artist,
            metadata.title or title,
            best_score,
        )
        return metadata
