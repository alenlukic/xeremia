from __future__ import annotations

import json

import numpy as np
import pytest
import soundfile as sf

from src.track_metadata.utils import (
    convert_wav_to_aiff,
    copy_to_converted,
    discover_new_audio_files,
    ensure_directories,
    log_agent_response,
    move_to_augmented,
    move_to_remediation,
    rename_file,
    reset_processing_dir,
    sanitize_filename,
    stage_file,
)


def test_ensure_and_reset_processing_dir(tmp_path):
    download_dir = tmp_path / "downloads"
    processing_dir = tmp_path / "processing"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(download_dir, processing_dir, augmented_dir)

    (processing_dir / "temp.txt").write_text("data", encoding="utf-8")
    (processing_dir / "nested").mkdir()
    (processing_dir / "nested" / "item.txt").write_text("more", encoding="utf-8")

    reset_processing_dir(processing_dir)

    assert list(processing_dir.iterdir()) == []


def test_stage_and_copy_to_converted(tmp_path):
    download_dir = tmp_path / "downloads"
    processing_dir = tmp_path / "processing"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(download_dir, processing_dir, augmented_dir)

    source = download_dir / "sample.mp3"
    source.write_text("content", encoding="utf-8")

    staged = stage_file(source, processing_dir)
    copied = copy_to_converted(staged, augmented_dir)

    assert staged.read_text(encoding="utf-8") == "content"
    assert copied.read_text(encoding="utf-8") == "content"
    assert copied.name == staged.name


def test_copy_to_converted_preserves_original_name(tmp_path):
    processing_dir = tmp_path / "processing"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(tmp_path / "downloads", processing_dir, augmented_dir)

    renamed = processing_dir / "renamed.mp3"
    renamed.write_text("audio", encoding="utf-8")

    copied = copy_to_converted(
        renamed, augmented_dir, original_name="original name.mp3"
    )

    assert copied.exists()
    assert copied.name == "original name.mp3"


def test_move_helpers_copy_to_expected_destinations(tmp_path):
    processing_dir = tmp_path / "processing"
    augmented_dir = tmp_path / "augmented"
    remediation_dir = tmp_path / "remediation"
    ensure_directories(
        tmp_path / "downloads", processing_dir, augmented_dir, remediation_dir
    )

    source = processing_dir / "track.mp3"
    source.write_text("audio", encoding="utf-8")

    augmented_copy = move_to_augmented(source, augmented_dir=augmented_dir)
    remediation_copy = move_to_remediation(source, remediation_dir=remediation_dir)

    assert augmented_copy.exists()
    assert remediation_copy.exists()


def test_sanitize_and_rename_file(tmp_path):
    processing_dir = tmp_path / "processing"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(tmp_path / "downloads", processing_dir, augmented_dir)

    source = processing_dir / "file?.mp3"
    source.write_text("audio", encoding="utf-8")

    cleaned = sanitize_filename("A?Title*")
    assert "?" not in cleaned
    assert "*" not in cleaned

    key_title = sanitize_filename("[12A - C#m - 128.00] Artist - Track")
    assert "#" in key_title
    assert "C#m" in key_title

    renamed = rename_file(source, "An Artist", "A / Title")

    assert renamed.exists()
    assert "?" not in renamed.name
    assert renamed.name.startswith("An Artist - A Title")


def test_rename_file_supports_metadata_first_title_only(tmp_path):
    processing_dir = tmp_path / "processing"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(tmp_path / "downloads", processing_dir, augmented_dir)

    source = processing_dir / "old.mp3"
    source.write_text("audio", encoding="utf-8")

    renamed = rename_file(source, "[06A - Gm - 151.00] Linds - Sunset Funk [MASTER v2]")

    assert renamed.exists()
    assert renamed.name == "[06A - Gm - 151.00] Linds - Sunset Funk [MASTER v2].mp3"


def test_rename_file_avoids_name_collisions(tmp_path):
    processing_dir = tmp_path / "processing"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(tmp_path / "downloads", processing_dir, augmented_dir)

    source = processing_dir / "track.mp3"
    source.write_text("audio", encoding="utf-8")
    existing = processing_dir / "[06A - Gm - 151.00] Linds - Sunset Funk.mp3"
    existing.write_text("existing", encoding="utf-8")

    renamed = rename_file(source, "[06A - Gm - 151.00] Linds - Sunset Funk")

    assert renamed.exists()
    assert renamed.name == "[06A - Gm - 151.00] Linds - Sunset Funk (1).mp3"


