from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Keep track_metadata config deterministic in local/dev shells by loading the
# repository .env before evaluating any feature toggles.
load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=True)

MISSION_CRITICAL_FIELDS: tuple[str, ...] = (
    "key",
    "bpm",
    "camelot_code",
    "artist",
    "title",
)

GAP_REPORT_FIELDS: tuple[str, ...] = (
    "title",
    "artist",
    "remixer",
    "genre",
    "label",
    "album",
    "year",
    "key",
    "bpm",
    "camelot_code",
    "energy",
)

REMEDIATION_DIR_NAME = os.getenv("TRACK_METADATA_REMEDIATION_DIR", "Remediation Tracks")

ENABLE_ESSENTIA = os.getenv("TRACK_METADATA_ENABLE_ESSENTIA", "0") == "1"
ENABLE_CURSOR_SDK_FALLBACK = os.getenv("TRACK_METADATA_ENABLE_CURSOR_SDK", "0") == "1"
ENABLE_BEATPORT_SKIP = os.getenv("TRACK_METADATA_BEATPORT_SKIP", "1") != "0"

# Field-resolution toggles (DB artist-history stays enabled independently).
RESOLUTION_GENRE_ARTIST_HISTORY = (
    os.getenv("TRACK_METADATA_RESOLUTION_GENRE_ARTIST_HISTORY", "1") != "0"
)
RESOLUTION_GENRE_BEATPORT = (
    os.getenv("TRACK_METADATA_RESOLUTION_GENRE_BEATPORT", "1") != "0"
)
RESOLUTION_LABEL_WEB_SEARCH = (
    os.getenv("TRACK_METADATA_RESOLUTION_LABEL_WEB_SEARCH", "1") != "0"
)
RESOLUTION_LABEL_BEATPORT = (
    os.getenv("TRACK_METADATA_RESOLUTION_LABEL_BEATPORT", "1") != "0"
)
RESOLUTION_LABEL_CDR = os.getenv("TRACK_METADATA_RESOLUTION_LABEL_CDR", "1") != "0"
RESOLUTION_EXTERNAL_TIMEOUT_SECONDS = float(
    os.getenv("TRACK_METADATA_RESOLUTION_EXTERNAL_TIMEOUT_SECONDS", "20")
)
RESOLUTION_EXTERNAL_MAX_RETRIES = int(
    os.getenv("TRACK_METADATA_RESOLUTION_EXTERNAL_MAX_RETRIES", "1")
)
RESOLUTION_CDR_MIN_SOUNDCLOUD_FOLLOWERS = int(
    os.getenv("TRACK_METADATA_RESOLUTION_CDR_MIN_SOUNDCLOUD_FOLLOWERS", "5000")
)
