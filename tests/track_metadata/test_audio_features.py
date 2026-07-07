from __future__ import annotations

from pathlib import Path

import pytest

import src.track_metadata.audio_features as audio_features_mod
from src.data_management.config import CAMELOT_MAP
from src.track_metadata.audio_features import (
    _canonicalize_key,
    analyze_missing_audio_features,
    estimate_bpm_candidates,
    estimate_key_candidates,
    resolve_bpm,
    resolve_key,
    snap_bpm,
)
from src.track_metadata.models import SimpleMetadata


def test_analyze_audio_features_uses_staged_consensus_and_snaps_round_bpm(monkeypatch):
    bpm_calls: list[str] = []
    key_calls: list[str] = []

    def fake_bpm(source: str, _path: Path) -> float | None:
        bpm_calls.append(source)
        return {"essentia": 128.04, "madmom": 127.9}[source]

    def fake_key(source: str, _path: Path) -> tuple[str, float] | None:
        key_calls.append(source)
        return {"essentia": ("Dbm", 0.8), "madmom": ("C#m", 0.85)}[source]

    monkeypatch.setattr(audio_features_mod, "_estimate_bpm_source", fake_bpm)
    monkeypatch.setattr(audio_features_mod, "_estimate_key_source", fake_key)

    metadata = SimpleMetadata(title="t", artist="a")
    updated = analyze_missing_audio_features(Path("dummy.mp3"), metadata)

    assert updated.bpm == 128.0
    assert updated.key == "C#m"
    assert bpm_calls == ["essentia", "madmom"]
    assert key_calls == ["essentia", "madmom"]


def test_existing_and_rekordbox_agreement_skips_all_bpm_analyzers(monkeypatch):
    monkeypatch.setattr(
        audio_features_mod,
        "_estimate_bpm_source",
        lambda *_args: pytest.fail("no BPM analyzer should run"),
    )

    resolution = resolve_bpm(
        Path("dummy.mp3"), existing_bpm=139.99, rekordbox_bpm=140.0
    )

    assert resolution.value == 139.99
    assert resolution.reason == "id3_rekordbox_agreement"


def test_rekordbox_and_essentia_agreement_skips_other_bpm_analyzers(monkeypatch):
    calls: list[str] = []

    def fake(source: str, _path: Path) -> float | None:
        calls.append(source)
        if source != "essentia":
            pytest.fail("madmom/librosa should not run")
        return 140.04

    monkeypatch.setattr(audio_features_mod, "_estimate_bpm_source", fake)

    resolution = resolve_bpm(Path("dummy.mp3"), rekordbox_bpm=140.0)

    assert resolution.value == 140.0
    assert resolution.reason == "rekordbox_essentia_agreement"
    assert calls == ["essentia"]


def test_rekordbox_bpm_uses_three_of_four_consensus(monkeypatch):
    calls: list[str] = []
    values = {"essentia": 150.0, "madmom": 140.8, "librosa": 139.0}

    def fake(source: str, _path: Path) -> float | None:
        calls.append(source)
        return values[source]

    monkeypatch.setattr(audio_features_mod, "_estimate_bpm_source", fake)

    resolution = resolve_bpm(Path("dummy.mp3"), rekordbox_bpm=140.0)

    assert resolution.value == 140.0
    assert resolution.reason == "three_of_four_consensus"
    assert calls == ["essentia", "madmom", "librosa"]


def test_rekordbox_bpm_falls_back_to_rekordbox_on_broad_disagreement(monkeypatch):
    values = {"essentia": 150.0, "madmom": 125.0, "librosa": 90.0}
    monkeypatch.setattr(
        audio_features_mod,
        "_estimate_bpm_source",
        lambda source, _path: values[source],
    )

    resolution = resolve_bpm(Path("dummy.mp3"), rekordbox_bpm=140.0)

    assert resolution.value == 140.0
    assert resolution.reason == "rekordbox_disagreement_fallback"


def test_existing_and_essentia_agreement_without_rekordbox_skips_fallbacks(
    monkeypatch,
):
    calls: list[str] = []

    def fake(source: str, _path: Path) -> float | None:
        calls.append(source)
        if source != "essentia":
            pytest.fail("madmom/librosa should not run")
        return 138.04

    monkeypatch.setattr(audio_features_mod, "_estimate_bpm_source", fake)

    resolution = resolve_bpm(Path("dummy.mp3"), existing_bpm=137.99)

    assert resolution.value == 137.99
    assert resolution.reason == "id3_essentia_agreement"
    assert calls == ["essentia"]


def test_existing_camelot_and_rekordbox_named_key_skip_all_key_analyzers(
    monkeypatch,
):
    monkeypatch.setattr(
        audio_features_mod,
        "_estimate_key_source",
        lambda *_args: pytest.fail("no key analyzer should run"),
    )

    resolution = resolve_key(
        Path("dummy.mp3"), existing_key="4A", rekordbox_key="Fm"
    )

    assert resolution.value == "Fm"
    assert resolution.reason == "id3_rekordbox_agreement"


