"""Sync track table columns to audio file names and ID3 tags.

This is the inverse of ``sync_track_fields``: the database is the source of
truth. Column values are written to the file's ID3 tags, the file is renamed
when the title column changed (preserving the extension), and the comment
column — a dict literal of the other columns — is rebuilt and written last,
after every other column and tag update.
"""

from __future__ import annotations

from os import rename
from os.path import basename, dirname, isfile, join, splitext
from time import ctime

from src.config import PROCESSED_MUSIC_DIR
from src.data_management.audio_file import AudioFile
from src.data_management.config import ArtistFields, DBUpdateType, ID3Tag, TrackDBCols
from src.data_management.utils import format_track_title, load_comment
from src.db import database
from src.errors import handle
from src.models.track import Track
from src.utils.audio_path import clear_audio_path_cache, resolve_audio_path
from src.utils.common import is_empty
from src.utils.file_operations import get_file_creation_time

RANGE_SEPARATOR = "..."

# Columns written to ID3 tags, in write order. camelot_code has no dedicated
# frame (it is embedded in the title prefix) and comment is written separately,
# last, by _sync_comment.
TAG_SYNC_COLUMNS = (
    (TrackDBCols.TITLE, ID3Tag.TITLE),
    (TrackDBCols.BPM, ID3Tag.BPM),
    (TrackDBCols.KEY, ID3Tag.KEY),
    (TrackDBCols.ENERGY, ID3Tag.ENERGY),
    (TrackDBCols.GENRE, ID3Tag.GENRE),
    (TrackDBCols.LABEL, ID3Tag.LABEL),
)


def parse_track_id_args(args: list[str]) -> list[int]:
    """Parse CLI args into track ids.

    Accepts either space-separated ids (``9400 9401 9402``) or one inclusive
    range in the form ``{min_id}...{max_id}`` (``9400...9410``). Raises
    ``ValueError`` for empty, malformed, or inverted input.
    """
    if len(args) == 0:
        raise ValueError(
            "No track ids given; pass ids (e.g. 9400 9401) or a range (e.g. 9400...9410)"
        )

    if len(args) == 1 and RANGE_SEPARATOR in args[0]:
        bounds = args[0].split(RANGE_SEPARATOR)
        if len(bounds) != 2:
            raise ValueError(
                "Malformed range %r; expected {min_id}...{max_id}" % args[0]
            )
        min_id, max_id = (_parse_track_id(bound) for bound in bounds)
        if min_id > max_id:
            raise ValueError(
                "Invalid range %r; min id is greater than max id" % args[0]
            )
        return list(range(min_id, max_id + 1))

    return [_parse_track_id(arg) for arg in args]


def format_tag_value(column: TrackDBCols, value: object) -> str:
    """Format a column value as ID3 tag text.

    BPM drops insignificant trailing zeros ("136.00" -> "136") to match the
    convention already present in the collection's TBPM frames.
    """
    if column == TrackDBCols.BPM:
        return ("%.2f" % float(value)).rstrip("0").rstrip(".")
    return str(value)


def build_comment(
    track: Track, artists: str | None, remixers: str | None, date_added: str | None
) -> str:
    """Build the comment dict literal from column values.

    Key order and value types match the comments produced at ingestion time so
    rebuilt comments stay diffable against existing rows.
    """
    fields = {
        ArtistFields.ARTISTS.value: artists,
        ArtistFields.REMIXERS.value: remixers,
        TrackDBCols.FILE_NAME.value: track.file_name,
        TrackDBCols.TITLE.value: track.title,
        TrackDBCols.BPM.value: None if track.bpm is None else float(track.bpm),
        TrackDBCols.KEY.value: track.key,
        TrackDBCols.CAMELOT_CODE.value: track.camelot_code,
        TrackDBCols.ENERGY.value: track.energy,
        TrackDBCols.GENRE.value: track.genre,
        TrackDBCols.LABEL.value: track.label,
        TrackDBCols.DATE_ADDED.value: date_added,
    }
    return str({k: v for k, v in fields.items() if not is_empty(v)})


