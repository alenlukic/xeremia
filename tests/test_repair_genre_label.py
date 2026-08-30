from __future__ import annotations

import io
import json
from contextlib import redirect_stderr, redirect_stdout

from src.scripts import repair_genre_label as repair


class _Track:
    def __init__(self, row_id, *, genre=None, label=None, bpm=None, file_name="t.mp3"):
        self.id = row_id
        self.file_name = file_name
        self.genre = genre
        self.label = label
        self.bpm = bpm


class _StubSession:
    def __init__(self, tracks):
        self.tracks = {track.id: track for track in tracks}
        self.committed = False

    def query(self, model):
        return self

    def all(self):
        return list(self.tracks.values())

    def filter_by(self, **kwargs):
        track_id = kwargs.get("id")
        return _TrackQuery(self.tracks.get(track_id))

    def commit(self):
        self.committed = True

    def close(self):
        return None


class _TrackQuery:
    def __init__(self, track):
        self._track = track

    def first(self):
        return self._track


def test_dry_run_and_snapshot_writes_nothing(tmp_path, monkeypatch):
    session = _StubSession(
        [
            _Track(9600, genre="Techno", label="", bpm=145.0),
        ]
    )
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    snapshot = tmp_path / "snapshot.csv"

    exit_code = repair.main(["--snapshot", str(snapshot)])

    assert exit_code == 0
    assert snapshot.exists()
    assert session.committed is False


def test_dry_run_and_snapshot_requires_path(monkeypatch):
    session = _StubSession([])
    monkeypatch.setattr("src.db.database.create_session", lambda: session)

    stderr = io.StringIO()
    with redirect_stderr(stderr):
        exit_code = repair.main([])

    assert exit_code == 1
    assert "--snapshot is required" in stderr.getvalue()


def test_dry_run_and_snapshot_reports_each_class(tmp_path, monkeypatch):
    session = _StubSession(
        [
            _Track(9600, genre="Techno", label="", bpm=145.0),
            _Track(9601, genre="Techno", label="", bpm=128.0),
            _Track(9000, genre="Techno", label=""),
            _Track(9922, genre="House ", label=""),
        ]
    )
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    stdout = io.StringIO()
    with redirect_stdout(stdout):
        repair.main(["--snapshot", str(tmp_path / "snap.csv")])

    output = stdout.getvalue()
    for class_name in repair.ALL_CLASSES:
        assert f"{class_name}:" in output


def test_bpm_threshold_applies_default(monkeypatch):
    session = _StubSession([_Track(9600, genre="Techno", label="", bpm=145.0)])
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    report = repair.classify(session)
    entries = report.classes.get("label_underground_default", [])
    assert any(entry.row_id == 9600 and entry.label_target == "CDR" for entry in entries)


def test_bpm_threshold_holds_below_140(monkeypatch):
    session = _StubSession(
        [
            _Track(9601, genre="Techno", label="", bpm=128.0),
            _Track(9602, genre="Techno", label="", bpm=None),
        ]
    )
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    report = repair.classify(session)
    held = report.classes.get("label_held_below_threshold", [])
    assert {entry.row_id for entry in held} == {9601, 9602}


def test_operator_named_rows(monkeypatch):
    session = _StubSession(
        [
            _Track(9540, genre="Soundtrack", label=""),
            _Track(9922, genre="House ", label=""),
            _Track(9000, genre="Techno", label=""),
        ]
    )
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    report = repair.classify(session)

    soundtrack = next(
        entry
        for entry in report.classes.get("label_soundtrack_publisher", [])
        if entry.row_id == 9540
    )
    assert soundtrack.label_target == "Supergiant Games"

    override = next(
        entry
        for entry in report.classes.get("genre_named_override", [])
        if entry.row_id == 9922
    )
    assert override.genre_target == "House"

    legacy = report.classes.get("label_legacy_excluded", [])
    assert any(entry.row_id == 9000 for entry in legacy)


