from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pytest

from src.models.track import Track
from src.scripts.metadata_quality_backfill import (
    MIN_TRACK_ID,
    BackfillManifest,
    apply_manifest,
    build_track_change,
    is_within_output_root,
    main,
    planned_file_name,
    resolve_output_root,
    run_backfill,
    scan_tracks,
)
from src.track_metadata.models import SimpleMetadata


@dataclass
class _FakeQuery:
    records: list[Track]
    criteria: dict = None

    def __post_init__(self):
        self.criteria = self.criteria or {}

    def filter_by(self, **kwargs):
        return _FakeQuery(self.records, kwargs)

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return self.records

    def first(self):
        for record in self.records:
            if all(getattr(record, key, None) == value for key, value in self.criteria.items()):
                return record
        return None


class _FakeSession:
    def __init__(self, tracks: list[Track], artists: dict | None = None, links: list | None = None):
        self.tracks = tracks
        self.artists = artists or {}
        self.links = links or []
        self.committed = False

    def query(self, model):
        from src.models.artist import Artist
        from src.models.artist_track import ArtistTrack

        if model is Artist:
            return _ArtistQuery(self.artists)
        if model is ArtistTrack:
            return _ArtistTrackQuery(self.links)
        return _FakeQuery(self.tracks)

    def commit(self):
        self.committed = True

    def close(self):
        return None


class _ArtistQuery:
    def __init__(self, artists: dict):
        self.artists = artists
        self.criteria: dict = {}

    def filter_by(self, **kwargs):
        query = _ArtistQuery(self.artists)
        query.criteria = kwargs
        return query

    def first(self):
        artist_id = self.criteria.get("id")
        if artist_id is None:
            return None
        name = self.artists.get(artist_id)
        if name is None:
            return None
        artist = type("Artist", (), {"id": artist_id, "name": name})()
        return artist


class _ArtistTrackQuery:
    def __init__(self, links: list):
        self.links = links
        self.criteria: dict = {}

    def filter_by(self, **kwargs):
        query = _ArtistTrackQuery(self.links)
        query.criteria = kwargs
        return query

    def all(self):
        track_id = self.criteria.get("track_id")
        if track_id is None:
            return self.links
        return [link for link in self.links if getattr(link, "track_id", None) == track_id]


def _track(track_id: int, **kwargs) -> Track:
    track = Track(file_name=kwargs.pop("file_name", f"track-{track_id}.aiff"), title=kwargs.pop("title", "Title"))
    track.id = track_id
    for key, value in kwargs.items():
        setattr(track, key, value)
    return track


def test_dry_run_default_does_not_mutate(tmp_path, monkeypatch):
    output_root = tmp_path / "data" / "ingestion_pipeline" / "output"
    output_root.mkdir(parents=True)
    old_name = "[12A - C#m - 128.00] Artist - Track.aiff"
    (output_root / old_name).write_bytes(b"audio")

    track = _track(
        MIN_TRACK_ID,
        file_name=old_name,
        title="Artist - Track",
        label="Cdr",
        genre="Techno",
        key="C#m",
        bpm=128.0,
        camelot_code="12A",
    )
    session = _FakeSession([track, _track(MIN_TRACK_ID - 1, label="Skip Me")])

    manifest = scan_tracks(session, output_root=output_root, web_verifier=lambda _label: True)
    assert manifest.dry_run is True
    assert manifest.skipped_below_min_id == 1
    assert any(change.new_label == "CDR" for change in manifest.changes)
    assert track.label == "Cdr"
    assert not session.committed


def test_apply_requires_explicit_flag_and_updates_db(tmp_path):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    source_name = "old.aiff"
    source = output_root / source_name
    source.write_bytes(b"audio")

    track = _track(MIN_TRACK_ID, file_name=source_name, label="CDR", genre="Techno")
    session = _FakeSession([track])
    manifest = BackfillManifest(
        generated_at="now",
        dry_run=False,
        output_root=str(output_root),
        changes=[],
    )
    from src.scripts.metadata_quality_backfill import BackfillChange

    manifest.changes.append(
        BackfillChange(
            track_id=track.id,
            old_label="CDR",
            new_label="CDR",
            old_genre="Techno",
            new_genre="Techno",
            old_file_name=source_name,
            new_file_name="new.aiff",
        )
    )
    target = output_root / "new.aiff"
    applied = apply_manifest(session, manifest, output_root=output_root)
    assert applied.changes[0].status == "applied"
    assert track.file_name == "new.aiff"
    assert target.exists()
    assert not source.exists()


def test_collision_and_out_of_scope_are_blocked(tmp_path):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    track = _track(MIN_TRACK_ID, file_name="missing.aiff", label="CDR")
    session = _FakeSession([track])
    manifest = scan_tracks(session, output_root=output_root)
    assert manifest.changes == [] or manifest.out_of_scope_paths


def test_planned_file_name_preserves_key_symbols():
    track = _track(
        MIN_TRACK_ID,
        file_name="file.aiff",
        title="Artist - Track",
        key="C#m",
        bpm=128.0,
        camelot_code="12A",
    )
    planned = planned_file_name(track)
    assert planned is not None
    assert "C#m" in planned


