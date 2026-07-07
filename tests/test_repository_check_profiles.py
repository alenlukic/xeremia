"""Regression checks for the embedded repository-check profile contract."""

import json
from pathlib import Path
from typing import List


_REPO_ROOT = Path(__file__).resolve().parent.parent
_PROFILE_PATH = _REPO_ROOT / ".pancreator" / "runtime" / "repository-checks.json"


def _commands(profile: str) -> List[str]:
    config = json.loads(_PROFILE_PATH.read_text(encoding="utf-8"))
    return config["profiles"][profile]["commands"]


def _pytest_commands(profile: str) -> List[str]:
    return [command for command in _commands(profile) if "pytest" in command]


def test_blocking_profiles_exclude_integration_and_slow_tests():
    for profile in ("fast", "full"):
        commands = _pytest_commands(profile)
        assert commands, f"{profile} profile must define a pytest command"
        assert all(
            '-m "not integration and not slow"' in command for command in commands
        )


def test_secondary_profile_owns_optional_integration_and_slow_tests():
    assert _pytest_commands("secondary") == [
        '.venv/bin/python -m pytest tests -m "integration or slow"'
    ]
