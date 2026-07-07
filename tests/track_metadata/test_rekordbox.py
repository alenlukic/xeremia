from __future__ import annotations

from pathlib import Path

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.rekordbox import RekordboxMetadataIndex


def _write_tsv(path: Path, rows: list[str]) -> None:
    content = "\t".join(["#", "Track Title", "BPM", "Key", "Time"]) + "\r\n"
    content += "\r\n".join(rows) + "\r\n"
    path.write_text(content, encoding="utf-16")


def test_rekordbox_index_reads_utf16_and_canonicalizes_camelot_key(tmp_path):
    path = tmp_path / "rekordbox.tsv"
    _write_tsv(path, ["1\tLemuria (Extended Mix)\t139.99\t4A\t06:00"])

    index = RekordboxMetadataIndex.from_tsv(path)

    assert len(index.rows) == 1
    assert index.rows[0].bpm == 139.99
    assert index.rows[0].key == "Fm"


def test_rekordbox_index_matches_title_without_generic_mix_suffix(tmp_path):
    path = tmp_path / "rekordbox.tsv"
    _write_tsv(path, ["1\tClub Joy (Extended Mix)\t143.00\t5A\t04:32"])
    index = RekordboxMetadataIndex.from_tsv(path)

    match = index.match(
        source=Path("Some Artist - Club Joy.mp3"),
        metadata=SimpleMetadata(artist="Some Artist", title="Club Joy"),
    )

    assert match is not None
    assert match.title == "Club Joy (Extended Mix)"
    assert match.bpm == 143.0
    assert match.key == "Cm"


def test_rekordbox_index_matches_rows_that_include_artist_in_track_title(tmp_path):
    path = tmp_path / "rekordbox.tsv"
    _write_tsv(path, ["1\tOSLO - PAPI\t162.00\t1A\t03:45"])
    index = RekordboxMetadataIndex.from_tsv(path)

    match = index.match(
        source=Path("OSLO - PAPI.aiff"),
        metadata=SimpleMetadata(artist="OSLO", title="PAPI"),
    )

    assert match is not None
    assert match.bpm == 162.0
    assert match.key == "Abm"


def test_rekordbox_index_refuses_ambiguous_title_only_match(tmp_path):
    path = tmp_path / "rekordbox.tsv"
    _write_tsv(
        path,
        [
            "1\tIntro\t120.00\t8A\t01:00",
            "2\tIntro\t130.00\t9A\t01:00",
        ],
    )
    index = RekordboxMetadataIndex.from_tsv(path)

    match = index.match(
        source=Path("Artist - Intro.mp3"),
        metadata=SimpleMetadata(artist="Artist", title="Intro"),
    )

    assert match is None
