from __future__ import annotations

import json
import sys
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.agent import CursorSDKFallbackAgent
from src.track_metadata.utils import log_agent_response


def test_resolve_metadata_logs_agent_response(tmp_path, monkeypatch) -> None:
    log_path = tmp_path / "agent.log"
    monkeypatch.setattr(
        "src.track_metadata.pipeline.agent.log_agent_response",
        lambda file_name, raw_text, messages, log_file_path=log_path: (
            log_agent_response(file_name, raw_text, messages, log_file_path=log_path)
        ),
    )

    mock_agent = MagicMock()
    mock_agent.prompt.return_value = json.dumps({"title": "Resolved Title"})
    cursor_sdk = ModuleType("cursor_sdk")
    cursor_sdk.Agent = MagicMock(create=MagicMock(return_value=mock_agent))
    monkeypatch.setitem(sys.modules, "cursor_sdk", cursor_sdk)

    agent = CursorSDKFallbackAgent()
    result = agent.resolve_metadata(
        Path("track.mp3"),
        SimpleMetadata(artist="Artist"),
        [{"source": "musicbrainz", "metadata": {"title": "Guess"}}],
        ["title"],
    )

    assert result is not None
    assert result.title == "Resolved Title"
    assert log_path.exists()
    entry = json.loads(log_path.read_text(encoding="utf-8").splitlines()[0])
    assert entry["file"] == "track.mp3"
    assert json.loads(entry["raw_response"])["title"] == "Resolved Title"
