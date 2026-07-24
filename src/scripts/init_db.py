"""Initialize Xeremia PostgreSQL schema on an empty database.

Creates all application tables, indexes, constraints, sequences, the pg_trgm
extension, and seeds canonical artist/genre/label mappings.

Usage (after ``createdb`` and configuring ``.env``)::

    python -m src.scripts.init_db

Options::

    --database-name NAME   Override DB_NAME from the environment
    --seed-only            Apply mapping seed data to an existing schema
    --verify-only          Check that expected tables exist (exit 1 if not)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "src" / "db" / "schema.sql"
SEED_PATH = REPO_ROOT / "src" / "db" / "seed_mappings.sql"

EXPECTED_TABLES = frozenset(
    {
        "artist",
        "artist_mapping",
        "artist_track",
        "dj_set",
        "final_tags",
        "genre_mapping",
        "initial_tags",
        "label_mapping",
        "post_mik_tags",
        "post_rekordbox_tags",
        "scoring_weight_override",
        "set_explorer_edge",
        "set_explorer_node",
        "set_pool_entry",
        "set_pool_subgroup",
        "set_pool_subgroup_member",
        "set_tracklist_entry",
        "table_preference",
        "track",
        "track_cosine_similarity",
        "track_descriptor",
        "track_trait",
    }
)

EXPECTED_EXTENSIONS = frozenset({"pg_trgm"})


def _load_env() -> None:
    load_dotenv(REPO_ROOT / ".env")


def _connect_params(database_name: str | None = None) -> dict:
    db_name = database_name or os.getenv("DB_NAME")
    if not db_name:
        raise SystemExit("DB_NAME is not set. Configure .env or pass --database-name.")

    return {
        "dbname": db_name,
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", "5432"),
    }


def _connect(database_name: str | None = None):
    return psycopg2.connect(**_connect_params(database_name))


def _execute_sql_file(conn, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


def _table_names(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            """
        )
        return {row[0] for row in cur.fetchall()}


def _extension_names(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT extname FROM pg_extension")
        return {row[0] for row in cur.fetchall()}


def is_initialized(conn) -> bool:
    return "track" in _table_names(conn)


def verify_schema(conn) -> list[str]:
    errors: list[str] = []
    tables = _table_names(conn)
    missing_tables = sorted(EXPECTED_TABLES - tables)
    if missing_tables:
        errors.append("missing tables: %s" % ", ".join(missing_tables))

    extensions = _extension_names(conn)
    missing_extensions = sorted(EXPECTED_EXTENSIONS - extensions)
    if missing_extensions:
        errors.append("missing extensions: %s" % ", ".join(missing_extensions))

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'track'
              AND indexname = 'track_title_trgm_idx'
            """
        )
        if cur.fetchone() is None:
            errors.append("missing index: track_title_trgm_idx on track.title")

    return errors


def init_schema(conn) -> None:
    if not SCHEMA_PATH.is_file():
        raise SystemExit("Schema file not found: %s" % SCHEMA_PATH)
    print("Applying schema from %s" % SCHEMA_PATH)
    _execute_sql_file(conn, SCHEMA_PATH)


def seed_mappings(conn) -> None:
    if not SEED_PATH.is_file():
        raise SystemExit("Seed file not found: %s" % SEED_PATH)
    print("Seeding mapping tables from %s" % SEED_PATH)
    _execute_sql_file(conn, SEED_PATH)


def run_init(database_name: str | None = None, seed_only: bool = False) -> None:
    conn = _connect(database_name)
    try:
        if seed_only:
            if not is_initialized(conn):
                raise SystemExit(
                    "Database is not initialized. Run without --seed-only first."
                )
            seed_mappings(conn)
        else:
            if is_initialized(conn):
                raise SystemExit(
                    "Database already initialized (track table exists). "
                    "Use a fresh database or --seed-only to re-apply mapping seeds."
                )
            init_schema(conn)
            seed_mappings(conn)

        errors = verify_schema(conn)
        if errors:
            raise SystemExit(
                "Schema verification failed:\n  - " + "\n  - ".join(errors)
            )

        tables = sorted(EXPECTED_TABLES)
        print("Database ready: %d tables, pg_trgm enabled." % len(tables))
    finally:
        conn.close()


def run_verify(database_name: str | None = None) -> int:
    conn = _connect(database_name)
    try:
        errors = verify_schema(conn)
        if errors:
            print("Schema verification failed:", file=sys.stderr)
            for err in errors:
                print("  - %s" % err, file=sys.stderr)
            return 1
        print("Schema verification passed (%d tables)." % len(EXPECTED_TABLES))
        return 0
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    _load_env()

    parser = argparse.ArgumentParser(
        description="Initialize Xeremia PostgreSQL schema."
    )
    parser.add_argument(
        "--database-name",
        help="Override DB_NAME from the environment (useful for sandbox testing).",
    )
    parser.add_argument(
        "--seed-only",
        action="store_true",
        help="Apply mapping seed data only (requires an existing schema).",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Verify expected tables/extensions exist and exit.",
    )
    args = parser.parse_args(argv)

    if args.verify_only:
        return run_verify(args.database_name)

    run_init(database_name=args.database_name, seed_only=args.seed_only)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except psycopg2.Error as exc:
        print("Database error: %s" % exc, file=sys.stderr)
        raise SystemExit(1) from exc
