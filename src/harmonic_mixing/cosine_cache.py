import logging
import threading
import time
from collections import OrderedDict, deque
from typing import Dict, List, Optional, Set, Tuple

from src.db import database
from src.feature_extraction.compact_descriptor import (
    compute_similarity as _compute_sim,
    unpack_vector,
)
from src.feature_extraction.config import DESCRIPTOR_VERSION
from src.models.track_cosine_similarity import TrackCosineSimilarity
from src.models.track_descriptor import TrackDescriptor

logger = logging.getLogger(__name__)

_MAX_ENTRIES = 500_000
_RECENT_EVENT_LIMIT = 10
_WARMUP_DELAY = 10.0
_MAX_BFS_DEPTH = 2
_MAX_NEIGHBORS_PER_LEVEL = 500
_MAX_COMPUTE_NEIGHBORS = 200
_MAX_COMPUTE_PAIRS = 5000


class CosineCache:
    """Thread-safe LRU cache for pairwise cosine similarity scores.

    Keys are canonical ordered pairs ``(min(id1, id2), max(id1, id2))``
    so that lookup order does not matter.

    Tracks hit/miss counts and recent entry/exit events for admin
    dashboard instrumentation.
    """

    def __init__(self, max_entries: int = _MAX_ENTRIES, warmup_delay: float = _WARMUP_DELAY):
        self._max_entries = max_entries
        self._warmup_delay = warmup_delay
        self._lock = threading.Lock()
        self._store: OrderedDict[Tuple[int, int], float] = OrderedDict()

        self._hits = 0
        self._misses = 0
        self._recent_entries: deque = deque(maxlen=_RECENT_EVENT_LIMIT)
        self._recent_exits: deque = deque(maxlen=_RECENT_EVENT_LIMIT)

        self._warmup_lock = threading.Lock()
        self._warmup_timer: Optional[threading.Timer] = None
        self._warmup_cancel: Optional[threading.Event] = None
        self._warmup_track_id: Optional[int] = None

        self._on_warmup_complete = None

    @staticmethod
    def _key(id1: int, id2: int) -> Tuple[int, int]:
        return (min(id1, id2), max(id1, id2))

    def get(self, id1: int, id2: int) -> Optional[float]:
        key = self._key(id1, id2)
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._hits += 1
                return self._store[key]
            self._misses += 1
        return None

    def _contains(self, id1: int, id2: int) -> bool:
        """Check if a pair exists without affecting hit/miss stats."""
        key = self._key(id1, id2)
        with self._lock:
            return key in self._store

    def put(self, id1: int, id2: int, value: float) -> None:
        key = self._key(id1, id2)
        now = time.time()
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._store[key] = value
            else:
                self._store[key] = value
                self._recent_entries.append({"pair": key, "timestamp": now})
                if len(self._store) > self._max_entries:
                    evicted_key, _ = self._store.popitem(last=False)
                    self._recent_exits.append({
                        "pair": evicted_key,
                        "timestamp": now,
                        "reason": "lru_eviction",
                    })

    def size(self) -> int:
        with self._lock:
            return len(self._store)

    def get_cached_track_ids(self) -> Set[int]:
        with self._lock:
            ids: Set[int] = set()
            for id1, id2 in self._store:
                ids.add(id1)
                ids.add(id2)
            return ids

    def get_stats(self) -> Dict:
        """Return admin-facing cache statistics.

        All counters are process-lifetime values.  Recent entry/exit
        lists are capped at ``_RECENT_EVENT_LIMIT`` and ordered
        newest-first.
        """
        with self._lock:
            used = len(self._store)
            capacity = self._max_entries
            hits = self._hits
            misses = self._misses
            recent_entries = list(reversed(self._recent_entries))
            recent_exits = list(reversed(self._recent_exits))

        total = hits + misses
        hit_rate = hits / total if total > 0 else 0.0

        return {
            "used": used,
            "capacity": capacity,
            "usage_ratio": round(used / capacity, 6) if capacity > 0 else 0.0,
            "hits": hits,
            "misses": misses,
            "hit_rate": round(hit_rate, 6),
            "hit_rate_numerator": hits,
            "hit_rate_denominator": total,
            "hit_rate_basis": "process_lifetime",
            "recent_entries": recent_entries,
            "recent_exits": recent_exits,
        }

    def clear(self) -> None:
        """Drop all cached entries and reset counters."""
        with self._warmup_lock:
            if self._warmup_timer is not None:
                self._warmup_timer.cancel()
                self._warmup_timer = None
            if self._warmup_cancel is not None:
                self._warmup_cancel.set()
                self._warmup_cancel = None
            self._warmup_track_id = None
        with self._lock:
            self._store.clear()
            self._hits = 0
            self._misses = 0
            self._recent_entries.clear()
            self._recent_exits.clear()

    def warm_from_db(self, track_id: int) -> None:
        """BFS-warm the cache from ``track_cosine_similarity`` rows.

        Depth 1: all rows incident to *track_id* (in either id1 or id2).
        Depth 2: for every depth-1 neighbor *n*, all rows incident to *n*.

        Rows are stored in canonical order (id1 < id2), so a track can
        appear in either column; both must be checked.

        Creates its own DB session so it never shares a session across threads.
        """
        session = database.create_session()
        try:
            depth1_rows = (
                session.query(TrackCosineSimilarity)
                .filter(
                    (TrackCosineSimilarity.id1 == track_id)
                    | (TrackCosineSimilarity.id2 == track_id),
                    TrackCosineSimilarity.descriptor_version == DESCRIPTOR_VERSION,
                )
                .all()
            )

            depth1_neighbors = []
            for row in depth1_rows:
                self.put(row.id1, row.id2, row.cosine_similarity)
                neighbor_id = row.id2 if row.id1 == track_id else row.id1
                depth1_neighbors.append(neighbor_id)

            for neighbor_id in depth1_neighbors:
                depth2_rows = (
                    session.query(TrackCosineSimilarity)
                    .filter(
                        (TrackCosineSimilarity.id1 == neighbor_id)
                        | (TrackCosineSimilarity.id2 == neighbor_id),
                        TrackCosineSimilarity.descriptor_version == DESCRIPTOR_VERSION,
                    )
                    .all()
                )
                for row in depth2_rows:
                    self.put(row.id1, row.id2, row.cosine_similarity)

        except Exception:
            logger.exception("Error warming cosine cache for track %s", track_id)
        finally:
            session.close()

    # ------------------------------------------------------------------
    # Cross-similarity computation for BFS expansion
    # ------------------------------------------------------------------

    def _compute_cross_similarities(
        self,
        session,
        neighbor_ids: Set[int],
        cancel: threading.Event,
    ) -> None:
        """Compute pairwise similarities between neighbor tracks.

        Loads TrackDescriptor records in a single batch query, computes
        cosine similarity for pairs not already cached, then caches and
        persists the results so future warmups find them via normal BFS
        reads.
        """
        if not neighbor_ids or cancel.is_set():
            return

        ids_list = sorted(neighbor_ids)[:_MAX_COMPUTE_NEIGHBORS]

        try:
            descriptors = (
                session.query(TrackDescriptor)
                .filter(
                    TrackDescriptor.track_id.in_(ids_list),
                    TrackDescriptor.descriptor_version == DESCRIPTOR_VERSION,
                )
                .all()
            )
        except Exception:
            logger.debug("Failed to load descriptors for cross-similarity computation")
            return

        desc_map = {d.track_id: d for d in descriptors}
        del descriptors

        if len(desc_map) < 2 or cancel.is_set():
            return

        vectors: Dict[int, object] = {}
        for tid, desc in desc_map.items():
            try:
                vectors[tid] = unpack_vector(desc.global_vector)
            except Exception:
                pass
        del desc_map

        available = sorted(vectors.keys())
        if len(available) < 2:
            return

        pairs_to_compute: List[Tuple[int, int]] = []
        for i, a in enumerate(available):
            if cancel.is_set():
                return
            for b in available[i + 1 :]:
                if not self._contains(a, b):
                    pairs_to_compute.append((a, b))
                if len(pairs_to_compute) >= _MAX_COMPUTE_PAIRS:
                    break
            if len(pairs_to_compute) >= _MAX_COMPUTE_PAIRS:
                break

        if not pairs_to_compute or cancel.is_set():
            return

        logger.info(
            "Computing %d cross-similarities for %d neighbors",
            len(pairs_to_compute),
            len(available),
        )

        new_rows: List[TrackCosineSimilarity] = []
        for a, b in pairs_to_compute:
            if cancel.is_set():
                return
            sim = _compute_sim(vectors[a], vectors[b])
            self.put(a, b, sim)
            lo, hi = min(a, b), max(a, b)
            new_rows.append(
                TrackCosineSimilarity(
                    id1=lo,
                    id2=hi,
                    cosine_similarity=sim,
                    descriptor_version=DESCRIPTOR_VERSION,
                )
            )

        if new_rows and not cancel.is_set():
            try:
                session.add_all(new_rows)
                session.commit()
            except Exception:
                session.rollback()
                logger.debug(
                    "Batch persist of %d cross-similarities failed, "
                    "values remain in cache only",
                    len(new_rows),
                )

        logger.info(
            "Cross-similarity computation complete: %d new pairs cached",
            len(new_rows),
        )

    # ------------------------------------------------------------------
    # Delayed BFS warm-up scheduler
    # ------------------------------------------------------------------

    def schedule_warmup(self, track_id: int) -> None:
        """Schedule a delayed BFS warm-up for *track_id*.

        If a warmup for the same *track_id* is already pending or running,
        the call is a no-op so that an in-progress depth-2 traversal is
        not interrupted by redundant API calls.

        If a *different* track is requested, the previous warmup is
        cancelled and a fresh delay begins for *track_id*.
        """
        with self._warmup_lock:
            if self._warmup_track_id == track_id:
                return

            if self._warmup_timer is not None:
                self._warmup_timer.cancel()
                self._warmup_timer = None

            if self._warmup_cancel is not None:
                self._warmup_cancel.set()

            self._warmup_track_id = track_id
            cancel_event = threading.Event()
            self._warmup_cancel = cancel_event

            timer = threading.Timer(
                self._warmup_delay,
                self._warmup_worker,
                args=(track_id, cancel_event),
            )
            timer.daemon = True
            self._warmup_timer = timer
            timer.start()

    def _warmup_worker(self, track_id: int, cancel: threading.Event) -> None:
        """BFS warm-up worker.  Populates cache incrementally to depth 2.

        Uses level-by-level batch queries (one ``IN`` query per depth
        level) instead of per-node queries so the BFS completes in
        O(max_depth) round-trips rather than O(N).

        Checks *cancel* between levels and between rows so a superseding
        search can stop the traversal promptly.  Already-added cache
        entries are never evicted on cancellation.
        """
        if cancel.is_set():
            return

        logger.info("BFS cache warmup starting for track %s", track_id)

        session = database.create_session()
        try:
            explored: Set[int] = {track_id}
            current_ids: Set[int] = {track_id}

            for depth in range(_MAX_BFS_DEPTH + 1):
                if cancel.is_set():
                    return
                if not current_ids:
                    break

                batch = list(current_ids)
                rows = (
                    session.query(TrackCosineSimilarity)
                    .filter(
                        (TrackCosineSimilarity.id1.in_(batch))
                        | (TrackCosineSimilarity.id2.in_(batch)),
                        TrackCosineSimilarity.descriptor_version == DESCRIPTOR_VERSION,
                    )
                    .all()
                )

                next_ids: Set[int] = set()
                for row in rows:
                    if cancel.is_set():
                        return
                    self.put(row.id1, row.id2, row.cosine_similarity)
                    if depth < _MAX_BFS_DEPTH:
                        for nid in (row.id1, row.id2):
                            if nid not in explored:
                                explored.add(nid)
                                next_ids.add(nid)

                del rows

                if len(next_ids) > _MAX_NEIGHBORS_PER_LEVEL:
                    next_ids = set(list(next_ids)[:_MAX_NEIGHBORS_PER_LEVEL])

                if depth == 0 and next_ids:
                    self._compute_cross_similarities(session, next_ids, cancel)

                current_ids = next_ids

            logger.info(
                "BFS cache warmup completed for track %s, cache size: %d",
                track_id, self.size(),
            )

            if not cancel.is_set() and self._on_warmup_complete is not None:
                try:
                    self._on_warmup_complete(track_id)
                except Exception:
                    logger.debug(
                        "on_warmup_complete callback failed for track %s",
                        track_id,
                        exc_info=True,
                    )
        except Exception:
            logger.exception("Error during BFS warm-up for track %s", track_id)
        finally:
            session.close()


