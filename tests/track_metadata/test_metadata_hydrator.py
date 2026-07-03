from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from src.track_metadata.matching import (
    _best_year,
    _extract_remixer,
    _merge_missing,
    _normalize_for_match,
    _parse_filename_seed,
    _similarity,
)
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.base import LookupContext, MetadataSource
from src.track_metadata.sources.cache import MetadataCache
from src.track_metadata.sources.discogs import (
    _coerce_year,
    _first_list_item,
    _first_non_empty,
    _split_discogs_title,
)
from src.track_metadata.sources.hydrator import MetadataHydrator
from src.track_metadata.sources.musicbrainz import (
    _extract_year_from_date,
    _first_release_id,
    _format_artist_credit,
    _musicbrainz_payload_to_metadata,
)

TEST_DATA_DIR = Path(__file__).resolve().parent / "test_data"
SAMPLE_MP3 = TEST_DATA_DIR / "[01A - Abm - 086.00] Cell - Traffic (Live).mp3"


# ---------------------------------------------------------------------------
# _normalize_for_match
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Aphex Twin", "aphex twin"),
        ("Feat. Someone & Another", "someone and another"),
        ("Track (Extended Mix)", "track"),
        ("Track [Radio Edit]", "track"),
        ("  spaces  ", "spaces"),
        ("", ""),
        (None, ""),
        ("A&B feat. C (Remix)", "a and b c"),
    ],
)
def test_normalize_for_match(value: str | None, expected: str) -> None:
    assert _normalize_for_match(value) == expected


# ---------------------------------------------------------------------------
# _similarity
# ---------------------------------------------------------------------------


def test_similarity_identical() -> None:
    assert _similarity("Boards of Canada", "Boards of Canada") == pytest.approx(1.0)


def test_similarity_case_insensitive() -> None:
    assert _similarity("boards of canada", "BOARDS OF CANADA") == pytest.approx(1.0)


def test_similarity_empty_returns_zero() -> None:
    assert _similarity(None, "something") == pytest.approx(0.0)
    assert _similarity("something", None) == pytest.approx(0.0)
    assert _similarity(None, None) == pytest.approx(0.0)


def test_similarity_partial_match_between_zero_and_one() -> None:
    score = _similarity("Burial", "Actress")
    assert 0.0 < score < 1.0


# ---------------------------------------------------------------------------
# _extract_remixer
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Track Title (Artist Name Remix)", "Artist Name"),
        ("Track Title [Artist Name Remix]", "Artist Name"),
        ("Track Title (REMIX)", None),  # no name before "remix"
        ("Plain Track Title", None),
        (None, None),
        ("", None),
        ("Track (DJ Sneak Remix)", "DJ Sneak"),
    ],
)
def test_extract_remixer(title: str | None, expected: str | None) -> None:
    assert _extract_remixer(title) == expected


# ---------------------------------------------------------------------------
# _parse_filename_seed
# ---------------------------------------------------------------------------


def test_parse_filename_seed_with_dash_separator() -> None:
    path = Path("Artist Name - Track Title.mp3")
    result = _parse_filename_seed(path)
    assert result.artist == "Artist Name"
    assert result.title == "Track Title"
    assert result.remixer is None


def test_parse_filename_seed_without_dash() -> None:
    path = Path("Some Track Title.mp3")
    result = _parse_filename_seed(path)
    assert result.artist is None
    assert result.title == "Some Track Title"


def test_parse_filename_seed_with_remix_in_title() -> None:
    path = Path("Artist - Title (DJ Someone Remix).mp3")
    result = _parse_filename_seed(path)
    assert result.artist == "Artist"
    assert result.title == "Title (DJ Someone Remix)"
    assert result.remixer == "DJ Someone"


def test_parse_filename_seed_strips_mastering_cruft() -> None:
    path = Path("Linds - Sunset Funk [MASTER v2].mp3")
    result = _parse_filename_seed(path)
    assert result.artist == "Linds"
    assert result.title == "Sunset Funk"
    assert result.remixer is None


