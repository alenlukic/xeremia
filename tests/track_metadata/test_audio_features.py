from __future__ import annotations

from pathlib import Path

import pytest

import src.track_metadata.audio_features as audio_features_mod
from src.track_metadata.audio_features import (
    _canonicalize_key,
    analyze_missing_audio_features,
    estimate_bpm_candidates,
    estimate_key_candidates,
)
from src.track_metadata.models import SimpleMetadata


@pytest.mark.parametrize(
    ("initial_bpm", "initial_key", "expected_bpm", "expected_key"),
    [
        (None, None, 128.0, "C#m"),
        (120.0, None, 120.0, "C#m"),
        (None, "Gm", 128.0, "Gm"),
        (120.0, "Gm", 120.0, "Gm"),
    ],
)
def test_analyze_missing_audio_features_is_safe_and_updates_only_missing(
    monkeypatch,
    initial_bpm: float | None,
    initial_key: str | None,
    expected_bpm: float | None,
    expected_key: str | None,
):
    monkeypatch.setattr(
        audio_features_mod,
        "estimate_bpm_candidates",
        lambda _path: {"essentia": 128.1234, "madmom": 127.9},
    )
    monkeypatch.setattr(
        audio_features_mod,
        "estimate_key_candidates",
        lambda _path: {
            "essentia": ("C#m", 0.9),
            "librosa": ("Dbm", 0.7),
        },
    )

    audio_path = Path("dummy.mp3")
    metadata = SimpleMetadata(title="t", artist="a", bpm=initial_bpm, key=initial_key)

    updated = analyze_missing_audio_features(audio_path, metadata)

    assert updated.bpm == expected_bpm
    assert updated.key == expected_key


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
    ],
)
def test_canonicalize_key_normalizes_spelled_and_compact_forms(
    raw_key: str, expected: str
):
    assert _canonicalize_key(raw_key) == expected
