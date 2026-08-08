"""Tests for the tracklist overrides migration script."""

from unittest.mock import MagicMock, patch

from src.scripts import migrate_tracklist_overrides


class TestTracklistOverridesMigrationVerify:
    def test_reports_missing_table(self):
        with patch.object(
            migrate_tracklist_overrides, "_table_exists", return_value=False
        ):
            assert migrate_tracklist_overrides.verify() == [
                "set_tracklist_entry table is missing"
            ]

    def test_reports_each_missing_column(self):
        with patch.object(
            migrate_tracklist_overrides, "_table_exists", return_value=True
        ):
            with patch.object(
                migrate_tracklist_overrides, "_column_names", return_value={"id"}
            ):
                assert migrate_tracklist_overrides.verify() == [
                    "set_tracklist_entry.play_minutes column is missing",
                    "set_tracklist_entry.pinned_end_minutes column is missing",
                    "set_tracklist_entry.bpm_override column is missing",
                ]

    def test_passes_when_all_columns_present(self):
        with patch.object(
            migrate_tracklist_overrides, "_table_exists", return_value=True
        ):
            with patch.object(
                migrate_tracklist_overrides,
                "_column_names",
                return_value={
                    "id",
                    "play_minutes",
                    "pinned_end_minutes",
                    "bpm_override",
                },
            ):
                assert migrate_tracklist_overrides.verify() == []


class TestTracklistOverridesMigrationApply:
    def test_creates_table_when_missing(self):
        with patch.object(
            migrate_tracklist_overrides, "_table_exists", return_value=False
        ):
            with patch.object(
                migrate_tracklist_overrides.SetTracklistEntry.__table__, "create"
            ) as create_table:
                migrate_tracklist_overrides.apply()

        create_table.assert_called_once_with(
            bind=migrate_tracklist_overrides.database.engine,
            checkfirst=True,
        )

    def test_is_noop_when_columns_exist(self):
        with patch.object(
            migrate_tracklist_overrides, "_table_exists", return_value=True
        ):
            with patch.object(
                migrate_tracklist_overrides,
                "_column_names",
                return_value={
                    "id",
                    "play_minutes",
                    "pinned_end_minutes",
                    "bpm_override",
                },
            ):
                with patch.object(
                    migrate_tracklist_overrides.database.engine, "begin"
                ) as begin:
                    migrate_tracklist_overrides.apply()

        begin.assert_not_called()

    def test_adds_only_missing_columns(self):
        conn = MagicMock()
        context = MagicMock()
        context.__enter__.return_value = conn
        context.__exit__.return_value = False
        with patch.object(
            migrate_tracklist_overrides, "_table_exists", return_value=True
        ):
            with patch.object(
                migrate_tracklist_overrides,
                "_column_names",
                return_value={"id", "play_minutes"},
            ):
                with patch.object(
                    migrate_tracklist_overrides.database.engine,
                    "begin",
                    return_value=context,
                ):
                    migrate_tracklist_overrides.apply()

        statements = [str(call.args[0]) for call in conn.execute.call_args_list]
        assert len(statements) == 2
        assert (
            "ALTER TABLE public.set_tracklist_entry "
            "ADD COLUMN pinned_end_minutes numeric(7,2)"
        ) in statements[0] + statements[1]
        assert (
            "ALTER TABLE public.set_tracklist_entry "
            "ADD COLUMN bpm_override numeric(5,2)"
        ) in statements[0] + statements[1]
