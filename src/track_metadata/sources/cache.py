from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.utils import AUGMENTED_DIR

CACHE_PATH = AUGMENTED_DIR / ".metadata_cache.json"
CACHE_SCHEMA_VERSION = 2


class MetadataCache:
    """File-backed cache of finalized hydration results, keyed per audio file."""

    def __init__(self, path: Path = CACHE_PATH) -> None:
        self.path = path
        self._entries = self._load()

    def _load(self) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logging.warning("Failed to read metadata cache at %s", self.path)
            return {}
        return raw if isinstance(raw, dict) else {}

    @staticmethod
    def file_key(file_path: Path) -> str:
        stat = file_path.stat()
        signature = f"{file_path.name}|{stat.st_size}|{stat.st_mtime_ns}"
        return hashlib.sha1(signature.encode("utf-8")).hexdigest()

    def get_final(self, key: str) -> SimpleMetadata | None:
        entry = self._entries.get(key, {})
        if entry.get("version") != CACHE_SCHEMA_VERSION:
            return None
        cached = entry.get("final")
        if isinstance(cached, dict):
            return SimpleMetadata.from_dict(cached)
        return None

    def store_final(self, key: str, metadata: SimpleMetadata) -> None:
        self._entries.setdefault(key, {})["version"] = CACHE_SCHEMA_VERSION
        self._entries.setdefault(key, {})["final"] = metadata.to_dict()
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            self._entries, indent=2, ensure_ascii=False, sort_keys=True
        )
        # Replace materialized state atomically so a crash mid-write cannot
        # leave a truncated cache behind.
        tmp_path = self.path.with_name(self.path.name + ".tmp")
        tmp_path.write_text(payload, encoding="utf-8")
        tmp_path.replace(self.path)
