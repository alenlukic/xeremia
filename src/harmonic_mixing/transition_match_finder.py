import logging

from sqlalchemy import or_

from src.db import database
from src.models.track import Track
from src.models.track_cosine_similarity import TrackCosineSimilarity
from src.models.track_descriptor import TrackDescriptor
from src.models.track_trait import TrackTrait
from src.assistant.config import DASHED_LINE
from src.data_management.config import TrackDBCols
from src.data_management.mapping_registry import MappingRegistry
from src.feature_extraction.compact_descriptor import compute_similarity, unpack_vector
from src.feature_extraction.config import DESCRIPTOR_VERSION, TRAIT_VERSION
from src.harmonic_mixing.config import (
    CamelotPriority,
    DOWN_KEY_LOWER_BOUND,
    DOWN_KEY_UPPER_BOUND,
    SAME_LOWER_BOUND,
    SAME_UPPER_BOUND,
    UP_KEY_LOWER_BOUND,
    UP_KEY_UPPER_BOUND,
)
from src.data_management.service import load_tracks
from src.harmonic_mixing.transition_match import TransitionMatch
from src.errors import handle
from src.utils.common import get_config_value
from src.harmonic_mixing.utils import (
    flip_camelot_letter,
    format_camelot_number,
    generate_camelot_map,
    get_bpm_bound,
)

logger = logging.getLogger(__name__)


