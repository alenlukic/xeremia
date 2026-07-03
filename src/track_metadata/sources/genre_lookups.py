from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

from src.track_metadata.sources.constants import LASTFM_API_URL, WEB_SEARCH_URL
from src.utils.http import RateLimitedHttpClient


def _dig(mapping: Any, *keys: str) -> Any:
    """Safely walk a chain of dict keys, returning ``None`` on any miss."""
    current = mapping
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def read_beatport_genre_from_tags(file_path: Path) -> str | None:
    try:
        from mutagen.id3 import ID3
    except ImportError:
        return None
    try:
        tags = ID3(str(file_path))
    except Exception:
        return None
    frame = tags.get("TCON")
    if frame is None or not getattr(frame, "text", None):
        return None
    text = str(frame.text[0]).strip()
    return text or None


def is_beatport_encoded(file_path: Path) -> bool:
    try:
        from mutagen.id3 import ID3
    except ImportError:
        return False
    try:
        tags = ID3(str(file_path))
    except Exception:
        return False
    frame = tags.get("TENC")
    if frame is None or not getattr(frame, "text", None):
        return False
    return "beatport" in str(frame.text[0]).lower()


def lookup_beatport_genre(
    http: RateLimitedHttpClient, artist: str | None, title: str | None
) -> str | None:
    if not artist or not title:
        return None
    try:
        html_text = http.get_text(
            WEB_SEARCH_URL, params={"q": f"site:beatport.com {artist} {title}"}
        )
    except Exception as exc:
        logging.warning(
            "Beatport genre lookup failed for %s - %s: %s", artist, title, exc
        )
        return None
    match = re.search(r"genre[^>]*>([^<]+)<", html_text, flags=re.IGNORECASE)
    return match.group(1).strip() if match else None


def _first_lastfm_tag(payload: dict[str, Any]) -> str | None:
    tags = _dig(payload, "track", "toptags", "tag")
    if not isinstance(tags, list) or not tags:
        return None
    first = tags[0]
    name = first.get("name") if isinstance(first, dict) else None
    if isinstance(name, str) and name.strip():
        return name.strip()
    return None


def lookup_lastfm_genre(
    http: RateLimitedHttpClient, artist: str | None, title: str | None
) -> str | None:
    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key or not artist:
        return None

    params: dict[str, Any] = {
        "method": "track.getInfo",
        "api_key": api_key,
        "artist": artist,
        "format": "json",
    }
    if title:
        params["track"] = title

    try:
        payload = http.get_json(LASTFM_API_URL, params=params)
    except Exception as exc:
        logging.warning(
            "Last.fm genre lookup failed for %s - %s: %s", artist, title, exc
        )
        return None
    return _first_lastfm_tag(payload)
