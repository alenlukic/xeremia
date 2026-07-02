from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from src.track_metadata.pipeline.config import GAP_REPORT_FIELDS
from src.track_metadata.pipeline.framework import TrackResult


@dataclass
class RunReport:
    rows: list[TrackResult] = field(default_factory=list)
    gap_columns: tuple[str, ...] = GAP_REPORT_FIELDS

    def add(self, result: TrackResult) -> None:
        self.rows.append(result)

    def render_table(self) -> str:
        if not self.rows:
            return "| file | status |\n|---|---|\n| _none_ | _none_ |"

        headers = ["file", "status", "blocking_fields", *self.gap_columns]
        lines = [
            "| " + " | ".join(headers) + " |",
            "| " + " | ".join(["---"] * len(headers)) + " |",
        ]

        for result in self.rows:
            missing = set(result.missing_optional) | set(result.missing_critical)
            row = [
                result.source.name,
                result.status.value,
                ", ".join(result.missing_critical) if result.missing_critical else "",
            ]
            row.extend("X" if column in missing else "" for column in self.gap_columns)
            lines.append("| " + " | ".join(row) + " |")

        return "\n".join(lines)

    def write(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        success_count = len([r for r in self.rows if r.status.value == "success"])
        remediation_count = len(
            [r for r in self.rows if r.status.value == "remediation"]
        )
        failed_count = len([r for r in self.rows if r.status.value == "failed"])
        summary = (
            f"# Track metadata run report\n\n"
            f"- Tracks processed: {len(self.rows)}\n"
            f"- Successful: {success_count}\n"
            f"- Routed to remediation: {remediation_count}\n"
            f"- Failed: {failed_count}\n\n"
            f"{self.render_table()}\n"
        )
        path.write_text(summary, encoding="utf-8")
        return path
