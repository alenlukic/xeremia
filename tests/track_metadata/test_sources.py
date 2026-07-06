from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import requests
import pytest

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources import acoustid_source as acoustid_mod
from src.track_metadata.sources.acoustid_source import AcoustIdSource
from src.track_metadata.sources.base import LookupContext
from src.track_metadata.sources.discogs import DiscogsSource, select_best_result
from src.track_metadata.sources.musicbrainz import (
    MusicBrainzSource,
    select_best_recording,
)
from src.track_metadata.sources.web_search import (
    WebSearchResearchClient,
    WebSearchSource,
    is_free_download_result,
)
from src.utils.http import RateLimitedHttpClient


def _client(get: Any) -> RateLimitedHttpClient:
    client = RateLimitedHttpClient(sleep=lambda _seconds: None)
    client.session.get = get  # type: ignore[method-assign]
    return client


def _json_response(payload: dict[str, Any]) -> MagicMock:
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


def _text_response(text: str) -> MagicMock:
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.text = text
    return response


def _context(client: RateLimitedHttpClient, name: str = "track.mp3") -> LookupContext:
    return LookupContext(file_path=Path(name), http=client)


# ---------------------------------------------------------------------------
# AcoustIdSource
# ---------------------------------------------------------------------------


def test_acoustid_skips_without_api_key(monkeypatch) -> None:
    monkeypatch.delenv("ACOUSTID_API_KEY", raising=False)
    source = AcoustIdSource()
    result = source.lookup(SimpleMetadata(), _context(_client(MagicMock())))
    assert result is None


def test_acoustid_skips_when_pyacoustid_not_installed(monkeypatch) -> None:
    monkeypatch.setenv("ACOUSTID_API_KEY", "fakekey")
    source = AcoustIdSource()

    original = sys.modules.get("acoustid", "SENTINEL")
    sys.modules["acoustid"] = None  # type: ignore[assignment]
    try:
        result = source.lookup(SimpleMetadata(), _context(_client(MagicMock())))
        assert result is None
    finally:
        if original == "SENTINEL":
            del sys.modules["acoustid"]
        else:
            sys.modules["acoustid"] = original


def test_acoustid_returns_none_on_low_confidence(monkeypatch) -> None:
    monkeypatch.setenv("ACOUSTID_API_KEY", "fakekey")
    mock_acoustid = MagicMock()
    mock_acoustid.match.return_value = [(0.50, "rec-id", "Title", "Artist")]
    source = AcoustIdSource()

    with patch.dict("sys.modules", {"acoustid": mock_acoustid}):
        result = source.lookup(SimpleMetadata(), _context(_client(MagicMock())))
    assert result is None


def test_acoustid_returns_metadata_on_high_confidence(monkeypatch) -> None:
    monkeypatch.setenv("ACOUSTID_API_KEY", "fakekey")
    mock_acoustid = MagicMock()
    mock_acoustid.match.return_value = [
        (0.95, "rec-abc", "Matched Title", "Matched Artist")
    ]
    source = AcoustIdSource()

    with (
        patch.object(acoustid_mod, "fetch_recording_metadata", return_value=None),
        patch.dict("sys.modules", {"acoustid": mock_acoustid}),
    ):
        result = source.lookup(SimpleMetadata(), _context(_client(MagicMock())))

    assert result is not None
    assert result.title == "Matched Title"
    assert result.artist == "Matched Artist"


# ---------------------------------------------------------------------------
# MusicBrainzSource
# ---------------------------------------------------------------------------


def test_musicbrainz_returns_none_without_title() -> None:
    source = MusicBrainzSource()
    result = source.lookup(
        SimpleMetadata(), _context(_client(MagicMock()), "no_title.mp3")
    )
    assert result is None


def test_musicbrainz_handles_http_error() -> None:
    get = MagicMock(side_effect=requests.RequestException("timeout"))
    source = MusicBrainzSource()
    result = source.lookup(
        SimpleMetadata(title="Some Track", artist="Some Artist"), _context(_client(get))
    )
    assert result is None


def test_musicbrainz_returns_none_when_no_recordings_match() -> None:
    get = MagicMock(return_value=_json_response({"recordings": []}))
    source = MusicBrainzSource()
    result = source.lookup(
        SimpleMetadata(title="Obscure Track"), _context(_client(get))
    )
    assert result is None