def test_is_within_output_root(tmp_path):
    root = resolve_output_root(tmp_path / "data" / "ingestion_pipeline" / "output")
    root.mkdir(parents=True, exist_ok=True)
    inside = root / "track.aiff"
    assert is_within_output_root(inside, root) is True
    assert is_within_output_root(tmp_path / "elsewhere.aiff", root) is False


def test_build_track_change_is_idempotent_for_cdr(tmp_path):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    file_name = "track.aiff"
    (output_root / file_name).write_bytes(b"audio")
    track = _track(MIN_TRACK_ID, file_name=file_name, label="CDR", genre="Techno", title="Artist - Track")
    session = _FakeSession([track])
    change = build_track_change(
        track,
        session=session,
        shared_state={},
        output_root=output_root,
        web_verifier=lambda _label: True,
    )
    assert change is None


def _patch_session(monkeypatch, session):
    monkeypatch.setattr(
        "src.scripts.metadata_quality_backfill.database.create_session",
        lambda: session,
    )


def test_planned_file_name_normalizes_unicode_key_symbols():
    track = _track(
        MIN_TRACK_ID,
        file_name="file.aiff",
        title="Artist - Track",
        key="C\u266fm",
        bpm=128.0,
        camelot_code="12A",
    )
    planned = planned_file_name(track)
    assert planned is not None
    assert "C#m" in planned
    assert "\u266f" not in planned


def test_run_backfill_dry_run_default_does_not_apply(tmp_path, monkeypatch):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    old_name = "old.aiff"
    (output_root / old_name).write_bytes(b"audio")
    track = _track(
        MIN_TRACK_ID,
        file_name=old_name,
        title="Artist - Track",
        label="Cdr",
        genre="Techno",
        key="C#m",
        bpm=128.0,
        camelot_code="12A",
    )
    session = _FakeSession([track])
    _patch_session(monkeypatch, session)

    manifest = run_backfill(
        dry_run=True,
        apply=False,
        output_root=output_root,
        manifest_path=tmp_path / "manifest.json",
        web_verifier=lambda _label: True,
    )
    assert manifest.dry_run is True
    assert not session.committed
    assert track.label == "Cdr"
    assert (output_root / old_name).exists()


def test_backfill_album_consistency_groups_existing_rows(tmp_path, monkeypatch):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    shared_album = "Same Album"
    creation_ts = datetime(2024, 6, 1, 12, 0, 0)

    track_one = _track(
        MIN_TRACK_ID,
        file_name="one.aiff",
        title="Artist - One",
        label="Label A",
    )
    track_two = _track(
        MIN_TRACK_ID + 1,
        file_name="two.aiff",
        title="Artist - Two",
        label="Label B",
    )
    for track in (track_one, track_two):
        (output_root / track.file_name).write_bytes(b"audio")
        track.date_added = creation_ts.isoformat()

    def _fake_metadata(track, _output_root):
        return SimpleMetadata(album=shared_album, artist="Artist")

    monkeypatch.setattr(
        "src.scripts.metadata_quality_backfill.load_track_file_metadata",
        lambda track, output_root: _fake_metadata(track, output_root),
    )
    monkeypatch.setattr(
        "src.scripts.metadata_quality_backfill.default_genre_lookups",
        lambda: (
            lambda _artist, _title: None,
            lambda _artist, _title: None,
        ),
    )

    session = _FakeSession([track_one, track_two])
    manifest = scan_tracks(session, output_root=output_root, web_verifier=lambda _label: True)
    labels = {change.track_id: change.new_label for change in manifest.changes}
    assert labels.get(track_two.id) == "Label A"
    assert all(change.new_label == "Label A" for change in manifest.changes)


def test_backfill_populates_null_genre_with_mocked_lookups(tmp_path, monkeypatch):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    file_name = "track.aiff"
    (output_root / file_name).write_bytes(b"audio")
    track = _track(
        MIN_TRACK_ID,
        file_name=file_name,
        title="Artist - Track",
        label="CDR",
        genre=None,
    )
    session = _FakeSession(
        [track],
        artists={1: "Artist"},
        links=[type("Link", (), {"track_id": track.id, "artist_id": 1})()],
    )

    monkeypatch.setattr(
        "src.scripts.metadata_quality_backfill.load_track_file_metadata",
        lambda _track, _output_root: SimpleMetadata(artist="Artist"),
    )
    monkeypatch.setattr(
        "src.scripts.metadata_quality_backfill.default_genre_lookups",
        lambda: (
            lambda _artist, _title: "Techno",
            lambda _artist, _title: None,
        ),
    )

    manifest = scan_tracks(session, output_root=output_root, web_verifier=lambda _label: True)
    assert manifest.populated_genres == 1
    assert manifest.changes[0].new_genre == "Techno"


