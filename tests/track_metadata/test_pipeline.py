from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.framework import PipelineContext, TrackStatus
from src.track_metadata.pipeline.report import RunReport
from src.track_metadata.pipeline.stages import build_default_pipeline


class _HydratorStub:
    def hydrate(self, _file_path: Path, existing: SimpleMetadata) -> SimpleMetadata:
        data = existing.to_dict()
        data["artist"] = data.get("artist") or "Artist"
        data["title"] = data.get("title") or "Track"
        return SimpleMetadata.from_dict(data)


class _SessionStub:
    def close(self):
        return None


def test_pipeline_orchestrates_and_stays_deterministic(monkeypatch, tmp_path):
    source = tmp_path / "input.mp3"
    source.write_text("audio", encoding="utf-8")
    working = tmp_path / "working.mp3"
    working.write_text("audio", encoding="utf-8")

    monkeypatch.setattr("src.track_metadata.pipeline.stages.stage_file", lambda _source: working)
    monkeypatch.setattr("src.track_metadata.pipeline.stages.read_existing_metadata", lambda _path: SimpleMetadata())
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.analyze_missing_audio_features",
        lambda _path, metadata: metadata.update({"bpm": 128.0, "key": "C#m"}),
    )
    monkeypatch.setattr("src.track_metadata.pipeline.stages.write_tags", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("src.track_metadata.pipeline.stages.rename_file", lambda path, *_args, **_kwargs: path)
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.move_to_augmented",
        lambda path, **_kwargs: tmp_path / f"augmented-{path.name}",
    )
    monkeypatch.setattr("src.track_metadata.pipeline.stages.upsert_track_records", lambda *_args, **_kwargs: {})
    monkeypatch.setattr("src.track_metadata.pipeline.stages.database.create_session", lambda: _SessionStub())

    report = RunReport()
    context = PipelineContext(hydrator=_HydratorStub(), run_report=report, agent=MagicMock())
    pipeline = build_default_pipeline()
    pipeline.run([source], context)

    assert len(report.rows) == 1
    row = report.rows[0]
    assert row.status == TrackStatus.SUCCESS
    assert row.agent_events == []
    assert row.metadata.title.startswith("[12A - C#m - 128.00]")


def test_pipeline_batch_run_uses_single_shared_report(monkeypatch, tmp_path):
    source_one = tmp_path / "one.mp3"
    source_two = tmp_path / "two.mp3"
    source_one.write_text("audio", encoding="utf-8")
    source_two.write_text("audio", encoding="utf-8")

    monkeypatch.setattr("src.track_metadata.pipeline.stages.stage_file", lambda source: source)
    monkeypatch.setattr("src.track_metadata.pipeline.stages.read_existing_metadata", lambda _path: SimpleMetadata())
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.analyze_missing_audio_features",
        lambda _path, metadata: metadata.update({"bpm": 128.0, "key": "C#m"}),
    )
    monkeypatch.setattr("src.track_metadata.pipeline.stages.write_tags", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("src.track_metadata.pipeline.stages.rename_file", lambda path, *_args, **_kwargs: path)
    monkeypatch.setattr("src.track_metadata.pipeline.stages.move_to_augmented", lambda path, **_kwargs: path)
    monkeypatch.setattr("src.track_metadata.pipeline.stages.upsert_track_records", lambda *_args, **_kwargs: {})
    monkeypatch.setattr("src.track_metadata.pipeline.stages.database.create_session", lambda: _SessionStub())

    report = RunReport()
    context = PipelineContext(hydrator=_HydratorStub(), run_report=report)
    build_default_pipeline().run([source_one, source_two], context)

    assert len(report.rows) == 2
