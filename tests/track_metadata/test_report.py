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
