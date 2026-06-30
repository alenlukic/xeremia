from __future__ import annotations

from src.track_metadata.audio_features import fuse_bpm, fuse_key


def test_fuse_bpm_normalizes_half_time_and_returns_confidence():
    bpm, confidence = fuse_bpm([64.0, 128.0, 129.0])
    assert bpm == 128.0
    assert confidence == 1.0


def test_fuse_bpm_returns_none_for_empty_candidates():
    bpm, confidence = fuse_bpm([])
    assert bpm is None
    assert confidence == 0.0


def test_fuse_key_uses_weighted_canonical_vote():
    key, confidence = fuse_key([("Dbm", 0.7), ("C#m", 0.8), ("F#m", 0.2)])
    assert key == "C#m"
    assert confidence > 0.7


def test_fuse_key_returns_none_without_valid_keys():
    key, confidence = fuse_key([("Unknown", 1.0)])
    assert key is None
    assert confidence == 0.0
