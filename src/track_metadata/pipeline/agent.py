from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.config import ENABLE_CURSOR_SDK_FALLBACK
from src.track_metadata.utils import log_agent_response


@dataclass
class CursorSDKFallbackAgent:
    model: str = "gpt-5.4-mini"

    def resolve_metadata(
        self,
        file_path: Path,
        current: SimpleMetadata,
        sources: list[dict[str, Any]],
        missing_fields: list[str],
    ) -> SimpleMetadata | None:
        try:
            from cursor_sdk import Agent
        except ImportError:
            logging.info(
                "cursor_sdk not installed; skipping metadata fallback for %s",
                file_path.name,
            )
            return None

        if not missing_fields:
            return None

        payload = {
            "file_name": file_path.name,
            "current_metadata": current.to_dict(),
            "missing_fields": missing_fields,
            "candidate_sources": sources,
        }
        prompt = (
            "Resolve only the missing metadata fields. "
            "Use null when uncertain and do not invent unsupported values.\n"
            f"{json.dumps(payload, ensure_ascii=False)}"
        )

        try:
            response = Agent.create(model=self.model).prompt(prompt)
        except Exception as exc:  # pragma: no cover - network/runtime dependent
            logging.warning(
                "Cursor SDK fallback failed for %s: %s", file_path.name, exc
            )
            return None

        content = _extract_content(response)
        log_agent_response(
            file_path.name,
            content or "",
            [{"role": "user", "content": prompt}],
        )
        if not content:
            return None

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, Mapping):
            return None
        return SimpleMetadata.from_dict(parsed)


def _extract_content(response: Any) -> str:
    if isinstance(response, str):
        return response
    content = getattr(response, "content", None)
    if isinstance(content, str):
        return content
    text = getattr(response, "text", None)
    if isinstance(text, str):
        return text
    return ""


def build_cursor_sdk_agent() -> CursorSDKFallbackAgent | None:
    if not ENABLE_CURSOR_SDK_FALLBACK:
        return None
    return CursorSDKFallbackAgent()


class StubBrowserResearchClient:
    """No-op browser adapter used when browser research is disabled or unavailable."""

    def inspect_beatport_artist_genres(self, artist: str):
        return None

    def inspect_beatport_track_label(self, artist: str, title: str):
        return None


class CursorBrowserResearchClient:
    """Bounded Beatport inspection via cursor-sdk when explicitly enabled."""

    def __init__(self, model: str = "gpt-5.4-mini") -> None:
        self.model = model

    def inspect_beatport_artist_genres(self, artist: str):
        from src.track_metadata.research import BeatportArtistGenreObservation

        payload = self._prompt(
            "Inspect the public Beatport artist releases page genre filter counts. "
            "Return JSON with keys artist, page_url, identity_confirmed, genre_counts.",
            {"artist": artist, "task": "beatport_artist_genres"},
        )
        if not payload or not payload.get("identity_confirmed"):
            return None
        counts = payload.get("genre_counts")
        if not isinstance(counts, dict):
            return None
        normalized = {
            str(key): int(value)
            for key, value in counts.items()
            if isinstance(value, (int, float)) and int(value) > 0
        }
        if not normalized:
            return None
        return BeatportArtistGenreObservation(
            artist=str(payload.get("artist") or artist),
            page_url=str(payload.get("page_url") or ""),
            genre_counts=normalized,
            identity_confirmed=True,
        )

    def inspect_beatport_track_label(self, artist: str, title: str):
        from src.track_metadata.research import BeatportTrackLabelObservation

        payload = self._prompt(
            "Inspect the public Beatport track page label field. "
            "Return JSON with keys artist, title, page_url, label, identity_confirmed.",
            {"artist": artist, "title": title, "task": "beatport_track_label"},
        )
        if not payload or not payload.get("identity_confirmed"):
            return None
        return BeatportTrackLabelObservation(
            artist=str(payload.get("artist") or artist),
            title=str(payload.get("title") or title),
            page_url=str(payload.get("page_url") or ""),
            label=payload.get("label"),
            identity_confirmed=True,
        )

    def _prompt(
        self, instruction: str, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        if not ENABLE_CURSOR_SDK_FALLBACK:
            return None
        try:
            from cursor_sdk import Agent
        except ImportError:
            logging.info("cursor_sdk not installed; skipping browser research")
            return None
        prompt = f"{instruction}\n{json.dumps(payload, ensure_ascii=False)}"
        try:
            response = Agent.create(model=self.model).prompt(prompt)
        except Exception as exc:  # pragma: no cover - network/runtime dependent
            logging.warning("Cursor browser research failed: %s", exc)
            return None
        content = _extract_content(response)
        if not content:
            return None
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None


def build_browser_research_client():
    from src.track_metadata.pipeline.config import (
        ENABLE_CURSOR_SDK_FALLBACK,
        RESOLUTION_GENRE_BEATPORT,
        RESOLUTION_LABEL_BEATPORT,
    )

    if not ENABLE_CURSOR_SDK_FALLBACK:
        return StubBrowserResearchClient()
    if not (RESOLUTION_GENRE_BEATPORT or RESOLUTION_LABEL_BEATPORT):
        return StubBrowserResearchClient()
    return CursorBrowserResearchClient()
