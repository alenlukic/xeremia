from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from src.track_metadata.models import SimpleMetadata

_CATALOG_REJECT_PATTERNS = re.compile(
    r"(spotify|deezer|songlyrics|open\.spotify\.com|deezer\.com|songlyrics\.com|https?://)",
    re.IGNORECASE,
)
_URL_PATTERN = re.compile(r"https?://", re.IGNORECASE)
_CDR_FORMS = frozenset(
    {
        "cdr",
        "white label",
        "whitelabel",
        "self release",
        "self released",
        "self",
    }
)


from src.data_management.utils import normalize_key_symbols


def _normalize_label_value(label: str | None) -> str | None:
    if label is None:
        return None
    return label.strip() or None


def canonicalize_label(label: str | None) -> str | None:
    normalized = _normalize_label_value(label)
    if normalized is None:
        return None

    if normalized.lower() == "cdr":
        return "CDR"

    simplified = re.sub(r"[\s\-]+", " ", normalized).lower()
    if simplified in _CDR_FORMS or "white label" in simplified or "self release" in simplified:
        return "CDR"

    return normalized


def is_rejected_catalog_label(label: str | None) -> bool:
    normalized = _normalize_label_value(label)
    if normalized is None:
        return False
    if _URL_PATTERN.search(normalized):
        return True
    if _CATALOG_REJECT_PATTERNS.search(normalized):
        return True
    if len(normalized) > 120:
        return True
    return False


def is_album_title_candidate(
    label: str | None,
    *,
    album: str | None = None,
    title: str | None = None,
) -> bool:
    normalized = _normalize_label_value(label)
    if normalized is None:
        return False

    def _matches(candidate: str | None) -> bool:
        if not candidate:
            return False
        left = re.sub(r"[\s\-]+", " ", candidate).strip().lower()
        right = re.sub(r"[\s\-]+", " ", normalized).strip().lower()
        return left == right

    return _matches(album) or _matches(title)


def label_exists_in_db(session: Any, label: str) -> bool:
    if session is None:
        return False

    from src.models.track import Track

    query = session.query(Track)
    try:
        match = query.filter(Track.label.ilike(label)).first()
        if match is not None:
            return True
    except Exception:
        pass

    if hasattr(session, "data"):
        for row in session.data.get(Track, []):
            existing = getattr(row, "label", None)
            if isinstance(existing, str) and existing.lower() == label.lower():
                return True
    return False


WebLabelVerifier = Callable[[str], bool]


def verify_label_via_web(
    label: str,
    *,
    verifier: WebLabelVerifier | None = None,
) -> bool:
    if verifier is None:
        return False
    return bool(verifier(label))


def resolve_label(
    label: str | None,
    *,
    album: str | None = None,
    title: str | None = None,
    session: Any = None,
    web_verifier: WebLabelVerifier | None = None,
) -> str | None:
    canonical = canonicalize_label(label)
    if canonical is None:
        return None

    if is_rejected_catalog_label(canonical):
        return None

    if is_album_title_candidate(canonical, album=album, title=title):
        return None

    if canonical == "CDR":
        return "CDR"

    if label_exists_in_db(session, canonical):
        return canonical

    if verify_label_via_web(canonical, verifier=web_verifier):
        return canonical

    return None


def apply_label_resolution(
    metadata: SimpleMetadata,
    *,
    session: Any = None,
    web_verifier: WebLabelVerifier | None = None,
) -> None:
    metadata.label = resolve_label(
        metadata.label,
        album=metadata.album,
        title=metadata.title,
        session=session,
        web_verifier=web_verifier,
    )


def _apply_label_fallback(metadata: SimpleMetadata) -> None:
    apply_label_resolution(metadata)


def album_group_key(
    *,
    source_catalog_id: str | None = None,
    album_tag: str | None = None,
    creation_timestamp: datetime | None = None,
) -> str | None:
    if source_catalog_id:
        return f"catalog:{source_catalog_id.strip().lower()}"

    album = _normalize_label_value(album_tag)
    if album is None or creation_timestamp is None:
        return None

    bucket = creation_timestamp.replace(minute=0, second=0, microsecond=0)
    return f"album:{album.lower()}:{bucket.isoformat()}"


def _parse_creation_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value)
    if isinstance(value, str):
        for fmt in ("%a %b %d %H:%M:%S %Y", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def tracks_share_album_window(
    left: datetime | None,
    right: datetime | None,
    *,
    hours: int = 24,
) -> bool:
    if left is None or right is None:
        return False
    return abs(left - right) <= timedelta(hours=hours)


def resolve_album_label_for_group(
    group_key: str,
    candidate_label: str | None,
    shared_state: dict[str, Any],
    *,
    session: Any = None,
    web_verifier: WebLabelVerifier | None = None,
) -> tuple[str | None, list[str]]:
    conflicts: list[str] = []
    resolved = resolve_label(
        candidate_label,
        session=session,
        web_verifier=web_verifier,
    )
    if resolved is None:
        return None, conflicts

    album_state = shared_state.setdefault("album_labels", {})
    existing = album_state.get(group_key)
    if existing is None:
        album_state[group_key] = resolved
        return resolved, conflicts

    if existing.lower() == resolved.lower():
        return existing, conflicts

    conflicts.append(f"group={group_key} existing={existing} candidate={resolved}")
    return existing, conflicts


def apply_album_label_consistency(
    metadata: SimpleMetadata,
    shared_state: dict[str, Any],
    *,
    source_catalog_id: str | None = None,
    creation_timestamp: Any = None,
    session: Any = None,
    web_verifier: WebLabelVerifier | None = None,
) -> list[str]:
    group_key = album_group_key(
        source_catalog_id=source_catalog_id,
        album_tag=metadata.album,
        creation_timestamp=_parse_creation_timestamp(creation_timestamp),
    )
    if group_key is None:
        apply_label_resolution(metadata, session=session, web_verifier=web_verifier)
        return []

    label, conflicts = resolve_album_label_for_group(
        group_key,
        metadata.label,
        shared_state,
        session=session,
        web_verifier=web_verifier,
    )
    metadata.label = label
    return conflicts
