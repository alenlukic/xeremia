"""Tests for src/harmonic_mixing/cosine_cache.py and cache integration.

Run with:
    python -m pytest tests/test_cosine_cache.py -v
"""

import threading
import time
from unittest.mock import MagicMock, patch

import pytest

from src.harmonic_mixing.cosine_cache import CosineCache


# ---------------------------------------------------------------------------
# Unit tests: basic cache semantics
# ---------------------------------------------------------------------------


class TestCosineCacheGetPut:
    def test_get_miss_returns_none(self):
        cache = CosineCache()
        assert cache.get(1, 2) is None

    def test_put_then_get_returns_value(self):
        cache = CosineCache()
        cache.put(1, 2, 0.95)
        assert cache.get(1, 2) == 0.95

    def test_canonical_ordering_reversed_ids(self):
        cache = CosineCache()
        cache.put(5, 3, 0.75)
        assert cache.get(3, 5) == 0.75
        assert cache.get(5, 3) == 0.75

    def test_overwrite_existing_key(self):
        cache = CosineCache()
        cache.put(1, 2, 0.5)
        cache.put(1, 2, 0.9)
        assert cache.get(1, 2) == 0.9

    def test_size(self):
        cache = CosineCache()
        assert cache.size() == 0
        cache.put(1, 2, 0.5)
        cache.put(3, 4, 0.6)
        assert cache.size() == 2


class TestCosineCacheLRUEviction:
    def test_eviction_at_max_plus_one(self):
        max_entries = 5
        cache = CosineCache(max_entries=max_entries)
        for i in range(max_entries):
            cache.put(i, i + 1000, float(i))
        assert cache.size() == max_entries

        cache.put(999, 1999, 0.99)
        assert cache.size() == max_entries
        # Oldest entry (0, 1000) should have been evicted
        assert cache.get(0, 1000) is None
        # Newest entry should be present
        assert cache.get(999, 1999) == 0.99

    @pytest.mark.slow
    def test_lru_eviction_at_500001(self):
        """Verify the default 500000-entry cap evicts the LRU entry."""
        max_entries = 500_000
        cache = CosineCache(max_entries=max_entries)
        for i in range(max_entries):
            cache.put(i, i + 1_000_000, float(i) / max_entries)
        assert cache.size() == max_entries

        cache.put(999_999, 1_999_999, 0.42)
        assert cache.size() == max_entries
        assert cache.get(0, 1_000_000) is None
        assert cache.get(999_999, 1_999_999) == 0.42

    def test_get_refreshes_lru_order(self):
        cache = CosineCache(max_entries=3)
        cache.put(1, 2, 0.1)
        cache.put(3, 4, 0.2)
        cache.put(5, 6, 0.3)
        # Access the oldest to refresh it
        cache.get(1, 2)
        # Add a new entry; (3,4) should be evicted since it's now oldest
        cache.put(7, 8, 0.4)
        assert cache.get(3, 4) is None
        assert cache.get(1, 2) == 0.1


class TestCosineCacheThreadSafety:
    def test_concurrent_puts_no_crash(self):
        cache = CosineCache(max_entries=10_000)
        errors = []

        def writer(start):
            try:
                for i in range(1000):
                    cache.put(start + i, start + i + 100_000, float(i))
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=writer, args=(t * 10_000,)) for t in range(4)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        assert cache.size() <= 10_000


# ---------------------------------------------------------------------------
# BFS warm_from_db
# ---------------------------------------------------------------------------


def _make_sim_row(id1, id2, sim, version="1"):
    row = MagicMock()
    row.id1 = id1
    row.id2 = id2
    row.cosine_similarity = sim
    row.descriptor_version = version
    return row


