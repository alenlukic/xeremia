from __future__ import annotations

import os

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
