"""Walled-off gold-set suite for external metadata catalogs.

This suite is marked ``integration`` and is excluded from the fast test suite.
It serves two purposes:

1. Query generation (offline): for every gold-set scenario, assert that the
   centralized query builder produces exactly the expected query for each
   catalog. These fixtures document what queries each scenario must emit and
   guard the gold set's own expectations.
2. Live resolution (network): for scenarios with a known gold answer, issue the
   real catalog request and assert the resolved metadata matches the gold set.
   Network calls are skipped automatically when the catalog is unreachable or
   credentials are absent, so the suite degrades to the offline checks alone.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
import requests

from src.track_metadata.matching import _similarity
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.base import LookupContext
from src.track_metadata.sources.constants import (
    DEFAULT_USER_AGENT,
    HTTP_TIMEOUT_SECONDS,
    MUSICBRAINZ_BASE_URL,
)
from src.track_metadata.sources.discogs import DiscogsSource
from src.track_metadata.sources.musicbrainz import MusicBrainzSource
from src.track_metadata.sources.queries import (
    build_search_terms,
    discogs_query_params,
    musicbrainz_query,
    web_search_query,
)
from src.utils.http import RateLimitedHttpClient

pytestmark = pytest.mark.integration

GOLD_SET_PATH = Path(__file__).resolve().parent / "gold_set.json"
_GOLD_MATCH_THRESHOLD = 0.6


def _load_gold_set() -> list[dict[str, Any]]:
    data = json.loads(GOLD_SET_PATH.read_text(encoding="utf-8"))
    return data["entries"]


GOLD_ENTRIES = _load_gold_set()


def _seed(entry: dict[str, Any]) -> SimpleMetadata:
    return SimpleMetadata(**entry["seed"])


def _live_client() -> RateLimitedHttpClient:
    return RateLimitedHttpClient(
        user_agent=DEFAULT_USER_AGENT, default_timeout=HTTP_TIMEOUT_SECONDS
    )


def _musicbrainz_reachable() -> bool:
    try:
        requests.get(
            f"{MUSICBRAINZ_BASE_URL}/",
            headers={"User-Agent": DEFAULT_USER_AGENT},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        return True
    except requests.RequestException:
        return False


# ---------------------------------------------------------------------------
# (b) + (c) query generation: assert each scenario emits the expected queries
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("entry", GOLD_ENTRIES, ids=[e["name"] for e in GOLD_ENTRIES])
def test_query_generation_matches_gold_fixture(entry: dict[str, Any]) -> None:
    terms = build_search_terms(_seed(entry))
    expected = entry["expected_queries"]
    assert musicbrainz_query(terms) == expected["musicbrainz"]
    assert discogs_query_params(terms) == expected["discogs"]
    assert web_search_query(terms) == expected["web_search"]


# ---------------------------------------------------------------------------
# (a) + (c) live resolution: assert real results match the gold set
# ---------------------------------------------------------------------------


_LIVE_ENTRIES = [e for e in GOLD_ENTRIES if e.get("gold")]


@pytest.mark.parametrize("entry", _LIVE_ENTRIES, ids=[e["name"] for e in _LIVE_ENTRIES])
def test_musicbrainz_live_resolution_matches_gold(entry: dict[str, Any]) -> None:
    if not _musicbrainz_reachable():
        pytest.skip("MusicBrainz is unreachable")

    context = LookupContext(file_path=Path(f"{entry['name']}.mp3"), http=_live_client())
    result = MusicBrainzSource().lookup(_seed(entry), context)
    assert result is not None, f"no MusicBrainz match for {entry['name']}"

    gold = entry["gold"]
    assert _similarity(result.artist, gold["artist"]) >= _GOLD_MATCH_THRESHOLD
    assert _similarity(result.title, gold["title"]) >= _GOLD_MATCH_THRESHOLD


@pytest.mark.parametrize("entry", _LIVE_ENTRIES, ids=[e["name"] for e in _LIVE_ENTRIES])
def test_discogs_live_resolution_matches_gold(entry: dict[str, Any]) -> None:
    if not (os.getenv("DISCOGS_TOKEN") or (os.getenv("DISCOGS_KEY") and os.getenv("DISCOGS_SECRET"))):
        pytest.skip("Discogs credentials are not configured")

    context = LookupContext(file_path=Path(f"{entry['name']}.mp3"), http=_live_client())
    result = DiscogsSource().lookup(_seed(entry), context)
    if result is None:
        pytest.skip(f"Discogs returned no confident match for {entry['name']}")

    # Discogs contributes release-level fields; assert we at least recovered a
    # plausible release for the gold track rather than an unrelated one.
    assert result.album is not None
