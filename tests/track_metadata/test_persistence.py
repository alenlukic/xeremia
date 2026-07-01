from __future__ import annotations

from dataclasses import dataclass, field

from src.models.artist import Artist
from src.models.artist_track import ArtistTrack
from src.models.track import Track
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.persistence import upsert_track_records


@dataclass
class _FakeQuery:
    records: list[object]
    criteria: dict[str, object] = field(default_factory=dict)

    def filter_by(self, **kwargs):
        merged = dict(self.criteria)
        merged.update(kwargs)
        return _FakeQuery(self.records, merged)

    def first(self):
        for record in self.records:
            if all(getattr(record, key, None) == value for key, value in self.criteria.items()):
                return record
        return None


class _FakeSession:
    def __init__(self):
        self.data = {
            Track: [],
            Artist: [],
            ArtistTrack: [],
        }
        self._ids = {Track: 1, Artist: 1, ArtistTrack: 1}

    def query(self, model):
        return _FakeQuery(self.data[model])

    def add(self, entity):
        model = type(entity)
        if getattr(entity, "id", None) is None:
            entity.id = self._ids[model]
            self._ids[model] += 1
        if entity not in self.data[model]:
            self.data[model].append(entity)

    def commit(self):
        return None

    def close(self):
        return None


def test_upsert_track_records_is_idempotent_for_reruns():
    session = _FakeSession()
    metadata = SimpleMetadata(
        title="[12A - C#m - 128.00] Artist - Track",
        artist="Artist",
        remixer="Remixer",
        key="Dbm",
        bpm=128.0,
        genre="Techno",
        label="Label",
    )

    first = upsert_track_records(session, "track.aiff", metadata)
    second = upsert_track_records(session, "track.aiff", metadata)

    assert first["track_created"] is True
    assert second["track_created"] is False
    assert len(session.data[Track]) == 1
    assert len(session.data[ArtistTrack]) == 2
    assert second["artist_track_links_added"] == 0


def test_upsert_track_records_requires_title():
    session = _FakeSession()
    metadata = SimpleMetadata(artist="Artist")
    try:
        upsert_track_records(session, "track.aiff", metadata)
        assert False, "Expected ValueError for missing title"
    except ValueError:
        pass
