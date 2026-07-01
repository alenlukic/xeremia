from __future__ import annotations

from src.data_management.audio_file import AudioFile
from src.data_management.config import CANONICAL_KEY_MAP
from src.db import database
from src.track_metadata.audio_features import analyze_missing_audio_features
from src.track_metadata.matching import _compose_display_title
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.config import GAP_REPORT_FIELDS, MISSION_CRITICAL_FIELDS
from src.track_metadata.pipeline.framework import (
    Pipeline,
    PipelineContext,
    Stage,
    TrackResult,
    TrackStatus,
)
from src.track_metadata.pipeline.persistence import upsert_track_records
from src.track_metadata.tags import read_existing_metadata, write_tags
from src.track_metadata.utils import (
    convert_wav_to_aiff,
    move_to_augmented,
    move_to_remediation,
    rename_file,
    stage_file,
)


def stage_prepare(result: TrackResult, context: PipelineContext) -> None:
    working = stage_file(result.source)
    if working.suffix.lower() == ".wav":
        working = convert_wav_to_aiff(working)
    result.working_path = working


def stage_hydrate(result: TrackResult, context: PipelineContext) -> None:
    if result.working_path is None:
        raise ValueError("working path is missing before hydrate stage")

    existing = read_existing_metadata(result.working_path)
    hydrated = context.hydrator.hydrate(
        result.working_path, existing, agent_events=result.agent_events
    )
    result.metadata = hydrated


def stage_analyze(result: TrackResult, context: PipelineContext) -> None:
    if result.working_path is None:
        raise ValueError("working path is missing before analyze stage")
    analyze_missing_audio_features(result.working_path, result.metadata)


def stage_format(result: TrackResult, context: PipelineContext) -> None:
    key = result.metadata.key
    bpm = result.metadata.bpm
    if key is None or bpm is None:
        result.camelot_code = None
        return

    canonical = CANONICAL_KEY_MAP.get(key.strip().lower(), key.strip().lower())
    if canonical:
        canonical = canonical[0].upper() + canonical[1:]
    result.metadata.key = canonical
    result.camelot_code = AudioFile.format_camelot_code(canonical)

    result.metadata.title = _compose_display_title(result.metadata, result.camelot_code)


def _collect_missing_fields(metadata: SimpleMetadata, camelot_code: str | None) -> set[str]:
    values = metadata.to_dict()
    values["camelot_code"] = camelot_code
    return {
        field
        for field in GAP_REPORT_FIELDS
        if values.get(field) in (None, "")
    }


def stage_classify(result: TrackResult, context: PipelineContext) -> None:
    missing = _collect_missing_fields(result.metadata, result.camelot_code)
    result.missing_critical = [field for field in MISSION_CRITICAL_FIELDS if field in missing]
    result.missing_optional = [
        field
        for field in GAP_REPORT_FIELDS
        if field in missing and field not in MISSION_CRITICAL_FIELDS
    ]


def stage_persist_or_route(result: TrackResult, context: PipelineContext) -> None:
    if result.working_path is None:
        raise ValueError("working path is missing before persist stage")

    if result.missing_critical:
        result.output_path = move_to_remediation(result.working_path)
        result.status = TrackStatus.REMEDIATION
        return

    write_tags(result.working_path, result.metadata)
    renamed = rename_file(result.working_path, result.metadata.title)
    result.working_path = renamed

    session = database.create_session()
    try:
        upsert_track_records(session, renamed, result.metadata)
    finally:
        session.close()

    result.output_path = move_to_augmented(renamed, original_name=renamed.name)
    result.status = TrackStatus.SUCCESS


def build_default_pipeline() -> Pipeline:
    return Pipeline(
        stages=[
            Stage(name="prepare", run=stage_prepare),
            Stage(name="hydrate", run=stage_hydrate),
            Stage(name="analyze", run=stage_analyze),
            Stage(name="format", run=stage_format),
            Stage(name="classify", run=stage_classify),
            Stage(name="persist_or_route", run=stage_persist_or_route),
        ]
    )


def build_context(hydrator: object, run_report: object) -> PipelineContext:
    return PipelineContext(hydrator=hydrator, run_report=run_report)
