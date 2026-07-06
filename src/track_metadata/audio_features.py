from __future__ import annotations

import importlib
import logging
from pathlib import Path

import numpy as np

from src.data_management.config import CANONICAL_KEY_MAP
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.config import ENABLE_ESSENTIA

# 48-track calibration against data/calibration ranked BPM analyzers by MAE as
# essentia (1.66) ahead of madmom (4.06) ahead of librosa (8.23).
BPM_ANALYZER_PRIORITY = ("essentia", "madmom", "librosa")
# The same 48-track calibration ranked exact canonical-key matches as essentia
# (31/48) ahead of madmom (26/48) ahead of librosa (17/48).
KEY_ANALYZER_PRIORITY = ("essentia", "madmom", "librosa")
# 2 BPM covers the observed clean-track analyzer spread while still resolving
# to the calibrated analyzer's value inside an agreeing cluster.
BPM_AGREEMENT_TOLERANCE = 2.0


def _import_attr(module: str, attr: str):
    return getattr(importlib.import_module(module), attr)


def analyze_missing_audio_features(
    audio_path: Path, metadata: SimpleMetadata
) -> SimpleMetadata:
    needs_bpm = metadata.bpm is None
    needs_key = metadata.key is None
    if not (needs_bpm or needs_key):
        return metadata

    if needs_bpm:
        bpm_value, _confidence = fuse_bpm(estimate_bpm_candidates(audio_path))
        if bpm_value is not None:
            # Estimated tempos should follow library convention: whole BPMs are
            # the default, with decimal-tempo exceptions carried only when tags
            # already provide them.
            metadata.bpm = float(round(bpm_value))
            logging.info("Estimated BPM for %s: %.2f", audio_path.name, metadata.bpm)

    if needs_key:
        key_value, _confidence = fuse_key(estimate_key_candidates(audio_path))
        if key_value is not None:
            metadata.key = key_value
            logging.info("Estimated key for %s: %s", audio_path.name, metadata.key)

    return metadata


def estimate_bpm_candidates(audio_path: Path) -> dict[str, float]:
    candidates: dict[str, float] = {}
    estimators = [
        ("madmom", _estimate_bpm_madmom),
        ("librosa", _estimate_bpm_librosa),
    ]
    if ENABLE_ESSENTIA:
        estimators.append(("essentia", _estimate_bpm_essentia))

    for analyzer_name, estimator in estimators:
        try:
            value = estimator(audio_path)
        except Exception as exc:  # pragma: no cover - external library behaviour
            logging.warning(
                "%s BPM analysis failed for %s: %s",
                analyzer_name,
                audio_path.name,
                exc,
            )
            continue
        if value is not None and value > 0:
            candidates[analyzer_name] = value
    return candidates


def estimate_key_candidates(audio_path: Path) -> dict[str, tuple[str, float]]:
    candidates: dict[str, tuple[str, float]] = {}
    estimators = [
        ("madmom", _estimate_key_madmom),
        ("librosa", _estimate_key_librosa),
    ]
    if ENABLE_ESSENTIA:
        estimators.append(("essentia", _estimate_key_essentia))

    for analyzer_name, estimator in estimators:
        try:
            value = estimator(audio_path)
        except Exception as exc:  # pragma: no cover - external library behaviour
            logging.warning(
                "%s key analysis failed for %s: %s",
                analyzer_name,
                audio_path.name,
                exc,
            )
            continue
        if value is not None:
            candidates[analyzer_name] = value
    return candidates


def _normalize_bpm(value: float) -> float:
    normalized = float(value)
    while normalized < 70:
        normalized *= 2
    while normalized > 200:
        normalized /= 2
    return normalized


def fuse_bpm(
    candidates: dict[str, float], *, tolerance: float = BPM_AGREEMENT_TOLERANCE
) -> tuple[float | None, float]:
    if not candidates:
        return None, 0.0

    normalized_candidates = {
        analyzer: _normalize_bpm(candidate)
        for analyzer, candidate in candidates.items()
        if candidate > 0
    }
    if not normalized_candidates:
        return None, 0.0

    ordered_analyzers = [
        analyzer
        for analyzer in BPM_ANALYZER_PRIORITY
        if analyzer in normalized_candidates
    ]
    ordered_analyzers.extend(
        analyzer
        for analyzer in normalized_candidates
        if analyzer not in BPM_ANALYZER_PRIORITY
    )

    winning_supporters: list[str] = []
    for analyzer in ordered_analyzers:
        anchor_value = normalized_candidates[analyzer]
        supporters = [
            supporter
            for supporter in ordered_analyzers
            if abs(normalized_candidates[supporter] - anchor_value) <= tolerance
        ]
        if len(supporters) > len(winning_supporters):
            winning_supporters = supporters

    total_candidates = len(ordered_analyzers)
    if len(winning_supporters) >= 2:
        winner = next(
            analyzer for analyzer in ordered_analyzers if analyzer in winning_supporters
        )
        return normalized_candidates[winner], len(winning_supporters) / total_candidates

    fallback = ordered_analyzers[0]
    return normalized_candidates[fallback], 0.0


def _canonicalize_key(value: str | None) -> str | None:
    if not value:
        return None
    normalized = " ".join(value.strip().lower().split())
    if normalized.endswith(" major"):
        normalized = normalized.removesuffix(" major") + "maj"
    elif normalized.endswith(" minor"):
        normalized = normalized.removesuffix(" minor") + "min"
    canonical = CANONICAL_KEY_MAP.get(normalized)
    if canonical is None:
        return None
    return canonical[0].upper() + canonical[1:]


