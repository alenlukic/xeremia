"""End-to-end DB-to-file sync against real audio files and a mock DB session.

The files in ``test_data`` are tag-only ID3 stubs with no audio frames, which
``mutagen.File`` cannot load. Each test therefore materializes the stub as a
valid AIFF container (the same soundfile-generation approach as
``test_id3._make_aiff``) carrying the stub's tags plus scenario seeds, while
keeping the stub's exact file name and extension.
"""

from __future__ import annotations

from ast import literal_eval
from decimal import Decimal
from pathlib import Path

import numpy as np
import soundfile as sf
from mutagen.aiff import AIFF
from mutagen.id3 import ID3, TBPM, TIT2, TKEY, TPE1, Frame

from src.data_management.config import DBUpdateType, TrackDBCols
from src.data_management.db_file_sync import sync_tracks_to_files
from src.models.track import Track

from tests.track_metadata.test_db_file_sync import _FakeSession, _make_track

TEST_DATA_DIR = Path(__file__).resolve().parent / "test_data"
MP3_STUB = "[01A - Abm - 086.00] Cell - Traffic (Live).mp3"
AIFF_STUB = "[01A - Abm - 110.00] Nova ft. AES Dana - Kalaallit Nunaat.aiff"


def _materialize_stub(
    tmp_path: Path, stub_name: str, seed_frames: list[Frame]
) -> Path:
    stub_tags = ID3(TEST_DATA_DIR / stub_name)

    target = tmp_path / stub_name
    sf.write(
        str(target),
        np.zeros((4410, 1), dtype=np.float32),
        44100,
        format="AIFF",
        subtype="PCM_16",
    )

    container = AIFF(str(target))
    container.add_tags()
    for frame in list(stub_tags.values()) + seed_frames:
        container.tags.add(frame)
    container.save()
    return target


def _nova_seed_frames() -> list[Frame]:
    return [
        TIT2(text=["[01A - Abm - 110.00] Nova ft. AES Dana - Kalaallit Nunaat"]),
        TPE1(text=["Nova ft. AES Dana"]),
        TBPM(text=["110"]),
        TKEY(text=["Abm"]),
    ]


def _nova_track(**overrides) -> Track:
    values = {
        "id": 9401,
        "file_name": AIFF_STUB,
        "title": "[01A - Abm - 110.00] Nova ft. AES Dana - Kalaallit Nunaat",
        "bpm": Decimal("110.00"),
        "key": "Abm",
        "camelot_code": "01A",
        "energy": 6,
        "genre": "Ambient",
        "label": "Ultimae Records",
        "comment": None,
    }
    values.update(overrides)
    return _make_track(**values)


def test_sync_writes_tags_renames_file_and_builds_comment(tmp_path):
    _materialize_stub(tmp_path, AIFF_STUB, _nova_seed_frames())
    new_title = "[01A - Abm - 110.00] Nova ft. AES Dana - Kalaallit Nunaat (Remaster)"
    track = _nova_track(title=new_title)
    session = _FakeSession([track])

    results = sync_tracks_to_files([9401], music_dir=str(tmp_path), session=session)

    assert results[9401]["status"] == DBUpdateType.UPDATE.value
    assert session.commits == 1

    # File renamed from the title column, extension preserved, column updated
    renamed = tmp_path / (new_title + ".aiff")
    assert renamed.is_file()
    assert not (tmp_path / AIFF_STUB).exists()
    assert track.file_name == renamed.name

    # Columns written to their ID3 tags
    tags = AIFF(str(renamed)).tags
    assert tags["TIT2"].text[0] == new_title
    assert tags["TCON"].text[0] == "Ambient"
    assert tags["TPUB"].text[0] == "Ultimae Records"
    assert tags["TXXX:EnergyLevel"].text[0] == "6"
    assert tags["TBPM"].text[0] == "110"
    assert tags["TKEY"].text[0] == "Abm"

    # Comment column added (was null) and mirrored into the COMM tag
    parsed = literal_eval(track.comment)
    assert parsed["artists"] == "Nova ft. AES Dana"
    assert parsed["file_name"] == renamed.name
    assert parsed["title"] == new_title
    assert parsed["bpm"] == 110.0
    assert parsed["energy"] == 6
    assert parsed["date_added"]

    comm_frames = [f for f in tags.values() if f.FrameID == "COMM"]
    assert comm_frames
    assert all(f.text[0] == track.comment for f in comm_frames)

    changes = results[9401]["changes"]
    assert list(changes.keys())[-1] == TrackDBCols.COMMENT.value


