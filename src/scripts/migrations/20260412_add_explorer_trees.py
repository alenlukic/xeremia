"""Migration: add multi-tree support to the explorer.

Run once:
    python -m src.scripts.migrations.20260412_add_explorer_trees

Creates set_explorer_tree table, adds tree_id to set_explorer_node and
set_explorer_edge, then backfills all existing explorer data into a default
"Main" tree per set.
"""

import sys

from src.db import database


MIGRATION_SQL = """
-- 1. Create the tree table
CREATE TABLE IF NOT EXISTS set_explorer_tree (
    id          SERIAL PRIMARY KEY,
    set_id      INTEGER NOT NULL REFERENCES dj_set(id) ON DELETE CASCADE,
    name        VARCHAR(256) NOT NULL DEFAULT 'Main',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (set_id, name)
);

CREATE INDEX IF NOT EXISTS idx_explorer_tree_set_id ON set_explorer_tree(set_id);

-- 2. Add tree_id columns (nullable first for backfill)
ALTER TABLE set_explorer_node
    ADD COLUMN IF NOT EXISTS tree_id INTEGER REFERENCES set_explorer_tree(id) ON DELETE CASCADE;

ALTER TABLE set_explorer_edge
    ADD COLUMN IF NOT EXISTS tree_id INTEGER REFERENCES set_explorer_tree(id) ON DELETE CASCADE;

-- 3. Create a default "Main" tree for every set that has explorer data
INSERT INTO set_explorer_tree (set_id, name)
SELECT DISTINCT set_id, 'Main'
FROM set_explorer_node
WHERE set_id NOT IN (
    SELECT set_id FROM set_explorer_tree WHERE name = 'Main'
)
ON CONFLICT DO NOTHING;

-- 4. Backfill tree_id on nodes
UPDATE set_explorer_node n
SET tree_id = t.id
FROM set_explorer_tree t
WHERE n.set_id = t.set_id
  AND t.name = 'Main'
  AND n.tree_id IS NULL;

-- 5. Backfill tree_id on edges
UPDATE set_explorer_edge e
SET tree_id = t.id
FROM set_explorer_tree t
WHERE e.set_id = t.set_id
  AND t.name = 'Main'
  AND e.tree_id IS NULL;

-- 6. Make tree_id NOT NULL now that everything is backfilled
ALTER TABLE set_explorer_node
    ALTER COLUMN tree_id SET NOT NULL;

ALTER TABLE set_explorer_edge
    ALTER COLUMN tree_id SET NOT NULL;

-- 7. Add indexes for tree_id
CREATE INDEX IF NOT EXISTS idx_explorer_node_tree_id ON set_explorer_node(tree_id);
CREATE INDEX IF NOT EXISTS idx_explorer_edge_tree_id ON set_explorer_edge(tree_id);

-- 8. Pluralized convenience views for QA verification queries
CREATE OR REPLACE VIEW set_explorer_trees AS SELECT * FROM set_explorer_tree;
CREATE OR REPLACE VIEW set_explorer_nodes AS SELECT * FROM set_explorer_node;
CREATE OR REPLACE VIEW set_explorer_edges AS SELECT * FROM set_explorer_edge;
"""


def run():
    with database.engine.begin() as conn:
        conn.execute(MIGRATION_SQL)
    print("Migration complete: explorer tree support added.")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
