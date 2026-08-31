from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
import soundfile as sf
from mutagen.aiff import AIFF
from mutagen.id3 import ID3

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.tags import read_existing_metadata, write_tags

TEST_DATA_DIR = Path(__file__).resolve().parent / "test_data"


def _copy_sample(tmp_path: Path, filename: str) -> Path:
    source = TEST_DATA_DIR / filename
    destination = tmp_path / filename
    shutil.copy2(source, destination)
    return destination


def _make_aiff(path: Path) -> Path:
    sf.write(
        str(path),
        np.zeros((4410, 2), dtype=np.float32),
        44100,
        format="AIFF",
        subtype="PCM_24",
    )
    return path


def test_read_existing_metadata_round_trip(tmp_path):
    audio_path = _copy_sample(
        tmp_path, "[01A - Abm - 086.00] Cell - Traffic (Live).mp3"
    )
    expected = SimpleMetadata(
        title="Traffic (Live)",
        artist="Cell",
        album="Live Sessions",
        label="Ultimae Records",
        genre="Electronic",
        year=2024,
        bpm=86.0,
        key="Abm",
    )
    write_tags(audio_path, expected)

    loaded = read_existing_metadata(audio_path)

    assert loaded.to_dict() == expected.to_dict()


def test_write_tags_preserves_existing_album(tmp_path):
    audio_path = _make_aiff(tmp_path / "existing-album.aiff")
    write_tags(
        audio_path,
        SimpleMetadata(
            title="Old Title",
            artist="Old Artist",
            album="Existing Album",
        ),
    )

    write_tags(audio_path, SimpleMetadata(title="New Title", artist="New Artist"))

    updated = read_existing_metadata(audio_path)
    assert updated.album == "Existing Album"
    assert updated.title == "New Title"
    assert updated.artist == "New Artist"


def test_write_and_read_remixer(tmp_path):
    audio_path = _copy_sample(
        tmp_path, "[01A - Abm - 086.00] Cell - Traffic (Live).mp3"
    )
    metadata = SimpleMetadata(
        title="Traffic (Live)", artist="Cell", remixer="Example Remixer"
    )

    write_tags(audio_path, metadata)
    loaded = read_existing_metadata(audio_path)

    assert loaded.remixer == "Example Remixer"
    assert loaded.title == metadata.title
    assert loaded.artist == metadata.artist


def test_write_tags_handles_numeric_fields(tmp_path):
    audio_path = _copy_sample(
        tmp_path, "[01A - Abm - 086.00] Cell - Traffic (Live).mp3"
    )
    metadata = SimpleMetadata(
        title="Track Title",
        artist="Artist",
        label="Label",
        genre="Genre",
        year=2025,
        bpm=128.5,
        key="G#m",
    )

    write_tags(audio_path, metadata)
    tags = ID3(audio_path)

    assert str(tags["TDRC"].text[0]).startswith("2025")
    assert float(tags["TBPM"].text[0]) == metadata.bpm
    assert tags["TKEY"].text[0] == metadata.key


def test_read_existing_metadata_aiff(tmp_path):
    audio_path = _make_aiff(tmp_path / "title-artist.aif")
    write_tags(audio_path, SimpleMetadata(title="Title A", artist="Artist A"))

    loaded = read_existing_metadata(audio_path)

    assert loaded.title == "Title A"
    assert loaded.artist == "Artist A"


def test_write_tags_round_trip_aiff(tmp_path):
    audio_path = _make_aiff(tmp_path / "round-trip.aiff")
    metadata = SimpleMetadata(
        title="Kalaallit Nunaat",
        artist="Nova ft. AES Dana",
        album="Single",
        label="Ultimae",
        genre="Ambient",
        year=2025,
        bpm=110.0,
        key="Abm",
    )

    write_tags(audio_path, metadata)
    container = AIFF(audio_path)
    loaded = read_existing_metadata(audio_path)

    assert audio_path.read_bytes()[:4] == b"FORM"
    assert container.tags is not None
    assert container.tags["TIT2"].text[0] == metadata.title
    assert container.tags["TPE1"].text[0] == metadata.artist
    assert loaded.to_dict() == metadata.to_dict()


def test_generate_metadata_genre(monkeypatch, tmp_path):
    from src.data_management.audio_file import AudioFile

    audio = AudioFile.__new__(AudioFile)
    audio.file_name = "track.mp3"
    audio.full_path = str(tmp_path / "track.mp3")

    def fake_tag(tag, default=""):
        tag_key = getattr(tag, "value", tag)
        values = {
            "TCON": "Chill House",
            "TIT2": "Title",
            "TBPM": "128",
            "TKEY": "Am",
            "TPUB": "Label",
        }
        return values.get(tag_key, default)

    monkeypatch.setattr(audio, "get_tag", fake_tag)
    monkeypatch.setattr(audio, "format_bpm", lambda: "128")
    monkeypatch.setattr(audio, "format_key", lambda: "Am")
    monkeypatch.setattr(audio, "generate_title", lambda *_args, **_kwargs: "Title")
    monkeypatch.setattr(audio, "parse_energy", lambda: None)
    monkeypatch.setattr(
        "src.data_management.audio_file.get_file_creation_time", lambda _path: 0
    )
    monkeypatch.setattr(audio, "generate_comment", lambda _metadata: {})

    off_vocab = audio.generate_metadata()
    assert "genre" not in off_vocab

    def psy_tag(tag, default=""):
        tag_key = getattr(tag, "value", tag)
        if tag_key == "TCON":
            return "Psy-Trance"
        return fake_tag(tag, default)

    monkeypatch.setattr(audio, "get_tag", psy_tag)
    with_genre = audio.generate_metadata()
    assert with_genre["genre"] == "Psytrance"
