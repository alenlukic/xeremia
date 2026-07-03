from __future__ import annotations

import logging
from pathlib import Path

from src.track_metadata.pipeline.agent import build_cursor_sdk_agent
from src.track_metadata.pipeline.report import RunReport
from src.track_metadata.pipeline.stages import build_context, build_default_pipeline
from src.track_metadata.sources.hydrator import build_metadata_agent
from src.track_metadata.utils import (
    AUGMENTED_DIR,
    DOWNLOAD_DIR,
    LOG_DIR,
    PROCESSING_DIR,
    REMEDIATION_DIR,
    RUN_START,
    discover_new_audio_files,
    ensure_directories,
    reset_processing_dir,
    setup_logging,
)


def _heartbeat(message: str) -> None:
    print(message, flush=True)


def run_pipeline() -> Path:
    setup_logging()
    _heartbeat(
        "track_metadata pipeline starting | "
        f"download={DOWNLOAD_DIR} processing={PROCESSING_DIR} "
        f"augmented={AUGMENTED_DIR} remediation={REMEDIATION_DIR} log={LOG_DIR}"
    )
    ensure_directories()
    reset_processing_dir()

    files = discover_new_audio_files()
    logging.info("Discovered %d file(s).", len(files))
    _heartbeat(f"discovered {len(files)} file(s) to process")

    report = RunReport()
    if files:
        from src.db import database

        fallback_agent = build_cursor_sdk_agent()
        hydrator = build_metadata_agent(
            candidate_resolver=(
                None
                if fallback_agent is None
                else lambda file_path,
                current,
                sources,
                missing: fallback_agent.resolve_metadata(
                    file_path, current, sources, missing
                )
            ),
            session_factory=database.create_session,
        )
        context = build_context(hydrator=hydrator, run_report=report)
        context.agent = fallback_agent
        pipeline = build_default_pipeline()
        pipeline.run(files, context, on_progress=_on_track_progress)

    report_path = LOG_DIR / f"{RUN_START}_report.md"
    report.write(report_path)
    success_count = len([r for r in report.rows if r.status.value == "success"])
    remediation_count = len([r for r in report.rows if r.status.value == "remediation"])
    failed_count = len([r for r in report.rows if r.status.value == "failed"])
    _heartbeat(
        "pipeline finished | "
        f"processed={len(report.rows)} success={success_count} "
        f"remediation={remediation_count} failed={failed_count}"
    )
    _heartbeat(f"report written to {report_path}")
    return report_path


def _on_track_progress(index: int, total: int, source: Path) -> None:
    _heartbeat(f"[{index}/{total}] processing {source.name}")


def main() -> None:
    report_path = run_pipeline()
    logging.info("Run report written to %s", report_path)


if __name__ == "__main__":
    main()