def test_parse_filename_seed_strips_original_mix_but_keeps_real_mix_names() -> None:
    original_mix = _parse_filename_seed(Path("Echo Delta - Jūra (Original Mix).mp3"))
    remix = _parse_filename_seed(Path("Lady Gaga - Alejandro (Linds Trance Mix).aiff"))

    assert original_mix.title == "Jūra"
    assert original_mix.remixer is None
    assert remix.title == "Alejandro (Linds Trance Mix)"
    assert remix.remixer == "Linds Trance"


def test_parse_filename_seed_underscores_become_spaces() -> None:
    path = Path("Artist_Name - Track_Title.mp3")
    result = _parse_filename_seed(path)
    assert result.artist == "Artist Name"
    assert result.title == "Track Title"


# ---------------------------------------------------------------------------
# _merge_missing
# ---------------------------------------------------------------------------


def test_merge_missing_fills_none_fields() -> None:
    target = SimpleMetadata(title="Existing Title", artist=None)
    candidate = SimpleMetadata(
        title="Candidate Title", artist="Candidate Artist", genre="Techno"
    )
    merged = _merge_missing(target, candidate)
    assert merged.title == "Existing Title"  # not overwritten
    assert merged.artist == "Candidate Artist"  # filled from candidate
    assert merged.genre == "Techno"  # filled from candidate


def test_merge_missing_returns_target_if_candidate_is_none() -> None:
    target = SimpleMetadata(title="Title")
    result = _merge_missing(target, None)
    assert result.title == "Title"


def test_merge_missing_with_fields_filter() -> None:
    target = SimpleMetadata(title=None, artist=None, genre=None, label=None)
    candidate = SimpleMetadata(
        title="New Title", artist="New Artist", genre="House", label="Label"
    )
    merged = _merge_missing(target, candidate, fields={"genre", "label"})
    assert merged.title is None  # filtered out
    assert merged.artist is None  # filtered out
    assert merged.genre == "House"
    assert merged.label == "Label"


# ---------------------------------------------------------------------------
# _best_year
# ---------------------------------------------------------------------------


def test_best_year_returns_first_truthy() -> None:
    assert _best_year(2020, 2021, 2022) == 2020


def test_best_year_skips_none() -> None:
    assert _best_year(None, None, 2018) == 2018


def test_best_year_all_none_returns_none() -> None:
    assert _best_year(None, None) is None


# ---------------------------------------------------------------------------
# _format_artist_credit
# ---------------------------------------------------------------------------


def test_format_artist_credit_simple_list() -> None:
    credit = [
        {"name": "Artist One", "joinphrase": " & "},
        {"name": "Artist Two", "joinphrase": ""},
    ]
    assert _format_artist_credit(credit) == "Artist One & Artist Two"


def test_format_artist_credit_string_items() -> None:
    credit = ["Artist One", " & ", "Artist Two"]
    assert _format_artist_credit(credit) == "Artist One & Artist Two"


def test_format_artist_credit_not_list_returns_none() -> None:
    assert _format_artist_credit("not a list") is None
    assert _format_artist_credit(None) is None


def test_format_artist_credit_empty_list_returns_none() -> None:
    assert _format_artist_credit([]) is None


# ---------------------------------------------------------------------------
# _first_release_id
# ---------------------------------------------------------------------------


def test_first_release_id_present() -> None:
    payload = {"releases": [{"id": "abc-123", "title": "Some Album"}]}
    assert _first_release_id(payload) == "abc-123"


def test_first_release_id_missing() -> None:
    assert _first_release_id({}) is None
    assert _first_release_id({"releases": []}) is None
    assert _first_release_id({"releases": [{"title": "No ID"}]}) is None


# ---------------------------------------------------------------------------
# _extract_year_from_date
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2021-05-01", 2021),
        ("1998", 1998),
        ("2000-01", 2000),
        ("no year here", None),
        (None, None),
        ("", None),
    ],
)
def test_extract_year_from_date(value: Any, expected: int | None) -> None:
    assert _extract_year_from_date(value) == expected


