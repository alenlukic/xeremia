"""Tests for src/harmonic_mixing/weight_service.py.

Run with:
    python -m pytest src/tests/test_weight_service.py -v
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from src.harmonic_mixing.config import MATCH_WEIGHTS, MatchFactors


def _make_service(**overrides):
    """Create a WeightService with DB persistence mocked out."""
    with patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"):
        with patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db"):
            from src.harmonic_mixing.weight_service import WeightService
            svc = WeightService()
            for k, v in overrides.items():
                if k in svc._raw_weights:
                    svc._raw_weights[k] = v
            return svc


class TestWeightFetch:
    def test_returns_expected_shape(self):
        svc = _make_service()
        result = svc.get_weights()
        assert "raw_weights" in result
        assert "effective_weights" in result
        assert "raw_sum" in result
        assert "target_sum" in result
        assert "is_sum_valid" in result
        assert "message" in result

    def test_raw_weights_on_0_100_scale(self):
        svc = _make_service()
        result = svc.get_weights()
        for factor in MatchFactors:
            raw = result["raw_weights"][factor.name]
            assert 0 <= raw <= 100

    def test_effective_weights_sum_to_100(self):
        svc = _make_service()
        result = svc.get_weights()
        eff_sum = sum(result["effective_weights"].values())
        assert eff_sum == pytest.approx(100.0, abs=0.1)

    def test_is_sum_valid_when_sum_matches_target(self):
        svc = _make_service()
        n = len(svc._raw_weights)
        for k in svc._raw_weights:
            svc._raw_weights[k] = 1.0 / n
        result = svc.get_weights()
        assert result["is_sum_valid"] is True
        assert result["message"] is None

    def test_is_sum_invalid_when_sum_differs(self):
        svc = _make_service()
        for k in svc._raw_weights:
            svc._raw_weights[k] = 0.5
        result = svc.get_weights()
        assert result["is_sum_valid"] is False
        assert result["message"] is not None
        assert "normalized" in result["message"].lower()


class TestDefaultWeights:
    def test_returns_all_factor_keys(self):
        svc = _make_service()
        defaults = svc.get_default_weights()
        for factor in MatchFactors:
            assert factor.name in defaults

    def test_returns_fusion_keys(self):
        svc = _make_service()
        defaults = svc.get_default_weights()
        for key in ("FUSION_HARMONIC", "FUSION_RHYTHM", "FUSION_TIMBRE", "FUSION_ENERGY"):
            assert key in defaults

    def test_values_on_0_100_scale(self):
        svc = _make_service()
        defaults = svc.get_default_weights()
        for v in defaults.values():
            assert 0 <= v <= 100

    def test_defaults_independent_of_current_state(self):
        svc = _make_service()
        with patch.object(svc, "_persist_to_db"):
            svc.update_weights({"BPM": 99})
        defaults = svc.get_default_weights()
        current = svc.get_weights()
        assert defaults["BPM"] != current["raw_weights"]["BPM"]


class TestWeightUpdate:
    @patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db")
    @patch("src.harmonic_mixing.weight_service.WeightService._load_from_db")
    def test_update_persists_and_returns(self, mock_load, mock_persist):
        from src.harmonic_mixing.weight_service import WeightService
        svc = WeightService()
        result = svc.update_weights({"BPM": 50, "CAMELOT": 50})
        assert result["raw_weights"]["BPM"] == 50.0
        assert result["raw_weights"]["CAMELOT"] == 50.0
        mock_persist.assert_called()

    def test_unknown_keys_ignored(self):
        svc = _make_service()
        original_bpm = svc._raw_weights["BPM"]
        with patch.object(svc, "_persist_to_db"):
            svc.update_weights({"NONEXISTENT_FACTOR": 99})
        assert svc._raw_weights["BPM"] == original_bpm

    def test_update_does_not_reject_non_100_sum(self):
        svc = _make_service()
        with patch.object(svc, "_persist_to_db"):
            result = svc.update_weights({"BPM": 10, "CAMELOT": 10})
        assert "raw_weights" in result
        assert result["raw_weights"]["BPM"] == 10.0
        assert result["raw_weights"]["CAMELOT"] == 10.0


class TestFusionWeights:
    def test_get_weights_includes_fusion_keys(self):
        svc = _make_service()
        result = svc.get_weights()
        for key in ("FUSION_HARMONIC", "FUSION_RHYTHM", "FUSION_TIMBRE", "FUSION_ENERGY"):
            assert key in result["raw_weights"]

    def test_raw_sum_ignores_fusion_keys(self):
        svc = _make_service()
        n = len(svc._raw_weights)
        for k in svc._raw_weights:
            svc._raw_weights[k] = 1.0 / n
        result = svc.get_weights()
        assert result["is_sum_valid"] is True
        main_sum = sum(
            v for k, v in result["raw_weights"].items() if not k.startswith("FUSION_")
        )
        assert result["raw_sum"] == pytest.approx(main_sum, abs=0.01)

    @patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db")
    @patch("src.harmonic_mixing.weight_service.WeightService._load_from_db")
    def test_update_fusion_key_round_trips(self, mock_load, mock_persist):
        from src.harmonic_mixing.weight_service import WeightService
        svc = WeightService()
        result = svc.update_weights({"FUSION_HARMONIC": 40})
        assert result["raw_weights"]["FUSION_HARMONIC"] == pytest.approx(40.0, abs=0.01)

    @patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db")
    @patch("src.harmonic_mixing.weight_service.WeightService._load_from_db")
    def test_get_fusion_weights_returns_0_1_scale(self, mock_load, mock_persist):
        from src.harmonic_mixing.weight_service import WeightService
        svc = WeightService()
        svc.update_weights({"FUSION_HARMONIC": 50})
        fw = svc.get_fusion_weights()
        assert fw["FUSION_HARMONIC"] == pytest.approx(0.50, abs=0.001)
        assert fw["FUSION_RHYTHM"] == pytest.approx(0.25, abs=0.001)

    def test_fusion_keys_not_in_effective_weights(self):
        svc = _make_service()
        result = svc.get_weights()
        for key in ("FUSION_HARMONIC", "FUSION_RHYTHM", "FUSION_TIMBRE", "FUSION_ENERGY"):
            assert key not in result["effective_weights"]


class TestEffectiveWeightsForScoring:
    def test_effective_weights_sum_to_one(self):
        svc = _make_service()
        eff = svc.get_effective_weights_for_scoring()
        assert sum(eff.values()) == pytest.approx(1.0, abs=1e-9)

    def test_all_zero_weights_distributes_evenly(self):
        svc = _make_service()
        for k in svc._raw_weights:
            svc._raw_weights[k] = 0.0
        eff = svc.get_effective_weights_for_scoring()
        n = len(svc._raw_weights)
        for v in eff.values():
            assert v == pytest.approx(1.0 / n, abs=1e-9)

    def test_normalization_preserves_ratios(self):
        svc = _make_service()
        for k in svc._raw_weights:
            svc._raw_weights[k] = 0.0
        svc._raw_weights["BPM"] = 0.6
        svc._raw_weights["CAMELOT"] = 0.4
        eff = svc.get_effective_weights_for_scoring()
        assert eff["BPM"] == pytest.approx(0.6, abs=1e-9)
        assert eff["CAMELOT"] == pytest.approx(0.4, abs=1e-9)

    def test_scoring_functional_when_sum_not_100(self):
        """Retrieval must not crash when raw weights don't sum to 100."""
        svc = _make_service()
        for k in svc._raw_weights:
            svc._raw_weights[k] = 0.5
        eff = svc.get_effective_weights_for_scoring()
        assert sum(eff.values()) == pytest.approx(1.0, abs=1e-9)
        assert all(v > 0 for v in eff.values())