_TRANSITION_MAX_ENTRIES = 100_000


class TransitionScoreCache:
    """Thread-safe cache for full transition scores keyed by (source, candidate).

    Unlike ``CosineCache``, keys are directional: ``(source_id, candidate_id)``
    because transition scores depend on the source track context.
    """

    def __init__(self, max_entries: int = _TRANSITION_MAX_ENTRIES):
        self._max_entries = max_entries
        self._lock = threading.Lock()
        self._store: OrderedDict[Tuple[int, int], float] = OrderedDict()
        self._hits = 0
        self._misses = 0

    def get(self, source_id: int, candidate_id: int) -> Optional[float]:
        key = (source_id, candidate_id)
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._hits += 1
                return self._store[key]
            self._misses += 1
        return None

    def put(self, source_id: int, candidate_id: int, score: float) -> None:
        key = (source_id, candidate_id)
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._store[key] = score
            else:
                self._store[key] = score
                if len(self._store) > self._max_entries:
                    self._store.popitem(last=False)

    def invalidate_source(self, source_id: int) -> int:
        """Remove all cached scores where *source_id* is the source track.

        Returns the number of entries removed.
        """
        with self._lock:
            keys_to_remove = [k for k in self._store if k[0] == source_id]
            for k in keys_to_remove:
                del self._store[k]
            return len(keys_to_remove)

    def size(self) -> int:
        with self._lock:
            return len(self._store)

    def get_stats(self) -> Dict:
        with self._lock:
            used = len(self._store)
            capacity = self._max_entries
            hits = self._hits
            misses = self._misses

        total = hits + misses
        hit_rate = hits / total if total > 0 else 0.0

        return {
            "used": used,
            "capacity": capacity,
            "hits": hits,
            "misses": misses,
            "hit_rate": round(hit_rate, 6),
        }

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._hits = 0
            self._misses = 0