class TestWarmFromDb:
    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_depth_1_and_depth_2(self, mock_db_module):
        mock_session = MagicMock()
        mock_db_module.create_session.return_value = mock_session

        depth1_rows = [
            _make_sim_row(10, 20, 0.8),
            _make_sim_row(10, 30, 0.7),
        ]
        depth2_rows_for_20 = [
            _make_sim_row(20, 40, 0.6),
        ]
        depth2_rows_for_30 = [
            _make_sim_row(30, 50, 0.5),
        ]

        mock_query = MagicMock()
        mock_session.query.return_value = mock_query

        call_count = {"n": 0}
        results_sequence = [depth1_rows, depth2_rows_for_20, depth2_rows_for_30]

        def filter_side_effect(*args, **kwargs):
            mock_filtered = MagicMock()
            mock_filtered.all.return_value = results_sequence[call_count["n"]]
            call_count["n"] += 1
            return mock_filtered

        mock_query.filter.side_effect = filter_side_effect

        cache = CosineCache()
        cache.warm_from_db(10)

        assert cache.get(10, 20) == 0.8
        assert cache.get(10, 30) == 0.7
        assert cache.get(20, 40) == 0.6
        assert cache.get(30, 50) == 0.5
        assert cache.size() == 4

    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_warm_creates_own_session(self, mock_db_module):
        mock_session = MagicMock()
        mock_db_module.create_session.return_value = mock_session
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value.all.return_value = []

        cache = CosineCache()
        cache.warm_from_db(42)

        mock_db_module.create_session.assert_called_once()
        mock_session.close.assert_called_once()

    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_warm_closes_session_on_error(self, mock_db_module):
        mock_session = MagicMock()
        mock_db_module.create_session.return_value = mock_session
        mock_session.query.side_effect = RuntimeError("boom")

        cache = CosineCache()
        cache.warm_from_db(1)

        mock_session.close.assert_called_once()

    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_depth1_finds_neighbor_in_id2_column(self, mock_db_module):
        """Regression: track appearing in id2 must still be discovered.

        Row (50, 200) has track 200 in id2.  Querying for track 200 must
        find this row and identify 50 as a depth-1 neighbor.
        """
        mock_session = MagicMock()
        mock_db_module.create_session.return_value = mock_session
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query

        depth1_rows = [_make_sim_row(50, 200, 0.9)]
        depth2_rows_for_50 = [_make_sim_row(30, 50, 0.85)]

        call_count = {"n": 0}
        results_sequence = [depth1_rows, depth2_rows_for_50]

        def filter_side_effect(*args, **kwargs):
            mock_filtered = MagicMock()
            mock_filtered.all.return_value = results_sequence[call_count["n"]]
            call_count["n"] += 1
            return mock_filtered

        mock_query.filter.side_effect = filter_side_effect

        cache = CosineCache()
        cache.warm_from_db(200)

        assert cache.get(50, 200) == 0.9, "depth-1 pair where track is in id2"
        assert cache.get(30, 50) == 0.85, "depth-2 pair via neighbor 50"
        assert cache.size() == 2

    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_depth2_expands_through_id2_neighbor(self, mock_db_module):
        """Regression: depth-2 expansion must work when both the seed and
        intermediate neighbors appear in the id2 column.

        Graph:  track 300 -- (100, 300) -- neighbor 100 -- (80, 100) -- 80
        Both canonical rows have the traversed node in id2.
        """
        mock_session = MagicMock()
        mock_db_module.create_session.return_value = mock_session
        mock_query = MagicMock()
        mock_session.query.return_value = mock_query

        depth1_rows = [_make_sim_row(100, 300, 0.75)]
        depth2_rows_for_100 = [
            _make_sim_row(80, 100, 0.65),
            _make_sim_row(100, 300, 0.75),
        ]

        call_count = {"n": 0}
        results_sequence = [depth1_rows, depth2_rows_for_100]

        def filter_side_effect(*args, **kwargs):
            mock_filtered = MagicMock()
            mock_filtered.all.return_value = results_sequence[call_count["n"]]
            call_count["n"] += 1
            return mock_filtered

        mock_query.filter.side_effect = filter_side_effect

        cache = CosineCache()
        cache.warm_from_db(300)

        assert cache.get(100, 300) == 0.75, "depth-1 pair"
        assert cache.get(80, 100) == 0.65, "depth-2 pair via id2 neighbor"
        assert cache.size() == 2


# ---------------------------------------------------------------------------
# Delayed BFS warm-up scheduler
# ---------------------------------------------------------------------------


