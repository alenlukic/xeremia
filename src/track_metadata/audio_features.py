from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import numpy as np

from src.track_metadata.key_utils import canonicalize_key
from src.track_metadata.models import SimpleMetadata
from src.track_metadata.pipeline.config import ENABLE_ESSENTIA

# 48-track calibration against data/calibration ranked BPM analyzers by MAE as
# essentia (1.66) ahead of madmom (4.06) ahead of librosa (8.23).
BPM_ANALYZER_PRIORITY = ("essentia", "madmom", "librosa")
# The same 48-track calibration ranked exact canonical-key matches as essentia
# (31/48) ahead of madmom (26/48) ahead of librosa (17/48).
KEY_ANALYZER_PRIORITY = ("essentia", "madmom", "librosa")
BPM_AGREEMENT_RATIO = 0.025
# Retained for callers that explicitly pass the legacy absolute tolerance to
# fuse_bpm; staged resolution uses BPM_AGREEMENT_RATIO by default.
BPM_AGREEMENT_TOLERANCE = 2.0
BPM_GROSS_OUTLIER_RATIO = 0.08
BPM_GROSS_OUTLIER_FLOOR = 8.0


@dataclass(frozen=True)
class FeatureResolution:
    value: Any | None
    confidence: float
    reason: str


def _import_attr(module: str, attr: str):
    return getattr(importlib.import_module(module), attr)


def analyze_missing_audio_features(
    audio_path: Path,
    metadata: SimpleMetadata,
    existing_metadata: SimpleMetadata | None = None,
    rekordbox_metadata: SimpleMetadata | None = None,
) -> SimpleMetadata:
    """Resolve BPM and key with staged analyzers and optional Rekordbox evidence.

    The historical function name is retained for compatibility, but existing BPM/key
    tags are now validated rather than unconditionally trusted.
    """
    existing = existing_metadata or SimpleMetadata(bpm=metadata.bpm, key=metadata.key)
    rekordbox = rekordbox_metadata or SimpleMetadata()

    bpm_resolution = resolve_bpm(
        audio_path,
        existing_bpm=existing.bpm,
        rekordbox_bpm=rekordbox.bpm,
    )
    if bpm_resolution.value is not None:
        metadata.bpm = round(
            snap_bpm(float(bpm_resolution.value), release_year=metadata.year), 2
        )
        logging.info(
            "Resolved BPM for %s: %.2f (%s)",
            audio_path.name,
            metadata.bpm,
            bpm_resolution.reason,
        )

    key_resolution = resolve_key(
        audio_path,
        existing_key=existing.key,
        rekordbox_key=rekordbox.key,
    )
    if key_resolution.value is not None:
        metadata.key = str(key_resolution.value)
        logging.info(
            "Resolved key for %s: %s (%s)",
            audio_path.name,
            metadata.key,
            key_resolution.reason,
        )

    return metadata


def resolve_bpm(
    audio_path: Path,
    *,
    existing_bpm: float | None = None,
    rekordbox_bpm: float | None = None,
) -> FeatureResolution:
    existing = _positive_bpm(existing_bpm)
    rekordbox = _positive_bpm(rekordbox_bpm)

    if rekordbox is not None:
        if existing is not None and bpm_values_agree(existing, rekordbox):
            return FeatureResolution(existing, 1.0, "id3_rekordbox_agreement")

        essentia = _estimate_bpm_source("essentia", audio_path)
        if essentia is not None and bpm_values_agree(rekordbox, essentia):
            return FeatureResolution(rekordbox, 1.0, "rekordbox_essentia_agreement")

        candidates: dict[str, float] = {"rekordbox": rekordbox}
        if essentia is not None:
            candidates["essentia"] = essentia
        madmom = _estimate_bpm_source("madmom", audio_path)
        librosa = _estimate_bpm_source("librosa", audio_path)
        if madmom is not None:
            candidates["madmom"] = madmom
        if librosa is not None:
            candidates["librosa"] = librosa

        supporters = _bpm_consensus_sources(candidates, minimum=3)
        if supporters:
            winner = _first_available(
                ("rekordbox", "essentia", "madmom", "librosa"), supporters
            )
            return FeatureResolution(
                candidates[winner],
                len(supporters) / 4,
                "three_of_four_consensus",
            )
        return FeatureResolution(rekordbox, 0.25, "rekordbox_disagreement_fallback")

    essentia = _estimate_bpm_source("essentia", audio_path)
    if existing is not None:
        if essentia is None:
            return FeatureResolution(existing, 0.5, "id3_essentia_unavailable")
        if bpm_values_agree(existing, essentia):
            return FeatureResolution(existing, 1.0, "id3_essentia_agreement")

    madmom = _estimate_bpm_source("madmom", audio_path)
    if essentia is not None and madmom is not None and bpm_values_agree(
        essentia, madmom
    ):
        return FeatureResolution(essentia, 1.0, "essentia_madmom_agreement")

    librosa = _estimate_bpm_source("librosa", audio_path)
    candidates = {
        source: value
        for source, value in (
            ("essentia", essentia),
            ("madmom", madmom),
            ("librosa", librosa),
        )
        if value is not None
    }
    value, confidence = fuse_bpm(candidates)
    if value is not None:
        return FeatureResolution(value, confidence, "analyzer_fusion")
    if existing is not None:
        return FeatureResolution(existing, 0.0, "id3_analyzers_unavailable")
    return FeatureResolution(None, 0.0, "bpm_unresolved")


