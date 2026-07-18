import sys

from src.data_management.config import DBUpdateType
from src.data_management.db_file_sync import parse_track_id_args, sync_tracks_to_files

USAGE = (
    "Usage: python -m src.scripts.sync_db_to_files <track_id> [<track_id> ...]\n"
    "       python -m src.scripts.sync_db_to_files {min_id}...{max_id}"
)


def main(argv):
    try:
        track_ids = parse_track_id_args(argv)
    except ValueError as e:
        print(e)
        print(USAGE)
        return 2

    results = sync_tracks_to_files(track_ids)

    failures = 0
    for track_id in track_ids:
        result = results[track_id]
        status = result["status"]
        if status == DBUpdateType.FAILURE.value:
            failures += 1
            print("%d: %s - %s" % (track_id, status, result["error"]))
            continue

        changes = result["changes"]
        changed_fields = ", ".join(changes.keys()) if changes else "no changes"
        print("%d: %s - %s" % (track_id, status, changed_fields))

    return 1 if failures > 0 else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