def test_log_agent_response(tmp_path):
    log_path = tmp_path / "logs" / "session.log"

    log_agent_response(
        file_name="track.mp3",
        raw_text='{"title": "Example"}',
        messages=[{"role": "user", "content": "Test"}],
        log_file_path=log_path,
    )

    assert log_path.exists()
    entry = json.loads(log_path.read_text(encoding="utf-8").splitlines()[0])
    assert entry["file"] == "track.mp3"
    assert entry["raw_response"] == '{"title": "Example"}'


def test_discover_new_audio_files_skips_existing_augmented(tmp_path):
    download_dir = tmp_path / "downloads"
    processing_dir = tmp_path / "processing"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(download_dir, processing_dir, augmented_dir)

    in_downloads = download_dir / "track1.mp3"
    in_downloads.write_text("a", encoding="utf-8")
    also_in_downloads = download_dir / "track2.mp3"
    also_in_downloads.write_text("b", encoding="utf-8")

    already_augmented = augmented_dir / in_downloads.name
    already_augmented.write_text("a-augmented", encoding="utf-8")

    discovered = discover_new_audio_files(
        download_dir=download_dir, augmented_dir=augmented_dir
    )

    assert also_in_downloads in discovered
    assert in_downloads not in discovered


# ---------------------------------------------------------------------------
# WAV conversion tests
# ---------------------------------------------------------------------------


def _make_wav(path, samplerate=44100, channels=2, duration_frames=4410):
    data = np.zeros((duration_frames, channels), dtype=np.float32)
    sf.write(str(path), data, samplerate)


def test_convert_wav_to_aiff(tmp_path):
    wav_path = tmp_path / "test.wav"
    _make_wav(wav_path)

    result = convert_wav_to_aiff(wav_path)

    assert result.suffix == ".aiff"
    assert result.exists()
    assert not wav_path.exists()

    converted_info = sf.info(str(result))
    assert converted_info.samplerate == 44100
    assert converted_info.channels == 2


def test_convert_wav_to_aiff_preserves_subtype(tmp_path):
    wav_path = tmp_path / "pcm24.wav"
    data = np.zeros((4410, 1), dtype=np.float32)
    sf.write(str(wav_path), data, 48000, subtype="PCM_24")

    result = convert_wav_to_aiff(wav_path)

    converted_info = sf.info(str(result))
    assert converted_info.subtype == "PCM_24"
    assert converted_info.samplerate == 48000


def test_convert_wav_to_aiff_invalid_file(tmp_path):
    bad_wav = tmp_path / "bad.wav"
    bad_wav.write_text("not audio data", encoding="utf-8")

    with pytest.raises(sf.LibsndfileError):
        convert_wav_to_aiff(bad_wav)

    assert bad_wav.exists(), "Original file should remain on failure"


def test_discover_includes_wav_files(tmp_path):
    download_dir = tmp_path / "downloads"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(download_dir, tmp_path / "processing", augmented_dir)

    mp3_file = download_dir / "track.mp3"
    mp3_file.write_text("mp3", encoding="utf-8")
    wav_file = download_dir / "track2.wav"
    wav_file.write_text("wav", encoding="utf-8")

    discovered = discover_new_audio_files(
        download_dir=download_dir, augmented_dir=augmented_dir
    )

    assert mp3_file in discovered
    assert wav_file in discovered


def test_discover_skips_wav_with_aiff_equivalent_in_augmented(tmp_path):
    download_dir = tmp_path / "downloads"
    augmented_dir = tmp_path / "augmented"
    ensure_directories(download_dir, tmp_path / "processing", augmented_dir)

    wav_file = download_dir / "track.wav"
    wav_file.write_text("wav", encoding="utf-8")
    (augmented_dir / "track.aiff").write_text("already converted", encoding="utf-8")

    discovered = discover_new_audio_files(
        download_dir=download_dir, augmented_dir=augmented_dir
    )

    assert wav_file not in discovered


def test_convert_float_wav_to_aiff_uses_pcm24(tmp_path):
    """FLOAT WAV must produce PCM_24 AIFF (not AIFF-C FLOAT) for Windows 11 compat."""
    wav_path = tmp_path / "float.wav"
    data = np.zeros((4410, 2), dtype=np.float32)
    sf.write(str(wav_path), data, 44100, subtype="FLOAT")

    result = convert_wav_to_aiff(wav_path)

    converted_info = sf.info(str(result))
    assert converted_info.subtype == "PCM_24"
    assert converted_info.samplerate == 44100
    assert converted_info.channels == 2
