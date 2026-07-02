from __future__ import annotations

import argparse
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from src.data_management.audio_file import AudioFile
from src.data_management.config import ArtistFields
from src.data_management.utils import load_comment, normalize_key_symbols, split_artist_string
from src.db import database
from src.models.artist import Artist
from src.models.artist_track import ArtistTrack
from src.models.track import Track
from src.track_metadata.genre import (
    BeatportGenreLookup,
    LastFmGenreLookup,
    normalize_genre_value,
    resolve_dynamic_genre,
)
from src.track_metadata.label import (
    _parse_creation_timestamp,
    apply_album_label_consistency,
    canonicalize_label,
    resolve_label,
)
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.tags import read_existing_metadata
from src.track_metadata.utils import sanitize_filename
from src.utils.file_operations import get_file_creation_time

MIN_TRACK_ID = 9450
DEFAULT_OUTPUT_ROOT = Path("data/ingestion_pipeline/output")


@dataclass
class BackfillChange:
    track_id: int
    old_label: str | None = None
    new_label: str | None = None
    old_genre: str | None = None
    new_genre: str | None = None
    old_file_name: str | None = None
    new_file_name: str | None = None
    status: str = "planned"


@dataclass
class BackfillManifest:
    generated_at: str
    dry_run: bool
    min_track_id: int = MIN_TRACK_ID
    output_root: str = str(DEFAULT_OUTPUT_ROOT)
    changes: list[BackfillChange] = field(default_factory=list)
    skipped_below_min_id: int = 0
    populated_genres: int = 0
    unresolved_genres: int = 0
    collisions: list[str] = field(default_factory=list)
    out_of_scope_paths: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["changes"] = [asdict(change) for change in self.changes]
        return payload


def _xeremia_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resolve_output_root(path: Path | None = None) -> Path:
    root = path or (_xeremia_root() / DEFAULT_OUTPUT_ROOT)
    if not root.is_absolute():
        root = _xeremia_root() / root
    return root.resolve()


def is_within_output_root(file_path: Path, output_root: Path) -> bool:
    try:
        file_path.resolve().relative_to(output_root.resolve())
        return True
    except ValueError:
        return False


def track_file_path(track: Track, output_root: Path) -> Path | None:
    if not track.file_name:
        return None
    return output_root / track.file_name


def load_track_file_metadata(track: Track, output_root: Path) -> SimpleMetadata | None:
    path = track_file_path(track, output_root)
    if path is None or not path.exists():
        return None
    return read_existing_metadata(path)


def resolve_track_creation_timestamp(track: Track, output_root: Path) -> datetime | None:
    date_added = getattr(track, "date_added", None)
    if date_added is not None:
        parsed = _parse_creation_timestamp(date_added)
        if parsed is not None:
            return parsed

    path = track_file_path(track, output_root)
    if path is not None and path.exists():
        return datetime.fromtimestamp(get_file_creation_time(str(path)))
    return None


def resolve_track_artist(
    session: Any,
    track: Track,
    file_metadata: SimpleMetadata | None,
) -> str | None:
    if track.id is not None:
        links = session.query(ArtistTrack).filter_by(track_id=track.id).all()
        for link in links:
            artist_id = getattr(link, "artist_id", None)
            if artist_id is None:
                continue
            artist = session.query(Artist).filter_by(id=artist_id).first()
            artist_name = getattr(artist, "name", None) if artist is not None else None
            if artist_name:
                return str(artist_name)

    if file_metadata is not None and file_metadata.artist:
        return file_metadata.artist

    if track.comment:
        comment = load_comment(track.comment)
        artists = split_artist_string(comment.get(ArtistFields.ARTISTS.value, ""))
        if artists:
            return artists[0]

    return None


def resolve_track_source_catalog_id(file_metadata: SimpleMetadata | None) -> str | None:
    if file_metadata is None or not file_metadata.source_catalog_id:
        return None
    return file_metadata.source_catalog_id.strip() or None


def read_beatport_genre_from_file(file_path: Path) -> str | None:
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


def default_genre_lookups() -> tuple[BeatportGenreLookup, LastFmGenreLookup]:
    from src.track_metadata.sources.hydrator import MetadataHydrator

    hydrator = MetadataHydrator(skip_beatport_hydration=False)
    return hydrator.beatport_genre_lookup, hydrator.lastfm_genre_lookup