def resolve_key(
    audio_path: Path,
    *,
    existing_key: str | None = None,
    rekordbox_key: str | None = None,
) -> FeatureResolution:
    existing = canonicalize_key(existing_key)
    rekordbox = canonicalize_key(rekordbox_key)

    if rekordbox is not None:
        if existing is not None and existing == rekordbox:
            return FeatureResolution(existing, 1.0, "id3_rekordbox_agreement")

        essentia = _estimate_key_source("essentia", audio_path)
        essentia_key = canonicalize_key(essentia[0]) if essentia else None
        if essentia_key is not None and essentia_key == rekordbox:
            return FeatureResolution(rekordbox, 1.0, "rekordbox_essentia_agreement")

        candidates: dict[str, str] = {"rekordbox": rekordbox}
        if essentia_key is not None:
            candidates["essentia"] = essentia_key
        madmom = _estimate_key_source("madmom", audio_path)
        librosa = _estimate_key_source("librosa", audio_path)
        madmom_key = canonicalize_key(madmom[0]) if madmom else None
        librosa_key = canonicalize_key(librosa[0]) if librosa else None
        if madmom_key is not None:
            candidates["madmom"] = madmom_key
        if librosa_key is not None:
            candidates["librosa"] = librosa_key

        supporters = _key_consensus_sources(candidates, minimum=3)
        if supporters:
            winner = _first_available(
                ("rekordbox", "essentia", "madmom", "librosa"), supporters
            )
            return FeatureResolution(
                candidates[winner],
                len(supporters) / 4,
                "three_of_four_consensus",
            )
        return FeatureResolution(rekordbox, 0.25, "rekordbox_disagreement_fallback")

    essentia = _estimate_key_source("essentia", audio_path)
    essentia_key = canonicalize_key(essentia[0]) if essentia else None
    if existing is not None:
        if essentia_key is None:
            return FeatureResolution(existing, 0.5, "id3_essentia_unavailable")
        if existing == essentia_key:
            return FeatureResolution(existing, 1.0, "id3_essentia_agreement")

    madmom = _estimate_key_source("madmom", audio_path)
    madmom_key = canonicalize_key(madmom[0]) if madmom else None
    if essentia_key is not None and essentia_key == madmom_key:
        return FeatureResolution(essentia_key, 1.0, "essentia_madmom_agreement")

    librosa = _estimate_key_source("librosa", audio_path)
    candidates = {
        source: value
        for source, value in (
            ("essentia", essentia),
            ("madmom", madmom),
            ("librosa", librosa),
        )
        if value is not None
    }
    value, confidence = fuse_key(candidates)
    if value is not None:
        return FeatureResolution(value, confidence, "analyzer_fusion")
    if existing is not None:
        return FeatureResolution(existing, 0.0, "id3_analyzers_unavailable")
    return FeatureResolution(None, 0.0, "key_unresolved")


def estimate_bpm_candidates(audio_path: Path) -> dict[str, float]:
    candidates: dict[str, float] = {}
    for analyzer_name in BPM_ANALYZER_PRIORITY:
        value = _estimate_bpm_source(analyzer_name, audio_path)
        if value is not None:
            candidates[analyzer_name] = value
    return candidates


def estimate_key_candidates(audio_path: Path) -> dict[str, tuple[str, float]]:
    candidates: dict[str, tuple[str, float]] = {}
    for analyzer_name in KEY_ANALYZER_PRIORITY:
        value = _estimate_key_source(analyzer_name, audio_path)
        if value is not None:
            candidates[analyzer_name] = value
    return candidates


def _estimate_bpm_source(source: str, audio_path: Path) -> float | None:
    if source == "essentia" and not ENABLE_ESSENTIA:
        return None
    estimators: dict[str, Callable[[Path], float | None]] = {
        "essentia": _estimate_bpm_essentia,
        "madmom": _estimate_bpm_madmom,
        "librosa": _estimate_bpm_librosa,
    }
    estimator = estimators[source]
    try:
        value = estimator(audio_path)
    except Exception as exc:  # pragma: no cover - external library behaviour
        logging.warning(
            "%s BPM analysis failed for %s: %s", source, audio_path.name, exc
        )
        return None
    return _positive_bpm(value)


def _estimate_key_source(
    source: str, audio_path: Path
) -> tuple[str, float] | None:
    if source == "essentia" and not ENABLE_ESSENTIA:
        return None
    estimators: dict[str, Callable[[Path], tuple[str, float] | None]] = {
        "essentia": _estimate_key_essentia,
        "madmom": _estimate_key_madmom,
        "librosa": _estimate_key_librosa,
    }
    estimator = estimators[source]
    try:
        return estimator(audio_path)
    except Exception as exc:  # pragma: no cover - external library behaviour
        logging.warning(
            "%s key analysis failed for %s: %s", source, audio_path.name, exc
        )
        return None


