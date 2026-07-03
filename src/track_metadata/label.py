from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.research import (
    BrowserResearchClient,
    CatalogLookupClient,
    CatalogNumberObservation,
    CdrEvidence,
    LabelSearchObservation,
    ResolutionProvenance,
    WebSearchClient,
)

_CATALOG_REJECT_PATTERNS = re.compile(
    r"(spotify|deezer|songlyrics|open\.spotify\.com|deezer\.com|songlyrics\.com|https?://)",
    re.IGNORECASE,
)
_URL_PATTERN = re.compile(r"https?://", re.IGNORECASE)
_DISTRIBUTOR_PATTERNS = re.compile(
    r"\b(distributor|distribution|publisher|rights society|ascap|bmi|sesac|"
    r"believe|distrokid|tunecore|cd baby|ingrooves|the orchard|"
    r"youtube channel|soundcloud profile|uploader)\b",
    re.IGNORECASE,
)
_CATALOG_NUMBER_PATTERN = re.compile(
    r"\b([A-Z]{1,4}[-\s]?\d{2,6}[A-Z0-9-]*)\b",
    re.IGNORECASE,
)
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
    if (
        simplified in _CDR_FORMS
        or "white label" in simplified
        or "self release" in simplified
    ):
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
        for fmt in (
            "%a %b %d %H:%M:%S %Y",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%d %H:%M:%S",
        ):
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


def is_unresolved_label(label: str | None) -> bool:
    return canonicalize_label(label) is None


def is_rejected_direct_label(observation: LabelSearchObservation) -> bool:
    if observation.is_distributor:
        return True
    label = observation.label
    if label is None:
        return True
    if is_rejected_catalog_label(label):
        return True
    if _DISTRIBUTOR_PATTERNS.search(label):
        return True
    if _DISTRIBUTOR_PATTERNS.search(observation.snippet):
        return True
    if re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", label.strip(), flags=re.IGNORECASE):
        return True
    return False


def _album_is_usable(album: str | None) -> bool:
    if album is None or not album.strip():
        return False
    lowered = album.strip().casefold()
    return lowered not in {"unknown", "n/a", "none", "untitled"}


def _pick_confirmed_catalog(
    observations: list[CatalogNumberObservation],
) -> CatalogNumberObservation | None:
    confirmed = [item for item in observations if item.identity_confirmed]
    if not confirmed:
        return None
    numbers = {item.catalog_number.casefold() for item in confirmed}
    if len(numbers) != 1:
        return None
    return confirmed[0]


def _pick_confirmed_label(
    observations: list[LabelSearchObservation],
) -> LabelSearchObservation | None:
    viable = [
        item
        for item in observations
        if item.identity_confirmed and not is_rejected_direct_label(item)
    ]
    labels = {
        canonicalize_label(item.label)
        for item in viable
        if canonicalize_label(item.label) not in (None, "CDR")
    }
    labels.discard(None)
    if len(labels) != 1:
        return None
    return next(item for item in viable if canonicalize_label(item.label) in labels)


def _resolve_from_catalog_number(
    catalog_number: str,
    *,
    catalog_client: CatalogLookupClient | None,
    web_client: WebSearchClient | None,
) -> str | None:
    if catalog_client is not None:
        try:
            label = catalog_client.lookup_label_by_catalog_number(catalog_number)
        except Exception:
            label = None
        if label:
            return canonicalize_label(label)

    if web_client is not None:
        try:
            observations = web_client.search_label_by_catalog_number(catalog_number)
        except Exception:
            observations = []
        picked = _pick_confirmed_label(observations)
        if picked and picked.label:
            return canonicalize_label(picked.label)
    return None


