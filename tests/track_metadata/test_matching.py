from __future__ import annotations

from pathlib import Path

from src.track_metadata.matching import (
    _compose_display_title,
    _parse_filename_seed,
)
from src.track_metadata.models import SimpleMetadata


def test_parse_filename_seed_remix_prefix_sets_original_work_only() -> None:
    path = Path("[Remix of ATC - Around The World] LonelyFans - Na Na Na.mp3")
    result = _parse_filename_seed(path)
    assert result.artist == "ATC"
    assert result.title == "Around The World"
    assert result.remixer is None


def test_parse_filename_seed_remix_prefix_wav_without_tags() -> None:
    path = Path("[Remix of ATC - Around The World] LonelyFans - Na Na Na.wav")
    result = _parse_filename_seed(path)
    assert result.artist == "ATC"
    assert result.title == "Around The World"
    assert result.remixer is None


def test_compose_display_title_with_search_resolved_remixer() -> None:
    metadata = SimpleMetadata(
        artist="ATC",
        title="Around The World",
        remixer="LonelyFans",
        key="Abm",
        bpm=86.0,
    )
    title = _compose_display_title(metadata, "01A")
    assert title == "[01A - Abm - 086.00] ATC - Around The World (LonelyFans Remix)"