def test_rekordbox_and_essentia_agreement_skips_other_key_analyzers(monkeypatch):
    calls: list[str] = []

    def fake(source: str, _path: Path) -> tuple[str, float] | None:
        calls.append(source)
        if source != "essentia":
            pytest.fail("madmom/librosa should not run")
        return "Dbm", 0.8

    monkeypatch.setattr(audio_features_mod, "_estimate_key_source", fake)

    resolution = resolve_key(Path("dummy.mp3"), rekordbox_key="12A")

    assert resolution.value == "C#m"
    assert resolution.reason == "rekordbox_essentia_agreement"
    assert calls == ["essentia"]


def test_existing_and_essentia_key_agreement_without_rekordbox_skips_fallbacks(
    monkeypatch,
):
    calls: list[str] = []

    def fake(source: str, _path: Path) -> tuple[str, float] | None:
        calls.append(source)
        if source != "essentia":
            pytest.fail("madmom/librosa should not run")
        return "F minor", 0.8

    monkeypatch.setattr(audio_features_mod, "_estimate_key_source", fake)

    resolution = resolve_key(Path("dummy.mp3"), existing_key="04A")

    assert resolution.value == "Fm"
    assert resolution.reason == "id3_essentia_agreement"
    assert calls == ["essentia"]


def test_rekordbox_key_uses_three_of_four_consensus(monkeypatch):
    values = {
        "essentia": ("Gm", 0.8),
        "madmom": ("G minor", 0.85),
        "librosa": ("06A", 0.6),
    }
    monkeypatch.setattr(
        audio_features_mod,
        "_estimate_key_source",
        lambda source, _path: values[source],
    )

    resolution = resolve_key(Path("dummy.mp3"), rekordbox_key="Am")

    assert resolution.value == "Gm"
    assert resolution.reason == "three_of_four_consensus"


def test_rekordbox_key_falls_back_on_broad_disagreement(monkeypatch):
    values = {
        "essentia": ("Gm", 0.8),
        "madmom": ("C#m", 0.85),
        "librosa": ("Bb", 0.6),
    }
    monkeypatch.setattr(
        audio_features_mod,
        "_estimate_key_source",
        lambda source, _path: values[source],
    )

    resolution = resolve_key(Path("dummy.mp3"), rekordbox_key="8A")

    assert resolution.value == "Am"
    assert resolution.reason == "rekordbox_disagreement_fallback"


def test_estimate_bpm_candidates_continues_on_estimator_error(monkeypatch):
    monkeypatch.setattr(audio_features_mod, "ENABLE_ESSENTIA", False)
    monkeypatch.setattr(audio_features_mod, "_estimate_bpm_madmom", lambda _path: 128.0)
    monkeypatch.setattr(
        audio_features_mod,
        "_estimate_bpm_librosa",
        lambda _path: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    candidates = estimate_bpm_candidates(Path("dummy.mp3"))
    assert candidates == {"madmom": 128.0}


def test_estimate_key_candidates_continues_on_estimator_error(monkeypatch):
    monkeypatch.setattr(audio_features_mod, "ENABLE_ESSENTIA", False)
    monkeypatch.setattr(
        audio_features_mod, "_estimate_key_madmom", lambda _path: ("Am", 0.8)
    )
    monkeypatch.setattr(
        audio_features_mod,
        "_estimate_key_librosa",
        lambda _path: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    candidates = estimate_key_candidates(Path("dummy.mp3"))
    assert candidates == {"madmom": ("Am", 0.8)}


@pytest.mark.parametrize(
    ("raw_key", "expected"),
    [
        ("D major", "D"),
        ("G# minor", "Abm"),
        ("Dmaj", "D"),
        ("F#m", "F#m"),
        ("C#m", "C#m"),
        ("4A", "Fm"),
        ("04A", "Fm"),
        ("12B", "E"),
    ],
)
def test_canonicalize_key_normalizes_named_and_camelot_forms(
    raw_key: str, expected: str
):
    assert _canonicalize_key(raw_key) == expected


def test_camelot_conversion_round_trips_all_repository_keys():
    for canonical_key, camelot_code in CAMELOT_MAP.items():
        expected = _canonicalize_key(canonical_key)
        assert _canonicalize_key(camelot_code) == expected
        assert _canonicalize_key(camelot_code.lstrip("0").lower()) == expected


@pytest.mark.parametrize(
    ("value", "year", "expected"),
    [
        (139.99, None, 140.0),
        (135.17, None, 135.17),
        (135.17, 2024, 135.0),
        (135.03, 1999, 135.03),
        (135.01, 1999, 135.0),
        (176.47, 2024, 176.47),
    ],
)
def test_snap_bpm_uses_release_era_aware_tolerance(
    value: float, year: int | None, expected: float
):
    assert snap_bpm(value, release_year=year) == expected