def planned_file_name(track: Track) -> str | None:
    key = normalize_key_symbols(getattr(track, "key", None))
    bpm = getattr(track, "bpm", None)
    camelot = getattr(track, "camelot_code", None)
    if not key or bpm is None or not camelot:
        return None

    bpm_text = f"{float(bpm):.2f}"
    prefix = AudioFile.generate_title_prefix(camelot, key, bpm_text)
    base_title = track.title or track.file_name
    if prefix and base_title and not base_title.startswith("["):
        composed = f"{prefix}{base_title}".strip()
    else:
        composed = base_title
    sanitized = sanitize_filename(composed)
    suffix = Path(track.file_name).suffix if track.file_name else ".aiff"
    return sanitized + suffix.lower()


def build_track_change(
    track: Track,
    *,
    session: Any,
    shared_state: dict[str, Any],
    output_root: Path,
    web_verifier: Any = None,
    beatport_lookup: BeatportGenreLookup | None = None,
    lastfm_lookup: LastFmGenreLookup | None = None,
) -> BackfillChange | None:
    if track.id is None or track.id < MIN_TRACK_ID:
        return None

    file_metadata = load_track_file_metadata(track, output_root)
    artist = resolve_track_artist(session, track, file_metadata)
    source_catalog_id = resolve_track_source_catalog_id(file_metadata)
    creation_ts = resolve_track_creation_timestamp(track, output_root)

    metadata_like = SimpleMetadata(
        label=track.label,
        album=file_metadata.album if file_metadata is not None else None,
        title=track.title,
        artist=artist,
        genre=track.genre,
        source_catalog_id=source_catalog_id,
    )

    apply_album_label_consistency(
        metadata_like,
        shared_state,
        source_catalog_id=source_catalog_id,
        creation_timestamp=creation_ts,
        session=session,
        web_verifier=web_verifier,
    )

    new_label = resolve_label(
        canonicalize_label(track.label),
        album=metadata_like.album,
        title=track.title,
        session=session,
        web_verifier=web_verifier,
    )
    if metadata_like.label is not None:
        new_label = metadata_like.label

    source_candidates: list[tuple[str, str | None, float]] = []
    file_path = track_file_path(track, output_root)
    if file_path is not None and file_path.exists():
        beatport_tag_genre = read_beatport_genre_from_file(file_path)
        if beatport_tag_genre:
            source_candidates.append(("beatport", beatport_tag_genre, 0.98))
    if track.genre:
        source_candidates.append(("discogs", track.genre, 0.5))

    genre_candidate = resolve_dynamic_genre(
        artist=artist,
        title=track.title,
        source_candidates=source_candidates,
        beatport_lookup=beatport_lookup,
        lastfm_lookup=lastfm_lookup,
    )
    new_genre = normalize_genre_value(genre_candidate or track.genre)

    new_file_name = planned_file_name(track)
    if new_file_name and not is_within_output_root(output_root / new_file_name, output_root):
        return None

    if (
        new_label == track.label
        and new_genre == track.genre
        and (new_file_name is None or new_file_name == track.file_name)
    ):
        return None

    return BackfillChange(
        track_id=track.id,
        old_label=track.label,
        new_label=new_label,
        old_genre=track.genre,
        new_genre=new_genre,
        old_file_name=track.file_name,
        new_file_name=new_file_name if new_file_name != track.file_name else None,
    )