# ---------------------------------------------------------------------------
# _coerce_year
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (2021, 2021),
        ("2021", 2021),
        ("2021-01-01", 2021),
        (None, None),
        ("bad", None),
    ],
)
def test_coerce_year(value: Any, expected: int | None) -> None:
    assert _coerce_year(value) == expected


# ---------------------------------------------------------------------------
# _first_non_empty
# ---------------------------------------------------------------------------


def test_first_non_empty_returns_first_non_empty_string() -> None:
    assert _first_non_empty(None, "", "  ", "found") == "found"
    assert _first_non_empty(None, None) is None


def test_first_non_empty_strips_whitespace() -> None:
    assert _first_non_empty("  hello  ") == "hello"


# ---------------------------------------------------------------------------
# _first_list_item
# ---------------------------------------------------------------------------


def test_first_list_item_returns_first_string() -> None:
    assert _first_list_item(["Techno", "Electronic"]) == "Techno"


def test_first_list_item_skips_empty_strings() -> None:
    assert _first_list_item(["", "  ", "House"]) == "House"


def test_first_list_item_not_a_list_returns_none() -> None:
    assert _first_list_item("not a list") is None
    assert _first_list_item(None) is None


# ---------------------------------------------------------------------------
# _split_discogs_title
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected_artist", "expected_title"),
    [
        ("Artist - Album Title", "Artist", "Album Title"),
        ("Album Without Artist", None, "Album Without Artist"),
        ("", None, None),
        (None, None, None),
        (42, None, None),
    ],
)
def test_split_discogs_title(
    value: Any, expected_artist: str | None, expected_title: str | None
) -> None:
    artist, title = _split_discogs_title(value)
    assert artist == expected_artist
    assert title == expected_title


# ---------------------------------------------------------------------------
# _musicbrainz_payload_to_metadata
# ---------------------------------------------------------------------------


def test_musicbrainz_payload_to_metadata_with_release() -> None:
    recording = {
        "title": "My Track",
        "artist-credit": [{"name": "Great Artist", "joinphrase": ""}],
        "first-release-date": "2019-06-01",
        "genres": [],
    }
    release = {
        "title": "My Album",
        "date": "2019-06-01",
        "genres": [{"name": "Electronic"}],
        "label-info": [{"label": {"name": "Warp Records"}}],
    }
    result = _musicbrainz_payload_to_metadata(recording, release)
    assert result.title == "My Track"
    assert result.artist == "Great Artist"
    assert result.album == "My Album"
    assert result.label == "Warp Records"
    assert result.genre == "Electronic"
    assert result.year == 2019


def test_musicbrainz_payload_to_metadata_without_release() -> None:
    recording = {
        "title": "Solo Track",
        "artist-credit": [{"name": "Solo Artist", "joinphrase": ""}],
        "first-release-date": "2022",
        "genres": [{"name": "Ambient"}],
    }
    result = _musicbrainz_payload_to_metadata(recording, None)
    assert result.title == "Solo Track"
    assert result.artist == "Solo Artist"
    assert result.album is None
    assert result.label is None
    assert result.genre == "Ambient"
    assert result.year == 2022


# ---------------------------------------------------------------------------
# MetadataHydrator orchestration
# ---------------------------------------------------------------------------


class _FakeSource:
    """A stand-in metadata source that returns a preconfigured candidate."""

    def __init__(
        self,
        name: str,
        result: SimpleMetadata | None = None,
        *,
        merge_fields: frozenset[str] | None = None,
        boom: bool = False,
    ) -> None:
        self.name = name
        self.result = result
        self.merge_fields = merge_fields
        self.boom = boom
        self.seen_seeds: list[SimpleMetadata] = []

    def lookup(
        self, seed: SimpleMetadata, context: LookupContext
    ) -> SimpleMetadata | None:
        if self.boom:  # pragma: no cover - guards against unexpected calls
            raise AssertionError(f"source {self.name} should not be called")
        self.seen_seeds.append(seed)
        return self.result


