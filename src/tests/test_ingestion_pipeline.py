from unittest.mock import MagicMock, patch

import pytest

from src.ingestion_pipeline.config import TAG_COLUMNS
from src.ingestion_pipeline.tag_record_factory import (
    FinalRecordFactory,
    InitialRecordFactory,
    PostMIKRecordFactory,
    PostRBRecordFactory,
    TagRecordFactory,
)


def _make_record(**kwargs):
    rec = MagicMock()
    for k, v in kwargs.items():
        setattr(rec, k, v)
    return rec


def _build_factory(cls, *, extra_init_kwargs=None, record_type="InitialTagRecord"):
    """Instantiate a factory subclass with AudioFile and CONFIG stubbed out."""
    extra_init_kwargs = extra_init_kwargs or {}
    mock_audio = MagicMock()
    mock_audio.get_tag = MagicMock(side_effect=lambda tag: tag.name.lower())
    mock_audio.get_basename = MagicMock(return_value="track.mp3")
    mock_audio.parse_energy = MagicMock(return_value=7)

    with patch(
        "src.ingestion_pipeline.tag_record_factory.AudioFile", return_value=mock_audio
    ):
        factory = cls(
            record_type, "track.mp3", "/music", "trk-1", MagicMock(), **extra_init_kwargs
        )
    return factory


# --- Fix 1: TAG_COLUMNS no longer includes ENERGY ---

class TestTagColumns:
    def test_create_row_excludes_energy(self):
        factory = _build_factory(InitialRecordFactory)
        assert "energy" not in factory.row

    def test_create_row_includes_expected_columns(self):
        factory = _build_factory(InitialRecordFactory)
        for col in ("title", "bpm", "key", "track_id"):
            assert col in factory.row


# --- Fix 6: error message uses model class name ---

class TestDuplicateDetection:
    def test_create_tag_record_raises_on_duplicate(self):
        factory = _build_factory(InitialRecordFactory)
        factory.session.query.return_value.filter_by.return_value.first.return_value = (
            object()
        )
        with pytest.raises(Exception):
            factory.create_tag_record()

    def test_create_tag_record_error_message_uses_class_name(self):
        factory = _build_factory(InitialRecordFactory)
        factory.session.query.return_value.filter_by.return_value.first.return_value = (
            object()
        )
        with pytest.raises(Exception, match="InitialTagRecord"):
            factory.create_tag_record()


# --- Fix 2: PostMIKRecordFactory adds energy ---

class TestPostMIKRecordFactory:
    def test_post_mik_update_row_adds_energy(self):
        factory = _build_factory(PostMIKRecordFactory, record_type="PostMIKTagRecord")
        assert "energy" not in factory.row
        factory.update_row()
        assert factory.row["energy"] == 7


# --- PostRBRecordFactory applies overrides ---

class TestPostRBRecordFactory:
    def test_post_rb_update_row_applies_overrides(self):
        overrides = {"track.mp3": {"bpm": "140", "key": "Am"}}
        factory = _build_factory(
            PostRBRecordFactory,
            record_type="PostRekordboxTagRecord",
            extra_init_kwargs={"rb_overrides": overrides},
        )
        factory.update_row()
        assert factory.row["bpm"] == "140"
        assert factory.row["key"] == "Am"


# --- Fix 3: _build_final_row returns a dict ---

class TestFinalRecordFactory:
    def test_final_build_final_row_returns_dict(self):
        factory = _build_factory(FinalRecordFactory, record_type="FinalTagRecord")

        initial = _make_record(title="Song", bpm="128", key="Am")
        mik = _make_record(bpm="128", key="Am", energy=6)
        rb = _make_record(bpm="128", key="Am")

        def _query_side_effect(model):
            from src.models import tag_record as tr

            mapping = {
                tr.InitialTagRecord: initial,
                tr.PostMIKTagRecord: mik,
                tr.PostRekordboxTagRecord: rb,
            }
            mock_q = MagicMock()
            mock_q.filter_by.return_value.first.return_value = mapping.get(model)
            return mock_q

        factory.session.query.side_effect = _query_side_effect
        result = factory._build_final_row("trk-1")

        assert isinstance(result, dict)
        for key in ("track_id", "title", "bpm", "key", "energy"):
            assert key in result


# --- Fix 4: _get_final_bpm guards ---

class TestGetFinalBpm:
    def test_get_final_bpm_majority(self):
        a = _make_record(bpm="128")
        b = _make_record(bpm="128")
        c = _make_record(bpm="130")
        assert FinalRecordFactory._get_final_bpm(a, b, c) == 128.0

    def test_get_final_bpm_empty_returns_none(self):
        a = _make_record(bpm=None)
        b = _make_record(bpm=None)
        c = _make_record(bpm=None)
        assert FinalRecordFactory._get_final_bpm(a, b, c) is None

    def test_get_final_bpm_no_rb_record_tie(self):
        a = _make_record(bpm="128")
        b = _make_record(bpm="130")
        assert FinalRecordFactory._get_final_bpm(a, b, None) is None


# --- Fix 5: _get_final_key guards ---

class TestGetFinalKey:
    def test_get_final_key_majority(self):
        a = _make_record(key="Am")
        b = _make_record(key="Am")
        c = _make_record(key="Cm")
        result = FinalRecordFactory._get_final_key(a, b, c)
        assert result is not None
        assert result.lower() == "am"

    def test_get_final_key_empty_returns_none(self):
        a = _make_record(key=None)
        b = _make_record(key=None)
        c = _make_record(key=None)
        assert FinalRecordFactory._get_final_key(a, b, c) is None


# --- Regression fix: write_tags guards None BPM ---

class TestWriteTagsNoneBpm:
    @patch("src.ingestion_pipeline.track_ingestion_pipeline.AudioFile")
    @patch("src.ingestion_pipeline.track_ingestion_pipeline.copyfile")
    def test_write_tags_skips_none_bpm(self, mock_copy, mock_audio_cls):
        from src.ingestion_pipeline.track_ingestion_pipeline import FinalPipelineStage

        mock_audio = MagicMock()
        mock_audio_cls.return_value = mock_audio

        stage = FinalPipelineStage.__new__(FinalPipelineStage)
        stage.source_dir = "/src"
        stage.target_dir = "/dst"

        tag_record = _make_record(bpm=None, key="Am")
        stage.write_tags({"track.mp3": tag_record})

        written_tags = mock_audio.write_tags.call_args[0][0]
        assert "bpm" not in written_tags
        assert written_tags.get("key") == "Am"