@pytest.mark.slow
class TestScheduleWarmup:
    def test_delayed_start(self):
        """Warm-up must not start immediately; it waits for the configured delay."""
        cache = CosineCache(warmup_delay=0.3)
        call_log = []

        def tracking_worker(track_id, cancel):
            call_log.append(track_id)

        with patch.object(cache, "_warmup_worker", side_effect=tracking_worker):
            cache.schedule_warmup(42)
            time.sleep(0.05)
            assert call_log == [], "worker should not fire before delay"
            time.sleep(0.4)
            assert call_log == [42], "worker should fire after delay"

    def test_supersession_cancels_pending(self):
        """A new schedule_warmup before the delay expires cancels the old one."""
        cache = CosineCache(warmup_delay=0.3)
        call_log = []

        def tracking_worker(track_id, cancel):
            call_log.append(track_id)

        with patch.object(cache, "_warmup_worker", side_effect=tracking_worker):
            cache.schedule_warmup(1)
            time.sleep(0.05)
            cache.schedule_warmup(2)
            time.sleep(0.5)
            assert call_log == [2], "only the second (superseding) warmup should fire"

    def test_same_track_skips_reschedule(self):
        """Calling schedule_warmup with the same track_id is a no-op."""
        cache = CosineCache(warmup_delay=0.3)
        call_log = []

        def tracking_worker(track_id, cancel):
            call_log.append(track_id)

        with patch.object(cache, "_warmup_worker", side_effect=tracking_worker):
            cache.schedule_warmup(42)
            cache.schedule_warmup(42)
            cache.schedule_warmup(42)
            time.sleep(0.5)
            assert call_log == [42], (
                "worker should fire exactly once for repeated same-track calls"
            )

    def test_different_track_supersedes(self):
        """Switching to a different track cancels the old warmup and schedules a new one."""
        cache = CosineCache(warmup_delay=0.2)
        call_log = []

        def tracking_worker(track_id, cancel):
            call_log.append(track_id)

        with patch.object(cache, "_warmup_worker", side_effect=tracking_worker):
            cache.schedule_warmup(1)
            time.sleep(0.05)
            cache.schedule_warmup(2)
            time.sleep(0.4)
            assert call_log == [2], "only the new track should fire"

    def test_clear_resets_track_allowing_reschedule(self):
        """After clear(), the same track_id can be re-scheduled."""
        cache = CosineCache(warmup_delay=0.15)
        call_log = []

        def tracking_worker(track_id, cancel):
            call_log.append(track_id)

        with patch.object(cache, "_warmup_worker", side_effect=tracking_worker):
            cache.schedule_warmup(42)
            time.sleep(0.25)
            assert call_log == [42]
            cache.clear()
            cache.schedule_warmup(42)
            time.sleep(0.25)
            assert call_log == [42, 42], "warmup should fire again after clear"

    @patch.object(CosineCache, "_compute_cross_similarities")
    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_active_cancellation_no_eviction(self, mock_db, _mock_cross):
        """Cancelling a running warm-up preserves already-added cache entries."""
        mock_session = MagicMock()
        mock_db.create_session.return_value = mock_session

        root_rows = [_make_sim_row(10, 20, 0.8), _make_sim_row(10, 30, 0.7)]

        call_count = {"n": 0}

        def filter_side_effect(*args, **kwargs):
            mock_filtered = MagicMock()
            if call_count["n"] == 0:
                mock_filtered.all.return_value = root_rows
                call_count["n"] += 1
            else:
                cancel_event.set()
                mock_filtered.all.return_value = [_make_sim_row(20, 40, 0.6)]
                call_count["n"] += 1
            return mock_filtered

        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.side_effect = filter_side_effect

        cancel_event = threading.Event()
        cache = CosineCache()
        cache._warmup_worker(10, cancel_event)

        assert cache.get(10, 20) == 0.8, "entries added before cancel must persist"
        assert cache.get(10, 30) == 0.7, "entries added before cancel must persist"
        assert cache.size() == 2

    @patch.object(CosineCache, "_compute_cross_similarities")
    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_bfs_depth2_with_explored_set(self, mock_db, _mock_cross):
        """BFS traverses to depth 2 using batched per-level queries.

        Level 0 (root): returns rows incident to track 10.
        Level 1 (batch {20,30}): returns all rows incident to 20 or 30.
        Level 2 (batch {40,50}): returns all rows incident to 40 or 50.
        """
        mock_session = MagicMock()
        mock_db.create_session.return_value = mock_session

        depth0_rows = [_make_sim_row(10, 20, 0.8), _make_sim_row(10, 30, 0.7)]
        depth1_rows = [
            _make_sim_row(20, 40, 0.6),
            _make_sim_row(30, 50, 0.5),
            _make_sim_row(10, 30, 0.7),
        ]
        depth2_rows = [
            _make_sim_row(20, 40, 0.6),
            _make_sim_row(40, 60, 0.45),
            _make_sim_row(30, 50, 0.5),
            _make_sim_row(50, 70, 0.35),
        ]

        call_count = {"n": 0}
        results = [depth0_rows, depth1_rows, depth2_rows]

        def filter_side_effect(*args, **kwargs):
            mock_filtered = MagicMock()
            mock_filtered.all.return_value = results[call_count["n"]]
            call_count["n"] += 1
            return mock_filtered

        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.side_effect = filter_side_effect

        cancel = threading.Event()
        cache = CosineCache()
        cache._warmup_worker(10, cancel)

        assert call_count["n"] == 3, "one batch query per depth level"
        assert cache.get(10, 20) == 0.8
        assert cache.get(10, 30) == 0.7
        assert cache.get(20, 40) == 0.6
        assert cache.get(30, 50) == 0.5
        assert cache.get(40, 60) == 0.45, "depth-2 expansion"
        assert cache.get(50, 70) == 0.35, "depth-2 expansion"
        assert cache.size() == 6

    @patch.object(CosineCache, "_compute_cross_similarities")
    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_depth2_warmup_populates_second_hop_entries(self, mock_db, _mock_cross):
        """Regression: depth-2 nodes must be visited so their incident pairs
        are cached beyond immediate neighbors of the root.

        Graph: root(1) -- 2(depth1) -- 3(depth2) -- 4(not visited)
        Pair (3,4) should be cached because node 3 is at depth 2.
        """
        mock_session = MagicMock()
        mock_db.create_session.return_value = mock_session

        depth0_rows = [_make_sim_row(1, 2, 0.9)]
        depth1_rows = [_make_sim_row(2, 3, 0.8), _make_sim_row(1, 2, 0.9)]
        depth2_rows = [_make_sim_row(3, 4, 0.7), _make_sim_row(2, 3, 0.8)]

        call_count = {"n": 0}
        results = [depth0_rows, depth1_rows, depth2_rows]

        def filter_side_effect(*args, **kwargs):
            mock_filtered = MagicMock()
            mock_filtered.all.return_value = results[call_count["n"]]
            call_count["n"] += 1
            return mock_filtered

        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.side_effect = filter_side_effect

        cancel = threading.Event()
        cache = CosineCache()
        cache._warmup_worker(1, cancel)

        assert call_count["n"] == 3, "one batch query per depth level"
        assert cache.get(1, 2) == 0.9, "root pair"
        assert cache.get(2, 3) == 0.8, "depth-1 pair"
        assert cache.get(3, 4) == 0.7, "depth-2 pair beyond immediate neighbors"
        assert cache.size() == 3


