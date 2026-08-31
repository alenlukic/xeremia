"""Idempotent migration for library-scoped Explorer crate tables.

Creates ``explorer_crate`` and ``explorer_crate_member`` with DDL matching
``src/db/schema.sql`` (schema-convention ``idx_*`` index names, so live-schema
reflection never collides with the declarative models' ``ix_*`` index names).

Also removes the legacy set-scoped ``set_crate``/``set_crate_member`` tables
from an earlier, unreleased iteration of this feature. Crates are
library-scoped: members reference ``track.id`` directly, and the immutable
"global" crate (every track) is virtual and never stored.

Usage:
    python -m src.scripts.migrate_explorer_crates            # migrate + verify
    python -m src.scripts.migrate_explorer_crates --verify-only
"""

import argparse
import logging
import sys

from sqlalchemy import inspect, text

from src.db import database

logger = logging.getLogger(__name__)

# Legacy set-scoped tables from the first iteration of this feature. They
# never shipped and hold no user data; drop them outright.
_LEGACY_DDL = """
DROP TABLE IF EXISTS public.set_crate_member CASCADE;
DROP TABLE IF EXISTS public.set_crate CASCADE;
DROP SEQUENCE IF EXISTS public.set_crate_member_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.set_crate_id_seq CASCADE;
"""

_CREATE_DDL = """
CREATE SEQUENCE IF NOT EXISTS public.explorer_crate_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.explorer_crate (
    id integer DEFAULT nextval('public.explorer_crate_id_seq'::regclass) NOT NULL,
    name character varying(256) NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT explorer_crate_pkey PRIMARY KEY (id)
);

ALTER SEQUENCE public.explorer_crate_id_seq OWNED BY public.explorer_crate.id;

CREATE SEQUENCE IF NOT EXISTS public.explorer_crate_member_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.explorer_crate_member (
    id integer DEFAULT nextval('public.explorer_crate_member_id_seq'::regclass) NOT NULL,
    crate_id integer NOT NULL,
    track_id integer NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT explorer_crate_member_pkey PRIMARY KEY (id),
    CONSTRAINT uq_explorer_crate_member UNIQUE (crate_id, track_id),
    CONSTRAINT explorer_crate_member_crate_id_fkey FOREIGN KEY (crate_id)
        REFERENCES public.explorer_crate(id) ON DELETE CASCADE,
    CONSTRAINT explorer_crate_member_track_id_fkey FOREIGN KEY (track_id)
        REFERENCES public.track(id) ON DELETE CASCADE
);

ALTER SEQUENCE public.explorer_crate_member_id_seq OWNED BY public.explorer_crate_member.id;

CREATE INDEX IF NOT EXISTS idx_crate_member_crate_id
    ON public.explorer_crate_member USING btree (crate_id);
CREATE INDEX IF NOT EXISTS idx_crate_member_track_id
    ON public.explorer_crate_member USING btree (track_id);
"""

# Indexes a model-metadata-based create would have added. Drop them so
# reflection of the live schema never collides with declarative model
# definitions (mirrors the schema.sql idx_* naming convention).
_MODEL_NAMED_INDEXES = (
    "ix_explorer_crate_id",
    "ix_explorer_crate_member_id",
    "ix_explorer_crate_member_crate_id",
    "ix_explorer_crate_member_track_id",
)

_TABLES = ("explorer_crate", "explorer_crate_member")


def migrate(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(_LEGACY_DDL))
        conn.execute(text(_CREATE_DDL))
        for index_name in _MODEL_NAMED_INDEXES:
            conn.execute(text(f"DROP INDEX IF EXISTS public.{index_name}"))
    logger.info("Explorer crate tables are in place")


def verify(engine) -> list:
    errors = []
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    for table in _TABLES:
        if table not in table_names:
            errors.append(f"{table} table is missing")
    for legacy in ("set_crate", "set_crate_member"):
        if legacy in table_names:
            errors.append(f"legacy {legacy} table still exists")
    if errors:
        return errors

    member_indexes = {
        idx["name"] for idx in inspector.get_indexes("explorer_crate_member")
    }
    for expected in ("idx_crate_member_crate_id", "idx_crate_member_track_id"):
        if expected not in member_indexes:
            errors.append(f"index {expected} is missing")

    all_indexes = member_indexes | {
        idx["name"] for idx in inspector.get_indexes("explorer_crate")
    }
    leftover = all_indexes.intersection(_MODEL_NAMED_INDEXES)
    for name in sorted(leftover):
        errors.append(f"model-named index {name} should not exist")

    member_columns = {
        col["name"] for col in inspector.get_columns("explorer_crate_member")
    }
    for column in ("id", "crate_id", "track_id", "added_at"):
        if column not in member_columns:
            errors.append(f"explorer_crate_member.{column} column is missing")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify the crate tables; do not run DDL.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    engine = database.engine
    if not args.verify_only:
        migrate(engine)
    errors = verify(engine)
    if errors:
        for error in errors:
            logger.error(error)
        return 1
    logger.info("Explorer crate schema verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
