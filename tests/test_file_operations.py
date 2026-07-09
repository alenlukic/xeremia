"""Tests for loading and staging audio files."""

from types import SimpleNamespace
import unicodedata
from unittest.mock import patch

from src.utils import file_operations


def test_get_track_load_path_uses_resolved_source_without_staging(tmp_path):
    stored_name = "Café.mp3"
    disk_name = unicodedata.normalize("NFD", stored_name)
    audio_path = tmp_path / disk_name
    audio_path.write_bytes(b"audio")
    track = SimpleNamespace(file_name=stored_name)

    with (
        patch.object(file_operations, "PROCESSED_MUSIC_DIR", str(tmp_path)),
        patch.object(file_operations, "FILE_STAGING_DIR", None),
    ):
        assert file_operations.get_track_load_path(track) == str(audio_path)


def test_get_track_load_path_returns_staged_copy(tmp_path):
    source_dir = tmp_path / "source"
    staging_dir = tmp_path / "staging"
    source_dir.mkdir()
    source_path = source_dir / "track.mp3"
    source_path.write_bytes(b"audio")
    track = SimpleNamespace(file_name="track.mp3")

    with (
        patch.object(file_operations, "PROCESSED_MUSIC_DIR", str(source_dir)),
        patch.object(file_operations, "FILE_STAGING_DIR", str(staging_dir)),
    ):
        load_path = file_operations.get_track_load_path(track)

    assert load_path == str(staging_dir / "track.mp3")
    assert (staging_dir / "track.mp3").read_bytes() == b"audio"


def test_get_track_load_path_falls_back_to_source_when_staging_fails(tmp_path):
    source_path = tmp_path / "track.mp3"
    source_path.write_bytes(b"audio")
    track = SimpleNamespace(file_name="track.mp3")

    with (
        patch.object(file_operations, "PROCESSED_MUSIC_DIR", str(tmp_path)),
        patch.object(file_operations, "FILE_STAGING_DIR", str(tmp_path / "staging")),
        patch.object(file_operations, "copyfile", side_effect=OSError("copy failed")),
    ):
        assert file_operations.get_track_load_path(track) == str(source_path)


def test_delete_track_files_invalidates_audio_path_cache(tmp_path):
    stored_name = "Café.mp3"
    disk_name = unicodedata.normalize("NFD", stored_name)
    audio_path = tmp_path / disk_name
    audio_path.write_bytes(b"audio")
    track = SimpleNamespace(file_name=stored_name)

    with patch.object(file_operations, "FILE_STAGING_DIR", None):
        assert file_operations.resolve_audio_path(tmp_path, stored_name) == str(
            audio_path
        )
        file_operations.delete_track_files(track, track_directory=str(tmp_path))

    replacement_stored_name = "Résumé.mp3"
    replacement_disk_name = unicodedata.normalize("NFD", replacement_stored_name)
    replacement_path = tmp_path / replacement_disk_name
    replacement_path.write_bytes(b"replacement")

    assert file_operations.resolve_audio_path(tmp_path, replacement_stored_name) == str(
        replacement_path
    )
