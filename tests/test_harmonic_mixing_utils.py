from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from mutagen import MutagenError

from src.data_management.config import ArtistFields, TrackDBCols
from src.harmonic_mixing.config import CollectionStat
from src.harmonic_mixing.utils import generate_camelot_map


def _make_track(comment=None):
    return SimpleNamespace(
        id=1,
        file_name="missing-track.aiff",
        comment=comment,
        title="Missing Track",
        bpm=128.0,
        key="Gm",
        camelot_code="06A",
        label="Test Label",
        genre="Progressive House",
        energy=7,
        date_added=datetime(2024, 1, 1, 12, 0, 0).ctime(),
    )


class TestGenerateCamelotMap:
    def test_ignores_missing_audio_file_when_comment_missing(self):
        track = _make_track(comment=None)

        with patch(
            "src.harmonic_mixing.utils.AudioFile",
            side_effect=MutagenError("[Errno 2] No such file or directory"),
        ) as audio_file:
            camelot_map, collection_md = generate_camelot_map([track])

        audio_file.assert_called_once_with(track.file_name)

        track_md = camelot_map["06A"][128.0][0]
        assert track_md[TrackDBCols.ID] == track.id
        assert track_md[TrackDBCols.TITLE] == track.title
        assert ArtistFields.ARTISTS not in track_md
        assert ArtistFields.REMIXERS not in track_md
        assert collection_md[CollectionStat.LABEL_COUNTS] == 1
        assert collection_md[CollectionStat.ARTIST_COUNTS] == 0

    def test_uses_audio_comment_fallback_when_available(self):
        track = _make_track(comment=None)
        comment = "{'artists': 'Artist A', 'remixers': 'Remixer B'}"

        with patch("src.harmonic_mixing.utils.AudioFile") as audio_file:
            audio_file.return_value.get_metadata.return_value = {
                TrackDBCols.COMMENT.value: comment
            }
            camelot_map, collection_md = generate_camelot_map([track])

        track_md = camelot_map["06A"][128.0][0]
        assert track_md[ArtistFields.ARTISTS] == {"Artist A": 1}
        assert track_md[ArtistFields.REMIXERS] == {"Remixer B": 1}
        assert collection_md[CollectionStat.ARTIST_COUNTS] == 2
