from os import listdir, remove, stat as osstat
from os.path import isfile, join, splitext
from shutil import copyfile

from src.config import IS_UNIX, PROCESSED_MUSIC_DIR
from src.utils.common import join_config_paths

AUDIO_TYPES = {".mp3", ".wav", ".flac", ".ogg", ".aif", ".aiff", ".m3u"}
FILE_STAGING_DIR = join_config_paths([["DATA", "ROOT"], ["DATA", "FILE_STAGING_DIR"]])


def delete_track_files(track, track_directory=PROCESSED_MUSIC_DIR):
    file_name = track.file_name
    file_path = join(track_directory, file_name)

    if isfile(file_path):
        remove(file_path)

    staging_path = join(FILE_STAGING_DIR, file_name)
    if isfile(staging_path):
        remove(staging_path)


def get_audio_files(input_dir=PROCESSED_MUSIC_DIR):
    return [
        f
        for f in listdir(input_dir)
        if isfile(join(input_dir, f)) and splitext(f)[-1].lower() in AUDIO_TYPES
    ]


def get_flac_files(input_dir):
    return [
        f
        for f in listdir(input_dir)
        if isfile(join(input_dir, f)) and splitext(f)[-1].lower() == ".flac"
    ]


def get_lossless_files(input_dir):
    lossless_exts = {".flac", ".wav"}
    return [
        f
        for f in listdir(input_dir)
        if isfile(join(input_dir, f)) and splitext(f)[-1].lower() in lossless_exts
    ]


def get_file_creation_time(full_path):
    file_stat = osstat(full_path)
    if IS_UNIX:
        return getattr(file_stat, "st_birthtime", file_stat.st_ctime)
    return file_stat.st_ctime


def _resolve_on_disk(track_name):
    """Return an on-disk path for ``track_name``, falling back to the readdir
    resolver when the direct path's ``stat`` is flaky on the SMB volume.

    Returns the direct joined path (which may not exist) when no readdir
    match is found, so the caller gets a normal ``FileNotFoundError`` rather
    than a silent skip.
    """
    direct = join(PROCESSED_MUSIC_DIR, track_name)
    if isfile(direct):
        return direct
    from src.utils.audio_path import resolve_audio_path

    resolved = resolve_audio_path(PROCESSED_MUSIC_DIR, track_name)
    return resolved if resolved is not None else direct


def get_track_load_path(track):
    file_path = _resolve_on_disk(track.file_name)

    if FILE_STAGING_DIR is None:
        return file_path

    if not isfile(file_path):
        stage_tracks([track])

    return join(FILE_STAGING_DIR, file_path)


def stage_tracks(tracks):
    if FILE_STAGING_DIR is None:
        return

    for track_name in [t.file_name for t in tracks]:
        file_path = _resolve_on_disk(track_name)
        if not isfile(file_path):
            continue

        staged_path = join(FILE_STAGING_DIR, track_name)
        if isfile(staged_path):
            continue

        try:
            copyfile(file_path, staged_path)
        except OSError:
            # Staging is a performance optimization, not a correctness
            # requirement; a read/copy failure here just means the caller
            # will read from the source path directly.
            pass
