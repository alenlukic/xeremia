"""Combined script: compute descriptors, traits, and cosine similarities.

Requires at least one track ID. Runs compact descriptor generation first
(prerequisite for cosine scoring), then trait extraction, then cosine
similarity computation for the given tracks against their harmonic-match
candidates.

Usage:
    python -m src.scripts.feature_extraction.compute_features_for_tracks 42 101 200
"""

import sys

from src.db import database
from src.errors import handle
from src.models.track import Track
from src.scripts.feature_extraction import compute_compact_descriptors
from src.scripts.feature_extraction import compute_track_traits
from src.scripts.feature_extraction import compute_cosine_similarities


def run(track_ids):
    if not track_ids:
        print("Error: at least one track ID is required.")
        sys.exit(1)

    print(
        "=== Step 1/3: Computing compact descriptors for %d track(s) ==="
        % len(track_ids)
    )
    session = database.create_session()
    try:
        compute_compact_descriptors.session = session
        compute_compact_descriptors.tracks = list(session.query(Track).all())
        compute_compact_descriptors.run(track_ids)
    except Exception as exc:
        handle(exc)
        print(
            "Warning: descriptor computation encountered errors; "
            "continuing to trait step."
        )
    finally:
        session.close()

    print("\n=== Step 2/3: Computing traits for %d track(s) ===" % len(track_ids))
    try:
        session = database.create_session()
        compute_track_traits.run(track_ids, session)
    except Exception as exc:
        handle(exc)
        print(
            "Warning: trait computation encountered errors; continuing to cosine step."
        )

    print(
        "\n=== Step 3/3: Computing cosine similarities for %d track(s) ==="
        % len(track_ids)
    )
    try:
        session = database.create_session()
        compute_cosine_similarities.run(track_ids, session)
    except Exception as exc:
        handle(exc)
        print("Warning: cosine computation encountered errors.")

    print("\nAll steps complete.")


if __name__ == "__main__":
    _args = sys.argv
    if len(_args) < 2:
        print(
            "Usage: python -m src.scripts.feature_extraction"
            ".compute_features_for_tracks <track_id> [track_id ...]"
        )
        sys.exit(1)
    run(set(int(t) for t in _args[1:]))
