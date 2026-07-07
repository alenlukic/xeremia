from __future__ import annotations

from datetime import datetime

from src.data_management.audio_file import AudioFile
from src.db import database
from src.models.track import Track
from src.track_metadata.audio_features import analyze_missing_audio_features
from src.track_metadata.db_matching import apply_db_fields
from src.track_metadata.key_utils import canonicalize_key
from src.track_metadata.label import apply_album_label_consistency
from src.track_metadata.matching import _compose_display_title, seed_metadata_from_filename
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.config import (
    GAP_REPORT_FIELDS,
    MISSION_CRITICAL_FIELDS,
)
from src.track_metadata.pipeline.framework import (
    Pipeline,
    PipelineContext,
    Stage,
    TrackResult,
    TrackStatus,
)
from src.track_metadata.pipeline.persistence import update_track_records, upsert_track_records
from src.track_metadata.tags import read_existing_metadata, write_tags
from src.track_metadata.utils import (
    AUGMENTED_DIR,
    convert_wav_to_aiff,
    move_to_augmented,
    move_to_remediation,
    rename_file,
    stage_file,
)
from src.utils.file_operations import get_file_creation_time


def _resolve_session(context: PipelineContext):
    shared_session = context.shared_state.get("session")
    if shared_session is not None:
        return shared_session, False
    if context.session_factory is not None:
        return context.session_factory(), True
    return database.create_session(), True


def stage_prepare(result: TrackResult, context: PipelineContext) -> None:
    working = stage_file(result.source)
    if working.suffix.lower() == ".wav":
        working = convert_wav_to_aiff(working)
    result.working_path = working


def stage_db_hydrate(result: TrackResult, context: PipelineContext) -> None:
    if result.working_path is None:
        raise ValueError("working path is missing before db hydrate stage")
    if result.matched_track_id is None:
        raise ValueError("matched_track_id is required before db hydrate stage")

    session, owned = _resolve_session(context)
    try:
        track = session.query(Track).filter_by(id=result.matched_track_id).first()
        if track is None:
            raise ValueError(f"track not found: {result.matched_track_id}")

        existing = read_existing_metadata(result.working_path)
        seeded = seed_metadata_from_filename(result.source, existing)
        result.existing_metadata = existing
        result.metadata = apply_db_fields(seeded, track)
    finally:
        if owned:
            session.close()

    if context.rekordbox_index is not None:
        rekordbox_row = context.rekordbox_index.match(
            source=result.source, metadata=result.metadata
        )
        if rekordbox_row is not None:
            result.rekordbox_metadata = rekordbox_row.to_simple_metadata()
            result.notes.append(f"rekordbox_match=row_{rekordbox_row.row_number}")


def stage_hydrate(result: TrackResult, context: PipelineContext) -> None:
    if result.working_path is None:
        raise ValueError("working path is missing before hydrate stage")

    existing = read_existing_metadata(result.working_path)
    hydrated = context.hydrator.hydrate(
        result.working_path, existing, agent_events=result.agent_events
    )
    creation_ts = datetime.fromtimestamp(
        get_file_creation_time(str(result.working_path))
    )
    conflicts = apply_album_label_consistency(
        hydrated,
        context.shared_state,
        source_catalog_id=hydrated.source_catalog_id,
        creation_timestamp=creation_ts,
        web_verifier=getattr(context.hydrator, "web_label_verifier", None),
    )
    if conflicts:
        result.notes.extend(conflicts)
    result.existing_metadata = existing
    result.metadata = hydrated

    if context.rekordbox_index is not None:
        rekordbox_row = context.rekordbox_index.match(
            source=result.source, metadata=hydrated
        )
        if rekordbox_row is not None:
            result.rekordbox_metadata = rekordbox_row.to_simple_metadata()
            result.notes.append(f"rekordbox_match=row_{rekordbox_row.row_number}")


def stage_analyze(result: TrackResult, context: PipelineContext) -> None:
    if result.working_path is None:
        raise ValueError("working path is missing before analyze stage")
    analyze_missing_audio_features(
        result.working_path,
        result.metadata,
        result.existing_metadata,
        result.rekordbox_metadata,
    )


def stage_classify_genre(result: TrackResult, context: PipelineContext) -> None:
    if result.metadata is None:
        return
    genre = context.hydrator.classify_free_download_genre(result.metadata)
    if genre:
        result.metadata.genre = genre


def stage_format(result: TrackResult, context: PipelineContext) -> None:
    canonical = canonicalize_key(result.metadata.key)
    bpm = result.metadata.bpm
    if canonical is None or bpm is None:
        result.camelot_code = None
        return

    result.metadata.key = canonical
    result.camelot_code = AudioFile.format_camelot_code(canonical)

    result.metadata.title = _compose_display_title(result.metadata, result.camelot_code)


def _collect_missing_fields(
    metadata: SimpleMetadata, camelot_code: str | None
) -> set[str]:
    values = metadata.to_dict()
    values["camelot_code"] = camelot_code
    return {field for field in GAP_REPORT_FIELDS if values.get(field) in (None, "")}


def stage_classify(result: TrackResult, context: PipelineContext) -> None:
    missing = _collect_missing_fields(result.metadata, result.camelot_code)
    result.missing_critical = [
        field for field in MISSION_CRITICAL_FIELDS if field in missing
    ]
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


def stage_persist_matched(result: TrackResult, context: PipelineContext) -> None:
    if result.working_path is None:
        raise ValueError("working path is missing before persist stage")
    if result.camelot_code is None:
        raise ValueError("camelot code is missing before persist stage")
    if result.matched_track_id is None:
        raise ValueError("matched_track_id is required before persist matched stage")

    write_tags(result.working_path, result.metadata)
    renamed = rename_file(result.working_path, result.metadata.title)
    result.working_path = renamed

    augmented_path = AUGMENTED_DIR / renamed.name
    if augmented_path.exists():
        augmented_path.unlink()

    session, owned = _resolve_session(context)
    try:
        update_track_records(session, result.matched_track_id, renamed, result.metadata)
    finally:
        if owned:
            session.close()

    result.output_path = move_to_augmented(renamed, original_name=renamed.name)
    result.status = TrackStatus.SUCCESS


def build_default_pipeline() -> Pipeline:
    return Pipeline(
        stages=[
            Stage(name="prepare", run=stage_prepare),
            Stage(name="hydrate", run=stage_hydrate),
            Stage(name="analyze", run=stage_analyze),
            Stage(name="classify_genre", run=stage_classify_genre),
            Stage(name="format", run=stage_format),
            Stage(name="classify", run=stage_classify),
            Stage(name="persist_or_route", run=stage_persist_or_route),
        ]
    )


def build_db_first_pipeline() -> Pipeline:
    return Pipeline(
        stages=[
            Stage(name="prepare", run=stage_prepare),
            Stage(name="db_hydrate", run=stage_db_hydrate),
            Stage(name="analyze", run=stage_analyze),
            Stage(name="format", run=stage_format),
            Stage(name="persist_matched", run=stage_persist_matched),
        ]
    )


def build_context(
    hydrator: object,
    run_report: object,
    rekordbox_index: object | None = None,
) -> PipelineContext:
    return PipelineContext(
        hydrator=hydrator,
        run_report=run_report,
        rekordbox_index=rekordbox_index,
    )