# ---------------------------------------------------------------------------
# Cross-similarity computation
# ---------------------------------------------------------------------------


class TestComputeCrossSimilarities:
    @patch("src.harmonic_mixing.cosine_cache._compute_sim")
    @patch("src.harmonic_mixing.cosine_cache.unpack_vector")
    def test_computes_and_caches_missing_pairs(self, mock_unpack, mock_compute):
        import numpy as np

        mock_session = MagicMock()
        desc_a = MagicMock(track_id=20, global_vector=b"va")
        desc_b = MagicMock(track_id=30, global_vector=b"vb")
        desc_c = MagicMock(track_id=40, global_vector=b"vc")
        mock_session.query.return_value.filter.return_value.all.return_value = [
            desc_a,
            desc_b,
            desc_c,
        ]

        mock_unpack.return_value = np.ones(75, dtype=np.float32)
        mock_compute.return_value = 0.85

        cancel = threading.Event()
        cache = CosineCache()
        cache._compute_cross_similarities(mock_session, {20, 30, 40}, cancel)

        assert mock_compute.call_count == 3
        assert cache.get(20, 30) == 0.85
        assert cache.get(20, 40) == 0.85
        assert cache.get(30, 40) == 0.85
        mock_session.add_all.assert_called_once()
        mock_session.commit.assert_called_once()

    @patch("src.harmonic_mixing.cosine_cache._compute_sim")
    @patch("src.harmonic_mixing.cosine_cache.unpack_vector")
    def test_skips_already_cached_pairs(self, mock_unpack, mock_compute):
        import numpy as np

        mock_session = MagicMock()
        desc_a = MagicMock(track_id=20, global_vector=b"va")
        desc_b = MagicMock(track_id=30, global_vector=b"vb")
        mock_session.query.return_value.filter.return_value.all.return_value = [
            desc_a,
            desc_b,
        ]
        mock_unpack.return_value = np.ones(75, dtype=np.float32)
        mock_compute.return_value = 0.85

        cancel = threading.Event()
        cache = CosineCache()
        cache.put(20, 30, 0.9)

        cache._compute_cross_similarities(mock_session, {20, 30}, cancel)

        mock_compute.assert_not_called()

    def test_cancel_stops_before_query(self):
        mock_session = MagicMock()
        cancel = threading.Event()
        cancel.set()

        cache = CosineCache()
        cache._compute_cross_similarities(mock_session, {20, 30}, cancel)

        mock_session.query.assert_not_called()

    @patch("src.harmonic_mixing.cosine_cache._compute_sim")
    @patch("src.harmonic_mixing.cosine_cache.unpack_vector")
    def test_handles_persist_failure_gracefully(self, mock_unpack, mock_compute):
        import numpy as np

        mock_session = MagicMock()
        desc_a = MagicMock(track_id=20, global_vector=b"va")
        desc_b = MagicMock(track_id=30, global_vector=b"vb")
        mock_session.query.return_value.filter.return_value.all.return_value = [
            desc_a,
            desc_b,
        ]
        mock_session.commit.side_effect = RuntimeError("duplicate key")
        mock_unpack.return_value = np.ones(75, dtype=np.float32)
        mock_compute.return_value = 0.77

        cancel = threading.Event()
        cache = CosineCache()
        cache._compute_cross_similarities(mock_session, {20, 30}, cancel)

        assert cache.get(20, 30) == 0.77, (
            "value should remain in cache despite persist failure"
        )
        mock_session.rollback.assert_called_once()

    def test_empty_neighbor_ids_is_noop(self):
        mock_session = MagicMock()
        cancel = threading.Event()
        cache = CosineCache()
        cache._compute_cross_similarities(mock_session, set(), cancel)
        mock_session.query.assert_not_called()