def test_musicbrainz_returns_metadata_on_match() -> None:
    search = _json_response(
        {
            "recordings": [
                {
                    "id": "rec-xyz",
                    "title": "Windowlicker",
                    "artist-credit": [{"name": "Aphex Twin", "joinphrase": ""}],
                    "releases": [{"title": "Windowlicker"}],
                }
            ]
        }
    )
    recording = _json_response(
        {
            "id": "rec-xyz",
            "title": "Windowlicker",
            "artist-credit": [{"name": "Aphex Twin", "joinphrase": ""}],
            "first-release-date": "1999",
            "genres": [{"name": "Electronic"}],
            "releases": [{"id": "rel-abc", "title": "Windowlicker"}],
        }
    )
    release = _json_response(
        {
            "title": "Windowlicker",
            "date": "1999-03-22",
            "genres": [{"name": "Electronic"}],
            "label-info": [{"label": {"name": "Warp Records"}}],
        }
    )

    def fake_get(url: str, **_kwargs: Any) -> MagicMock:
        if "/recording/rec-xyz" in url:
            return recording
        if "/release/rel-abc" in url:
            return release
        return search

    source = MusicBrainzSource()
    result = source.lookup(
        SimpleMetadata(title="Windowlicker", artist="Aphex Twin"),
        _context(_client(fake_get)),
    )
    assert result is not None
    assert result.title == "Windowlicker"
    assert result.artist == "Aphex Twin"
    assert result.label == "Warp Records"


def test_select_best_recording_returns_none_below_threshold() -> None:
    recordings = [
        {
            "id": "rec-1",
            "title": "Completely Different",
            "artist-credit": [{"name": "Another Artist", "joinphrase": ""}],
            "releases": [],
        }
    ]
    seed = SimpleMetadata(title="My Track", artist="My Artist")
    assert select_best_recording(recordings, seed) is None


def test_select_best_recording_returns_best_match() -> None:
    recordings = [
        {
            "id": "rec-1",
            "title": "Windowlicker",
            "artist-credit": [{"name": "Aphex Twin", "joinphrase": ""}],
            "releases": [{"title": "Windowlicker"}],
        },
        {
            "id": "rec-2",
            "title": "Come to Daddy",
            "artist-credit": [{"name": "Aphex Twin", "joinphrase": ""}],
            "releases": [{"title": "Come to Daddy"}],
        },
    ]
    seed = SimpleMetadata(title="Windowlicker", artist="Aphex Twin")
    best = select_best_recording(recordings, seed)
    assert best is not None
    assert best["id"] == "rec-1"


# ---------------------------------------------------------------------------
# DiscogsSource
# ---------------------------------------------------------------------------


def test_discogs_returns_none_without_credentials(monkeypatch) -> None:
    for var in ("DISCOGS_TOKEN", "DISCOGS_KEY", "DISCOGS_SECRET"):
        monkeypatch.delenv(var, raising=False)
    source = DiscogsSource()
    result = source.lookup(
        SimpleMetadata(title="Track"), _context(_client(MagicMock()))
    )
    assert result is None


def test_discogs_returns_none_without_title(monkeypatch) -> None:
    monkeypatch.setenv("DISCOGS_TOKEN", "faketoken")
    source = DiscogsSource()
    result = source.lookup(
        SimpleMetadata(artist="Artist"), _context(_client(MagicMock()))
    )
    assert result is None


def test_discogs_returns_metadata_on_match(monkeypatch) -> None:
    monkeypatch.setenv("DISCOGS_TOKEN", "faketoken")
    get = MagicMock(
        return_value=_json_response(
            {
                "results": [
                    {
                        "title": "Aphex Twin - Selected Ambient Works",
                        "year": 1992,
                        "genre": ["Electronic"],
                        "label": ["R&S Records"],
                    }
                ]
            }
        )
    )
    source = DiscogsSource()
    result = source.lookup(
        SimpleMetadata(title="Selected Ambient Works", artist="Aphex Twin"),
        _context(_client(get)),
    )
    assert result is not None
    assert result.year == 1992
    assert result.genre == "Electronic"
    assert result.label == "R&S Records"


