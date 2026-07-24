"""Tests for init_db and table_preference migration expectations."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.scripts import init_db
from src.scripts import migrate_table_preferences


def test_expected_tables_includes_table_preference():
    assert "table_preference" in init_db.EXPECTED_TABLES


def test_expected_tables_includes_pool_subgroups():
    assert "set_pool_subgroup" in init_db.EXPECTED_TABLES
    assert "set_pool_subgroup_member" in init_db.EXPECTED_TABLES


def test_subgroup_migration_verify_reports_missing_tables():
    from src.scripts import migrate_pool_subgroups

    with patch.object(migrate_pool_subgroups, "subgroup_table_exists", return_value=False):
        errors = migrate_pool_subgroups.verify()
    assert errors == ["set_pool_subgroup table is missing"]


def test_subgroup_migration_verify_passes_when_present():
    from src.scripts import migrate_pool_subgroups

    with (
        patch.object(migrate_pool_subgroups, "subgroup_table_exists", return_value=True),
        patch.object(migrate_pool_subgroups, "member_table_exists", return_value=True),
        patch.object(
            migrate_pool_subgroups,
            "_member_column_names",
            return_value={"display_order", "subgroup_id", "pool_entry_id"},
        ),
        patch.object(
            migrate_pool_subgroups,
            "_invalid_member_order_subgroup_ids",
            return_value=[],
        ),
    ):
        assert migrate_pool_subgroups.verify() == []


def test_subgroup_migration_verify_reports_non_dense_order():
    from src.scripts import migrate_pool_subgroups

    with (
        patch.object(migrate_pool_subgroups, "subgroup_table_exists", return_value=True),
        patch.object(migrate_pool_subgroups, "member_table_exists", return_value=True),
        patch.object(
            migrate_pool_subgroups,
            "_member_column_names",
            return_value={"display_order", "subgroup_id", "pool_entry_id"},
        ),
        patch.object(
            migrate_pool_subgroups,
            "_invalid_member_order_subgroup_ids",
            return_value=[3, 7],
        ),
    ):
        assert migrate_pool_subgroups.verify() == [
            "set_pool_subgroup_member.display_order is not dense for subgroups: 3, 7"
        ]


def test_subgroup_migration_repairs_only_non_dense_order():
    from src.scripts import migrate_pool_subgroups

    with (
        patch.object(migrate_pool_subgroups, "subgroup_table_exists", return_value=True),
        patch.object(migrate_pool_subgroups, "member_table_exists", return_value=True),
        patch.object(
            migrate_pool_subgroups,
            "_member_column_names",
            return_value={"display_order", "subgroup_id", "pool_entry_id"},
        ),
        patch.object(
            migrate_pool_subgroups,
            "_invalid_member_order_subgroup_ids",
            return_value=[7],
        ),
        patch.object(migrate_pool_subgroups, "_backfill_member_order") as backfill,
    ):
        migrate_pool_subgroups.apply()
    backfill.assert_called_once_with([7])


def test_subgroup_migration_rerun_preserves_dense_order():
    from src.scripts import migrate_pool_subgroups

    with (
        patch.object(migrate_pool_subgroups, "subgroup_table_exists", return_value=True),
        patch.object(migrate_pool_subgroups, "member_table_exists", return_value=True),
        patch.object(
            migrate_pool_subgroups,
            "_member_column_names",
            return_value={"display_order", "subgroup_id", "pool_entry_id"},
        ),
        patch.object(
            migrate_pool_subgroups,
            "_invalid_member_order_subgroup_ids",
            return_value=[],
        ),
        patch.object(migrate_pool_subgroups, "_backfill_member_order") as backfill,
    ):
        migrate_pool_subgroups.apply()
    backfill.assert_not_called()


def test_migration_verify_reports_missing_table():
    with patch.object(migrate_table_preferences, "table_exists", return_value=False):
        errors = migrate_table_preferences.verify()
    assert errors == ["table_preference table is missing"]


def test_migration_verify_passes_when_present():
    with (
        patch.object(migrate_table_preferences, "table_exists", return_value=True),
        patch.object(
            migrate_table_preferences,
            "_column_names",
            return_value={"device_hash", "table_id", "column_order"},
        ),
    ):
        assert migrate_table_preferences.verify() == []


def test_migration_verify_flags_missing_device_hash():
    with (
        patch.object(migrate_table_preferences, "table_exists", return_value=True),
        patch.object(
            migrate_table_preferences,
            "_column_names",
            return_value={"table_id", "column_order"},
        ),
    ):
        errors = migrate_table_preferences.verify()
    assert errors == ["table_preference.device_hash column is missing"]


def test_init_db_verify_schema_flags_missing_table_preference():
    conn = MagicMock()
    with (
        patch.object(init_db, "_table_names", return_value=set(init_db.EXPECTED_TABLES) - {"table_preference"}),
        patch.object(init_db, "_extension_names", return_value=init_db.EXPECTED_EXTENSIONS),
    ):
        with patch.object(init_db, "_connect", return_value=conn):
            cursor = conn.cursor.return_value.__enter__.return_value
            cursor.fetchone.return_value = (1,)
            errors = init_db.verify_schema(conn)
    assert any("table_preference" in err for err in errors)
