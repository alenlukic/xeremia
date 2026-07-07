from __future__ import annotations

import argparse
import logging
from pathlib import Path

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.run_pipeline import run_pipeline
from src.track_metadata.tags import read_existing_metadata
from src.track_metadata.utils import AUGMENTED_DIR, SUPPORTED_AUDIO_EXTENSIONS


def purge_invalid_augmented_files(augmented_dir: Path = AUGMENTED_DIR) -> None:
    """Remove augmented files that cannot produce a valid title."""
    if not augmented_dir.exists():
        return

    for candidate in augmented_dir.iterdir():
        if not (
            candidate.is_file()
            and candidate.suffix.lower() in SUPPORTED_AUDIO_EXTENSIONS
        ):
            continue

        try:
            metadata = read_existing_metadata(candidate)
        except Exception as exc:
            logging.warning("Could not read metadata from %s: %s", candidate.name, exc)
            metadata = SimpleMetadata()

        if metadata.title:
            continue

        logging.info(
            "Deleting %s from augmented; missing tags or title", candidate.name
        )
        candidate.unlink(missing_ok=True)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the track metadata agent")
    parser.add_argument(
        "--rekordbox-tsv",
        type=Path,
        help="Optional Rekordbox-exported metadata TSV used for BPM/key resolution",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    report_path = run_pipeline(rekordbox_tsv=args.rekordbox_tsv)
    logging.info("Metadata pipeline completed. Report: %s", report_path)


if __name__ == "__main__":
    main()
