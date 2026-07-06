from __future__ import annotations

import html as html_lib
import logging
import re
from typing import Any

from src.track_metadata.label import is_rejected_catalog_label
from src.track_metadata.matching import (
    _clean_title_seed,
    _extract_remixer,
    _normalize_whitespace,
    _similarity,
)
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.research import LabelSearchObservation
from src.track_metadata.sources.base import LookupContext
from src.track_metadata.sources.constants import (
    WEB_SEARCH_ARTIST_WEIGHT,
    WEB_SEARCH_MAX_RESULTS,
    WEB_SEARCH_MIN_SCORE,
    WEB_SEARCH_TITLE_WEIGHT,
    WEB_SEARCH_URL,
)
from src.track_metadata.sources.queries import (
    SearchTerms,
    build_search_terms,
    direct_label_album_query,
    direct_label_title_query,
    free_download_query,
    web_search_query,
)

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
    urls = re.findall(
        r'class="result__a"[^>]*href="([^"]+)"', html_text, flags=re.IGNORECASE
    )
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
                "snippet": _strip_html(snippets[index])
                if index < len(snippets)
                else "",
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
            (
                _normalize_whitespace(by_match.group(2)),
                _clean_title_seed(by_match.group(1)),
            )
        )
    return pairs


def _extract_label(normalized: str, snippet: str) -> str | None:
    bracket_match = re.search(r"\[([^\[\]]+)\]", normalized)
    if bracket_match and not re.search(
        r"\bmix\b", bracket_match.group(1), flags=re.IGNORECASE
    ):
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
        score = WEB_SEARCH_TITLE_WEIGHT * _similarity(
            seed.title, title
        ) + WEB_SEARCH_ARTIST_WEIGHT * _similarity(seed.artist, artist)
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


_DISTRIBUTOR_HINT = re.compile(
    r"\b(distributor|distribution|publisher|rights society)\b",
    re.IGNORECASE,
)
_IDENTITY_THRESHOLD = 0.72
_FREE_DOWNLOAD_SNIPPET = re.compile(r"free\s+download", re.IGNORECASE)
_FREE_DOWNLOAD_AFFORDANCE = re.compile(
    r"\b(download\s+(?:for\s+)?free|free\s+download|download\s+track)\b",
    re.IGNORECASE,
)


def _identity_confirmed(seed: SimpleMetadata, result: dict[str, str]) -> bool:
    candidate, score = candidate_from_result(result, seed)
    return candidate is not None and score >= _IDENTITY_THRESHOLD


def is_free_download_result(result: dict[str, str]) -> bool:
    title = result.get("title", "")
    snippet = result.get("snippet", "")
    url = result.get("url", "").casefold()
    text = f"{title} {snippet}"

    if _FREE_DOWNLOAD_SNIPPET.search(text):
        return True
    if _FREE_DOWNLOAD_AFFORDANCE.search(text):
        return True
    if "hypeddit.com" in url and re.search(r"\bdownload\b", text, flags=re.IGNORECASE):
        return True
    if "soundcloud.com" in url and re.search(
        r"\b(?:free|download)\b", text, flags=re.IGNORECASE
    ):
        return True
    return False


def _label_from_result(
    result: dict[str, str], seed: SimpleMetadata
) -> LabelSearchObservation | None:
    title_text = result.get("title", "")
    snippet = result.get("snippet", "")
    normalized = _normalize_result_title(title_text)
    label = _extract_label(normalized, snippet)
    return LabelSearchObservation(
        label=label,
        source_url=result.get("url", ""),
        identity_confirmed=_identity_confirmed(seed, result),
        is_distributor=bool(_DISTRIBUTOR_HINT.search(f"{title_text} {snippet}")),
        snippet=snippet,
    )


class WebSearchResearchClient:
    """Structured web-search observations for field-resolution heuristics."""

    def __init__(self, http: Any) -> None:
        self._http = http

    def _search(self, query: str) -> list[dict[str, str]]:
        try:
            html_text = self._http.get_text(WEB_SEARCH_URL, params={"q": query})
        except Exception as exc:
            logging.warning("Structured web search failed: %s", exc)
            return []
        return parse_search_results(html_text)

    def _seed(self, artist: str | None, title: str | None, album: str | None = None) -> SimpleMetadata:
        return SimpleMetadata(artist=artist, title=title, album=album)

    def detect_free_download(
        self, artist: str | None, title: str | None
    ) -> bool:
        query = free_download_query(SearchTerms(artist=artist, title=title, album=None))
        if query is None:
            return False
        seed = self._seed(artist, title)
        return any(
            _identity_confirmed(seed, result) and is_free_download_result(result)
            for result in self._search(query)
        )

    def search_label_by_title(
        self, artist: str | None, title: str | None
    ) -> list[LabelSearchObservation]:
        query = direct_label_title_query(SearchTerms(artist=artist, title=title, album=None))
        if query is None:
            return []
        seed = self._seed(artist, title)
        return [
            obs
            for result in self._search(query)
            if (obs := _label_from_result(result, seed)) is not None and obs.label
        ]

    def search_label_by_album(
        self, artist: str | None, album: str | None
    ) -> list[LabelSearchObservation]:
        query = direct_label_album_query(SearchTerms(artist=artist, title=None, album=album))
        if query is None:
            return []
        seed = self._seed(artist, None, album)
        return [
            obs
            for result in self._search(query)
            if (obs := _label_from_result(result, seed)) is not None and obs.label
        ]
