from __future__ import annotations

import html as html_lib
import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.base import LookupContext
from src.track_metadata.sources.constants import WEB_SEARCH_URL
from src.track_metadata.sources.queries import bandcamp_track_discovery_query
from src.track_metadata.sources.web_search import identity_confirmed, parse_search_results

logger = logging.getLogger(__name__)


def _collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _casefold_collapsed(value: str | None) -> str:
    if value is None:
        return ""
    return _collapse_whitespace(value).casefold()


def _extract_json_ld(html_text: str) -> dict[str, Any] | None:
    pattern = re.compile(
        r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>',
        flags=re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(html_text):
        try:
            payload = json.loads(html_lib.unescape(match.group(1)))
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(payload, dict):
            return payload
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict):
                    return item
    return None


def _extract_data_tralbum(html_text: str) -> dict[str, Any] | None:
    pattern = re.compile(
        r"data-tralbum=(['\"])(?P<payload>.*?)\1",
        flags=re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(html_text)
    if match is None:
        return None
    try:
        payload = json.loads(html_lib.unescape(match.group("payload")))
    except (json.JSONDecodeError, TypeError):
        return None
    return payload if isinstance(payload, dict) else None


def _extract_data_band(html_text: str) -> dict[str, Any] | None:
    pattern = re.compile(
        r"data-band=(['\"])(?P<payload>.*?)\1",
        flags=re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(html_text)
    if match is None:
        return None
    try:
        payload = json.loads(html_lib.unescape(match.group("payload")))
    except (json.JSONDecodeError, TypeError):
        return None
    return payload if isinstance(payload, dict) else None


def _meta_content(html_text: str, property_name: str) -> str | None:
    pattern = re.compile(
        rf'<meta[^>]+property="{re.escape(property_name)}"[^>]+content="([^"]*)"',
        flags=re.IGNORECASE,
    )
    match = pattern.search(html_text)
    if match is None:
        return None
    value = html_lib.unescape(match.group(1)).strip()
    return value or None


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _nested_get(data: dict[str, Any], *path: str) -> Any:
    current: Any = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _parse_bandcamp_page(html_text: str) -> tuple[str | None, str | None, str | None]:
    tralbum = _extract_data_tralbum(html_text) or {}
    data_band = _extract_data_band(html_text) or {}
    ld_json = _extract_json_ld(html_text) or {}

    explicit_label = _first_string(
        _nested_get(tralbum, "current", "publisher"),
        _nested_get(tralbum, "current", "label"),
        tralbum.get("label"),
    )
    owner = _first_string(
        data_band.get("name"),
        _nested_get(ld_json, "publisher", "name"),
        _meta_content(html_text, "og:site_name"),
    )
    artist = _first_string(
        tralbum.get("artist"),
        _nested_get(ld_json, "byArtist", "name"),
    )
    return explicit_label, owner, artist


def _is_bandcamp_host(host: str) -> bool:
    # Search output is untrusted, so a lookalike host such as evilbandcamp.com
    # must not pass as a Bandcamp page.
    return host == "bandcamp.com" or host.endswith(".bandcamp.com")


class BandcampSource:
    """Read a release label from a Bandcamp track page or album page.

    The source discovers the page through the shared web-search endpoint, then
    contributes the page owner as the label when the owner differs from the
    track artist. It returns None on any missing value or parse failure, so an
    unconfirmed key path yields no label rather than a wrong label.
    """

    name = "bandcamp"
    merge_fields = frozenset({"label"})

    def lookup(
        self, seed: SimpleMetadata, context: LookupContext
    ) -> SimpleMetadata | None:
        if seed.label and str(seed.label).strip():
            return None

        query = bandcamp_track_discovery_query(seed.artist, seed.title)
        if query is None:
            return None

        try:
            search_html = context.http.get_text(WEB_SEARCH_URL, params={"q": query})
        except Exception as exc:
            logger.warning("Bandcamp discovery search failed: %s", exc)
            return None

        results = parse_search_results(search_html)
        page_url: str | None = None
        for result in results:
            url = result.get("url", "")
            host = urlparse(url).hostname or ""
            if not _is_bandcamp_host(host.lower()):
                continue
            if identity_confirmed(seed, result):
                page_url = url
                break

        if page_url is None:
            return None

        try:
            page_html = context.http.get_text(page_url)
        except Exception as exc:
            logger.warning("Bandcamp page fetch failed for %s: %s", page_url, exc)
            return None

        try:
            explicit_label, owner, page_artist = _parse_bandcamp_page(page_html)
        except Exception as exc:
            logger.warning("Bandcamp page parse failed for %s: %s", page_url, exc)
            return None

        if explicit_label:
            compare_artist = page_artist or seed.artist
            if _casefold_collapsed(explicit_label) == _casefold_collapsed(compare_artist):
                return None
            return SimpleMetadata(label=explicit_label)

        if owner is None:
            return None

        compare_artist = page_artist or seed.artist
        if _casefold_collapsed(owner) == _casefold_collapsed(compare_artist):
            return None

        return SimpleMetadata(label=owner)