def test_discogs_supports_key_and_secret_auth(monkeypatch) -> None:
    monkeypatch.delenv("DISCOGS_TOKEN", raising=False)
    monkeypatch.setenv("DISCOGS_KEY", "key123")
    monkeypatch.setenv("DISCOGS_SECRET", "secret456")
    get = MagicMock(
        return_value=_json_response(
            {
                "results": [
                    {
                        "title": "Echo Delta - Jūra",
                        "year": 2019,
                        "genre": ["Deep House"],
                        "label": ["Mule Musiq"],
                    }
                ]
            }
        )
    )
    source = DiscogsSource()
    result = source.lookup(
        SimpleMetadata(title="Jūra", artist="Echo Delta"), _context(_client(get))
    )
    assert result is not None
    assert result.label == "Mule Musiq"
    _, kwargs = get.call_args
    assert kwargs["params"]["key"] == "key123"
    assert kwargs["params"]["secret"] == "secret456"


def test_discogs_returns_none_below_threshold(monkeypatch) -> None:
    monkeypatch.setenv("DISCOGS_TOKEN", "faketoken")
    get = MagicMock(
        return_value=_json_response(
            {
                "results": [
                    {
                        "title": "Completely Unrelated - Release Name",
                        "year": 2005,
                        "genre": ["Pop"],
                        "label": ["Some Label"],
                    }
                ]
            }
        )
    )
    source = DiscogsSource()
    result = source.lookup(
        SimpleMetadata(title="Very Different Track", artist="Unknown Artist"),
        _context(_client(get)),
    )
    assert result is None


def test_select_best_result_prefers_higher_score() -> None:
    results = [
        {"title": "Aphex Twin - Windowlicker"},
        {"title": "Someone Else - Unrelated"},
    ]
    seed = SimpleMetadata(title="Windowlicker", artist="Aphex Twin")
    best, score = select_best_result(results, seed)
    assert best is not None
    assert best["title"].startswith("Aphex Twin")
    assert score > 0.72


# ---------------------------------------------------------------------------
# WebSearchSource
# ---------------------------------------------------------------------------


def test_web_search_returns_metadata_from_results() -> None:
    html = (
        '<a class="result__a" href="https://example.com">'
        "Echo Delta - Jūra (Original Mix) [Mule Musiq] | Beatport</a>"
        '<div class="result__snippet">Genres: Deep House. Released 2019 on Mule Musiq.</div>'
    )
    source = WebSearchSource()
    result = source.lookup(
        SimpleMetadata(title="Jūra", artist="Echo Delta"),
        _context(
            _client(MagicMock(return_value=_text_response(html))),
            "Echo Delta - Jūra.mp3",
        ),
    )
    assert result is not None
    assert result.artist == "Echo Delta"
    assert result.title == "Jūra"
    assert result.label == "Mule Musiq"
    assert result.genre == "Deep House"
    assert result.year == 2019


def test_web_search_returns_none_without_query() -> None:
    source = WebSearchSource()
    result = source.lookup(SimpleMetadata(), _context(_client(MagicMock())))
    assert result is None


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        (
            {
                "title": "Artist - Track",
                "snippet": "Free download on SoundCloud",
                "url": "https://soundcloud.com/artist/track",
            },
            True,
        ),
        (
            {
                "title": "Artist - Track | Hypeddit",
                "snippet": "Download track",
                "url": "https://hypeddit.com/track",
            },
            True,
        ),
        (
            {
                "title": "Artist - Track",
                "snippet": "Stream only",
                "url": "https://soundcloud.com/artist/track",
            },
            False,
        ),
    ],
)
def test_is_free_download_result(result: dict[str, str], expected: bool) -> None:
    assert is_free_download_result(result) is expected


def test_detect_free_download_uses_site_restricted_query() -> None:
    html = (
        '<a class="result__a" href="https://soundcloud.com/a/t">Artist - Track | SoundCloud</a>'
        '<div class="result__snippet">Free download</div>'
    )
    captured: dict[str, str] = {}

    def _get(url: str, *, params: dict[str, str] | None = None, timeout=None, **_kwargs):
        captured["query"] = params["q"] if params else ""
        return _text_response(html)

    client = WebSearchResearchClient(_client(_get))
    assert client.detect_free_download("Artist", "Track") is True
    assert captured["query"].startswith("(site:soundcloud.com OR site:hypeddit.com)")


def test_detect_free_download_requires_identity_match() -> None:
    html = (
        '<a class="result__a" href="https://soundcloud.com/other/track">'
        "Other Artist - Other Track | SoundCloud</a>"
        '<div class="result__snippet">Free download</div>'
    )
    client = WebSearchResearchClient(_client(lambda *_args, **_kwargs: _text_response(html)))
    assert client.detect_free_download("Artist", "Track") is False
