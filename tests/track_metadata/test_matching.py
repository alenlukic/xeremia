from __future__ import annotations

from pathlib import Path

from src.track_metadata.matching import (
    _compose_display_title,
    _parse_filename_seed,
)
from src.track_metadata.models import SimpleMetadata


def test_parse_filename_seed_remix_prefix_sets_original_work_and_remixer_hint() -> None:
    path = Path("[Remix of ATC - Around The World] LonelyFans - Na Na Na.mp3")
    result = _parse_filename_seed(path)
    assert result.artist == "ATC"
    assert result.title == "Around The World"
    assert result.remixer == "LonelyFans"


def test_parse_filename_seed_remix_prefix_wav_without_tags() -> None:
    path = Path("[Remix of ATC - Around The World] LonelyFans - Na Na Na.wav")
    result = _parse_filename_seed(path)
    assert result.artist == "ATC"
    assert result.title == "Around The World"
    assert result.remixer == "LonelyFans"


def test_parse_filename_seed_remix_prefix_without_tail_remixer() -> None:
    path = Path("[Remix of ATC - Around The World].wav")
    result = _parse_filename_seed(path)
    assert result.artist == "ATC"
    assert result.title == "Around The World"
    assert result.remixer is None


def test_parse_filename_seed_remix_prefix_extracts_edit_remixer() -> None:
    path = Path(
        "[Remix of Culture Club - Do You Really Want to Hurt Me] "
        "hurts me (DJ MISCHKONSUM TRANCE EDIT).wav"
    )
    result = _parse_filename_seed(path)
    assert result.artist == "Culture Club"
    assert result.title == "Do You Really Want to Hurt Me"
    assert result.remixer == "DJ MISCHKONSUM TRANCE"


def test_parse_filename_seed_remix_prefix_extracts_parenthetical_edit_remixer() -> None:
    path = Path(
        "[Remix of Tove Lo - Talking Body] "
        "Talking Body (Beau James Speedy G Edit) mp3.mp3"
    )
    result = _parse_filename_seed(path)
    assert result.artist == "Tove Lo"
    assert result.title == "Talking Body"
    assert result.remixer == "Beau James Speedy G"


def test_parse_filename_seed_remix_prefix_extracts_bracketed_edit_remixer() -> None:
    path = Path(
        "[Remix of Justin Timberlake - Sexyback] "
        "SUITSIDE SEXY BACK EDIT [V1MASTER].wav"
    )
    result = _parse_filename_seed(path)
    assert result.artist == "Justin Timberlake"
    assert result.title == "Sexyback"
    assert result.remixer == "SUITSIDE"


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


def test_compose_display_title_normalizes_multi_artist_separator_to_ampersand() -> None:
    metadata = SimpleMetadata(
        artist="mes amis, DJ Holgersson",
        title="Atmos (Original Mix)",
        key="Gm",
        bpm=153.85,
    )
    title = _compose_display_title(metadata, "06A")
    assert title == "[06A - Gm - 153.85] mes amis & DJ Holgersson - Atmos"


def test_compose_display_title_normalizes_multi_remixer_separator_to_ampersand() -> None:
    metadata = SimpleMetadata(
        artist="ATC",
        title="Around The World",
        remixer="LonelyFans, KI/KI",
        key="Abm",
        bpm=86.0,
    )
    title = _compose_display_title(metadata, "01A")
    assert (
        title
        == "[01A - Abm - 086.00] ATC - Around The World (LonelyFans & KI/KI Remix)"
    )


def test_compose_display_title_uses_and_when_artist_name_contains_ampersand() -> None:
    metadata = SimpleMetadata(
        artist="Above & Beyond, Richard Bedford",
        title="Thing Called Love",
        key="Ebm",
        bpm=85.97,
    )
    title = _compose_display_title(metadata, "02A")
    assert (
        title
        == "[02A - Ebm - 085.97] Above & Beyond and Richard Bedford - Thing Called Love"
    )
