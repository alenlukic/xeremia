from __future__ import annotations

import html
import json
import os
import re
from pathlib import Path

CANONICAL_GENRES = frozenset(
    {
        "Trance",
        "Techno",
        "Classic Trance",
        "Progressive House",
        "Melodic House & Techno",
        "Electronica / Downtempo",
        "House",
        "Psybient",
        "Progressive Trance",
        "Organic House",
        "Hard Techno",
        "Dance / Electro Pop",
        "Electro House",
        "Psytrance",
        "Electronica",
        "Organic House / Downtempo",
        "Minimal / Deep Tech",
        "Breaks",
        "Soundtracks",
        "Tech House",
        "Leftfield House & Techno",
        "Acid Trance",
        "Deep House",
        "Hardcore / Hard Techno",
        "Breaks / Breakbeat / UK Bass",
        "Hard Trance",
        "Dance & DJ",
        "Ravevival",
        "Afro House",
        "Dance",
        "Indie Dance",
        "Drum & Bass",
    }
)

GENRE_ALIASES: dict[str, str] = {
    "psy-trance": "Psytrance",
    "psytrance": "Psytrance",
    "soundtrack": "Soundtracks",
    "electronic": "Electronica",
    "breaks / breakbeat / uk bass": "Breaks / Breakbeat / UK Bass",
}

_MAX_GENRE_LENGTH = 64

_NOISE_PATTERNS = (
    re.compile(r"\bbeatport\b", re.IGNORECASE),
    re.compile(r"\bbuy\b.+\bmusic\b", re.IGNORECASE),
    re.compile(r"\btracks?\s*-\s*beatport\b", re.IGNORECASE),
)

_DEFAULT_REVIEW_QUEUE = Path(
    os.environ.get("GENRE_REVIEW_QUEUE_PATH", "data/genre_review_queue.jsonl")
)


def _review_queue_path(path: Path | None = None) -> Path:
    return path if path is not None else _DEFAULT_REVIEW_QUEUE


def record_genre_rejection(
    raw: str,
    reason: str,
    context: str,
    *,
    queue_path: Path | None = None,
) -> None:
    target = _review_queue_path(queue_path)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8") as handle:
            handle.write(
                json.dumps({"raw": raw, "reason": reason, "context": context})
                + "\n"
            )
    except OSError:
        return


def _is_noise_genre(value: str) -> bool:
    return any(pattern.search(value) for pattern in _NOISE_PATTERNS)


def resolve_canonical_genre(
    value: str | None,
    *,
    context: str = "",
    queue_path: Path | None = None,
) -> str | None:
    if value is None:
        return None

    decoded = html.unescape(value).strip()
    if not decoded:
        return None

    if len(decoded) > _MAX_GENRE_LENGTH:
        record_genre_rejection(
            decoded, "length_exceeds_limit", context, queue_path=queue_path
        )
        return None

    if _is_noise_genre(decoded):
        record_genre_rejection(decoded, "noise_token", context, queue_path=queue_path)
        return None

    alias_key = re.sub(r"\s+", " ", decoded).casefold()
    if alias_key in GENRE_ALIASES:
        return GENRE_ALIASES[alias_key]

    if decoded in CANONICAL_GENRES:
        return decoded

    record_genre_rejection(
        decoded, "off_vocabulary", context, queue_path=queue_path
    )
    return None