class TestWarmupCallsCrossComputation:
    @patch.object(CosineCache, "_compute_cross_similarities")
    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_warmup_invokes_cross_computation_after_depth0(self, mock_db, mock_cross):
        mock_session = MagicMock()
        mock_db.create_session.return_value = mock_session

        depth0_rows = [_make_sim_row(10, 20, 0.8), _make_sim_row(10, 30, 0.7)]

        call_count = {"n": 0}
        results = [depth0_rows, [], []]

        def filter_side_effect(*args, **kwargs):
            mock_filtered = MagicMock()
            idx = min(call_count["n"], len(results) - 1)
            mock_filtered.all.return_value = results[idx]
            call_count["n"] += 1
            return mock_filtered

        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.side_effect = filter_side_effect

        cancel = threading.Event()
        cache = CosineCache()
        cache._warmup_worker(10, cancel)

        mock_cross.assert_called_once()
        call_args = mock_cross.call_args[0]
        assert call_args[0] is mock_session
        assert call_args[1] == {20, 30}
        assert call_args[2] is cancel

    @patch.object(CosineCache, "_compute_cross_similarities")
    @patch("src.harmonic_mixing.cosine_cache.database")
    def test_warmup_skips_cross_computation_when_no_neighbors(
        self, mock_db, mock_cross
    ):
        mock_session = MagicMock()
        mock_db.create_session.return_value = mock_session

        mock_query = MagicMock()
        mock_session.query.return_value = mock_query
        mock_query.filter.return_value.all.return_value = []

        cancel = threading.Event()
        cache = CosineCache()
        cache._warmup_worker(10, cancel)

        mock_cross.assert_not_called()