def sync_track_to_file(track: Track, music_dir: str = PROCESSED_MUSIC_DIR) -> dict:
    """Write one track's column values to its audio file.

    Returns a dict of the fields that changed (column name -> written value).
    Mutates ``track.file_name`` and ``track.comment`` when they change; the
    caller owns the session and commits.
    """
    source_path = resolve_audio_path(music_dir, track.file_name)
    if source_path is None:
        raise FileNotFoundError(
            "No audio file found for track %s (%s)" % (track.id, track.file_name)
        )

    changes: dict = {}
    audio_file = AudioFile(basename(source_path), dirname(source_path))
    for column, tag in TAG_SYNC_COLUMNS:
        value = getattr(track, column.value)
        if is_empty(value):
            continue
        formatted = format_tag_value(column, value)
        if audio_file.get_tag(tag) != formatted:
            audio_file.write_tag(tag.value, formatted, save=False)
            changes[column.value] = formatted
    if changes:
        audio_file.save_tags()

    current_path = _rename_track_file(track, source_path, changes)
    _sync_comment(track, current_path, changes)

    return changes


def sync_tracks_to_files(
    track_ids: list[int], music_dir: str = PROCESSED_MUSIC_DIR, session=None
) -> dict:
    """Sync each track id's columns to its file; returns per-id results.

    Each id maps to a dict with a ``status`` (``DBUpdateType`` value) plus the
    ``changes`` written or the ``error`` encountered. Failures roll back the
    current track's database changes and do not block the remaining ids.
    """
    owns_session = session is None
    active_session = session if session is not None else database.create_session()
    results = {}

    try:
        for track_id in track_ids:
            track = active_session.query(Track).filter_by(id=track_id).first()
            if track is None:
                results[track_id] = {
                    "status": DBUpdateType.FAILURE.value,
                    "error": "no track row with id %s" % track_id,
                }
                continue

            try:
                changes = sync_track_to_file(track, music_dir)
                active_session.commit()
                results[track_id] = {
                    "status": (
                        DBUpdateType.UPDATE.value
                        if changes
                        else DBUpdateType.NOOP.value
                    ),
                    "changes": changes,
                }
            except Exception as e:
                handle(e, "Failed to sync track %s to its file" % track_id)
                active_session.rollback()
                results[track_id] = {
                    "status": DBUpdateType.FAILURE.value,
                    "error": str(e),
                }
    finally:
        if owns_session:
            active_session.close()

    return results


def _parse_track_id(raw: str) -> int:
    try:
        return int(raw)
    except ValueError:
        raise ValueError("Invalid track id %r; ids must be integers" % raw) from None


def _rename_track_file(track: Track, source_path: str, changes: dict) -> str:
    """Rename the file to match the title column; returns the current path."""
    extension = splitext(source_path)[1]
    target_name = format_track_title(track.title) + extension
    if target_name == basename(source_path):
        return source_path

    target_path = join(dirname(source_path), target_name)
    if isfile(target_path):
        raise FileExistsError(
            "Cannot rename track %s: %s already exists" % (track.id, target_path)
        )

    rename(source_path, target_path)
    clear_audio_path_cache()
    track.file_name = target_name
    changes[TrackDBCols.FILE_NAME.value] = target_name
    return target_path


def _sync_comment(track: Track, current_path: str, changes: dict) -> None:
    """Rebuild the comment column and write it to the COMM tags, last.

    The file is reopened because a rename may have moved it after the other
    tags were saved. artists/remixers/date_added are not track columns, so
    they are preserved from the existing comment, falling back to the file's
    artist tags and creation time (mirroring ingestion-time metadata).
    """
    audio_file = AudioFile(basename(current_path), dirname(current_path))

    existing = load_comment(track.comment, "{}")
    if not isinstance(existing, dict):
        existing = {}

    artists = existing.get(ArtistFields.ARTISTS.value) or audio_file.get_tag(
        ID3Tag.ARTIST
    )
    remixers = existing.get(ArtistFields.REMIXERS.value) or audio_file.get_tag(
        ID3Tag.REMIXER
    )
    date_added = existing.get(TrackDBCols.DATE_ADDED.value) or ctime(
        get_file_creation_time(current_path)
    )

    comment = build_comment(track, artists, remixers, date_added)
    if comment != track.comment:
        track.comment = comment
        changes[TrackDBCols.COMMENT.value] = comment

    comment_tags = set([ID3Tag.COMMENT.value]) | set(
        audio_file.get_synonym_values(ID3Tag.COMMENT.value).keys()
    )
    stale_tags = [t for t in comment_tags if audio_file.get_tag(t) != comment]
    if len(stale_tags) == 0:
        return

    for tag in stale_tags:
        audio_file.write_tag(tag, comment, save=False)
    audio_file.save_tags()
