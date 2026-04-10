"""Migration: create set workspace tables.

Run once:
    python -m src.scripts.migrations.20260409_create_set_workspace_tables

Creates dj_set, set_pool_entry, set_tracklist_entry, set_explorer_node,
and set_explorer_edge tables with foreign keys and uniqueness constraints.
"""

import sys

from src.db import database


CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS dj_set (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(256) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS set_pool_entry (
    id              SERIAL PRIMARY KEY,
    set_id          INTEGER NOT NULL REFERENCES dj_set(id) ON DELETE CASCADE,
    track_id        INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    insertion_order INTEGER NOT NULL DEFAULT 0,
    added_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (set_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_set_id ON set_pool_entry(set_id);
CREATE INDEX IF NOT EXISTS idx_pool_track_id ON set_pool_entry(track_id);

CREATE TABLE IF NOT EXISTS set_tracklist_entry (
    id          SERIAL PRIMARY KEY,
    set_id      INTEGER NOT NULL REFERENCES dj_set(id) ON DELETE CASCADE,
    track_id    INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    added_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (set_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_tracklist_set_id ON set_tracklist_entry(set_id);
CREATE INDEX IF NOT EXISTS idx_tracklist_track_id ON set_tracklist_entry(track_id);

CREATE TABLE IF NOT EXISTS set_explorer_node (
    id          SERIAL PRIMARY KEY,
    set_id      INTEGER NOT NULL REFERENCES dj_set(id) ON DELETE CASCADE,
    node_id     VARCHAR(64) NOT NULL,
    track_id    INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    level       INTEGER NOT NULL DEFAULT 0,
    added_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (set_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_explorer_node_set_id ON set_explorer_node(set_id);

CREATE TABLE IF NOT EXISTS set_explorer_edge (
    id              SERIAL PRIMARY KEY,
    set_id          INTEGER NOT NULL REFERENCES dj_set(id) ON DELETE CASCADE,
    parent_node_id  VARCHAR(64) NOT NULL,
    child_node_id   VARCHAR(64) NOT NULL,
    added_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (set_id, parent_node_id, child_node_id)
);

CREATE INDEX IF NOT EXISTS idx_explorer_edge_set_id ON set_explorer_edge(set_id);
"""


def run():
    engine = database.engine
    engine.execute(CREATE_TABLES_SQL)
    print("Migration complete: set workspace tables created.")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
