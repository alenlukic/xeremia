"""Tests for robust audio-path resolution."""

import os
import unicodedata

import pytest

from src.utils import audio_path as audio_path_module
from src.utils.audio_path import clear_audio_path_cache, resolve_audio_path


@pytest.fixture(autouse=True)
def _clear_resolver_cache():
    clear_audio_path_cache()
    yield
    clear_audio_path_cache()


def test_returns_direct_existing_path(tmp_path):
    audio_path = tmp_path / "track.mp3"
    audio_path.write_bytes(b"audio")

    assert resolve_audio_path(tmp_path, "track.mp3") == str(audio_path)


def test_resolves_unicode_normalization_mismatch(tmp_path):
    stored_name = "Café.mp3"
    disk_name = unicodedata.normalize("NFD", stored_name)
    audio_path = tmp_path / disk_name
    audio_path.write_bytes(b"audio")

    assert resolve_audio_path(tmp_path, stored_name) == str(audio_path)


def test_resolves_file_inside_relative_subdirectory(tmp_path):
    album_dir = tmp_path / "Album"
    album_dir.mkdir()
    stored_basename = "Café.mp3"
    disk_basename = unicodedata.normalize("NFD", stored_basename)
    audio_path = album_dir / disk_basename
    audio_path.write_bytes(b"audio")

    assert resolve_audio_path(tmp_path, f"Album/{stored_basename}") == str(audio_path)


def test_resolves_historical_disk_substitutions(tmp_path):
    audio_path = tmp_path / "A_S_Y_S - Track_.mp3"
    audio_path.write_bytes(b"audio")

    assert resolve_audio_path(tmp_path, "A*S*Y*S - Track?.mp3") == str(audio_path)


def test_resolves_unique_question_mark_placeholder(tmp_path):
    audio_path = tmp_path / "Artist - Trück.mp3"
    audio_path.write_bytes(b"audio")

    assert resolve_audio_path(tmp_path, "Artist - Tr?ck.mp3") == str(audio_path)


def test_rejects_ambiguous_question_mark_placeholder(tmp_path):
    (tmp_path / "Artist - Track.mp3").write_bytes(b"one")
    (tmp_path / "Artist - Trick.mp3").write_bytes(b"two")

    assert resolve_audio_path(tmp_path, "Artist - Tr?ck.mp3") is None


def test_resolves_unique_legacy_control_character_prefix(tmp_path):
    audio_path = tmp_path / "Artist - Traçk.mp3"
    audio_path.write_bytes(b"audio")

    assert resolve_audio_path(tmp_path, "Artist - Tra\x80k.mp3") == str(audio_path)


def test_resolves_unique_legacy_prefix_at_first_uncertain_character(tmp_path):
    audio_path = tmp_path / "AB_rest.mp3"
    audio_path.write_bytes(b"audio")

    assert resolve_audio_path(tmp_path, "AB?cd\x80ef.mp3") == str(audio_path)
    clear_audio_path_cache()
    assert resolve_audio_path(tmp_path, "AB\x80cd?ef.mp3") == str(audio_path)


def test_rejects_placeholder_at_start_without_a_safe_prefix(tmp_path):
    (tmp_path / "Xtrack.mp3").write_bytes(b"audio")

    assert resolve_audio_path(tmp_path, "?track.mp3") is None


def test_rejects_ambiguous_casefold_match(tmp_path):
    upper = tmp_path / "Song.mp3"
    lower = tmp_path / "song.mp3"
    upper.write_bytes(b"one")
    try:
        lower.write_bytes(b"two")
    except OSError:
        pytest.skip("filesystem is case-insensitive")

    if os.path.samefile(upper, lower):
        pytest.skip("filesystem is case-insensitive")

    assert resolve_audio_path(tmp_path, "SONG.mp3") is None


def test_index_cache_is_bounded_and_evicts_oldest(tmp_path, monkeypatch):
    monkeypatch.setattr(audio_path_module, "_INDEX_CACHE_MAX", 3)

    directories = []
    for i in range(6):
        directory = tmp_path / f"dir{i}"
        directory.mkdir()
        (directory / f"track{i}.mp3").write_bytes(b"audio")
        directories.append(directory)
        assert resolve_audio_path(directory, f"track{i}.mp3") is not None

    cache = audio_path_module._INDEX_CACHE
    assert len(cache) == 3
    # Oldest three directories were evicted; the three most recent remain.
    remaining = {os.path.abspath(str(directories[i])) for i in (3, 4, 5)}
    assert set(cache.keys()) == remaining


def test_index_cache_hit_refreshes_lru_position(tmp_path, monkeypatch):
    monkeypatch.setattr(audio_path_module, "_INDEX_CACHE_MAX", 2)

    dirs = []
    for i in range(2):
        directory = tmp_path / f"d{i}"
        directory.mkdir()
        (directory / f"t{i}.mp3").write_bytes(b"audio")
        dirs.append(directory)
        resolve_audio_path(directory, f"t{i}.mp3")

    # Touch the oldest entry so it is no longer the eviction candidate.
    resolve_audio_path(dirs[0], "t0.mp3")

    new_dir = tmp_path / "d2"
    new_dir.mkdir()
    (new_dir / "t2.mp3").write_bytes(b"audio")
    resolve_audio_path(new_dir, "t2.mp3")

    cache = audio_path_module._INDEX_CACHE
    assert len(cache) == 2
    assert os.path.abspath(str(dirs[0])) in cache
    assert os.path.abspath(str(dirs[1])) not in cache
