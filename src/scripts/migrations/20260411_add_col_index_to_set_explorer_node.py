"""Migration: add col_index column to set_explorer_node.

Run once:
    python -m src.scripts.migrations.20260411_add_col_index_to_set_explorer_node

Adds an INTEGER NOT NULL DEFAULT 0 column, then backfills existing rows
with a deterministic rank within each (set_id, level) group.
"""

import sys

from src.db import database


MIGRATION_SQL = """
ALTER TABLE set_explorer_node ADD COLUMN IF NOT EXISTS col_index INTEGER NOT NULL DEFAULT 0;

UPDATE set_explorer_node AS t
SET col_index = ranked.rn
FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY set_id, level ORDER BY added_at, id) - 1 AS rn
    FROM set_explorer_node
) AS ranked
WHERE t.id = ranked.id;
"""


def run():
    engine = database.engine
    engine.execute(MIGRATION_SQL)
    print("Migration complete: col_index column added to set_explorer_node and backfilled.")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