def _make_hydrator(
    tmp_path: Path,
    *,
    catalog_sources: list[MetadataSource] | None = None,
    web_source: MetadataSource | None = None,
    **kwargs: Any,
) -> MetadataHydrator:
    return MetadataHydrator(
        cache=MetadataCache(path=tmp_path / "cache.json"),
        catalog_sources=catalog_sources if catalog_sources is not None else [],
        web_source=web_source if web_source is not None else _FakeSource("web_search"),
        beatport_genre_lookup=lambda artist, title: None,
        lastfm_genre_lookup=lambda artist, title: None,
        **kwargs,
    )


def _staged_mp3(tmp_path: Path, name: str) -> Path:
    mp3 = tmp_path / name
    shutil.copy2(SAMPLE_MP3, mp3)
    return mp3


def test_hydrate_uses_cache_hit(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "artist - track.mp3")
    hydrator = _make_hydrator(
        tmp_path, catalog_sources=[_FakeSource("boom", boom=True)]
    )
    hydrator.cache.store_final(
        hydrator.cache.file_key(mp3),
        SimpleMetadata(title="Cached Title", artist="Cached Artist"),
    )

    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.title == "Cached Title"
    assert result.artist == "Cached Artist"


def test_hydrate_uses_filename_seed_when_no_sources_match(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "Great Artist - Great Track.mp3")
    hydrator = _make_hydrator(tmp_path, catalog_sources=[_FakeSource("musicbrainz")])

    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.artist == "Great Artist"
    assert result.title == "Great Track"


def test_hydrate_does_not_overwrite_existing_metadata(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "SomeFile.mp3")
    existing = SimpleMetadata(
        title="Existing Title", artist="Existing Artist", bpm=128.0
    )
    candidate = SimpleMetadata(
        title="Candidate Title", artist="Candidate Artist", genre="Techno"
    )
    hydrator = _make_hydrator(
        tmp_path, catalog_sources=[_FakeSource("musicbrainz", candidate)]
    )

    result = hydrator.hydrate(mp3, existing)
    assert result.title == "Existing Title"
    assert result.artist == "Existing Artist"
    assert result.bpm == 128.0
    assert result.genre == "Techno"


def test_hydrate_writes_then_reads_cache(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "Track.mp3")
    source = _FakeSource("musicbrainz", SimpleMetadata(genre="Techno"))
    hydrator = _make_hydrator(tmp_path, catalog_sources=[source])

    first = hydrator.hydrate(mp3, SimpleMetadata(title="Cached Track", artist="Artist"))
    assert len(source.seen_seeds) == 1

    # Second hydrate hits the cache and must not touch sources again.
    source.boom = True
    second = hydrator.hydrate(mp3, SimpleMetadata())
    assert first.title == second.title
    assert first.artist == second.artist


def test_hydrate_uses_web_fallback_when_catalog_sources_leave_gaps(
    tmp_path: Path,
) -> None:
    mp3 = _staged_mp3(tmp_path, "Echo Delta - Jūra (Original Mix).mp3")
    web_candidate = SimpleMetadata(
        artist="Echo Delta",
        title="Jūra",
        label="Mule Musiq",
        genre="Deep House",
        year=2019,
    )
    hydrator = _make_hydrator(
        tmp_path,
        catalog_sources=[_FakeSource("musicbrainz")],
        web_source=_FakeSource("web_search", web_candidate),
        web_label_verifier=lambda _label: True,
    )

    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.artist == "Echo Delta"
    assert result.title == "Jūra"
    assert result.label == "Mule Musiq"
    assert result.genre == "Deep House"
    assert result.year == 2019


def test_hydrate_skips_web_fallback_when_all_fields_resolved(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "Track.mp3")
    full = SimpleMetadata(
        title="T", artist="A", album="Al", label="L", genre="G", remixer="R", year=2020
    )
    web = _FakeSource("web_search", boom=True)
    hydrator = _make_hydrator(
        tmp_path,
        catalog_sources=[_FakeSource("musicbrainz", full)],
        web_source=web,
    )

    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.year == 2020