def scan_tracks(
    session: Any,
    *,
    output_root: Path,
    web_verifier: Any = None,
    beatport_lookup: BeatportGenreLookup | None = None,
    lastfm_lookup: LastFmGenreLookup | None = None,
) -> BackfillManifest:
    if beatport_lookup is None or lastfm_lookup is None:
        default_beatport, default_lastfm = default_genre_lookups()
        beatport_lookup = beatport_lookup or default_beatport
        lastfm_lookup = lastfm_lookup or default_lastfm

    manifest = BackfillManifest(
        generated_at=datetime.now().isoformat(),
        dry_run=True,
        output_root=str(output_root),
    )
    shared_state: dict[str, Any] = {}
    rows = session.query(Track).all()
    for track in rows:
        if track.id is None or track.id < MIN_TRACK_ID:
            manifest.skipped_below_min_id += 1
            continue

        change = build_track_change(
            track,
            session=session,
            shared_state=shared_state,
            output_root=output_root,
            web_verifier=web_verifier,
            beatport_lookup=beatport_lookup,
            lastfm_lookup=lastfm_lookup,
        )
        if change is None:
            if track.genre:
                manifest.unresolved_genres += 1
            continue

        if change.new_genre and change.new_genre != track.genre:
            manifest.populated_genres += 1
        elif change.new_genre is None and track.genre:
            manifest.unresolved_genres += 1

        if change.new_file_name and track.file_name:
            current_path = output_root / track.file_name
            target_path = output_root / change.new_file_name
            if not is_within_output_root(current_path, output_root):
                manifest.out_of_scope_paths.append(str(current_path))
                change.new_file_name = None
            elif target_path.exists() and target_path.name != current_path.name:
                manifest.collisions.append(f"{track.id}:{target_path.name}")
                change.new_file_name = None

        manifest.changes.append(change)
    return manifest


def apply_manifest(
    session: Any,
    manifest: BackfillManifest,
    *,
    output_root: Path,
) -> BackfillManifest:
    applied = BackfillManifest(
        generated_at=datetime.now().isoformat(),
        dry_run=False,
        output_root=str(output_root),
        changes=[],
    )
    for change in manifest.changes:
        track = session.query(Track).filter_by(id=change.track_id).first()
        if track is None:
            continue

        if change.new_file_name and change.new_file_name != track.file_name:
            source = output_root / (change.old_file_name or track.file_name)
            target = output_root / change.new_file_name
            if not is_within_output_root(source, output_root) or not is_within_output_root(
                target, output_root
            ):
                applied.out_of_scope_paths.append(str(target))
                continue
            if target.exists() and target != source:
                applied.collisions.append(f"{track.id}:{target.name}")
                continue
            if source.exists():
                source.rename(target)
            track.file_name = change.new_file_name

        track.label = change.new_label
        track.genre = change.new_genre
        applied_change = BackfillChange(**asdict(change))
        applied_change.status = "applied"
        applied.changes.append(applied_change)

    session.commit()
    return applied


def run_backfill(
    *,
    dry_run: bool = True,
    apply: bool = False,
    output_root: Path | None = None,
    manifest_path: Path | None = None,
    web_verifier: Any = None,
    beatport_lookup: BeatportGenreLookup | None = None,
    lastfm_lookup: LastFmGenreLookup | None = None,
) -> BackfillManifest:
    root = resolve_output_root(output_root)
    session = database.create_session()
    try:
        manifest = scan_tracks(
            session,
            output_root=root,
            web_verifier=web_verifier,
            beatport_lookup=beatport_lookup,
            lastfm_lookup=lastfm_lookup,
        )
        manifest.dry_run = (not apply) or dry_run
        if manifest_path is not None:
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(json.dumps(manifest.to_dict(), indent=2), encoding="utf-8")

        if apply and not dry_run:
            if manifest.collisions or manifest.out_of_scope_paths:
                raise RuntimeError(
                    "Refusing to apply backfill with collisions or out-of-scope paths"
                )
            manifest = apply_manifest(session, manifest, output_root=root)
            if manifest_path is not None:
                manifest_path.write_text(json.dumps(manifest.to_dict(), indent=2), encoding="utf-8")
        return manifest
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Metadata quality backfill for track.id >= 9450")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Force dry-run preview (default when --apply is omitted; wins over --apply)",
    )
    parser.add_argument("--apply", action="store_true", default=False)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--manifest", type=Path, default=None)
    args = parser.parse_args()

    dry_run = not args.apply or args.dry_run
    manifest_path = args.manifest or (
        _xeremia_root()
        / "logs"
        / f"{datetime.now().strftime('%Y%m%dT%H%M%S')}_metadata_quality_backfill.json"
    )
    logging.basicConfig(level=logging.INFO)
    manifest = run_backfill(
        dry_run=dry_run,
        apply=args.apply,
        output_root=args.output_root,
        manifest_path=manifest_path,
    )
    logging.info(
        "Backfill complete dry_run=%s changes=%d populated_genres=%d unresolved_genres=%d",
        manifest.dry_run,
        len(manifest.changes),
        manifest.populated_genres,
        manifest.unresolved_genres,
    )


if __name__ == "__main__":
    main()
