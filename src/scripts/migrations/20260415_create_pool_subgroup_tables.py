"""Migration: create set_pool_subgroup and set_pool_subgroup_member tables.

Run once:
    python -m src.scripts.migrations.20260415_create_pool_subgroup_tables

Creates set_pool_subgroup and set_pool_subgroup_member with foreign keys,
unique constraint, cascade behavior, and indexes matching the shipped models.
"""

import sys

from sqlalchemy import text

from src.db import database


MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS set_pool_subgroup (
    id              SERIAL PRIMARY KEY,
    set_id          INTEGER NOT NULL REFERENCES dj_set(id) ON DELETE CASCADE,
    name            VARCHAR(256) NOT NULL,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_subgroup_set_id ON set_pool_subgroup(set_id);

CREATE TABLE IF NOT EXISTS set_pool_subgroup_member (
    id              SERIAL PRIMARY KEY,
    subgroup_id     INTEGER NOT NULL REFERENCES set_pool_subgroup(id) ON DELETE CASCADE,
    pool_entry_id   INTEGER NOT NULL REFERENCES set_pool_entry(id) ON DELETE CASCADE,
    added_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_subgroup_member UNIQUE (subgroup_id, pool_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_subgroup_member_subgroup_id ON set_pool_subgroup_member(subgroup_id);
CREATE INDEX IF NOT EXISTS idx_subgroup_member_pool_entry_id ON set_pool_subgroup_member(pool_entry_id);
"""

VERIFY_SQL = text(
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema = current_schema() AND table_name IN "
    "('set_pool_subgroup', 'set_pool_subgroup_member')"
)


def run():
    with database.engine.begin() as conn:
        conn.execute(MIGRATION_SQL)

    with database.engine.connect() as conn:
        result = conn.execute(VERIFY_SQL)
        found = {row[0] for row in result}

    expected = {"set_pool_subgroup", "set_pool_subgroup_member"}
    missing = expected - found

    if missing:
        print(
            "Migration FAILED verification: missing tables: %s"
            % ", ".join(sorted(missing)),
            file=sys.stderr,
        )
        sys.exit(1)

    print(
        "Migration complete: set_pool_subgroup and set_pool_subgroup_member "
        "tables created and verified."
    )


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("Migration failed: %s" % exc, file=sys.stderr)
        sys.exit(1)
