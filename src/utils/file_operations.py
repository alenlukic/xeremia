from os import listdir, makedirs, remove, stat as osstat
from os.path import dirname, isfile, join, splitext
from shutil import copyfile

from src.config import IS_UNIX, PROCESSED_MUSIC_DIR
from src.utils.audio_path import clear_audio_path_cache, resolve_audio_path
from src.utils.common import join_config_paths

AUDIO_TYPES = {".mp3", ".wav", ".flac", ".ogg", ".aif", ".aiff", ".m3u"}
FILE_STAGING_DIR = join_config_paths([["DATA", "ROOT"], ["DATA", "FILE_STAGING_DIR"]])


def delete_track_files(track, track_directory=PROCESSED_MUSIC_DIR):
    file_name = track.file_name
    file_path = resolve_audio_path(track_directory, file_name)
    if file_path is not None:
        remove(file_path)
        clear_audio_path_cache()

    if FILE_STAGING_DIR is None:
        return

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


def get_track_load_path(track):
    source_path = _source_audio_path(track.file_name)
    if FILE_STAGING_DIR is None:
        return source_path

    staged_path = join(FILE_STAGING_DIR, track.file_name)
    if isfile(staged_path):
        return staged_path

    return staged_path if _copy_to_staging(source_path, staged_path) else source_path


def stage_tracks(tracks):
    if FILE_STAGING_DIR is None:
        return

    for track in tracks:
        staged_path = join(FILE_STAGING_DIR, track.file_name)
        if isfile(staged_path):
            continue
        _copy_to_staging(_source_audio_path(track.file_name), staged_path)


def _source_audio_path(track_name):
    return resolve_audio_path(PROCESSED_MUSIC_DIR, track_name) or join(
        PROCESSED_MUSIC_DIR, track_name
    )


def _copy_to_staging(source_path, staged_path):
    try:
        parent_directory = dirname(staged_path)
        if parent_directory:
            makedirs(parent_directory, exist_ok=True)
        copyfile(source_path, staged_path)
    except OSError:
        return False
    return True
