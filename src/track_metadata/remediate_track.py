"""Finalize a remediation track after the agent resolves its missing fields.

The metadata pipeline routes tracks with missing mission-critical fields to the
remediation directory when the in-process cursor_sdk fallback is disabled
(`TRACK_METADATA_ENABLE_CURSOR_SDK=0`). This module mirrors the pipeline's
`stage_format` + `stage_persist_or_route` success branch so an agent (or
operator) that has researched the missing fields can write them back, finalize
the track into the augmented library, and upsert it into PostgreSQL without
re-running the whole pipeline.

CLI:
    python -m src.track_metadata.remediate_track <remediation_file> <resolved.json>

`resolved.json` is a JSON object whose keys are SimpleMetadata field names
(title, artist, album, label, genre, remixer, year, bpm, key). Only the fields
present in the JSON are overridden; existing tag values are preserved.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any, Mapping

from src.data_management.audio_file import AudioFile
from src.data_management.config import CANONICAL_KEY_MAP
from src.data_management.utils import normalize_key_symbols
from src.db import database
from src.track_metadata.matching import _compose_display_title
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.persistence import upsert_track_records
from src.track_metadata.tags import read_existing_metadata, write_tags
from src.track_metadata.utils import move_to_augmented, rename_file


def _format_metadata(metadata: SimpleMetadata) -> str | None:
    """Mirror `stage_format`: canonicalize key, derive camelot code, compose title.

    Returns the display title, or None when key or bpm is missing (matching the
    pipeline's stage_format early return). `metadata.key` is canonicalized
    in place when both key and bpm are present.
    """
    key = normalize_key_symbols(metadata.key)
    bpm = metadata.bpm
    if key is None or bpm is None:
        return None

    canonical = CANONICAL_KEY_MAP.get(key.strip().lower(), key.strip().lower())
    if canonical:
        canonical = canonical[0].upper() + canonical[1:]
    metadata.key = canonical
    camelot_code = AudioFile.format_camelot_code(canonical)
    return _compose_display_title(metadata, camelot_code)


def remediate_track(
    remediation_file: Path, resolved_fields: Mapping[str, Any]
) -> dict[str, Any]:
    """Apply resolved fields to a remediation track and finalize it.

    Returns a summary dict with the renamed file name, output path, track id,
    and camelot code. Raises ValueError if the title cannot be derived, which
    `upsert_track_records` requires for persistence.
    """
    if not remediation_file.exists():
        raise FileNotFoundError(f"remediation file not found: {remediation_file}")

    metadata = read_existing_metadata(remediation_file)
    metadata.update(resolved_fields)

    display_title = _format_metadata(metadata)
    if display_title:
        metadata.title = display_title

    write_tags(remediation_file, metadata)
    renamed = rename_file(remediation_file, metadata.title)

    session = database.create_session()
    try:
        result = upsert_track_records(session, renamed, metadata)
    finally:
        session.close()

    output_path = move_to_augmented(renamed, original_name=renamed.name)
    logging.info("remediated %s -> %s", remediation_file.name, output_path)
    return {
        "file": renamed.name,
        "output_path": str(output_path),
        **result,
    }


def _load_resolved_fields(source: str) -> dict[str, Any]:
    """Accept a path to a JSON file or an inline JSON object string."""
    candidate = Path(source)
    if candidate.exists():
        return json.loads(candidate.read_text(encoding="utf-8"))
    return json.loads(source)


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if len(args) != 2:
        print(
            "usage: python -m src.track_metadata.remediate_track "
            "<remediation_file> <resolved.json | inline-json>",
            file=sys.stderr,
        )
        return 2

    remediation_file = Path(args[0]).expanduser()
    resolved_fields = _load_resolved_fields(args[1])
    summary = remediate_track(remediation_file, resolved_fields)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