def test_backfill_miss_overrides_genres_and_soundtrack_labels(monkeypatch):
    session = _StubSession(
        [
            _Track(9565, genre="Trance", label=None, bpm=120.0),
            _Track(
                9566,
                genre="Hard Dance / Hardcore / Neo Rave Tracks - Beatport",
                label="CDR",
                bpm=150.0,
            ),
            _Track(9567, genre="Trance", label=None, bpm=125.0),
            _Track(
                9910,
                genre="Buy Drum &amp; Bass Music",
                label=None,
                bpm=119.0,
            ),
        ]
    )
    monkeypatch.setattr("src.db.database.create_session", lambda: session)

    report = repair.classify(session)

    genre_targets = {
        entry.row_id: entry.genre_target
        for entry in report.classes["genre_named_override"]
    }
    assert genre_targets == {
        9565: "Soundtracks",
        9566: "Soundtracks",
        9567: "Soundtracks",
        9910: "Drum & Bass",
    }
    label_targets = {
        entry.row_id: entry.label_target
        for entry in report.classes["label_named_override"]
    }
    assert label_targets == {
        9565: "Supergiant Games",
        9566: "Supergiant Games",
        9567: "Supergiant Games",
    }
    held = report.classes["label_held_below_threshold"]
    assert [entry.row_id for entry in held] == [9910]

    changes = {
        change.row_id: change
        for change in repair.plan_changes(repair._candidate_rows(session), report)
    }
    assert changes[9566].genre_old == (
        "Hard Dance / Hardcore / Neo Rave Tracks - Beatport"
    )
    assert changes[9566].genre_new == "Soundtracks"
    assert changes[9566].label_old == "CDR"
    assert changes[9566].label_new == "Supergiant Games"
    assert changes[9910].genre_old == "Buy Drum &amp; Bass Music"
    assert changes[9910].genre_new == "Drum & Bass"
    assert changes[9910].label_new is None

    repair.apply(session, report)
    assert session.tracks[9565].genre == "Soundtracks"
    assert session.tracks[9565].label == "Supergiant Games"
    assert session.tracks[9566].genre == "Soundtracks"
    assert session.tracks[9566].label == "Supergiant Games"
    assert session.tracks[9567].genre == "Soundtracks"
    assert session.tracks[9567].label == "Supergiant Games"
    assert session.tracks[9910].genre == "Drum & Bass"
    assert session.tracks[9910].label is None


def test_named_overrides_are_idempotent(monkeypatch):
    session = _StubSession(
        [
            _Track(9565, genre="Soundtracks", label="Supergiant Games", bpm=120.0),
            _Track(9566, genre="Soundtracks", label="Supergiant Games", bpm=150.0),
            _Track(
                9567,
                genre="Soundtracks",
                label="Supergiant Games",
                bpm=125.0,
            ),
            _Track(9910, genre="Drum & Bass", label=None, bpm=119.0),
            _Track(9922, genre="House", label=None),
        ]
    )
    monkeypatch.setattr("src.db.database.create_session", lambda: session)

    report = repair.classify(session)

    assert all(not report.classes.get(name) for name in repair.WRITE_CLASSES)


def test_operator_named_rows_exclude_legacy(monkeypatch):
    # The row clears the underground BPM threshold, so only the legacy
    # exclusion keeps it out of every write class.
    session = _StubSession([_Track(9000, genre="Techno", label="", bpm=145.0)])
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    report = repair.classify(session)
    assert report.classes.get("label_underground_default") is None
    assert [entry.row_id for entry in report.classes["label_legacy_excluded"]] == [9000]


def test_verify_only_exit_code(tmp_path, monkeypatch):
    unrepaired = _StubSession([_Track(9600, genre="Techno", label="", bpm=145.0)])
    repaired = _StubSession([_Track(9600, genre="Techno", label="CDR", bpm=145.0)])
    snapshot = str(tmp_path / "snap.csv")

    monkeypatch.setattr("src.db.database.create_session", lambda: unrepaired)
    pending_output = io.StringIO()
    with redirect_stdout(pending_output):
        assert repair.main(["--snapshot", snapshot, "--verify-only"]) == 1
    assert "new_cohort_label_coverage: 0.0%" in pending_output.getvalue()
    assert "legacy_label_coverage: 100.0%" in pending_output.getvalue()

    monkeypatch.setattr("src.db.database.create_session", lambda: repaired)
    repaired_output = io.StringIO()
    with redirect_stdout(repaired_output):
        assert repair.main(["--snapshot", snapshot, "--verify-only"]) == 0
    assert "new_cohort_label_coverage: 100.0%" in repaired_output.getvalue()

    assert unrepaired.committed is False
    assert repaired.committed is False