class TransitionMatchFinder:
    """Encapsulates functionality for finding transition matches."""

    def __init__(self, session=None, cosine_cache=None, transition_score_cache=None):
        self.session = session if session is not None else database.create_session()
        self.cosine_cache = cosine_cache
        self.transition_score_cache = transition_score_cache
        MappingRegistry.load(self.session)
        self.tracks = load_tracks(self.session)
        self.camelot_map, self.collection_metadata = generate_camelot_map(self.tracks)
        self.max_results = get_config_value(["HARMONIC_MIXING", "MAX_RESULTS"])
        self.cutoff_threshold_score = get_config_value(
            ["HARMONIC_MIXING", "SCORE_THRESHOLD"]
        )
        self.result_threshold = get_config_value(
            ["HARMONIC_MIXING", "RESULT_THRESHOLD"]
        )

        TransitionMatch.db_session = self.session
        TransitionMatch.collection_metadata = self.collection_metadata
        TransitionMatch.cosine_cache = self.cosine_cache
        self._sync_effective_weights()

    def reload_track_data(self):
        MappingRegistry.load(self.session)
        self.tracks = load_tracks(self.session)
        self.camelot_map, self.collection_metadata = generate_camelot_map(self.tracks)
        TransitionMatch.collection_metadata = self.collection_metadata
        TransitionMatch.clear_descriptor_caches()
        self._sync_effective_weights()

    @staticmethod
    def _sync_effective_weights():
        try:
            from src.harmonic_mixing.weight_service import WeightService
            TransitionMatch.effective_weights = (
                WeightService.instance().get_effective_weights_for_scoring()
            )
        except Exception:
            logger.warning("Failed to sync effective weights from WeightService", exc_info=True)

    def get_transition_matches(self, track, sort_results=True):
        TransitionMatch.clear_descriptor_caches()
        try:
            db_row = (
                track
                if isinstance(track, Track)
                else self.session.query(Track).filter_by(title=track).first()
            )
            title_mismatch_message = ""

            if db_row is None:
                db_row = (
                    self.session.query(Track)
                    .filter(Track.file_name.like("%{}%".format(track)))
                    .first()
                )

                if db_row is not None:
                    file_name = db_row.file_name
                    title_mismatch_message = (
                        "\n\nWarning: found %s in file name %s (but not title)"
                        % (track, file_name)
                    )
                else:
                    raise Exception("%s not found in database." % track)

            title = db_row.title
            bpm = float(db_row.bpm)
            camelot_code = db_row.camelot_code
            if bpm is None:
                raise Exception("Did not find a BPM for %s." % title)
            if camelot_code is None:
                raise Exception("Did not find a Camelot code for %s." % title)

            camelot_map_entry = self.camelot_map[camelot_code][bpm]
            cur_track_md = [
                md for md in camelot_map_entry if md.get(TrackDBCols.TITLE) == title
            ]
            if len(cur_track_md) == 0:
                raise Exception("%s metadata not found in Camelot map." % title)

            cur_track_md = cur_track_md[0]

            harmonic_codes = TransitionMatchFinder._get_all_harmonic_codes(cur_track_md)
            same_key, higher_key, lower_key = self._get_matches_for_code(
                harmonic_codes, cur_track_md, sort_results
            )

            source_id = cur_track_md.get(TrackDBCols.ID)
            if source_id is not None and self.transition_score_cache is not None:
                for match in same_key + higher_key + lower_key:
                    cid = match.metadata.get(TrackDBCols.ID)
                    if cid is not None:
                        self.transition_score_cache.put(
                            source_id, cid, round(match.get_score(), 2),
                        )

            return (same_key, higher_key, lower_key), title_mismatch_message

        except Exception as e:
            handle(e)

    def print_transition_matches(self, track):
        (same_key, higher_key, lower_key), title_mismatch_message = (
            self.get_transition_matches(track)
        )

        self._print_transition_ranks("Higher key (step down)", higher_key)
        self._print_transition_ranks("Lower key (step up)", lower_key)
        self._print_transition_ranks("Same key", same_key, 1)
        print(title_mismatch_message)

    @staticmethod
    def _get_all_harmonic_codes(cur_track_md):
        camelot_code = cur_track_md[TrackDBCols.CAMELOT_CODE]
        code_number = int(camelot_code[0:2])
        code_letter = camelot_code[-1].upper()

        return [
            # Same key
            (code_number, code_letter, CamelotPriority.SAME_KEY.value),
            # One key jump
            ((code_number + 1) % 12, code_letter, CamelotPriority.ONE_KEY_JUMP.value),
            # Two key jump
            (
                (code_number + 2) % 12,
                code_letter,
                CamelotPriority.TWO_OCTAVE_JUMP.value,
            ),
            # One octave jump
            (
                (code_number + 7) % 12,
                code_letter,
                CamelotPriority.ONE_OCTAVE_JUMP.value,
            ),
            # Major/minor jump
            (
                (code_number + (3 if code_letter == "A" else -3)) % 12,
                flip_camelot_letter(code_letter),
                CamelotPriority.MAJOR_MINOR_JUMP.value,
            ),
            # Adjacent key jumps
            (
                (code_number + (1 if code_letter == "B" else -1)) % 12,
                flip_camelot_letter(code_letter),
                CamelotPriority.ADJACENT_JUMP.value,
            ),
            (
                code_number,
                flip_camelot_letter(code_letter),
                CamelotPriority.ADJACENT_JUMP.value,
            ),
        ]

    def _get_matches(self, bpm, camelot_code, upper_bound, lower_bound):
        upper_bpm = get_bpm_bound(bpm, lower_bound)
        lower_bpm = get_bpm_bound(bpm, upper_bound)

        results = []
        code_map = self.camelot_map[camelot_code]
        matching_bpms = sorted(
            [b for b in code_map.keys() if lower_bpm <= b <= upper_bpm]
        )
        for b in matching_bpms:
            results.extend(code_map[b])

        return results

    def _prefetch_for_matches(self, source_id, all_matches):
        """Batch-load all scoring data before sorting.

        Populates TransitionMatch class-level caches so every per-match
        lookup during get_score() becomes an O(1) cache hit.  Converts
        the N+1 query pattern (5N queries for N matches) into a fixed
        number of bulk queries regardless of match count.

        Queries issued:
          1. TrackTrait WHERE track_id IN (source + all candidates)
          2. TrackCosineSimilarity WHERE (source, candidate) pairs
          3. TrackDescriptor WHERE track_id IN (source + candidates
             missing from cosine cache) — only when needed
        """
        if not all_matches or source_id is None:
            return

        candidate_ids = set()
        for match in all_matches:
            cid = match.metadata.get(TrackDBCols.ID)
            if cid is not None:
                candidate_ids.add(cid)

        if not candidate_ids:
            return

        all_track_ids = list(candidate_ids | {source_id})

        # --- Batch 1: TrackTrait for source + all candidates ---
        try:
            traits = (
                self.session.query(TrackTrait)
                .filter(
                    TrackTrait.track_id.in_(all_track_ids),
                    TrackTrait.trait_version == TRAIT_VERSION,
                )
                .all()
            )
            trait_by_id = {t.track_id: t for t in traits}

            TransitionMatch._on_deck_trait_cache[source_id] = trait_by_id.get(source_id)
            for cid in candidate_ids:
                TransitionMatch._candidate_trait_cache[cid] = trait_by_id.get(cid)
        except Exception:
            logger.debug("Batch trait prefetch failed", exc_info=True)
            try:
                self.session.rollback()
            except Exception:
                pass

        # --- Batch 2: TrackCosineSimilarity for all (source, candidate) pairs ---
        cosine_cache = TransitionMatch.cosine_cache
        found_pairs = set()

        try:
            cand_list = list(candidate_ids)
            rows = (
                self.session.query(TrackCosineSimilarity)
                .filter(
                    or_(
                        (TrackCosineSimilarity.id1 == source_id)
                        & TrackCosineSimilarity.id2.in_(cand_list),
                        (TrackCosineSimilarity.id2 == source_id)
                        & TrackCosineSimilarity.id1.in_(cand_list),
                    ),
                    TrackCosineSimilarity.descriptor_version == DESCRIPTOR_VERSION,
                )
                .all()
            )
            for row in rows:
                if cosine_cache is not None:
                    cosine_cache.put(row.id1, row.id2, row.cosine_similarity)
                peer = row.id2 if row.id1 == source_id else row.id1
                found_pairs.add(peer)
        except Exception:
            logger.debug("Batch similarity prefetch failed", exc_info=True)
            try:
                self.session.rollback()
            except Exception:
                pass

        # --- Batch 3: Compute missing similarities from descriptors ---
        missing_cids = candidate_ids - found_pairs
        if cosine_cache is not None:
            missing_cids = {
                cid for cid in missing_cids if cosine_cache.get(cid, source_id) is None
            }

        if not missing_cids:
            return

        try:
            desc_ids = list(missing_cids | {source_id})
            descriptors = (
                self.session.query(TrackDescriptor)
                .filter(
                    TrackDescriptor.track_id.in_(desc_ids),
                    TrackDescriptor.descriptor_version == DESCRIPTOR_VERSION,
                )
                .all()
            )
            desc_by_id = {d.track_id: d for d in descriptors}

            TransitionMatch._on_deck_descriptor_cache[source_id] = desc_by_id.get(source_id)
            for cid in missing_cids:
                TransitionMatch._candidate_descriptor_cache[cid] = desc_by_id.get(cid)

            source_desc = desc_by_id.get(source_id)
            if source_desc is None:
                return

            source_vec = unpack_vector(source_desc.global_vector)
            new_rows = []

            for cid in missing_cids:
                cand_desc = desc_by_id.get(cid)
                if cand_desc is None:
                    if cosine_cache is not None:
                        cosine_cache.put(source_id, cid, 0.0)
                    continue

                sim = compute_similarity(source_vec, unpack_vector(cand_desc.global_vector))
                if cosine_cache is not None:
                    cosine_cache.put(source_id, cid, sim)

                lo, hi = min(source_id, cid), max(source_id, cid)
                new_rows.append(
                    TrackCosineSimilarity(
                        id1=lo,
                        id2=hi,
                        cosine_similarity=sim,
                        descriptor_version=DESCRIPTOR_VERSION,
                    )
                )

            if new_rows:
                persist_session = database.create_session()
                try:
                    persist_session.add_all(new_rows)
                    persist_session.commit()
                except Exception:
                    persist_session.rollback()
                    logger.debug(
                        "Batch persist of %d similarities failed, values remain in cache",
                        len(new_rows),
                    )
                finally:
                    persist_session.close()
        except Exception:
            logger.debug("Batch descriptor/compute prefetch failed", exc_info=True)
            try:
                self.session.rollback()
            except Exception:
                pass

    def _get_matches_for_code(self, harmonic_codes, cur_track_md, sort_results):
        bpm = cur_track_md[TrackDBCols.BPM]
        source_id = cur_track_md.get(TrackDBCols.ID)
        same_key = []
        higher_key = []
        lower_key = []

        for code_number, code_letter, priority in harmonic_codes:
            camelot_code = format_camelot_number(code_number) + code_letter
            hk_code = format_camelot_number((code_number + 7) % 12) + code_letter
            lk_code = format_camelot_number((code_number - 7) % 12) + code_letter

            for md in self._get_matches(
                bpm, camelot_code, SAME_UPPER_BOUND, SAME_LOWER_BOUND
            ):
                if source_id is not None and md.get(TrackDBCols.ID) == source_id:
                    continue
                match = TransitionMatch(md, cur_track_md, priority)
                same_key.append(match)

            for md in self._get_matches(
                bpm, hk_code, DOWN_KEY_UPPER_BOUND, DOWN_KEY_LOWER_BOUND
            ):
                if source_id is not None and md.get(TrackDBCols.ID) == source_id:
                    continue
                match = TransitionMatch(md, cur_track_md, priority)
                higher_key.append(match)

            for md in self._get_matches(
                bpm, lk_code, UP_KEY_UPPER_BOUND, UP_KEY_LOWER_BOUND
            ):
                if source_id is not None and md.get(TrackDBCols.ID) == source_id:
                    continue
                match = TransitionMatch(md, cur_track_md, priority)
                lower_key.append(match)

        all_matches = same_key + higher_key + lower_key
        self._prefetch_for_matches(source_id, all_matches)

        if sort_results:
            same_key = sorted(same_key, reverse=True)
            higher_key = sorted(higher_key, reverse=True)
            lower_key = sorted(lower_key, reverse=True)

        return same_key, higher_key, lower_key

    def _print_transition_ranks(self, result_type, results, start_index=0):
        print("\n\n\n%s results:\n\n\n" % result_type)
        print(DASHED_LINE)
        print(TransitionMatch.result_column_header)
        print(DASHED_LINE)

        num_results = len(results)
        if num_results == 0:
            return

        for i, result in enumerate(results[start_index:]):
            if i == self.max_results:
                break

            if (
                num_results >= self.result_threshold
                and result.get_score() < self.cutoff_threshold_score
            ):
                break

            print(result.format())
            if (i + 1) % 5 == 0:
                print()
