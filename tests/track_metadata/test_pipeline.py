from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.framework import PipelineContext, TrackStatus
from src.track_metadata.pipeline.report import RunReport
from src.track_metadata.pipeline.stages import build_default_pipeline


class _HydratorStub:
    def hydrate(
        self,
        _file_path: Path,
        existing: SimpleMetadata,
        *,
        agent_events=None,
    ) -> SimpleMetadata:
        data = existing.to_dict()
        data["artist"] = data.get("artist") or "Artist"
        data["title"] = data.get("title") or "Track"
        return SimpleMetadata.from_dict(data)

    def classify_free_download_genre(self, metadata: SimpleMetadata) -> str | None:
        return None


class _SessionStub:
    def close(self):
        return None


def test_pipeline_orchestrates_and_stays_deterministic(monkeypatch, tmp_path):
    source = tmp_path / "input.mp3"
    source.write_text("audio", encoding="utf-8")
    working = tmp_path / "working.mp3"
    working.write_text("audio", encoding="utf-8")

    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.stage_file", lambda _source: working
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.read_existing_metadata",
        lambda _path: SimpleMetadata(),
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.analyze_missing_audio_features",
        lambda _path, metadata, *_args: metadata.update({"bpm": 128.0, "key": "C#m"}),
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.write_tags", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.rename_file",
        lambda path, *_args, **_kwargs: path,
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.move_to_augmented",
        lambda path, **_kwargs: tmp_path / f"augmented-{path.name}",
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.upsert_track_records",
        lambda *_args, **_kwargs: {},
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.database.create_session",
        lambda: _SessionStub(),
    )

    report = RunReport()
    context = PipelineContext(
        hydrator=_HydratorStub(), run_report=report, agent=MagicMock()
    )
    pipeline = build_default_pipeline()
    pipeline.run([source], context)

    assert len(report.rows) == 1
    row = report.rows[0]
    assert row.status == TrackStatus.SUCCESS
    assert row.agent_events == []
    assert row.metadata.title == "[12A - C#m - 128.00] Artist - Track"


class _CruftHydratorStub:
    def hydrate(
        self,
        _file_path: Path,
        existing: SimpleMetadata,
        *,
        agent_events=None,
    ) -> SimpleMetadata:
        _ = agent_events
        data = existing.to_dict()
        data["artist"] = data.get("artist") or "Linds"
        data["title"] = data.get("title") or "Sunset Funk [MASTER v2] (Original Mix)"
        return SimpleMetadata.from_dict(data)

    def classify_free_download_genre(self, metadata: SimpleMetadata) -> str | None:
        return None


def test_pipeline_strips_cruft_from_display_title(monkeypatch, tmp_path):
    source = tmp_path / "input.mp3"
    source.write_text("audio", encoding="utf-8")
    working = tmp_path / "working.mp3"
    working.write_text("audio", encoding="utf-8")

    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.stage_file", lambda _source: working
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.read_existing_metadata",
        lambda _path: SimpleMetadata(),
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.analyze_missing_audio_features",
        lambda _path, metadata, *_args: metadata.update({"bpm": 151.0, "key": "Gm"}),
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.write_tags", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.rename_file",
        lambda path, *_args, **_kwargs: path,
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.move_to_augmented",
        lambda path, **_kwargs: path,
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.upsert_track_records",
        lambda *_args, **_kwargs: {},
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.database.create_session",
        lambda: _SessionStub(),
    )

    report = RunReport()
    context = PipelineContext(hydrator=_CruftHydratorStub(), run_report=report)
    build_default_pipeline().run([source], context)

    row = report.rows[0]
    assert row.metadata.title == "[06A - Gm - 151.00] Linds - Sunset Funk"


class _FallbackHydratorStub:
    def hydrate(
        self,
        file_path: Path,
        existing: SimpleMetadata,
        *,
        agent_events=None,
    ) -> SimpleMetadata:
        if agent_events is not None:
            agent_events.append(
                {
                    "type": "metadata_fallback",
                    "file": file_path.name,
                    "outcome": "resolved",
                    "missing_fields": ["title"],
                }
            )
        data = existing.to_dict()
        data["artist"] = data.get("artist") or "Artist"
        data["title"] = data.get("title") or "Resolved Track"
        return SimpleMetadata.from_dict(data)

    def classify_free_download_genre(self, metadata: SimpleMetadata) -> str | None:
        return None