def fuse_key(
    candidates: dict[str, tuple[str, float]],
) -> tuple[str | None, float]:
    if not candidates:
        return None, 0.0

    canonical_candidates: dict[str, str] = {}
    for analyzer, (key, _confidence) in candidates.items():
        canonical = _canonicalize_key(key)
        if canonical is None:
            continue
        canonical_candidates[analyzer] = canonical

    if not canonical_candidates:
        return None, 0.0

    ordered_analyzers = [
        analyzer
        for analyzer in KEY_ANALYZER_PRIORITY
        if analyzer in canonical_candidates
    ]
    ordered_analyzers.extend(
        analyzer
        for analyzer in canonical_candidates
        if analyzer not in KEY_ANALYZER_PRIORITY
    )

    total_candidates = len(ordered_analyzers)

    fallback = ordered_analyzers[0]
    fallback_key = canonical_candidates[fallback]
    # Only let agreement reinforce the best available analyzer; otherwise keep
    # the calibrated fallback instead of letting lower-priority consensus
    # override it.
    fallback_supporters = [
        supporter
        for supporter in ordered_analyzers
        if canonical_candidates[supporter] == fallback_key
    ]
    if len(fallback_supporters) >= 2:
        return fallback_key, len(fallback_supporters) / total_candidates
    return fallback_key, 0.0


def _estimate_bpm_madmom(audio_path: Path) -> float | None:
    try:
        DBNBeatTrackingProcessor = _import_attr(
            "madmom.features.beats", "DBNBeatTrackingProcessor"
        )
        RNNBeatProcessor = _import_attr("madmom.features.beats", "RNNBeatProcessor")
    except ImportError as exc:
        raise RuntimeError(
            "madmom is required for BPM estimation. "
            "Install this module's requirements to enable audio analysis."
        ) from exc

    beat_processor = RNNBeatProcessor()
    activation = beat_processor(str(audio_path))
    beats = DBNBeatTrackingProcessor(fps=100)(activation)
    if len(beats) < 2:
        return None

    intervals = np.diff(beats)  # type: ignore[arg-type]
    if intervals.size == 0:  # type: ignore[attr-defined]
        return None

    positive_intervals = intervals[intervals > 0]
    if positive_intervals.size == 0:  # type: ignore[attr-defined]
        return None

    median_interval = float(np.median(positive_intervals))  # type: ignore[arg-type]
    if median_interval <= 0:
        return None

    return 60.0 / median_interval


def _estimate_bpm_librosa(audio_path: Path) -> float | None:
    librosa = importlib.import_module("librosa")
    signal, sample_rate = librosa.load(str(audio_path), mono=True)
    tempo, _beats = librosa.beat.beat_track(y=signal, sr=sample_rate)
    if tempo is None:
        return None
    return float(tempo)


def _estimate_bpm_essentia(audio_path: Path) -> float | None:
    standard = importlib.import_module("essentia.standard")
    loader = standard.MonoLoader(filename=str(audio_path))
    signal = loader()
    extractor = standard.RhythmExtractor2013(method="multifeature")
    bpm, _ticks, _confidence, _bpm_intervals, _ = extractor(signal)
    return float(bpm) if bpm else None


def _estimate_key_madmom(audio_path: Path) -> tuple[str, float] | None:
    try:
        CNNKeyRecognitionProcessor = _import_attr(
            "madmom.features.key", "CNNKeyRecognitionProcessor"
        )
        key_prediction_to_label = _import_attr(
            "madmom.features.key", "key_prediction_to_label"
        )
    except ImportError as exc:
        raise RuntimeError(
            "madmom is required for key estimation. "
            "Install this module's requirements to enable audio analysis."
        ) from exc

    key_processor = CNNKeyRecognitionProcessor()
    prediction = key_processor(str(audio_path))
    if prediction is None:
        return None

    label = key_prediction_to_label(prediction)
    if isinstance(label, str):
        return label, 0.85

    return None


def _estimate_key_librosa(audio_path: Path) -> tuple[str, float] | None:
    librosa = importlib.import_module("librosa")
    signal, sample_rate = librosa.load(str(audio_path), mono=True)
    chroma = librosa.feature.chroma_cqt(y=signal, sr=sample_rate)
    if chroma.size == 0:
        return None

    pitch_profile = chroma.mean(axis=1)
    major_profile = np.array(
        [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    )
    minor_profile = np.array(
        [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    )
    note_names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

    scores: list[tuple[str, float]] = []
    for idx, note in enumerate(note_names):
        major_score = float(np.dot(pitch_profile, np.roll(major_profile, idx)))
        minor_score = float(np.dot(pitch_profile, np.roll(minor_profile, idx)))
        scores.append((note, major_score))
        scores.append((f"{note}m", minor_score))

    scores.sort(key=lambda item: item[1], reverse=True)
    if not scores:
        return None

    top_key, top_score = scores[0]
    second_score = scores[1][1] if len(scores) > 1 else top_score
    confidence = (
        0.5
        if top_score <= 0
        else max(0.05, min(1.0, (top_score - second_score) / top_score))
    )
    return top_key, confidence


def _estimate_key_essentia(audio_path: Path) -> tuple[str, float] | None:
    standard = importlib.import_module("essentia.standard")
    loader = standard.MonoLoader(filename=str(audio_path))
    signal = loader()
    extractor = standard.KeyExtractor()
    key, scale, _strength = extractor(signal)
    if not key:
        return None
    return (f"{key}m" if scale == "minor" else key, 0.8)
