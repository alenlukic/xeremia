from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from src.track_metadata.models import SimpleMetadata


class TrackStatus(str, Enum):
    SUCCESS = "success"
    REMEDIATION = "remediation"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class TrackResult:
    source: Path
    metadata: SimpleMetadata = field(default_factory=SimpleMetadata)
    existing_metadata: SimpleMetadata = field(default_factory=SimpleMetadata)
    rekordbox_metadata: SimpleMetadata | None = None
    working_path: Path | None = None
    output_path: Path | None = None
    status: TrackStatus = TrackStatus.SKIPPED
    camelot_code: str | None = None
    missing_critical: list[str] = field(default_factory=list)
    missing_optional: list[str] = field(default_factory=list)
    agent_events: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    matched_track_id: int | None = None


@dataclass
class PipelineContext:
    hydrator: Any
    run_report: Any
    agent: Any | None = None
    session_factory: Callable[[], Any] | None = None
    shared_state: dict[str, Any] = field(default_factory=dict)
    rekordbox_index: Any | None = None


StageRun = Callable[[TrackResult, PipelineContext], None]
AgentFallback = Callable[[TrackResult, PipelineContext, Exception], None]


@dataclass
class Stage:
    name: str
    run: StageRun
    agent_fallback: AgentFallback | None = None

    def execute(self, result: TrackResult, context: PipelineContext) -> None:
        try:
            self.run(result, context)
        except Exception as exc:
            if self.agent_fallback is None:
                raise
            self.agent_fallback(result, context, exc)


@dataclass
class Pipeline:
    stages: list[Stage]

    def run(
        self,
        files: list[Path],
        context: PipelineContext,
        on_progress: Callable[[int, int, Path], None] | None = None,
    ):
        total = len(files)
        for index, source in enumerate(files, start=1):
            if on_progress is not None:
                on_progress(index, total, source)
            result = TrackResult(source=source)
            for stage in self.stages:
                try:
                    stage.execute(result, context)
                except Exception as exc:  # pragma: no cover - integration safety
                    logging.warning(
                        "Pipeline stage %r failed for %s: %s",
                        stage.name,
                        source,
                        exc,
                    )
                    result.status = TrackStatus.FAILED
                    result.notes.append(f"stage={stage.name} error={exc}")
                    break

                if result.status in {TrackStatus.REMEDIATION, TrackStatus.FAILED}:
                    break
            context.run_report.add(result)

        return context.run_report
