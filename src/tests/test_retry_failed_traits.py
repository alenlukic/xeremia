"""Unit tests for retry_failed_traits configuration."""

from pathlib import Path

from src.scripts.feature_extraction.retry_failed_traits import LOG_FILE


def test_log_file_is_under_repo_logs():
    repo_root = Path(__file__).resolve().parents[2]
    assert LOG_FILE == repo_root / "logs" / "trait_failure_retry.txt"
