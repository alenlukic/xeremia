from __future__ import annotations

import logging
from pathlib import Path

from src.track_metadata.pipeline.agent import build_cursor_sdk_agent
from src.track_metadata.pipeline.report import RunReport
from src.track_metadata.pipeline.stages import build_context, build_default_pipeline
from src.track_metadata.sources.hydrator import build_metadata_agent
from src.track_metadata.utils import (
    LOG_DIR,
    RUN_START,
    discover_new_audio_files,
    ensure_directories,
    reset_processing_dir,
    setup_logging,
)


def run_pipeline() -> Path:
    setup_logging()
    ensure_directories()
    reset_processing_dir()

    files = discover_new_audio_files()
    logging.info("Discovered %d file(s).", len(files))

    report = RunReport()
    if files:
        fallback_agent = build_cursor_sdk_agent()
        hydrator = build_metadata_agent(
            candidate_resolver=(
                None
                if fallback_agent is None
                else lambda file_path, current, sources, missing: fallback_agent.resolve_metadata(
                    file_path, current, sources, missing
                )
            )
        )
        context = build_context(hydrator=hydrator, run_report=report)
        context.agent = fallback_agent
        pipeline = build_default_pipeline()
        pipeline.run(files, context)

    report_path = LOG_DIR / f"{RUN_START}_report.md"
    report.write(report_path)
    return report_path


def main() -> None:
    report_path = run_pipeline()
    logging.info("Run report written to %s", report_path)


if __name__ == "__main__":
    main()
