from __future__ import annotations

import json
from pathlib import Path

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.cache import MetadataCache


def test_missing_file_loads_empty(tmp_path: Path) -> None:
    cache = MetadataCache(path=tmp_path / "nope.json")
    assert cache.get_final("anything") is None


def test_corrupt_file_loads_empty(tmp_path: Path) -> None:
    path = tmp_path / "cache.json"
    path.write_text("{ not valid json", encoding="utf-8")
    cache = MetadataCache(path=path)
    assert cache.get_final("anything") is None


def test_store_then_get_round_trips(tmp_path: Path) -> None:
    path = tmp_path / "cache.json"
    cache = MetadataCache(path=path)
    cache.store_final("key1", SimpleMetadata(title="Cached", artist="Artist"))

    reloaded = MetadataCache(path=path)
    result = reloaded.get_final("key1")
    assert result is not None
    assert result.title == "Cached"
    assert result.artist == "Artist"


def test_store_writes_pretty_sorted_json(tmp_path: Path) -> None:
    path = tmp_path / "cache.json"
    cache = MetadataCache(path=path)
    cache.store_final("key1", SimpleMetadata(title="Cached"))
    raw = json.loads(path.read_text(encoding="utf-8"))
    assert raw["key1"]["final"]["title"] == "Cached"


def test_store_replaces_atomically_without_leaving_tmp(tmp_path: Path) -> None:
    path = tmp_path / "cache.json"
    cache = MetadataCache(path=path)
    cache.store_final("key1", SimpleMetadata(title="Cached"))
    assert path.exists()
    assert not (tmp_path / "cache.json.tmp").exists()


def test_file_key_is_deterministic(tmp_path: Path) -> None:
    sample = tmp_path / "sample.mp3"
    sample.write_bytes(b"fake audio data")
    key1 = MetadataCache.file_key(sample)
    key2 = MetadataCache.file_key(sample)
    assert key1 == key2
    assert len(key1) == 40  # sha1 hex