def test_pipeline_records_fallback_agent_events(monkeypatch, tmp_path):
    source = tmp_path / "input.mp3"
    source.write_text("audio", encoding="utf-8")
    working = tmp_path / "working.mp3"
    working.write_text("audio", encoding="utf-8")

    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.stage_file", lambda _source: working
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.read_existing_metadata",
        lambda _path: SimpleMetadata(),
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.analyze_missing_audio_features",
        lambda _path, metadata, *_args: metadata.update({"bpm": 128.0, "key": "C#m"}),
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.write_tags", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.rename_file",
        lambda path, *_args, **_kwargs: path,
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.move_to_augmented",
        lambda path, **_kwargs: tmp_path / f"augmented-{path.name}",
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.upsert_track_records",
        lambda *_args, **_kwargs: {},
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.database.create_session",
        lambda: _SessionStub(),
    )

    report = RunReport()
    context = PipelineContext(
        hydrator=_FallbackHydratorStub(), run_report=report, agent=MagicMock()
    )
    pipeline = build_default_pipeline()
    pipeline.run([source], context)

    row = report.rows[0]
    assert len(row.agent_events) == 1
    assert row.agent_events[0]["type"] == "metadata_fallback"
    assert row.agent_events[0]["outcome"] == "resolved"
    assert row.agent_events[0]["file"] == working.name


def test_pipeline_batch_run_uses_single_shared_report(monkeypatch, tmp_path):
    source_one = tmp_path / "one.mp3"
    source_two = tmp_path / "two.mp3"
    source_one.write_text("audio", encoding="utf-8")
    source_two.write_text("audio", encoding="utf-8")

    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.stage_file", lambda source: source
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.read_existing_metadata",
        lambda _path: SimpleMetadata(),
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.analyze_missing_audio_features",
        lambda _path, metadata, *_args: metadata.update({"bpm": 128.0, "key": "C#m"}),
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.write_tags", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.rename_file",
        lambda path, *_args, **_kwargs: path,
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.move_to_augmented",
        lambda path, **_kwargs: path,
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.upsert_track_records",
        lambda *_args, **_kwargs: {},
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.database.create_session",
        lambda: _SessionStub(),
    )

    report = RunReport()
    context = PipelineContext(hydrator=_HydratorStub(), run_report=report)
    build_default_pipeline().run([source_one, source_two], context)

    assert len(report.rows) == 2


class _RekordboxRowStub:
    row_number = 7

    def to_simple_metadata(self) -> SimpleMetadata:
        return SimpleMetadata(title="Track", bpm=128.0, key="12A")


class _RekordboxIndexStub:
    def match(self, *, source: Path, metadata: SimpleMetadata):
        assert source.name == "input.mp3"
        assert metadata.title == "Track"
        return _RekordboxRowStub()


def test_pipeline_passes_existing_and_rekordbox_metadata_to_audio_resolution(
    monkeypatch, tmp_path
):
    source = tmp_path / "input.mp3"
    source.write_text("audio", encoding="utf-8")
    working = tmp_path / "working.mp3"
    working.write_text("audio", encoding="utf-8")
    existing = SimpleMetadata(title="Track", artist="Artist", bpm=127.99, key="C#m")
    observed: dict[str, SimpleMetadata | None] = {}

    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.stage_file", lambda _source: working
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.read_existing_metadata",
        lambda _path: existing,
    )

    def analyze(_path, metadata, existing_metadata, rekordbox_metadata):
        observed["existing"] = existing_metadata
        observed["rekordbox"] = rekordbox_metadata
        metadata.bpm = rekordbox_metadata.bpm
        metadata.key = rekordbox_metadata.key

    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.analyze_missing_audio_features", analyze
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.write_tags", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.rename_file",
        lambda path, *_args, **_kwargs: path,
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.move_to_augmented",
        lambda path, **_kwargs: path,
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.upsert_track_records",
        lambda *_args, **_kwargs: {},
    )
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.database.create_session",
        lambda: _SessionStub(),
    )

    report = RunReport()
    context = PipelineContext(
        hydrator=_HydratorStub(),
        run_report=report,
        rekordbox_index=_RekordboxIndexStub(),
    )
    build_default_pipeline().run([source], context)

    row = report.rows[0]
    assert observed["existing"] is existing
    assert observed["rekordbox"] is not None
    assert observed["rekordbox"].bpm == 128.0
    assert observed["rekordbox"].key == "12A"
    assert "rekordbox_match=row_7" in row.notes
    assert row.metadata.key == "C#m"
    assert row.camelot_code == "12A"
