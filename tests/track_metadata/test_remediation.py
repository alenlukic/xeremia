from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.config import MISSION_CRITICAL_FIELDS
from src.track_metadata.pipeline.framework import PipelineContext, TrackResult, TrackStatus
from src.track_metadata.pipeline.report import RunReport
from src.track_metadata.pipeline.stages import stage_classify, stage_persist_or_route


def test_stage_classify_uses_exact_mission_critical_set():
    metadata = SimpleMetadata(title="T", artist="A", bpm=128.0, key=None)
    result = TrackResult(source=Path("track.mp3"), metadata=metadata)

    stage_classify(result, PipelineContext(hydrator=MagicMock(), run_report=RunReport()))

    assert set(MISSION_CRITICAL_FIELDS) == {"key", "bpm", "camelot_code", "artist", "title"}
    assert set(result.missing_critical) == {"key", "camelot_code"}


def test_stage_persist_routes_to_remediation_when_critical_missing(monkeypatch, tmp_path):
    working = tmp_path / "track.mp3"
    working.write_text("audio", encoding="utf-8")

    result = TrackResult(source=Path("track.mp3"), metadata=SimpleMetadata(title="T", artist="A"))
    result.working_path = working
    result.missing_critical = ["key"]

    expected_output = tmp_path / "remediation-track.mp3"
    monkeypatch.setattr(
        "src.track_metadata.pipeline.stages.move_to_remediation",
        lambda _path: expected_output,
    )

    stage_persist_or_route(result, PipelineContext(hydrator=MagicMock(), run_report=RunReport()))

    assert result.status == TrackStatus.REMEDIATION
    assert result.output_path == expected_output
