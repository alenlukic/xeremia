"""Shared helpers for idempotent one-off schema migrations."""

from __future__ import annotations

import argparse
import sys
from typing import Any, Callable, Iterable, Optional

from sqlalchemy import inspect


def table_exists(engine, table_name: str) -> bool:
    return table_name in inspect(engine).get_table_names()


def column_names(engine, table_name: str) -> set[str]:
    return {col["name"] for col in inspect(engine).get_columns(table_name)}


def print_errors(errors: Iterable[str]) -> None:
    for err in errors:
        print(err, file=sys.stderr)


def run_migration_cli(
    argv: Optional[list[str]],
    *,
    description: str,
    verify_help: str,
    verify_fn: Callable[[], list[str]],
    apply_fn: Callable[[argparse.Namespace], Any],
    verified_message: str,
    applied_message: str,
    configure_parser: Optional[Callable[[argparse.ArgumentParser], None]] = None,
    on_apply_success: Optional[Callable[[Any], None]] = None,
) -> int:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help=verify_help,
    )
    if configure_parser is not None:
        configure_parser(parser)
    args = parser.parse_args(argv)

    if args.verify_only:
        errors = verify_fn()
        if errors:
            print_errors(errors)
            return 1
        print(verified_message)
        return 0

    result = apply_fn(args)
    errors = verify_fn()
    if errors:
        print_errors(errors)
        return 1
    print(applied_message)
    if on_apply_success is not None:
        on_apply_success(result)
    return 0
