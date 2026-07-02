from __future__ import annotations

import html as html_lib
import logging
import re

from src.track_metadata.label import is_rejected_catalog_label
from src.track_metadata.matching import (
    _clean_title_seed,
    _extract_remixer,
    _normalize_whitespace,
    _similarity,
)
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.base import LookupContext
from src.track_metadata.sources.constants import (
    WEB_SEARCH_ARTIST_WEIGHT,
    WEB_SEARCH_MAX_RESULTS,
    WEB_SEARCH_MIN_SCORE,
    WEB_SEARCH_TITLE_WEIGHT,
    WEB_SEARCH_URL,
)
from src.track_metadata.sources.queries import build_search_terms, web_search_query

_CATALOG_SUFFIX_PATTERN = re.compile(
    r"\s+-\s+(?:Beatport|Discogs|MusicBrainz|YouTube|Spotify).*$",
    flags=re.IGNORECASE,
)
_TITLE_TAIL_PATTERN = re.compile(r"\s+\|\s+.*$")


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html_lib.unescape(value))
    return re.sub(r"\s+", " ", text).strip()


def parse_search_results(html_text: str) -> list[dict[str, str]]:
    titles = re.findall(
        r'class="result__a"[^>]*>(.*?)</a>', html_text, flags=re.IGNORECASE | re.DOTALL
    )
    urls = re.findall(r'class="result__a"[^>]*href="([^"]+)"', html_text, flags=re.IGNORECASE)
    snippets = re.findall(
        r'class="result__snippet"[^>]*>(.*?)</(?:a|div)>',
        html_text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    results: list[dict[str, str]] = []
    for index, raw_title in enumerate(titles[:WEB_SEARCH_MAX_RESULTS]):
        title = _strip_html(raw_title)
        if not title:
            continue
        results.append(
            {
                "title": title,
                "url": urls[index] if index < len(urls) else "",
                "snippet": _strip_html(snippets[index]) if index < len(snippets) else "",
            }
        )
    return results


def _normalize_result_title(title_text: str) -> str:
    normalized = _TITLE_TAIL_PATTERN.sub("", title_text).strip()
    return _CATALOG_SUFFIX_PATTERN.sub("", normalized)


def _artist_title_pairs(normalized: str) -> list[tuple[str | None, str | None]]:
    pairs: list[tuple[str | None, str | None]] = []
    if " - " in normalized:
        left, right = normalized.split(" - ", 1)
        pairs.append((_normalize_whitespace(left), _clean_title_seed(right)))
        pairs.append((_normalize_whitespace(right), _clean_title_seed(left)))

    by_match = re.match(r"(.+?)\s+by\s+(.+)", normalized, flags=re.IGNORECASE)
    if by_match:
        pairs.append(
            (_normalize_whitespace(by_match.group(2)), _clean_title_seed(by_match.group(1)))
        )
    return pairs


def _extract_label(normalized: str, snippet: str) -> str | None:
    bracket_match = re.search(r"\[([^\[\]]+)\]", normalized)
    if bracket_match and not re.search(r"\bmix\b", bracket_match.group(1), flags=re.IGNORECASE):
        label = bracket_match.group(1).strip()
    else:
        on_match = re.search(r"\bon\s+([^|]+)", snippet, flags=re.IGNORECASE)
        label = on_match.group(1).strip(" .,-") if on_match else None

    if label is not None and is_rejected_catalog_label(label):
        return None
    return label


def candidate_from_result(
    result: dict[str, str], seed: SimpleMetadata
) -> tuple[SimpleMetadata | None, float]:
    title_text = result.get("title", "")
    snippet = result.get("snippet", "")
    normalized = _normalize_result_title(title_text)

    best_artist = _normalize_whitespace(seed.artist)
    best_title = _clean_title_seed(seed.title)
    best_score = 0.0
    for artist, title in _artist_title_pairs(normalized):
        if not artist or not title:
            continue
        score = (
            WEB_SEARCH_TITLE_WEIGHT * _similarity(seed.title, title)
            + WEB_SEARCH_ARTIST_WEIGHT * _similarity(seed.artist, artist)
        )
        if score > best_score:
            best_artist, best_title, best_score = artist, title, score

    if best_title is None:
        return None, 0.0

    year_match = re.search(r"\b(19|20)\d{2}\b", f"{normalized} {snippet}")
    genre_match = re.search(r"\bgenres?:\s*([^|.;]+)", snippet, flags=re.IGNORECASE)
    candidate = SimpleMetadata(
        artist=best_artist,
        title=best_title,
        label=_extract_label(normalized, snippet),
        genre=genre_match.group(1).strip() if genre_match else None,
        year=int(year_match.group()) if year_match else None,
        remixer=_extract_remixer(best_title),
    )
    return candidate, best_score


class WebSearchSource:
    """Best-effort metadata recovery from public web-search result pages."""

    name = "web_search"
    merge_fields: frozenset[str] | None = None

    def lookup(
        self, seed: SimpleMetadata, context: LookupContext
    ) -> SimpleMetadata | None:
        query = web_search_query(build_search_terms(seed))
        if query is None:
            return None

        try:
            html_text = context.http.get_text(WEB_SEARCH_URL, params={"q": query})
        except Exception as exc:
            logging.warning("Web search failed for %s: %s", context.file_path.name, exc)
            return None

        best_metadata: SimpleMetadata | None = None
        best_score = 0.0
        for result in parse_search_results(html_text):
            candidate, score = candidate_from_result(result, seed)
            if candidate is not None and score > best_score:
                best_metadata, best_score = candidate, score

        if best_metadata is None or best_score < WEB_SEARCH_MIN_SCORE:
            return None

        logging.info(
            "Web search matched %s -> %s / %s (score=%.3f)",
            context.file_path.name,
            best_metadata.artist,
            best_metadata.title,
            best_score,
        )
        return best_metadata
