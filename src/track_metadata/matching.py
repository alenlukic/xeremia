from __future__ import annotations

import re
from dataclasses import replace
from difflib import SequenceMatcher
from pathlib import Path

from src.data_management.audio_file import AudioFile
from src.data_management.utils import extract_unformatted_title, transform_artist
from src.track_metadata.models import SimpleMetadata

_PRESERVED_SHORT_TOKENS = frozenset(
    {"dj", "mc", "ft", "vs", "ii", "iii", "iv", "vi", "vii", "viii"}
)
_IMMATERIAL_PAREN_SUFFIXES = frozenset(
    {"original mix", "extended mix", "extended", "original"}
)
_MASTERING_ENGINEER_SUFFIXES = frozenset(
    {"dm", "mstr", "master", "rem", "rmx", "mix"}
)


def _strip_production_metadata_cruft(title: str) -> str:
    """Remove version, bit-depth, and mastering tokens from title seeds."""
    cleaned = re.sub(r"\s*-\s*24bits?\b", " ", title, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bv\.?\s*\d+\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b\d+\s*-?\s*bit(?:s)?\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"\b(?:master(?:ing)?|premaster(?:ed)?)(?:\s*v\d+)?\b",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    while True:
        match = re.search(r"\s+\b([A-Za-z]{2,3})\s*$", cleaned)
        if match is None or match.group(1).casefold() not in _MASTERING_ENGINEER_SUFFIXES:
            break
        cleaned = cleaned[: match.start()]
    return cleaned


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

    match = re.search(
        r"\(([^()]+?)\s+(?:mix|remix|edit|dub|version|rework|vip|live|bootleg)\)",
        title,
        flags=re.IGNORECASE,
    )
    if match:
        remixer = match.group(1).strip()
        if remixer.casefold() not in {"original", "extended"}:
            return remixer or None

    match = re.search(
        r"\[([^\[\]]+?)\s+(?:mix|remix|edit|dub|version|rework|vip|live|bootleg)\]",
        title,
        flags=re.IGNORECASE,
    )
    if match:
        remixer = match.group(1).strip()
        if remixer.casefold() not in {"original", "extended"}:
            return remixer or None

    return None


def _normalize_apostrophes(value: str) -> str:
    return re.sub(r"[\u00b4\u2018\u2019\u201b\u02bc`]", "'", value)


def _titlecase_if_lowercase(value: str) -> str:
    return value.title() if value == value.lower() else value


def _normalize_whitespace(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value).strip()
    return normalized or None


def _normalize_display_token(token: str) -> str:
    stripped = token.strip()
    if not stripped:
        return stripped
    if stripped.casefold() in _PRESERVED_SHORT_TOKENS:
        return stripped.upper()
    mapped = transform_artist(stripped)
    if mapped != stripped:
        return mapped
    if "/" in stripped:
        return stripped
    if stripped.isupper() and len(stripped) > 3:
        return stripped.title()
    return stripped


def _normalize_shouting_phrase(value: str | None) -> str | None:
    normalized = _normalize_whitespace(value)
    if not normalized or not normalized.isupper():
        return normalized
    return " ".join(_normalize_display_token(word) for word in normalized.split())


def _normalize_title_display(title: str | None) -> str | None:
    cleaned = _clean_title_seed(title)
    if not cleaned:
        return cleaned
    if cleaned.isupper():
        return _normalize_shouting_phrase(cleaned)
    if cleaned.islower():
        return cleaned.title()
    return cleaned


def _format_artist_display(value: str | None) -> str | None:
    normalized = _normalize_whitespace(value)
    if not normalized:
        return None

    parts = [
        part.strip()
        for part in re.split(r"\s*(?:,| and )\s*", normalized, flags=re.IGNORECASE)
        if part.strip()
    ]
    if not parts:
        return None
    parts = [transform_artist(part) for part in parts]
    parts = [
        _titlecase_if_lowercase(_normalize_shouting_phrase(part) or part)
        for part in parts
    ]
    if len(parts) == 1:
        return parts[0]
    separator = " and " if any("&" in part for part in parts) else " & "
    return separator.join(parts)


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
    title = _normalize_apostrophes(title)
    title = title.replace("_", " ")
    title = _strip_production_metadata_cruft(title)

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
        if normalized in _IMMATERIAL_PAREN_SUFFIXES:
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
    artist = _format_artist_display(metadata.artist) or "Unknown Artist"
    title = _normalize_title_display(metadata.title) or "Unknown Title"
    remixer = _format_artist_display(metadata.remixer)

    if remixer and _has_mix_annotation(title):
        mix_kind = "Remix"
        if re.search(r"\bEdit\b", title, flags=re.IGNORECASE):
            mix_kind = "Edit"
        elif re.search(r"\bMix\b", title, flags=re.IGNORECASE):
            mix_kind = "Mix"
        elif re.search(r"\bDub\b", title, flags=re.IGNORECASE):
            mix_kind = "Dub"

        paren_match = re.search(
            r"\(([^)]*(?:mix|remix|edit|dub|version|rework|vip|live|bootleg)[^)]*)\)",
            title,
            flags=re.IGNORECASE,
        )
        is_original_mix = bool(
            paren_match
            and re.search(r"\boriginal\b", paren_match.group(1), flags=re.IGNORECASE)
        )
        remixer_in_annotation = False
        if paren_match and not is_original_mix:
            annotation_name = re.sub(
                r"\s+(?:mix|remix|edit|dub|version|rework|vip|live|bootleg)\b.*",
                "",
                paren_match.group(1),
                flags=re.IGNORECASE,
            ).strip()
            remixer_in_annotation = (
                annotation_name.casefold() == remixer.casefold()
            )

        if not is_original_mix and (
            remixer.casefold() not in title.casefold() or remixer_in_annotation
        ):
            title = re.sub(
                r"\s*\([^)]*(?:mix|remix|edit|dub|version|rework|vip|live|bootleg)[^)]*\)\s*",
                "",
                title,
                flags=re.IGNORECASE,
            ).strip()
            title = f"{title} ({remixer} {mix_kind})"
    elif (
        remixer
        and remixer.casefold() not in title.casefold()
        and not _has_mix_annotation(title)
    ):
        title = f"{title} ({remixer} Remix)"

    if metadata.key is None or metadata.bpm is None:
        return _normalize_apostrophes(f"{artist} - {title}".strip())

    prefix = AudioFile.generate_title_prefix(
        camelot_code, metadata.key, f"{metadata.bpm:06.2f}"
    )
    return _normalize_apostrophes(f"{prefix}{artist} - {title}".strip())


_REMIX_PREFIX_PATTERN = re.compile(
    r"^\[Remix of (.+?) - (.+?)\]\s*(.*)$",
    flags=re.IGNORECASE,
)


def _parse_remix_prefix_tail(tail: str | None) -> str | None:
    candidate = _normalize_whitespace(tail)
    if not candidate:
        return None

    if " - " in candidate:
        remixer, _ = candidate.split(" - ", 1)
        remixer = _normalize_whitespace(remixer)
        if remixer:
            return remixer

    extracted = _normalize_whitespace(_extract_remixer(candidate))
    if extracted:
        return extracted

    fallback = re.match(
        r"^(.+?)\s+(?:mix|remix|edit|dub|version|rework|vip|live|bootleg)\b",
        candidate,
        flags=re.IGNORECASE,
    )
    if fallback:
        remixer = _normalize_whitespace(fallback.group(1))
        if remixer and remixer.casefold() not in {"original", "extended"}:
            if "[" in candidate and "(" not in candidate and " - " not in candidate:
                return remixer.split(" ", 1)[0]
            return remixer

    return None


def _parse_filename_seed(path: Path) -> SimpleMetadata:
    stem = path.stem
    stem = re.sub(r"[_]+", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()

    remix_match = _REMIX_PREFIX_PATTERN.match(stem)
    if remix_match:
        return SimpleMetadata(
            artist=_normalize_whitespace(remix_match.group(1)),
            title=_clean_title_seed(remix_match.group(2)),
            remixer=_parse_remix_prefix_tail(remix_match.group(3)),
        )

    parts = [part.strip() for part in stem.split(" - ")]
    if len(parts) >= 3:
        remixer = _normalize_whitespace(parts[0])
        artist = _format_artist_display(_normalize_whitespace(parts[1]))
        title_part = " - ".join(parts[2:])
        return SimpleMetadata(
            artist=artist,
            title=_clean_title_seed(title_part),
            remixer=remixer,
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


def seed_metadata_from_filename(
    source: Path, existing: SimpleMetadata
) -> SimpleMetadata:
    """Build the initial metadata seed used by both remote and DB-first hydration.

    Remix-prefix filenames (``[Remix of <artist> - <title>]``) encode the original
    work identity, so the parsed artist/title seed wins over imported tags while
    the imported artist formatting is kept when it matches the parsed remixer.
    For every other filename shape, imported tags win and the filename only fills
    gaps. A remixer is inferred from the title annotation as a final fallback.
    """
    parsed_seed = _parse_filename_seed(source)
    if source.stem.casefold().startswith("[remix of "):
        seed = _merge_missing(parsed_seed, existing)
        if (
            parsed_seed.remixer
            and existing.artist
            and _normalize_for_match(parsed_seed.remixer)
            == _normalize_for_match(existing.artist)
        ):
            seed.remixer = existing.artist
    else:
        seed = _merge_missing(existing, parsed_seed)
    if seed.remixer is None:
        seed.remixer = _extract_remixer(seed.title)
    return seed