def test_backfill_no_album_signal_skips_grouping(tmp_path, monkeypatch):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    track_one = _track(MIN_TRACK_ID, file_name="one.aiff", label="Label A")
    track_two = _track(MIN_TRACK_ID + 1, file_name="two.aiff", label="Label B")
    for track in (track_one, track_two):
        (output_root / track.file_name).write_bytes(b"audio")

    monkeypatch.setattr(
        "src.scripts.metadata_quality_backfill.load_track_file_metadata",
        lambda _track, _output_root: SimpleMetadata(album=None),
    )

    monkeypatch.setattr(
        "src.scripts.metadata_quality_backfill.default_genre_lookups",
        lambda: (
            lambda _artist, _title: None,
            lambda _artist, _title: None,
        ),
    )

    session = _FakeSession([track_one, track_two])
    shared_state: dict = {}
    change_two = None
    for track in (track_one, track_two):
        change = build_track_change(
            track,
            session=session,
            shared_state=shared_state,
            output_root=output_root,
            web_verifier=lambda _label: True,
            beatport_lookup=lambda _artist, _title: None,
            lastfm_lookup=lambda _artist, _title: None,
        )
        if track.id == track_two.id:
            change_two = change
    assert change_two is None


def test_main_dry_run_flag_overrides_apply(tmp_path, monkeypatch):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    old_name = "old.aiff"
    (output_root / old_name).write_bytes(b"audio")
    track = _track(
        MIN_TRACK_ID,
        file_name=old_name,
        title="Artist - Track",
        label="Cdr",
        genre="Techno",
        key="C#m",
        bpm=128.0,
        camelot_code="12A",
    )
    session = _FakeSession([track])
    _patch_session(monkeypatch, session)

    monkeypatch.setattr(
        "sys.argv",
        [
            "metadata_quality_backfill",
            "--apply",
            "--dry-run",
            "--output-root",
            str(output_root),
            "--manifest",
            str(tmp_path / "manifest.json"),
        ],
    )
    main()
    assert not session.committed
    assert track.label == "Cdr"


def test_run_backfill_dry_run_with_apply_records_dry_run(tmp_path, monkeypatch):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    old_name = "old.aiff"
    (output_root / old_name).write_bytes(b"audio")
    track = _track(
        MIN_TRACK_ID,
        file_name=old_name,
        title="Artist - Track",
        label="Cdr",
        genre="Techno",
        key="C#m",
        bpm=128.0,
        camelot_code="12A",
    )
    session = _FakeSession([track])
    _patch_session(monkeypatch, session)
    monkeypatch.setattr(
        "src.scripts.metadata_quality_backfill.default_genre_lookups",
        lambda: (
            lambda _artist, _title: None,
            lambda _artist, _title: None,
        ),
    )

    manifest = run_backfill(
        dry_run=True,
        apply=True,
        output_root=output_root,
        manifest_path=tmp_path / "manifest.json",
        web_verifier=lambda _label: True,
    )
    assert manifest.dry_run is True
    assert not session.committed
    assert track.label == "Cdr"
    assert (output_root / old_name).exists()


def test_run_backfill_apply_mutates_db_and_writes_manifest(tmp_path, monkeypatch):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    old_name = "old.aiff"
    (output_root / old_name).write_bytes(b"audio")
    track = _track(
        MIN_TRACK_ID,
        file_name=old_name,
        title="Artist - Track",
        label="Cdr",
        genre="Techno",
        key="C#m",
        bpm=128.0,
        camelot_code="12A",
    )
    session = _FakeSession([track])
    _patch_session(monkeypatch, session)
    manifest_path = tmp_path / "manifest.json"

    manifest = run_backfill(
        dry_run=False,
        apply=True,
        output_root=output_root,
        manifest_path=manifest_path,
        web_verifier=lambda _label: True,
    )
    assert manifest.dry_run is False
    assert session.committed is True
    assert track.label == "CDR"
    assert track.file_name != old_name
    assert manifest_path.exists()
    recorded = json.loads(manifest_path.read_text())
    assert recorded["dry_run"] is False
    assert recorded["changes"]


def test_run_backfill_apply_refuses_collisions_before_mutation(tmp_path, monkeypatch):
    output_root = tmp_path / "output"
    output_root.mkdir(parents=True)
    old_name = "track.aiff"
    target_name = "[12A - C#m - 128.00] Artist - Track.aiff"
    (output_root / old_name).write_bytes(b"audio")
    (output_root / target_name).write_bytes(b"existing")
    track = _track(
        MIN_TRACK_ID,
        file_name=old_name,
        title="Artist - Track",
        label="Cdr",
        genre="Techno",
        key="C#m",
        bpm=128.0,
        camelot_code="12A",
    )
    session = _FakeSession([track])
    _patch_session(monkeypatch, session)

    with pytest.raises(RuntimeError, match="Refusing to apply"):
        run_backfill(
            dry_run=False,
            apply=True,
            output_root=output_root,
            manifest_path=tmp_path / "manifest.json",
            web_verifier=lambda _label: True,
        )
    assert not session.committed
    assert (output_root / old_name).exists()