def test_sync_without_title_change_keeps_file_name_and_extension(tmp_path):
    _materialize_stub(
        tmp_path,
        MP3_STUB,
        [
            TIT2(text=["[01A - Abm - 086.00] Cell - Traffic (Live)"]),
            TPE1(text=["Cell"]),
            TBPM(text=["86"]),
            TKEY(text=["Abm"]),
        ],
    )
    track = _make_track(
        id=9402,
        file_name=MP3_STUB,
        title="[01A - Abm - 086.00] Cell - Traffic (Live)",
        bpm=Decimal("86.00"),
        key="Abm",
        camelot_code="01A",
        energy=None,
        genre="Psychill",
        label=None,
        comment=None,
    )
    session = _FakeSession([track])

    results = sync_tracks_to_files([9402], music_dir=str(tmp_path), session=session)

    assert results[9402]["status"] == DBUpdateType.UPDATE.value
    assert (tmp_path / MP3_STUB).is_file()
    assert track.file_name == MP3_STUB

    tags = AIFF(str(tmp_path / MP3_STUB)).tags
    assert tags["TCON"].text[0] == "Psychill"
    assert "TXXX:EnergyLevel" not in tags
    assert "genre" in results[9402]["changes"]
    assert "file_name" not in results[9402]["changes"]


def test_sync_is_idempotent(tmp_path):
    _materialize_stub(tmp_path, AIFF_STUB, _nova_seed_frames())
    track = _nova_track()
    session = _FakeSession([track])

    first = sync_tracks_to_files([9401], music_dir=str(tmp_path), session=session)
    second = sync_tracks_to_files([9401], music_dir=str(tmp_path), session=session)

    assert first[9401]["status"] == DBUpdateType.UPDATE.value
    assert second[9401] == {"status": DBUpdateType.NOOP.value, "changes": {}}


def test_sync_replaces_special_characters_in_file_name_only(tmp_path):
    _materialize_stub(tmp_path, AIFF_STUB, _nova_seed_frames())
    special_title = "[01A - Abm - 110.00] Nova ft. AES Dana - Kalaallit/Nunaat?"
    track = _nova_track(title=special_title)
    session = _FakeSession([track])

    sync_tracks_to_files([9401], music_dir=str(tmp_path), session=session)

    sanitized = "[01A - Abm - 110.00] Nova ft. AES Dana - Kalaallit_Nunaat_.aiff"
    assert (tmp_path / sanitized).is_file()
    assert track.file_name == sanitized
    assert AIFF(str(tmp_path / sanitized)).tags["TIT2"].text[0] == special_title


def test_sync_preserves_existing_comment_provenance_fields(tmp_path):
    _materialize_stub(tmp_path, AIFF_STUB, _nova_seed_frames())
    existing_comment = str(
        {
            "artists": "Original Artist",
            "remixers": "Original Remixer",
            "file_name": AIFF_STUB,
            "date_added": "Wed Apr 15 15:59:11 2026",
        }
    )
    track = _nova_track(label="Ultimae", comment=existing_comment)
    session = _FakeSession([track])

    sync_tracks_to_files([9401], music_dir=str(tmp_path), session=session)

    parsed = literal_eval(track.comment)
    assert parsed["artists"] == "Original Artist"
    assert parsed["remixers"] == "Original Remixer"
    assert parsed["date_added"] == "Wed Apr 15 15:59:11 2026"
    assert parsed["label"] == "Ultimae"


def test_sync_missing_file_fails_and_rolls_back(tmp_path):
    track = _nova_track(file_name="does-not-exist.aiff")
    session = _FakeSession([track])

    results = sync_tracks_to_files([9401], music_dir=str(tmp_path), session=session)

    assert results[9401]["status"] == DBUpdateType.FAILURE.value
    assert "No audio file found" in results[9401]["error"]
    assert session.rollbacks == 1
    assert session.commits == 0
