"""DB-backed track matching: resolve a source file to an existing Track row.

When a file in the ingestion directory is a re-import or duplicate of a track
already represented in the database, the metadata pipeline can update that row
in place rather than creating a second record. The heuristics here score every
DB track against a filename seed and the optional Rekordbox index, applying
artist and remixer compatibility gates so that an unambiguous match wins and
ambiguous cases are surfaced for operator review.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from src.data_management.utils import extract_unformatted_title
from src.models.artist import Artist
from src.models.artist_track import ArtistTrack
from src.models.track import Track
from src.track_metadata.matching import (
    _clean_title_seed,
    _extract_remixer,
    _parse_filename_seed,
    _similarity,
)
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.rekordbox import RekordboxMetadataIndex

# Minimum normalized similarity required to consider a DB track a match for a
# seed. Tuned against observed Beatport/SoundCloud filename drift and kept
# generous enough to survive apostrophe/casing noise while rejecting unrelated
# tracks that share a common word.
MATCH_THRESHOLD = 0.82

_REMIXER_BONUS = 0.1
_BPM_CLOSE_BONUS = 0.05
_BPM_DRIFT_PENALTY = 0.2
_BPM_CLOSE_DELTA = 1.0
_BPM_DRIFT_DELTA = 4.0


@dataclass(frozen=True)
class TrackMatch:
    """A candidate DB track and the score that qualified it as a match."""

    track: Track
    score: float


def artists_for_track(session: Any, track: Track) -> tuple[str | None, str | None]:
    """Resolve a track's primary artist and a secondary collaborator string.

    Returns ``(primary, secondary)`` where ``secondary`` joins every linked
    artist after the first with ``" & "``. When only one artist is linked the
    secondary slot is filled from a remixer hint parsed out of the track title
    so callers can still distinguish a remixer credit from the primary artist.
    """
    links = session.query(ArtistTrack).filter_by(track_id=track.id).all()
    names: list[str] = []
    for link in links:
        artist = session.query(Artist).filter_by(id=link.artist_id).first()
        name = getattr(artist, "name", None) if artist is not None else None
        if name:
            names.append(str(name))
    if len(names) >= 2:
        return names[0], " & ".join(names[1:])
    if len(names) == 1:
        return names[0], _extract_remixer(extract_unformatted_title(track.title or ""))
    return None, None


def track_remixer_hint(session: Any, track: Track) -> str | None:
    """Best-effort remixer hint for a DB track, preferring linked artists."""
    _, remixer = artists_for_track(session, track)
    return remixer or _extract_remixer(
        extract_unformatted_title(track.title or "")
    )


def artist_compatible(
    seed_artist: str | None,
    db_artist: str | None,
    *,
    threshold: float = MATCH_THRESHOLD,
) -> bool:
    """Whether a seed artist can be reconciled with a DB artist.

    A direct similarity hit accepts the pair, as does any comma/ampersand
    sub-token of a multi-artist seed (e.g. ``"A, B"`` matches DB artist ``B``)
    or a substring containment of the seed inside the DB artist name. Empty
    inputs are treated as compatible so callers can layer stricter checks.
    """
    if not seed_artist or not db_artist:
        return True
    if _similarity(seed_artist, db_artist) >= threshold:
        return True
    seed_norm = seed_artist.casefold()
    return (
        any(
            token.strip()
            and _similarity(token.strip(), db_artist) >= threshold
            for token in seed_norm.replace("&", ",").split(",")
        )
        or seed_norm in db_artist.casefold()
    )


def remixer_matches(
    source_remixer: str | None,
    track_hint: str | None,
    track_title: str | None,
    *,
    threshold: float = MATCH_THRESHOLD,
) -> bool:
    """Whether a seed remixer credit is consistent with a DB track.

    A missing source remixer is always consistent. Otherwise the remixer must
    either be similar to the DB remixer hint or appear verbatim inside the
    track title (e.g. ``"(Foo Remix)"``).
    """
    if not source_remixer:
        return True
    if track_hint and _similarity(source_remixer, track_hint) >= threshold:
        return True
    return bool(
        track_title and source_remixer.casefold() in track_title.casefold()
    )


def score_track_match(
    session: Any,
    source: Path,
    seed: SimpleMetadata,
    seed_full: str,
    track: Track,
    rb_row: Any | None,
    *,
    threshold: float = MATCH_THRESHOLD,
) -> float | None:
    """Score a DB track against a filename seed, or ``None`` if incompatible.

    The score blends title similarity (parsed seed vs. cleaned DB title) with
    full ``"artist - title"`` similarity, then applies artist and remixer
    compatibility gates. A matching remixer credit earns a small bonus, and
    Rekordbox BPM agreement nudges the score while large BPM drift penalizes
    it. Returns ``None`` when the track fails the title threshold or any
    artist/remixer gate so callers can drop it from the candidate set.
    """
    db_title = _clean_title_seed(extract_unformatted_title(track.title or "")) or ""
    title_score = _similarity(_clean_title_seed(seed.title), db_title)
    combined_score = _similarity(seed_full, db_title)
    score = max(
        title_score, combined_score, _similarity(seed_full, track.title or "")
    )
    if score < threshold:
        return None

    db_artist, db_remixer = artists_for_track(session, track)
    remixer_ok = remixer_matches(
        seed.remixer, track_remixer_hint(session, track), track.title
    )
    if (
        seed.remixer
        and remixer_ok
        and seed.remixer.casefold() in (track.title or "").casefold()
    ):
        score += _REMIXER_BONUS
    if seed.artist and db_artist and not artist_compatible(seed.artist, db_artist):
        # Allow the remixer credit to cover a missing primary-artist match, and
        # allow the DB remixer to cover a missing seed-artist match, before
        # rejecting the candidate outright.
        if seed.remixer and artist_compatible(seed.remixer, db_artist):
            pass
        elif db_remixer and artist_compatible(seed.artist, db_remixer):
            pass
        else:
            return None
    if not remixer_ok:
        return None

    if (
        rb_row is not None
        and track.bpm is not None
        and getattr(rb_row, "bpm", None) is not None
    ):
        bpm_delta = abs(float(track.bpm) - float(rb_row.bpm))
        if bpm_delta <= _BPM_CLOSE_DELTA:
            score += _BPM_CLOSE_BONUS
        elif bpm_delta > _BPM_DRIFT_DELTA:
            score -= _BPM_DRIFT_PENALTY
    return score


def find_matching_tracks(
    session: Any,
    source: Path,
    rekordbox_index: RekordboxMetadataIndex | None = None,
    *,
    threshold: float = MATCH_THRESHOLD,
) -> list[TrackMatch]:
    """Find DB tracks that match ``source``, best score first.

    A DB track with the same file name is an exact match (score 1.0) and short
    circuits the heuristic. Otherwise every DB track is scored against the
    filename seed (and the Rekordbox row, when available) and surviving
    candidates are ordered by score, preferencing titles without a ``" & "``
    collaborator annotation, then by lowest track id for deterministic ties.
    """
    by_name = session.query(Track).filter_by(file_name=source.name).first()
    if by_name is not None:
        return [TrackMatch(track=by_name, score=1.0)]

    seed = _parse_filename_seed(source)
    seed_full = (
        f"{seed.artist} - {seed.title}"
        if seed.artist and seed.title
        else seed.title or source.stem
    )
    rb_row = (
        rekordbox_index.match(source=source, metadata=seed)
        if rekordbox_index is not None
        else None
    )

    matches: list[TrackMatch] = []
    for track in session.query(Track).all():
        score = score_track_match(
            session,
            source,
            seed,
            seed_full,
            track,
            rb_row,
            threshold=threshold,
        )
        if score is None:
            continue
        matches.append(TrackMatch(track=track, score=score))

    matches.sort(
        key=lambda match: (
            -match.score,
            " & " in (match.track.title or ""),
            match.track.id,
        )
    )
    return matches


def apply_db_fields(metadata: SimpleMetadata, track: Track) -> SimpleMetadata:
    """Return a copy of ``metadata`` with genre/label filled from a DB track.

    Only non-empty DB values overwrite the seed so that already-resolved
    metadata from imported tags or the Rekordbox row is preserved.
    """
    merged = replace(metadata)
    if track.genre:
        merged.genre = track.genre
    if track.label:
        merged.label = track.label
    return merged
