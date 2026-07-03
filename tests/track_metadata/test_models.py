from __future__ import annotations

from src.track_metadata.models import SimpleMetadata
from src.track_metadata.sources.cache import MetadataCache


def test_simple_metadata_round_trips_source_ids_through_cache(tmp_path):
    metadata = SimpleMetadata(
        title="Track",
        artist="Artist",
        source_catalog_id="mb-abc",
        source_provider="musicbrainz",
    )
    cache = MetadataCache(path=tmp_path / "cache.json")
    cache.store_final("key", metadata)

    restored = MetadataCache(path=tmp_path / "cache.json").get_final("key")
    assert restored is not None
    assert restored.source_catalog_id == "mb-abc"
    assert restored.source_provider == "musicbrainz"
