from __future__ import annotations

import json
from pathlib import Path

from src.data_management.genre_vocabulary import (
    CANONICAL_GENRES,
    resolve_canonical_genre,
    record_genre_rejection,
)


def test_vocabulary_members():
    assert len(CANONICAL_GENRES) == 32
    assert "Breaks / Breakbeat / UK Bass" in CANONICAL_GENRES
    assert "Breaks / Breakbeat / Uk Bass" not in CANONICAL_GENRES


def test_alias_resolution_case_insensitive():
    assert resolve_canonical_genre("Psy-Trance") == "Psytrance"
    assert resolve_canonical_genre("Psy-trance") == "Psytrance"
    assert resolve_canonical_genre("psy-trance") == "Psytrance"
    assert resolve_canonical_genre("Soundtrack") == "Soundtracks"
    assert resolve_canonical_genre("Electronic") == "Electronica"


def test_off_vocabulary_returns_none():
    assert resolve_canonical_genre("Chill House") is None
    assert resolve_canonical_genre("UK Garage") is None


def test_noise_guards_reject_scraped_titles_and_long_values():
    assert resolve_canonical_genre("Buy Drum &amp; Bass Music") is None
    assert (
        resolve_canonical_genre("Hard Dance / Hardcore / Neo Rave Tracks - Beatport")
        is None
    )
    assert resolve_canonical_genre("x" * 65) is None


def test_review_queue_appends_jsonl_records(tmp_path: Path):
    queue = tmp_path / "queue.jsonl"
    record_genre_rejection("Chill House", "off_vocabulary", "test", queue_path=queue)
    record_genre_rejection("UK Garage", "off_vocabulary", "test", queue_path=queue)
    lines = queue.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    for line in lines:
        payload = json.loads(line)
        assert {"raw", "reason", "context"} <= payload.keys()
