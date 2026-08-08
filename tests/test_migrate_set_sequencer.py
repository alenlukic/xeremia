"""Tests for the set sequencer migration script."""

from unittest.mock import MagicMock, patch

from src.scripts import migrate_set_sequencer


class TestSetSequencerMigrationVerify:
    def test_reports_missing_table(self):
        with patch.object(migrate_set_sequencer, "_table_exists", return_value=False):
            assert migrate_set_sequencer.verify() == ["dj_set table is missing"]

    def test_reports_missing_column(self):
        with patch.object(migrate_set_sequencer, "_table_exists", return_value=True):
            with patch.object(
                migrate_set_sequencer, "_column_names", return_value={"id"}
            ):
                assert migrate_set_sequencer.verify() == [
                    "dj_set.sequencer column is missing"
                ]

    def test_passes_when_column_present(self):
        with patch.object(migrate_set_sequencer, "_table_exists", return_value=True):
            with patch.object(
                migrate_set_sequencer,
                "_column_names",
                return_value={"id", "sequencer"},
            ):
                assert migrate_set_sequencer.verify() == []


class TestSetSequencerMigrationApply:
    def test_creates_table_when_missing(self):
        with patch.object(migrate_set_sequencer, "_table_exists", return_value=False):
            with patch.object(
                migrate_set_sequencer.DjSet.__table__, "create"
            ) as create_table:
                migrate_set_sequencer.apply()

        create_table.assert_called_once_with(
            bind=migrate_set_sequencer.database.engine,
            checkfirst=True,
        )

    def test_is_noop_when_column_already_exists(self):
        with patch.object(migrate_set_sequencer, "_table_exists", return_value=True):
            with patch.object(
                migrate_set_sequencer,
                "_column_names",
                return_value={"id", "sequencer"},
            ):
                with patch.object(
                    migrate_set_sequencer.database.engine, "begin"
                ) as begin:
                    migrate_set_sequencer.apply()

        begin.assert_not_called()

    def test_adds_column_when_missing(self):
        conn = MagicMock()
        context = MagicMock()
        context.__enter__.return_value = conn
        context.__exit__.return_value = False
        with patch.object(migrate_set_sequencer, "_table_exists", return_value=True):
            with patch.object(
                migrate_set_sequencer, "_column_names", return_value={"id"}
            ):
                with patch.object(
                    migrate_set_sequencer.database.engine,
                    "begin",
                    return_value=context,
                ):
                    migrate_set_sequencer.apply()

        conn.execute.assert_called_once()
        statement = str(conn.execute.call_args[0][0])
        assert "ALTER TABLE public.dj_set ADD COLUMN sequencer jsonb" in statement