def _positive_bpm(value: float | None) -> float | None:
    if value is None:
        return None
    candidate = float(value)
    return candidate if candidate > 0 else None


def _normalize_bpm(value: float) -> float:
    """Compatibility helper: preserve the analyzer's reported tempo octave."""
    return float(value)


def bpm_values_agree(
    left: float,
    right: float,
    *,
    tolerance_ratio: float = BPM_AGREEMENT_RATIO,
) -> bool:
    average = (abs(left) + abs(right)) / 2
    if average == 0:
        return False
    return abs(left - right) / average <= tolerance_ratio


def bpm_values_octave_related(left: float, right: float) -> bool:
    return bpm_values_agree(left, right * 2) or bpm_values_agree(left * 2, right)


def snap_bpm(value: float, *, release_year: int | None = None) -> float:
    nearest_integer = round(value)
    delta = abs(value - nearest_integer)
    if release_year is not None and release_year < 2005:
        tolerance = 0.02
    elif release_year is not None:
        tolerance = 0.25
    else:
        tolerance = 0.15
    return float(nearest_integer) if delta <= tolerance + 1e-9 else value


def fuse_bpm(
    candidates: dict[str, float],
    *,
    tolerance: float | None = None,
) -> tuple[float | None, float]:
    valid = {
        source: value
        for source, raw in candidates.items()
        if (value := _positive_bpm(raw)) is not None
    }
    if not valid:
        return None, 0.0

    ordered = [source for source in BPM_ANALYZER_PRIORITY if source in valid]
    ordered.extend(source for source in valid if source not in BPM_ANALYZER_PRIORITY)

    def agrees(left: float, right: float) -> bool:
        if tolerance is not None:
            return abs(left - right) <= tolerance
        return bpm_values_agree(left, right)

    essentia = valid.get("essentia")
    madmom = valid.get("madmom")
    librosa = valid.get("librosa")
    if essentia is not None and madmom is not None and agrees(essentia, madmom):
        return essentia, 2 / len(valid)

    if madmom is not None and librosa is not None and agrees(madmom, librosa):
        if essentia is None or _is_gross_bpm_outlier(essentia, madmom, librosa):
            return madmom, 2 / len(valid)

    if essentia is not None and librosa is not None and agrees(essentia, librosa):
        return essentia, 2 / len(valid)

    fallback = ordered[0]
    return valid[fallback], 0.0


def _is_gross_bpm_outlier(value: float, first: float, second: float) -> bool:
    consensus = (first + second) / 2
    return abs(value - consensus) > max(
        BPM_GROSS_OUTLIER_FLOOR, consensus * BPM_GROSS_OUTLIER_RATIO
    )


def _bpm_consensus_sources(
    candidates: dict[str, float], *, minimum: int
) -> set[str]:
    sources = list(candidates)
    best: set[str] = set()
    for anchor in sources:
        supporters = {
            source
            for source in sources
            if bpm_values_agree(candidates[anchor], candidates[source])
        }
        if len(supporters) >= minimum and all(
            bpm_values_agree(candidates[left], candidates[right])
            for left in supporters
            for right in supporters
        ):
            if len(supporters) > len(best):
                best = supporters
    return best


def _canonicalize_key(value: str | None) -> str | None:
    return canonicalize_key(value)


def fuse_key(
    candidates: dict[str, tuple[str, float]],
) -> tuple[str | None, float]:
    canonical_candidates: dict[str, str] = {}
    for analyzer, (key, _confidence) in candidates.items():
        canonical = canonicalize_key(key)
        if canonical is not None:
            canonical_candidates[analyzer] = canonical

    if not canonical_candidates:
        return None, 0.0

    ordered = [
        analyzer
        for analyzer in KEY_ANALYZER_PRIORITY
        if analyzer in canonical_candidates
    ]
    ordered.extend(
        analyzer
        for analyzer in canonical_candidates
        if analyzer not in KEY_ANALYZER_PRIORITY
    )

    fallback = ordered[0]
    fallback_key = canonical_candidates[fallback]
    supporters = [
        source
        for source in ordered
        if canonical_candidates[source] == fallback_key
    ]
    if len(supporters) >= 2:
        return fallback_key, len(supporters) / len(ordered)
    return fallback_key, 0.0


def _key_consensus_sources(
    candidates: dict[str, str], *, minimum: int
) -> set[str]:
    by_key: dict[str, set[str]] = {}
    for source, key in candidates.items():
        by_key.setdefault(key, set()).add(source)
    supporters = max(by_key.values(), key=len, default=set())
    return supporters if len(supporters) >= minimum else set()


def _first_available(priority: tuple[str, ...], available: set[str]) -> str:
    return next(source for source in priority if source in available)


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
