from __future__ import annotations

import re

from src.data_management.config import CAMELOT_MAP, CANONICAL_KEY_MAP

_CAMELOT_PATTERN = re.compile(r"^0?([1-9]|1[0-2])\s*([ab])$", re.IGNORECASE)
_CAMELOT_TO_KEY = {
    code.casefold(): canonical_key
    for canonical_key, code in CAMELOT_MAP.items()
}


def canonicalize_key(value: str | None) -> str | None:
    """Return the repository's canonical musical key for a named or Camelot key."""
    normalized_symbols = _normalize_key_symbols(value)
    if not normalized_symbols:
        return None

    normalized = " ".join(normalized_symbols.strip().lower().split())
    camelot_match = _CAMELOT_PATTERN.fullmatch(normalized)
    if camelot_match:
        code = f"{int(camelot_match.group(1)):02d}{camelot_match.group(2).upper()}"
        canonical = _CAMELOT_TO_KEY.get(code.casefold())
        return _display_key(canonical)

    if normalized.endswith(" major"):
        normalized = normalized[: -len(" major")] + "maj"
    elif normalized.endswith(" minor"):
        normalized = normalized[: -len(" minor")] + "min"

    canonical = CANONICAL_KEY_MAP.get(normalized)
    return _display_key(canonical)


def _normalize_key_symbols(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text.replace("♯", "#").replace("♭", "b")


def _display_key(value: str | None) -> str | None:
    if not value:
        return None
    return value[0].upper() + value[1:]
