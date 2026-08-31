from __future__ import annotations

import argparse
import logging
from pathlib import Path

from src.track_metadata.run_pipeline import run_pipeline


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
