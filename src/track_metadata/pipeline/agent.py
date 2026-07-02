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