def test_hydrate_respects_discogs_merge_field_restriction(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "No Tags.mp3")
    discogs = _FakeSource(
        "discogs",
        SimpleMetadata(title="Discogs Title", artist="Discogs Artist", label="Label"),
        merge_fields=frozenset({"album", "label", "genre", "year"}),
    )
    hydrator = _make_hydrator(
        tmp_path, catalog_sources=[discogs], web_label_verifier=lambda _label: True
    )

    # File has no " - " so no title/artist seed; discogs may only fill release fields.
    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.title == "No Tags"  # from filename, not discogs
    assert result.artist is None  # discogs artist is filtered out
    assert result.label == "Label"  # release-level field survives the restriction


def test_hydrate_fills_year_from_catalog_candidates(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "Artist - Track.mp3")
    hydrator = _make_hydrator(
        tmp_path,
        catalog_sources=[
            _FakeSource("musicbrainz", SimpleMetadata(genre="Techno")),
            _FakeSource(
                "discogs",
                SimpleMetadata(year=2011),
                merge_fields=frozenset({"album", "label", "genre", "year"}),
            ),
        ],
    )
    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.year == 2011


def test_hydrate_uses_musicbrainz_catalog_id_via_merge(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "Artist - Track.mp3")
    mb_candidate = SimpleMetadata(
        genre="Techno", source_catalog_id="mb-1", source_provider="musicbrainz"
    )
    hydrator = _make_hydrator(
        tmp_path, catalog_sources=[_FakeSource("musicbrainz", mb_candidate)]
    )
    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.source_catalog_id == "mb-1"
    assert result.source_provider == "musicbrainz"


def test_hydrate_applies_discogs_catalog_id_despite_field_restriction(
    tmp_path: Path,
) -> None:
    # Discogs' merge is restricted to release fields, so its catalog id cannot
    # flow through the merge; _apply_source_catalog_ids is what surfaces it.
    mp3 = _staged_mp3(tmp_path, "Artist - Track.mp3")
    mb_candidate = SimpleMetadata(genre="Techno")  # no catalog id
    discogs_candidate = SimpleMetadata(
        album="Al", source_catalog_id="disc-9", source_provider="discogs"
    )
    hydrator = _make_hydrator(
        tmp_path,
        catalog_sources=[
            _FakeSource("musicbrainz", mb_candidate),
            _FakeSource(
                "discogs",
                discogs_candidate,
                merge_fields=frozenset({"album", "label", "genre", "year"}),
            ),
        ],
    )
    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.source_catalog_id == "disc-9"
    assert result.source_provider == "discogs"


def test_hydrate_applies_label_fallback(tmp_path: Path) -> None:
    mp3 = _staged_mp3(tmp_path, "Track.mp3")
    hydrator = _make_hydrator(tmp_path, catalog_sources=[_FakeSource("musicbrainz")])
    existing = SimpleMetadata(title="Track", artist="Artist", label="White Label")

    result = hydrator.hydrate(mp3, existing)
    assert result.label == "CDR"


def test_hydrate_skips_remote_lookups_for_beatport_encoded_file(tmp_path: Path) -> None:
    from mutagen.id3 import ID3, TENC

    mp3 = _staged_mp3(tmp_path, "Artist - Beatport Track.mp3")
    tags = ID3(str(mp3))
    tags.add(TENC(encoding=3, text="Beatport"))
    tags.save(str(mp3), v2_version=4)

    hydrator = _make_hydrator(
        tmp_path,
        catalog_sources=[_FakeSource("musicbrainz", boom=True)],
        web_source=_FakeSource("web_search", boom=True),
    )
    result = hydrator.hydrate(mp3, SimpleMetadata())
    assert result.artist == "Artist"
    assert result.title == "Beatport Track"


# ---------------------------------------------------------------------------
# MetadataHydrator candidate-resolver fallback
# ---------------------------------------------------------------------------


