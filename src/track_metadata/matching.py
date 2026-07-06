from __future__ import annotations

import re
from dataclasses import replace
from difflib import SequenceMatcher
from pathlib import Path

from src.data_management.audio_file import AudioFile
from src.data_management.utils import extract_unformatted_title
from src.track_metadata.models import SimpleMetadata


def _normalize_for_match(value: str | None) -> str:
    if not value:
        return ""

    normalized = value.casefold()
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"\b(feat|featuring|ft)\.?\b", "", normalized)
    normalized = re.sub(r"\(.*?\)|\[.*?\]", " ", normalized)
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _similarity(left: str | None, right: str | None) -> float:
    a = _normalize_for_match(left)
    b = _normalize_for_match(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _extract_remixer(title: str | None) -> str | None:
    if not title:
        return None

    match = re.search(r"\(([^()]+?)\s+(?:remix|mix)\)", title, flags=re.IGNORECASE)
    if match:
        remixer = match.group(1).strip()
        if remixer.casefold() not in {"original", "extended"}:
            return remixer or None

    match = re.search(r"\[([^\[\]]+?)\s+(?:remix|mix)\]", title, flags=re.IGNORECASE)
    if match:
        remixer = match.group(1).strip()
        if remixer.casefold() not in {"original", "extended"}:
            return remixer or None

    return None


def _normalize_whitespace(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value).strip()
    return normalized or None


def _has_mix_annotation(value: str | None) -> bool:
    if not value:
        return False
    return bool(
        re.search(
            r"\b(mix|remix|edit|dub|version|rework|vip|live|bootleg)\b",
            value,
            flags=re.IGNORECASE,
        )
    )


def _clean_title_seed(title: str | None) -> str | None:
    if not title:
        return None

    title = extract_unformatted_title(title)
    title = title.replace("_", " ")
    title = re.sub(r"\s*-\s*24bits\b", "", title, flags=re.IGNORECASE)

    removed_mastering_marker = False

    def _replace_square(match: re.Match[str]) -> str:
        inner = match.group(1).strip()
        if _has_mix_annotation(inner):
            return f" ({inner})"
        return " "

    def _replace_paren(match: re.Match[str]) -> str:
        nonlocal removed_mastering_marker
        inner = match.group(1).strip()
        normalized = inner.casefold()
        if normalized in {"original mix", "extended mix"}:
            return " "
        if "master" in normalized:
            removed_mastering_marker = True
            return " "
        return match.group(0) if _has_mix_annotation(inner) else match.group(0)

    title = re.sub(r"\[([^\[\]]+)\]", _replace_square, title)
    title = re.sub(r"\(([^()]+)\)", _replace_paren, title)
    if removed_mastering_marker:
        title = re.sub(r"\s+(?:[ivxlcdm]+|\d+)\s*$", "", title, flags=re.IGNORECASE)

    title = re.sub(r"\s+", " ", title)
    title = re.sub(r"\s+\)", ")", title)
    title = re.sub(r"\(\s+", "(", title)
    title = re.sub(r"\s+([,.;:])", r"\1", title)
    title = re.sub(r"\s+-\s*$", "", title)
    return title.strip() or None


def _compose_display_title(
    metadata: SimpleMetadata,
    camelot_code: str | None,
) -> str:
    artist = _normalize_whitespace(metadata.artist) or "Unknown Artist"
    title = _clean_title_seed(metadata.title) or "Unknown Title"
    remixer = _normalize_whitespace(metadata.remixer)

    if (
        remixer
        and remixer.casefold() not in title.casefold()
        and not _has_mix_annotation(title)
    ):
        title = f"{title} ({remixer} Remix)"

    if metadata.key is None or metadata.bpm is None:
        return f"{artist} - {title}".strip()

    prefix = AudioFile.generate_title_prefix(
        camelot_code, metadata.key, f"{metadata.bpm:06.2f}"
    )
    return f"{prefix}{artist} - {title}".strip()


_REMIX_PREFIX_PATTERN = re.compile(
    r"^\[Remix of (.+?) - (.+?)\]\s*(.*)$",
    flags=re.IGNORECASE,
)


def _parse_filename_seed(path: Path) -> SimpleMetadata:
    stem = path.stem
    stem = re.sub(r"[_]+", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()

    remix_match = _REMIX_PREFIX_PATTERN.match(stem)
    if remix_match:
        return SimpleMetadata(
            artist=_normalize_whitespace(remix_match.group(1)),
            title=_clean_title_seed(remix_match.group(2)),
            remixer=None,
        )

    if " - " not in stem:
        return SimpleMetadata(
            title=_clean_title_seed(stem),
            remixer=_extract_remixer(stem),
        )

    artist_part, title_part = stem.split(" - ", 1)
    return SimpleMetadata(
        artist=_normalize_whitespace(artist_part),
        title=_clean_title_seed(title_part),
        remixer=_extract_remixer(title_part),
    )


def _merge_missing(
    target: SimpleMetadata,
    candidate: SimpleMetadata | None,
    *,
    fields: set[str] | None = None,
) -> SimpleMetadata:
    if candidate is None:
        return target

    merged = replace(target)
    candidate_data = candidate.to_dict()
    for field, value in candidate_data.items():
        if fields is not None and field not in fields:
            continue
        if value is None:
            continue
        if getattr(merged, field) is None:
            setattr(merged, field, value)
    return merged


def _best_year(*values: int | None) -> int | None:
    for value in values:
        if value:
            return value
    return None