def infer_cdr_label(evidence: CdrEvidence) -> bool:
    if not evidence.track_identity_confirmed:
        return False
    if evidence.label_found:
        return False
    if not evidence.indicators and not evidence.free_download:
        return False
    if evidence.free_download:
        return True
    if evidence.artist_controlled_source:
        return True
    # A small follower count is only supporting evidence; it must never yield
    # CDR on its own without an explicit non-label indicator.
    decisive = [
        indicator
        for indicator in evidence.indicators
        if indicator != "small_soundcloud_following"
    ]
    return len(decisive) > 0


def resolve_label_fallback(
    *,
    artist: str | None,
    title: str | None,
    album: str | None = None,
    web_client: WebSearchClient | None = None,
    catalog_client: CatalogLookupClient | None = None,
    browser: BrowserResearchClient | None = None,
    enable_web_search: bool = True,
    enable_beatport: bool = True,
    enable_cdr: bool = True,
    cdr_min_soundcloud_followers: int = 5000,
) -> tuple[str | None, list[ResolutionProvenance]]:
    events: list[ResolutionProvenance] = []
    inputs = {"artist": artist, "title": title, "album": album}
    cdr_evidence = CdrEvidence(track_identity_confirmed=False)
    title_label_obs: list[LabelSearchObservation] = []

    if enable_web_search and web_client is not None and artist and title:
        try:
            title_catalog_obs = web_client.search_catalog_number_by_title(artist, title)
        except Exception as exc:
            events.append(
                ResolutionProvenance(
                    field="label",
                    method="catalog_number_title",
                    outcome="error",
                    source="web_search",
                    confidence="error",
                    evidence={"error": str(exc)},
                    inputs=inputs,
                )
            )
            title_catalog_obs = []
        else:
            picked = _pick_confirmed_catalog(title_catalog_obs)
            events.append(
                ResolutionProvenance(
                    field="label",
                    method="catalog_number_title",
                    outcome="resolved" if picked else "unresolved",
                    source=picked.source_url if picked else "web_search",
                    confidence="high" if picked else "no_match",
                    evidence={
                        "observations": [item.catalog_number for item in title_catalog_obs]
                    },
                    inputs=inputs,
                )
            )
            if picked:
                cdr_evidence.catalog_number_found = True
                cdr_evidence.track_identity_confirmed = True
                label = _resolve_from_catalog_number(
                    picked.catalog_number,
                    catalog_client=catalog_client,
                    web_client=web_client,
                )
                if label:
                    return label, events

        if _album_is_usable(album):
            try:
                album_catalog_obs = web_client.search_catalog_number_by_album(
                    artist, album
                )
            except Exception as exc:
                events.append(
                    ResolutionProvenance(
                        field="label",
                        method="catalog_number_album",
                        outcome="error",
                        source="web_search",
                        confidence="error",
                        evidence={"error": str(exc)},
                        inputs=inputs,
                    )
                )
                album_catalog_obs = []
            else:
                picked = _pick_confirmed_catalog(album_catalog_obs)
                events.append(
                    ResolutionProvenance(
                        field="label",
                        method="catalog_number_album",
                        outcome="resolved" if picked else "unresolved",
                        source=picked.source_url if picked else "web_search",
                        confidence="high" if picked else "no_match",
                        evidence={
                            "observations": [
                                item.catalog_number for item in album_catalog_obs
                            ]
                        },
                        inputs=inputs,
                    )
                )
                if picked:
                    cdr_evidence.catalog_number_found = True
                    cdr_evidence.track_identity_confirmed = True
                    label = _resolve_from_catalog_number(
                        picked.catalog_number,
                        catalog_client=catalog_client,
                        web_client=web_client,
                    )
                    if label:
                        return label, events

        try:
            title_label_obs = web_client.search_label_by_title(artist, title)
        except Exception as exc:
            events.append(
                ResolutionProvenance(
                    field="label",
                    method="web_label_title",
                    outcome="error",
                    source="web_search",
                    confidence="error",
                    evidence={"error": str(exc)},
                    inputs=inputs,
                )
            )
            title_label_obs = []
        else:
            picked = _pick_confirmed_label(title_label_obs)
            if picked:
                cdr_evidence.track_identity_confirmed = True
            events.append(
                ResolutionProvenance(
                    field="label",
                    method="web_label_title",
                    outcome="resolved" if picked else "unresolved",
                    source=picked.source_url if picked else "web_search",
                    confidence="high" if picked else "no_match",
                    evidence={"label": picked.label if picked else None},
                    inputs=inputs,
                )
            )
            if picked and picked.label:
                return canonicalize_label(picked.label), events

        if _album_is_usable(album):
            try:
                album_label_obs = web_client.search_label_by_album(artist, album)
            except Exception as exc:
                events.append(
                    ResolutionProvenance(
                        field="label",
                        method="web_label_album",
                        outcome="error",
                        source="web_search",
                        confidence="error",
                        evidence={"error": str(exc)},
                        inputs=inputs,
                    )
                )
                album_label_obs = []
            else:
                picked = _pick_confirmed_label(album_label_obs)
                if picked:
                    cdr_evidence.track_identity_confirmed = True
                events.append(
                    ResolutionProvenance(
                        field="label",
                        method="web_label_album",
                        outcome="resolved" if picked else "unresolved",
                        source=picked.source_url if picked else "web_search",
                        confidence="high" if picked else "no_match",
                        evidence={"label": picked.label if picked else None},
                        inputs=inputs,
                    )
                )
                if picked and picked.label:
                    return canonicalize_label(picked.label), events

    if enable_beatport and browser is not None and artist and title:
        try:
            observation = browser.inspect_beatport_track_label(artist, title)
        except Exception as exc:
            events.append(
                ResolutionProvenance(
                    field="label",
                    method="beatport_track",
                    outcome="error",
                    source="beatport",
                    confidence="error",
                    evidence={"error": str(exc)},
                    inputs=inputs,
                )
            )
            observation = None
        else:
            label = None
            if (
                observation is not None
                and observation.identity_confirmed
                and observation.label
            ):
                label = canonicalize_label(observation.label)
                cdr_evidence.track_identity_confirmed = True
                if label:
                    cdr_evidence.label_found = True
            events.append(
                ResolutionProvenance(
                    field="label",
                    method="beatport_track",
                    outcome="resolved" if label else "unresolved",
                    source=observation.page_url if observation else "beatport",
                    confidence="high" if label else "no_match",
                    evidence={
                        "label": observation.label if observation else None,
                        "page_url": observation.page_url if observation else None,
                    },
                    inputs=inputs,
                )
            )
            if label:
                return label, events

    if enable_cdr and cdr_evidence.track_identity_confirmed:
        for item in title_label_obs:
            snippet = item.snippet.casefold()
            if "free download" in snippet:
                cdr_evidence.free_download = True
                cdr_evidence.indicators.append("free_download")
            if "soundcloud" in snippet:
                cdr_evidence.artist_controlled_source = "SoundCloud"
                cdr_evidence.indicators.append("artist_controlled_source")
            follower_match = re.search(r"(\d[\d,]*)\s+followers", snippet)
            if follower_match:
                followers = int(follower_match.group(1).replace(",", ""))
                if followers < cdr_min_soundcloud_followers:
                    cdr_evidence.indicators.append("small_soundcloud_following")

        if infer_cdr_label(cdr_evidence):
            events.append(
                ResolutionProvenance(
                    field="label",
                    method="cdr_inference",
                    outcome="resolved",
                    source="web_search",
                    confidence="medium",
                    evidence={
                        "track_identity_confirmed": cdr_evidence.track_identity_confirmed,
                        "free_download": cdr_evidence.free_download,
                        "artist_controlled_source": cdr_evidence.artist_controlled_source,
                        "catalog_number_found": cdr_evidence.catalog_number_found,
                        "label_found": cdr_evidence.label_found,
                        "indicators": list(cdr_evidence.indicators),
                    },
                    inputs=inputs,
                )
            )
            return "CDR", events

    return None, events