def test_resolve_from_candidates_returns_none_without_resolver(tmp_path: Path) -> None:
    hydrator = _make_hydrator(tmp_path)
    result = hydrator._resolve_from_candidates(
        Path("track.mp3"),
        SimpleMetadata(title="Track", artist="Artist"),
        [{"source": "musicbrainz", "metadata": {"title": "Track"}}],
    )
    assert result is None


def test_resolve_from_candidates_returns_none_when_no_missing_fields(
    tmp_path: Path,
) -> None:
    resolver = MagicMock(return_value=SimpleMetadata(title="X"))
    hydrator = _make_hydrator(tmp_path, candidate_resolver=resolver)
    full_metadata = SimpleMetadata(
        title="Title",
        artist="Artist",
        album="Album",
        label="Label",
        genre="Genre",
        remixer="Remixer",
        year=2020,
    )
    result = hydrator._resolve_from_candidates(
        Path("track.mp3"), full_metadata, [{"source": "musicbrainz", "metadata": {}}]
    )
    assert result is None
    resolver.assert_not_called()


def test_resolve_from_candidates_returns_none_when_no_sources(tmp_path: Path) -> None:
    resolver = MagicMock(return_value=SimpleMetadata(title="X"))
    hydrator = _make_hydrator(tmp_path, candidate_resolver=resolver)
    result = hydrator._resolve_from_candidates(
        Path("track.mp3"), SimpleMetadata(title=None), []
    )
    assert result is None
    resolver.assert_not_called()


def test_resolve_from_candidates_uses_callback(tmp_path: Path) -> None:
    resolver = MagicMock(return_value=SimpleMetadata(title="Resolved Title"))
    hydrator = _make_hydrator(tmp_path, candidate_resolver=resolver)
    result = hydrator._resolve_from_candidates(
        Path("track.mp3"),
        SimpleMetadata(title=None, artist="Artist"),
        [{"source": "musicbrainz", "metadata": {"title": "Resolved Title"}}],
    )
    assert result is not None
    assert result.title == "Resolved Title"
    resolver.assert_called_once()


def test_resolve_from_candidates_records_agent_events(tmp_path: Path) -> None:
    resolver = MagicMock(return_value=SimpleMetadata(title="Resolved Title"))
    hydrator = _make_hydrator(tmp_path, candidate_resolver=resolver)
    events: list[dict[str, object]] = []
    result = hydrator._resolve_from_candidates(
        Path("track.mp3"),
        SimpleMetadata(title=None, artist="Artist"),
        [{"source": "musicbrainz", "metadata": {"title": "Resolved Title"}}],
        agent_events=events,
    )
    assert result is not None
    assert len(events) == 1
    assert events[0]["type"] == "metadata_fallback"
    assert events[0]["outcome"] == "resolved"
    assert "title" in events[0]["missing_fields"]
    assert events[0]["file"] == "track.mp3"


def test_resolve_from_candidates_records_no_match_agent_events(tmp_path: Path) -> None:
    resolver = MagicMock(return_value=None)
    hydrator = _make_hydrator(tmp_path, candidate_resolver=resolver)
    events: list[dict[str, object]] = []
    hydrator._resolve_from_candidates(
        Path("track.mp3"),
        SimpleMetadata(title=None, artist="Artist"),
        [{"source": "musicbrainz", "metadata": {}}],
        agent_events=events,
    )
    assert len(events) == 1
    assert events[0]["outcome"] == "no_match"


def test_resolve_from_candidates_records_error_agent_events(tmp_path: Path) -> None:
    resolver = MagicMock(side_effect=RuntimeError("boom"))
    hydrator = _make_hydrator(tmp_path, candidate_resolver=resolver)
    events: list[dict[str, object]] = []
    result = hydrator._resolve_from_candidates(
        Path("track.mp3"),
        SimpleMetadata(title=None, artist="Artist"),
        [{"source": "musicbrainz", "metadata": {}}],
        agent_events=events,
    )
    assert result is None
    assert events[0]["outcome"] == "error"
    assert "boom" in events[0]["error"]