# ---------------------------------------------------------------------------
# Integration: similarity score consults cache before DB/compute
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Admin metrics instrumentation
# ---------------------------------------------------------------------------


class TestCacheAdminStats:
    def test_stats_shape_on_empty_cache(self):
        cache = CosineCache(max_entries=100)
        stats = cache.get_stats()
        assert stats["used"] == 0
        assert stats["capacity"] == 100
        assert stats["usage_ratio"] == 0.0
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0.0
        assert stats["hit_rate_basis"] == "process_lifetime"
        assert stats["recent_entries"] == []
        assert stats["recent_exits"] == []

    def test_hit_miss_counting(self):
        cache = CosineCache()
        cache.put(1, 2, 0.5)
        cache.get(1, 2)  # hit
        cache.get(1, 2)  # hit
        cache.get(3, 4)  # miss
        stats = cache.get_stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["hit_rate"] == pytest.approx(2 / 3, abs=1e-6)
        assert stats["hit_rate_numerator"] == 2
        assert stats["hit_rate_denominator"] == 3

    def test_recent_entries_recorded(self):
        cache = CosineCache()
        cache.put(1, 2, 0.5)
        cache.put(3, 4, 0.6)
        stats = cache.get_stats()
        assert len(stats["recent_entries"]) == 2
        assert stats["recent_entries"][0]["pair"] == (3, 4)
        assert stats["recent_entries"][1]["pair"] == (1, 2)

    def test_recent_entries_capped_at_10(self):
        cache = CosineCache()
        for i in range(15):
            cache.put(i, i + 1000, float(i))
        stats = cache.get_stats()
        assert len(stats["recent_entries"]) == 10

    def test_recent_exits_on_eviction(self):
        cache = CosineCache(max_entries=3)
        cache.put(1, 2, 0.1)
        cache.put(3, 4, 0.2)
        cache.put(5, 6, 0.3)
        cache.put(7, 8, 0.4)
        stats = cache.get_stats()
        assert len(stats["recent_exits"]) == 1
        assert stats["recent_exits"][0]["pair"] == (1, 2)
        assert stats["recent_exits"][0]["reason"] == "lru_eviction"

    def test_usage_ratio(self):
        cache = CosineCache(max_entries=10)
        cache.put(1, 2, 0.5)
        cache.put(3, 4, 0.6)
        stats = cache.get_stats()
        assert stats["usage_ratio"] == pytest.approx(0.2)

    def test_get_cached_track_ids(self):
        cache = CosineCache()
        cache.put(10, 20, 0.5)
        cache.put(10, 30, 0.6)
        cache.put(40, 50, 0.7)
        ids = cache.get_cached_track_ids()
        assert ids == {10, 20, 30, 40, 50}

    def test_overwrite_does_not_add_duplicate_entry_event(self):
        cache = CosineCache()
        cache.put(1, 2, 0.5)
        cache.put(1, 2, 0.9)
        stats = cache.get_stats()
        assert len(stats["recent_entries"]) == 1


