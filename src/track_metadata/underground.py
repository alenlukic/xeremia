from __future__ import annotations

import re

LEGACY_TRACK_ID_CEILING = 9531
UNDERGROUND_MIN_BPM = 140.0

_UNSANCTIONED_REMIX_PATTERN = re.compile(
    r"\b(bootleg|edit|rework|flip|vip|unofficial)\b",
    re.IGNORECASE,
)


def is_underground_release(
    *,
    bpm: float | None,
    title: str | None,
    artist_in_legacy_library: bool,
) -> bool:
    if bpm is None or bpm < UNDERGROUND_MIN_BPM:
        return False

    if not artist_in_legacy_library:
        return True

    if title and _UNSANCTIONED_REMIX_PATTERN.search(title):
        return True

    return False
