"""Migration: add note column to set_tracklist_entry.

Run once:
    python -m src.scripts.migrations.20260409_add_note_to_tracklist_entry

Adds a nullable TEXT column with empty-string default for per-track notes.
"""

import sys

from src.db import database


ALTER_SQL = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'set_tracklist_entry' AND column_name = 'note'
    ) THEN
        ALTER TABLE set_tracklist_entry ADD COLUMN note TEXT NOT NULL DEFAULT '';
    END IF;
END
$$;
"""


def run():
    engine = database.engine
    engine.execute(ALTER_SQL)
    print("Migration complete: note column added to set_tracklist_entry.")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