@pytest.mark.slow
class TestSimilarityScoreCacheIntegration:
    def test_cache_hit_skips_db(self):
        """When cache has a value, get_similarity_score must return it
        without touching descriptor caches or db_session."""
        from src.harmonic_mixing.transition_match import TransitionMatch
        from src.data_management.config import TrackDBCols
        from src.harmonic_mixing.config import CamelotPriority, MatchFactors

        cache = CosineCache()
        cache.put(100, 200, 0.88)

        original_db_session = TransitionMatch.db_session
        original_cosine_cache = TransitionMatch.cosine_cache
        try:
            TransitionMatch.cosine_cache = cache
            TransitionMatch.db_session = None

            cur_md = {TrackDBCols.ID: 100, TrackDBCols.TITLE: "Track A"}
            cand_md = {TrackDBCols.ID: 200, TrackDBCols.TITLE: "Track B"}
            match = TransitionMatch(cand_md, cur_md, CamelotPriority.SAME_KEY)

            result = match.get_similarity_score()
            assert result == 0.88
            assert match.factors[MatchFactors.SIMILARITY] == 0.88
        finally:
            TransitionMatch.db_session = original_db_session
            TransitionMatch.cosine_cache = original_cosine_cache

    def test_cache_miss_falls_through_to_compute_and_stores(self):
        """On cache miss with no DB row, the score must be computed and stored in cache."""
        from src.harmonic_mixing.transition_match import TransitionMatch
        from src.data_management.config import TrackDBCols
        from src.harmonic_mixing.config import CamelotPriority

        cache = CosineCache()
        mock_session = MagicMock()

        mock_desc = MagicMock()
        import numpy as np

        mock_desc.global_vector = np.ones(75, dtype=np.float32).tobytes()

        def filter_by_side_effect(**kwargs):
            mock_filtered = MagicMock()
            if "track_id" in kwargs:
                mock_filtered.first.return_value = mock_desc
            else:
                mock_filtered.first.return_value = None
            return mock_filtered

        mock_session.query.return_value.filter_by.side_effect = filter_by_side_effect

        original_db_session = TransitionMatch.db_session
        original_cosine_cache = TransitionMatch.cosine_cache
        original_od_cache = TransitionMatch._on_deck_descriptor_cache.copy()
        original_cd_cache = TransitionMatch._candidate_descriptor_cache.copy()
        try:
            TransitionMatch.db_session = mock_session
            TransitionMatch.cosine_cache = cache
            TransitionMatch._on_deck_descriptor_cache.clear()
            TransitionMatch._candidate_descriptor_cache.clear()

            cur_md = {TrackDBCols.ID: 300, TrackDBCols.TITLE: "Track C"}
            cand_md = {TrackDBCols.ID: 400, TrackDBCols.TITLE: "Track D"}
            match = TransitionMatch(cand_md, cur_md, CamelotPriority.SAME_KEY)

            with patch.object(TransitionMatch, "_compute_similarity", return_value=0.7):
                with patch.object(TransitionMatch, "_persist_similarity"):
                    result = match.get_similarity_score()
            assert result == pytest.approx(0.7, abs=1e-6)
            assert cache.get(300, 400) == pytest.approx(0.7, abs=1e-6)
        finally:
            TransitionMatch.db_session = original_db_session
            TransitionMatch.cosine_cache = original_cosine_cache
            TransitionMatch._on_deck_descriptor_cache = original_od_cache
            TransitionMatch._candidate_descriptor_cache = original_cd_cache

    def test_no_cache_still_works(self):
        """When cosine_cache is None, the old DB/compute path works."""
        from src.harmonic_mixing.transition_match import TransitionMatch
        from src.data_management.config import TrackDBCols
        from src.harmonic_mixing.config import CamelotPriority

        mock_session = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None

        original_db_session = TransitionMatch.db_session
        original_cosine_cache = TransitionMatch.cosine_cache
        original_od_cache = TransitionMatch._on_deck_descriptor_cache.copy()
        original_cd_cache = TransitionMatch._candidate_descriptor_cache.copy()
        try:
            TransitionMatch.db_session = mock_session
            TransitionMatch.cosine_cache = None
            TransitionMatch._on_deck_descriptor_cache.clear()
            TransitionMatch._candidate_descriptor_cache.clear()

            cur_md = {TrackDBCols.ID: 500, TrackDBCols.TITLE: "Track E"}
            cand_md = {TrackDBCols.ID: 600, TrackDBCols.TITLE: "Track F"}
            match = TransitionMatch(cand_md, cur_md, CamelotPriority.SAME_KEY)

            result = match.get_similarity_score()
            assert result == 0.0
        finally:
            TransitionMatch.db_session = original_db_session
            TransitionMatch.cosine_cache = original_cosine_cache
            TransitionMatch._on_deck_descriptor_cache = original_od_cache
            TransitionMatch._candidate_descriptor_cache = original_cd_cache
