"""Migration: create set_tracklist_version, set_tracklist_slot, and set_tracklist_candidate tables.

Run once:
    python -m src.scripts.migrations.20260421_create_set_tracklist_version_tables

Creates the three versioned-tracklist tables with foreign keys, indexes,
unique constraints, and cascade behavior matching the shipped models.
"""

import sys

from sqlalchemy import text

from src.db import database


MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS set_tracklist_version (
    id                  SERIAL PRIMARY KEY,
    set_id              INTEGER NOT NULL REFERENCES dj_set(id) ON DELETE CASCADE,
    name                VARCHAR(256) NOT NULL DEFAULT 'v1',
    display_order       INTEGER NOT NULL DEFAULT 0,
    explorer_tree_id    INTEGER UNIQUE REFERENCES set_explorer_tree(id) ON DELETE SET NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tracklist_version_set_name UNIQUE (set_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tracklist_version_set_id ON set_tracklist_version(set_id);

CREATE TABLE IF NOT EXISTS set_tracklist_slot (
    id              SERIAL PRIMARY KEY,
    version_id      INTEGER NOT NULL REFERENCES set_tracklist_version(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    note            TEXT NOT NULL DEFAULT '',
    is_inherited    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracklist_slot_version_id ON set_tracklist_slot(version_id);

CREATE TABLE IF NOT EXISTS set_tracklist_candidate (
    id              SERIAL PRIMARY KEY,
    slot_id         INTEGER NOT NULL REFERENCES set_tracklist_slot(id) ON DELETE CASCADE,
    track_id        INTEGER REFERENCES track(id) ON DELETE SET NULL,
    is_selected     BOOLEAN NOT NULL DEFAULT FALSE,
    added_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracklist_candidate_slot_id ON set_tracklist_candidate(slot_id);
CREATE INDEX IF NOT EXISTS idx_tracklist_candidate_track_id ON set_tracklist_candidate(track_id);
"""

VERIFY_SQL = text(
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema = current_schema() AND table_name IN "
    "('set_tracklist_version', 'set_tracklist_slot', 'set_tracklist_candidate')"
)


def run():
    with database.engine.begin() as conn:
        conn.execute(MIGRATION_SQL)

    with database.engine.connect() as conn:
        result = conn.execute(VERIFY_SQL)
        found = {row[0] for row in result}

    expected = {"set_tracklist_version", "set_tracklist_slot", "set_tracklist_candidate"}
    missing = expected - found

    if missing:
        print(
            "Migration FAILED verification: missing tables: %s"
            % ", ".join(sorted(missing)),
            file=sys.stderr,
        )
        sys.exit(1)

    print(
        "Migration complete: set_tracklist_version, set_tracklist_slot, and "
        "set_tracklist_candidate tables created and verified."
    )


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
