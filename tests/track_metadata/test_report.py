from __future__ import annotations

from pathlib import Path

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.framework import TrackResult, TrackStatus
from src.track_metadata.pipeline.report import RunReport


def test_run_report_marks_missing_fields_with_x(tmp_path):
    report = RunReport()
    result = TrackResult(source=Path("track.mp3"), metadata=SimpleMetadata())
    result.status = TrackStatus.SUCCESS
    result.missing_optional = ["genre", "label"]
    report.add(result)

    rendered = report.render_table()
    assert "| track.mp3 | success |" in rendered
    assert "| X | X |" in rendered


def test_run_report_write_creates_markdown_file(tmp_path):
    report = RunReport()
    result = TrackResult(source=Path("track.mp3"), metadata=SimpleMetadata())
    result.status = TrackStatus.REMEDIATION
    result.missing_critical = ["key"]
    report.add(result)

    output_path = report.write(tmp_path / "report.md")
    assert output_path.exists()
    body = output_path.read_text(encoding="utf-8")
    assert "Tracks processed: 1" in body
    assert "Routed to remediation: 1" in body


def test_run_report_renders_resolution_appendix(tmp_path):
    report = RunReport()
    result = TrackResult(source=Path("track.mp3"), metadata=SimpleMetadata())
    result.status = TrackStatus.SUCCESS
    result.agent_events = [
        {
            "type": "field_resolution",
            "field": "genre",
            "method": "artist_history",
            "outcome": "resolved",
            "resolution_source": "track_repository",
            "confidence": "high",
        }
    ]
    report.add(result)

    appendix = report.render_resolution_appendix()
    assert "Field resolution provenance" in appendix
    assert "artist_history" in appendix

    output_path = report.write(tmp_path / "report.md")
    body = output_path.read_text(encoding="utf-8")
    assert "Field resolution provenance" in body