class TestWeightPropagation:
    """PUT /api/weights must propagate immediately to the scoring path."""

    @patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db")
    @patch("src.harmonic_mixing.weight_service.WeightService._load_from_db")
    def test_update_syncs_effective_weights_to_transition_match(
        self, mock_load, mock_persist
    ):
        from src.harmonic_mixing.transition_match import TransitionMatch
        from src.harmonic_mixing.weight_service import WeightService

        WeightService.reset()
        svc = WeightService()
        WeightService._instance = svc

        try:
            TransitionMatch.effective_weights = None

            from src.harmonic_mixing.transition_match_finder import TransitionMatchFinder
            TransitionMatchFinder._sync_effective_weights()

            assert TransitionMatch.effective_weights is not None
            prev_bpm = TransitionMatch.effective_weights.get("BPM")

            svc.update_weights({"BPM": 80})
            TransitionMatchFinder._sync_effective_weights()

            new_bpm = TransitionMatch.effective_weights.get("BPM")
            assert new_bpm != prev_bpm
            assert new_bpm > prev_bpm
        finally:
            WeightService.reset()
            TransitionMatch.effective_weights = None


class TestStaleKeyMigration:
    """When persisted weights contain keys removed from MatchFactors,
    the load path must redistribute their weight mass to surviving keys."""

    @staticmethod
    def _even_weights() -> dict:
        """Return weights that sum to exactly 1.0 for current MatchFactors."""
        keys = [f.name for f in MatchFactors]
        w = 1.0 / len(keys)
        return {k: w for k in keys}

    def _build_saved_payload(self, extra_keys: dict) -> str:
        base = self._even_weights()
        base.update(extra_keys)
        return json.dumps(base)

    @patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db")
    def test_stale_keys_redistributed_on_load(self, mock_persist):
        from src.harmonic_mixing.weight_service import WeightService

        stale_weight = 0.05
        payload = self._build_saved_payload({
            "DANCEABILITY": stale_weight,
            "TIMBRE": stale_weight,
        })

        mock_row = MagicMock()
        mock_row.weights_json = payload

        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_row

        with patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"):
            svc = WeightService()

        svc._load_from_db = WeightService._load_from_db.__get__(svc)

        with patch("src.db.database.create_session", return_value=mock_session):
            svc._load_from_db()

        result = svc.get_weights()
        expected_sum = 100.0 + (stale_weight * 2) * 100
        assert result["raw_sum"] == pytest.approx(expected_sum, abs=0.1)
        mock_persist.assert_called()

    @patch("src.harmonic_mixing.weight_service.WeightService._persist_to_db")
    def test_stale_keys_with_zero_weight_no_change(self, mock_persist):
        from src.harmonic_mixing.weight_service import WeightService

        payload = self._build_saved_payload({
            "OLD_REMOVED_FACTOR": 0.0,
        })

        mock_row = MagicMock()
        mock_row.weights_json = payload

        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_row

        with patch("src.harmonic_mixing.weight_service.WeightService._load_from_db"):
            svc = WeightService()

        svc._load_from_db = WeightService._load_from_db.__get__(svc)

        with patch("src.db.database.create_session", return_value=mock_session):
            svc._load_from_db()

        result = svc.get_weights()
        assert result["raw_sum"] == pytest.approx(100.0, abs=0.1)
