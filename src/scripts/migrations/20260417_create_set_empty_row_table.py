"""Migration: create set_empty_row table for persisted empty row placeholders.

Run once:
    python -m src.scripts.migrations.20260417_create_set_empty_row_table
"""

import sys

from src.db import database


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS set_empty_row (
    id          SERIAL PRIMARY KEY,
    set_id      INTEGER NOT NULL REFERENCES dj_set(id) ON DELETE CASCADE,
    surface     VARCHAR(16) NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    added_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empty_row_set_id ON set_empty_row(set_id);
CREATE INDEX IF NOT EXISTS idx_empty_row_set_surface ON set_empty_row(set_id, surface);
"""


def run():
    engine = database.engine
    engine.execute(CREATE_TABLE_SQL)
    print("Migration complete: set_empty_row table created.")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