def test_apply_writes_snapshot_before_the_commit(tmp_path, monkeypatch):
    session = _StubSession([_Track(9600, genre="Techno", label="", bpm=145.0)])
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    snapshot = tmp_path / "fresh.csv"

    with redirect_stdout(io.StringIO()):
        exit_code = repair.main(["--snapshot", str(snapshot), "--apply"])

    assert exit_code == 0
    assert session.committed is True
    assert session.tracks[9600].label == "CDR"
    # The snapshot holds the pre-write value of the field the write changed.
    (entry,) = json.loads(snapshot.read_text(encoding="utf-8"))
    assert entry == {
        "id": 9600,
        "repair_classes": ["label_underground_default"],
        "file_name": "t.mp3",
        "label": "null -> CDR",
    }


def test_apply_reuses_the_dry_run_snapshot(tmp_path, monkeypatch):
    session = _StubSession([_Track(9600, genre="Techno", label="", bpm=145.0)])
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    snapshot = tmp_path / "snap.csv"

    with redirect_stdout(io.StringIO()):
        assert repair.main(["--snapshot", str(snapshot)]) == 0
    dry_run_csv = snapshot.read_text(encoding="utf-8")

    with redirect_stdout(io.StringIO()):
        assert repair.main(["--snapshot", str(snapshot), "--apply"]) == 0

    assert snapshot.read_text(encoding="utf-8") == dry_run_csv
    assert session.committed is True
    assert session.tracks[9600].label == "CDR"


def test_snapshot_holds_only_changing_rows(tmp_path, monkeypatch):
    session = _StubSession(
        [
            _Track(9600, genre="Techno", label="", bpm=145.0),
            _Track(9601, genre="Techno", label="", bpm=100.0),
            _Track(9000, genre="Techno", label=""),
        ]
    )
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    snapshot = tmp_path / "snap.csv"

    with redirect_stdout(io.StringIO()):
        assert repair.main(["--snapshot", str(snapshot)]) == 0

    entries = json.loads(snapshot.read_text(encoding="utf-8"))
    # Report-only rows (held below threshold, legacy excluded) write nothing,
    # so the snapshot does not carry them.
    assert [entry["id"] for entry in entries] == [9600]
    assert "genre" not in entries[0]
    assert entries[0]["label"] == "null -> CDR"


def test_snapshot_renders_explicit_deltas(tmp_path, monkeypatch):
    session = _StubSession([_Track(9540, genre="Soundtrack", label="")])
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    snapshot = tmp_path / "snap.csv"

    with redirect_stdout(io.StringIO()):
        assert repair.main(["--snapshot", str(snapshot)]) == 0

    (entry,) = json.loads(snapshot.read_text(encoding="utf-8"))
    assert entry["genre"] == "Soundtrack -> Soundtracks"
    assert entry["label"] == "null -> Supergiant Games"
    assert entry["repair_classes"] == [
        "genre_soundtrack_collision",
        "label_soundtrack_publisher",
    ]


def test_apply_refuses_when_the_snapshot_cannot_be_written(tmp_path, monkeypatch):
    session = _StubSession([_Track(9600, genre="Techno", label="", bpm=145.0)])
    monkeypatch.setattr("src.db.database.create_session", lambda: session)
    blocker = tmp_path / "blocker"
    blocker.write_text("not a directory", encoding="utf-8")

    stderr = io.StringIO()
    with redirect_stdout(io.StringIO()), redirect_stderr(stderr):
        exit_code = repair.main(["--snapshot", str(blocker / "snap.csv"), "--apply"])

    assert exit_code == 1
    assert "snapshot write failed" in stderr.getvalue()
    assert session.committed is False
    assert session.tracks[9600].label == ""


def test_apply_writes_genre_and_label_targets(tmp_path, monkeypatch):
    session = _StubSession(
        [
            _Track(9540, genre="Soundtrack", label=""),
            _Track(9922, genre="House ", label=""),
        ]
    )
    monkeypatch.setattr("src.db.database.create_session", lambda: session)

    with redirect_stdout(io.StringIO()):
        assert repair.main(["--snapshot", str(tmp_path / "snap.csv"), "--apply"]) == 0

    assert session.tracks[9540].genre == "Soundtracks"
    assert session.tracks[9540].label == "Supergiant Games"
    assert session.tracks[9922].genre == "House"
    assert session.tracks[9922].label == ""
    assert session.committed is True
