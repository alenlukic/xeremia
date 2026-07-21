"""API route definitions."""

import logging
import os
from collections import Counter
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from src.api.schemas import (
    CacheStatsResponse,
    ExplorerAddEdgeRequest,
    ExplorerAddNodeRequest,
    ExplorerDeleteNodeRequest,
    ExplorerEdgeScoreRequest,
    ExplorerEdgeScoreResponse,
    ExplorerNodeToTracklistRequest,
    ExplorerSwapRequest,
    HydratedSetResponse,
    MatchDetailResponse,
    MoveRequest,
    PoolAddRequest,
    PoolReorderRequest,
    PoolSubgroupResponse,
    SearchSuggestion,
    SetCreateRequest,
    SetExportRequest,
    SetExportResponse,
    SetSummary,
    SetUpdateRequest,
    SubgroupCreateRequest,
    SubgroupMemberRequest,
    SubgroupRenameRequest,
    SubgroupReorderRequest,
    TableId,
    TablePreferenceConfig,
    TablePreferenceResponse,
    TablePreferencesListResponse,
    TracklistAddRequest,
    TracklistNoteUpdateRequest,
    TracklistReorderRequest,
    TrackResponse,
    TrackTraitResponse,
    TransitionMatchResponse,
    TransitionScoreRequest,
    TransitionScoreResponse,
    WeightResponse,
    WeightUpdateRequest,
)
from src.api.queries import get_tracks
from src.api.serializers import (
    serialize_explorer_node,
    serialize_match_detail_track,
    serialize_matches,
    serialize_track_row,
    serialize_trait_info,
)
from src.data_management.config import TrackDBCols
from src.utils.audio_path import resolve_audio_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

_match_finder = None

_BPM_BIN_WIDTH = 5


def _get_session():
    from src.db import database

    return database.create_session()


def _get_match_finder():
    global _match_finder
    if _match_finder is None:
        from src.harmonic_mixing.cosine_cache import CosineCache
        from src.harmonic_mixing.transition_match_finder import TransitionMatchFinder

        _match_finder = TransitionMatchFinder(cosine_cache=CosineCache())
    return _match_finder


@router.get("/search", response_model=List[SearchSuggestion])
def api_search(q: str = Query(..., min_length=1)):
    from src.api.es import search as es_search

    try:
        hits = es_search(q.strip(), limit=10)
    except Exception:
        logger.exception("Elasticsearch search failed for q=%r", q)
        raise HTTPException(status_code=503, detail="Search unavailable")
    results = []
    for doc in hits:
        artist_names = doc.get("artist_names", [])
        if isinstance(artist_names, str):
            artist_names = [n.strip() for n in artist_names.split(",") if n.strip()]
        results.append(
            {
                "id": doc["id"],
                "title": doc.get("title", ""),
                "artist_names": artist_names,
                "bpm": doc.get("bpm"),
                "key": doc.get("key"),
                "camelot_code": doc.get("camelot_code"),
            }
        )
    return results


@router.get("/tracks", response_model=List[TrackResponse])
def api_tracks(
    camelot_code: Optional[str] = Query(None),
    bpm: Optional[float] = Query(None),
    bpm_min: Optional[float] = Query(None),
    bpm_max: Optional[float] = Query(None),
):
    codes = None
    if camelot_code:
        codes = [c.strip() for c in camelot_code.split(",") if c.strip()]

    session = _get_session()
    try:
        rows = get_tracks(
            session.session,
            camelot_codes=codes,
            bpm=bpm,
            bpm_min=bpm_min,
            bpm_max=bpm_max,
        )
        return [serialize_track_row(track) for track in rows]
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Track listing failed")
        raise HTTPException(status_code=500, detail="Track listing failed")
    finally:
        session.close()


@router.get("/track-traits", response_model=List[TrackTraitResponse])
def api_track_traits():
    from src.models.track_trait import TrackTrait
    from src.feature_extraction.config import TRAIT_VERSION

    session = _get_session()
    try:
        rows = session.query(TrackTrait).filter_by(trait_version=TRAIT_VERSION).all()
        return [
            {"track_id": row.track_id, "traits": serialize_trait_info(row)}
            for row in rows
        ]
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Track trait listing failed")
        raise HTTPException(status_code=500, detail="Track trait listing failed")
    finally:
        session.close()


_SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".aiff", ".aif"}
_AUDIO_MEDIA_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff",
}


@router.api_route("/tracks/{track_id}/audio", methods=["GET", "HEAD"])
def api_track_audio(track_id: int):
    from src.models.track import Track
    from src.config import PROCESSED_MUSIC_DIR

    if not PROCESSED_MUSIC_DIR:
        raise HTTPException(status_code=500, detail="Audio directory not configured")

    session = _get_session()
    try:
        track = session.query(Track).filter_by(id=track_id).first()
        if track is None:
            raise HTTPException(status_code=404, detail="Track not found")

        file_name = track.file_name
        if not file_name:
            raise HTTPException(status_code=404, detail="Track has no associated file")

        ext = os.path.splitext(file_name)[1].lower()
        if ext not in _SUPPORTED_AUDIO_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported audio format '{ext}'. Supported: MP3, WAV, AIFF, AIF.",
            )

        file_path = resolve_audio_path(PROCESSED_MUSIC_DIR, file_name)
        if file_path is None:
            logger.warning(
                "Audio file not found on disk for track_id=%s file_name=%r",
                track_id,
                file_name,
            )
            raise HTTPException(
                status_code=404,
                detail=f"Audio file not found on disk for track {track_id}",
            )

        media_type = _AUDIO_MEDIA_TYPES[ext]
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=file_name,
        )
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Audio streaming failed for track_id=%s", track_id)
        raise HTTPException(status_code=500, detail="Audio streaming failed")
    finally:
        session.close()


@router.get("/tracks/{track_id}/matches", response_model=List[TransitionMatchResponse])
def api_matches(track_id: int):
    from src.models.track import Track

    session = _get_session()
    try:
        track = session.query(Track).filter_by(id=track_id).first()
        if track is None:
            raise HTTPException(status_code=404, detail="Track not found")

        finder = _get_match_finder()
        result = finder.get_transition_matches(track)
        if result is None:
            raise HTTPException(status_code=404, detail="No matches found")

        (same_key, higher_key, lower_key), _ = result

        cache = finder.cosine_cache
        if cache is not None and hasattr(cache, "schedule_warmup"):
            cache.schedule_warmup(track_id)

        return serialize_matches(same_key, higher_key, lower_key)
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Match retrieval failed for track_id=%s", track_id)
        raise HTTPException(status_code=500, detail="Match retrieval failed")
    finally:
        session.close()


@router.get(
    "/tracks/{track_id}/match-detail/{candidate_id}",
    response_model=MatchDetailResponse,
)
def api_match_detail(track_id: int, candidate_id: int):
    from src.models.track import Track
    from src.harmonic_mixing.config import MATCH_WEIGHTS, MatchFactors
    from src.harmonic_mixing.weight_service import WeightService

    session = _get_session()
    try:
        source_track = session.query(Track).filter_by(id=track_id).first()
        if source_track is None:
            raise HTTPException(status_code=404, detail="Source track not found")

        candidate_track = session.query(Track).filter_by(id=candidate_id).first()
        if candidate_track is None:
            raise HTTPException(status_code=404, detail="Candidate track not found")

        finder = _get_match_finder()
        result = finder.get_transition_matches(source_track)
        if result is None:
            raise HTTPException(status_code=404, detail="No matches found")

        (same_key, higher_key, lower_key), _ = result

        target_match = None
        for match in same_key + higher_key + lower_key:
            if match.metadata.get(TrackDBCols.ID) == candidate_id:
                target_match = match
                break

        if target_match is None:
            raise HTTPException(
                status_code=404, detail="Match not found for this track pair"
            )

        target_match.get_score()

        try:
            active_weights = (
                WeightService.instance().get_effective_weights_for_scoring()
            )
        except Exception:
            active_weights = MATCH_WEIGHTS

        factors = []
        for factor in MatchFactors:
            weight = active_weights.get(factor.name, 0)
            score = target_match.factors.get(factor, 0)
            factors.append(
                {
                    "name": factor.value,
                    "score": round(score, 4),
                    "weight": round(weight, 4),
                }
            )

        return {
            "overall_score": round(target_match.get_score(), 2),
            "factors": factors,
            "on_deck": serialize_match_detail_track(source_track, None),
            "candidate": serialize_match_detail_track(candidate_track, None),
        }
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception(
            "Match detail failed for track_id=%s, candidate_id=%s",
            track_id,
            candidate_id,
        )
        raise HTTPException(status_code=500, detail="Match detail retrieval failed")
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Admin / cache stats
# ---------------------------------------------------------------------------


@router.get("/admin/cache-stats", response_model=CacheStatsResponse)
def api_cache_stats():
    finder = _get_match_finder()
    cache = finder.cosine_cache
    if cache is None:
        return CacheStatsResponse(
            used=0,
            capacity=0,
            usage_ratio=0.0,
            hits=0,
            misses=0,
            hit_rate=0.0,
            hit_rate_numerator=0,
            hit_rate_denominator=0,
            hit_rate_basis="process_lifetime",
            key_distribution=[],
            bpm_distribution=[],
            recent_entries=[],
            recent_exits=[],
        )

    stats = cache.get_stats()

    key_dist, bpm_dist = _build_cache_distributions(cache)

    return CacheStatsResponse(
        **{
            k: v
            for k, v in stats.items()
            if k not in ("recent_entries", "recent_exits")
        },
        key_distribution=key_dist,
        bpm_distribution=bpm_dist,
        recent_entries=[
            {"pair": list(e["pair"]), "timestamp": e["timestamp"]}
            for e in stats["recent_entries"]
        ],
        recent_exits=[
            {
                "pair": list(e["pair"]),
                "timestamp": e["timestamp"],
                "reason": e.get("reason"),
            }
            for e in stats["recent_exits"]
        ],
    )


def _build_cache_distributions(cache):
    from src.models.track import Track

    track_ids = cache.get_cached_track_ids()
    if not track_ids:
        return [], []

    session = _get_session()
    try:
        rows = session.query(Track).filter(Track.id.in_(track_ids)).all()

        key_counter: Counter = Counter()
        bpms: list = []
        for row in rows:
            if row.camelot_code:
                key_counter[row.camelot_code] += 1
            if row.bpm is not None:
                bpms.append(float(row.bpm))

        key_dist = [{"key": k, "count": c} for k, c in key_counter.most_common()]

        bpm_dist = []
        if bpms:
            min_bpm = int(min(bpms) // _BPM_BIN_WIDTH) * _BPM_BIN_WIDTH
            max_bpm = int(max(bpms) // _BPM_BIN_WIDTH) * _BPM_BIN_WIDTH + _BPM_BIN_WIDTH
            bins: Counter = Counter()
            for b in bpms:
                bin_start = int(b // _BPM_BIN_WIDTH) * _BPM_BIN_WIDTH
                bins[bin_start] += 1
            for b in range(min_bpm, max_bpm + 1, _BPM_BIN_WIDTH):
                bpm_dist.append(
                    {
                        "bin_start": float(b),
                        "bin_end": float(b + _BPM_BIN_WIDTH),
                        "count": bins.get(b, 0),
                    }
                )

        return key_dist, bpm_dist
    except Exception:
        session.rollback()
        logger.exception("Cache distribution query failed")
        return [], []
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Weight controls
# ---------------------------------------------------------------------------


@router.get("/weights", response_model=WeightResponse)
def api_get_weights():
    from src.harmonic_mixing.weight_service import WeightService

    return WeightService.instance().get_weights()


@router.get("/weights/defaults")
def api_get_weight_defaults():
    from src.harmonic_mixing.weight_service import WeightService

    return WeightService.instance().get_default_weights()


def _clear_similarity_cache():
    from src.db import database
    from src.models.track_cosine_similarity import TrackCosineSimilarity

    session = database.create_session()
    try:
        session.query(TrackCosineSimilarity).delete()
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to clear cosine similarity cache after weight update")
    finally:
        session.close()


@router.put("/weights", response_model=WeightResponse)
def api_update_weights(body: WeightUpdateRequest):
    from src.harmonic_mixing.weight_service import WeightService

    result = WeightService.instance().update_weights(body.weights)
    finder = _get_match_finder()
    finder._sync_effective_weights()
    if finder.cosine_cache is not None:
        finder.cosine_cache.clear()
    _clear_similarity_cache()
    return result


# ---------------------------------------------------------------------------
# Set builder
# ---------------------------------------------------------------------------


@router.post("/sets/transition-scores", response_model=TransitionScoreResponse)
def api_transition_scores(body: TransitionScoreRequest):
    """Compute transition scores for a list of adjacent track pairs."""
    from src.models.track import Track

    session = _get_session()
    try:
        finder = _get_match_finder()

        source_ids = {p[0] for p in body.pairs if len(p) == 2}
        match_cache: dict = {}
        for sid in source_ids:
            source = session.query(Track).filter_by(id=sid).first()
            if source is None:
                continue
            result = finder.get_transition_matches(source)
            if result is None:
                continue
            (same_key, higher_key, lower_key), _ = result
            scores: dict = {}
            for m in same_key + higher_key + lower_key:
                cid = m.metadata.get(TrackDBCols.ID)
                if cid is not None:
                    scores[cid] = round(m.get_score(), 2)
            match_cache[sid] = scores

        results = []
        for pair in body.pairs:
            if len(pair) != 2:
                results.append(None)
                continue
            sid, cid = pair
            source_scores = match_cache.get(sid, {})
            results.append(source_scores.get(cid))

        return {"scores": results}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Transition score computation failed")
        raise HTTPException(status_code=500, detail="Score computation failed")
    finally:
        session.close()


@router.post("/sets/export-m3u8", response_model=SetExportResponse)
def api_export_m3u8(body: SetExportRequest):
    """Export an ordered set of tracks as an m3u8 playlist."""
    from src.models.track import Track

    session = _get_session()
    try:
        tracks = session.query(Track).filter(Track.id.in_(body.track_ids)).all()
        track_map = {t.id: t for t in tracks}

        lines = ["#EXTM3U"]
        for tid in body.track_ids:
            t = track_map.get(tid)
            if t is None:
                continue
            lines.append(f"#EXTINF:-1,{t.title}")
            lines.append(t.file_name)

        content = "\n".join(lines) + "\n"
        safe_name = (
            "".join(c if c.isalnum() or c in " _-" else "_" for c in body.name).strip()
            or "set"
        )
        return {"content": content, "filename": f"{safe_name}.m3u8"}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("M3U8 export failed")
        raise HTTPException(status_code=500, detail="Export failed")
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Set workspace CRUD
# ---------------------------------------------------------------------------


def _serialize_set_summary(dj_set, session) -> dict:
    from src.models.set_pool_entry import SetPoolEntry
    from src.models.set_tracklist_entry import SetTracklistEntry

    pool_count = session.query(SetPoolEntry).filter_by(set_id=dj_set.id).count()
    tracklist_count = (
        session.query(SetTracklistEntry).filter_by(set_id=dj_set.id).count()
    )
    return {
        "id": dj_set.id,
        "name": dj_set.name,
        "created_at": dj_set.created_at.isoformat() if dj_set.created_at else "",
        "updated_at": dj_set.updated_at.isoformat() if dj_set.updated_at else "",
        "pool_count": pool_count,
        "tracklist_count": tracklist_count,
    }


def _serialize_hydrated(hydration, session) -> dict:
    from src.models.track import Track

    dj_set = hydration["set"]

    all_track_ids = list(
        {e.track_id for e in hydration["pool"]}
        | {e.track_id for e in hydration["tracklist"]}
        | {n.track_id for n in hydration["explorer_nodes"]}
    )

    track_map: dict = {}
    if all_track_ids:
        tracks = session.query(Track).filter(Track.id.in_(all_track_ids)).all()
        track_map = {t.id: serialize_track_row(t) for t in tracks}

    return {
        "set": _serialize_set_summary(dj_set, session),
        "pool": [
            {
                "id": e.id,
                "set_id": e.set_id,
                "track_id": e.track_id,
                "insertion_order": e.insertion_order,
                "track": track_map.get(e.track_id),
            }
            for e in hydration["pool"]
        ],
        "tracklist": [
            {
                "id": e.id,
                "set_id": e.set_id,
                "track_id": e.track_id,
                "position": e.position,
                "note": getattr(e, "note", "") or "",
                "track": track_map.get(e.track_id),
            }
            for e in hydration["tracklist"]
        ],
        "explorer_nodes": [
            serialize_explorer_node(n, track_map.get(n.track_id))
            for n in hydration["explorer_nodes"]
        ],
        "explorer_edges": [
            {
                "id": e.id,
                "set_id": e.set_id,
                "parent_node_id": e.parent_node_id,
                "child_node_id": e.child_node_id,
            }
            for e in hydration["explorer_edges"]
        ],
        "pool_subgroups": [
            _serialize_subgroup(sg) for sg in hydration.get("pool_subgroups", [])
        ],
        "pool_subgroup_memberships": [
            {
                "id": m.id,
                "subgroup_id": m.subgroup_id,
                "pool_entry_id": m.pool_entry_id,
            }
            for m in hydration.get("pool_subgroup_memberships", [])
        ],
    }


@router.get("/sets", response_model=List[SetSummary])
def api_list_sets():
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        sets = svc.list_sets()
        return [_serialize_set_summary(s, session) for s in sets]
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Set listing failed")
        raise HTTPException(status_code=500, detail="Set listing failed")
    finally:
        session.close()


@router.post("/sets", response_model=SetSummary, status_code=201)
def api_create_set(body: SetCreateRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        dj_set = svc.create_set(body.name)
        session.commit()
        return _serialize_set_summary(dj_set, session)
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Set creation failed")
        raise HTTPException(status_code=500, detail="Set creation failed")
    finally:
        session.close()


@router.get("/sets/{set_id}", response_model=HydratedSetResponse)
def api_get_set(set_id: int):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        hydration = svc.hydrate_set(set_id)
        if hydration is None:
            raise HTTPException(status_code=404, detail="Set not found")
        return _serialize_hydrated(hydration, session)
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Set hydration failed for set_id=%s", set_id)
        raise HTTPException(status_code=500, detail="Set hydration failed")
    finally:
        session.close()


@router.put("/sets/{set_id}", response_model=SetSummary)
def api_update_set(set_id: int, body: SetUpdateRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        dj_set = svc.update_set(set_id, body.name)
        if dj_set is None:
            raise HTTPException(status_code=404, detail="Set not found")
        session.commit()
        return _serialize_set_summary(dj_set, session)
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Set update failed for set_id=%s", set_id)
        raise HTTPException(status_code=500, detail="Set update failed")
    finally:
        session.close()


@router.delete("/sets/{set_id}", status_code=204)
def api_delete_set(set_id: int):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        deleted = svc.delete_set(set_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Set not found")
        session.commit()
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Set deletion failed for set_id=%s", set_id)
        raise HTTPException(status_code=500, detail="Set deletion failed")
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Pool endpoints
# ---------------------------------------------------------------------------


@router.post("/sets/{set_id}/pool", status_code=201)
def api_pool_add(set_id: int, body: PoolAddRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        if svc.get_set(set_id) is None:
            raise HTTPException(status_code=404, detail="Set not found")
        entry, error = svc.pool_add(set_id, body.track_id)
        if error:
            raise HTTPException(status_code=409, detail=error)
        session.commit()
        return {"ok": True, "track_id": body.track_id}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Pool add failed")
        raise HTTPException(status_code=500, detail="Pool add failed")
    finally:
        session.close()


@router.delete("/sets/{set_id}/pool/{track_id}", status_code=204)
def api_pool_remove(set_id: int, track_id: int):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        removed = svc.pool_remove(set_id, track_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Track not found in pool")
        session.commit()
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Pool remove failed")
        raise HTTPException(status_code=500, detail="Pool remove failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/pool/reorder")
def api_pool_reorder(set_id: int, body: PoolReorderRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.pool_reorder(set_id, body.track_id, body.new_position)
        if not ok:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Pool reorder failed")
        raise HTTPException(status_code=500, detail="Reorder failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/pool/move-to-tracklist")
def api_pool_move_to_tracklist(set_id: int, body: MoveRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.pool_move_to_tracklist(set_id, body.track_id)
        if not ok:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Pool move to tracklist failed")
        raise HTTPException(status_code=500, detail="Move failed")
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Pool subgroup endpoints
# ---------------------------------------------------------------------------


def _serialize_subgroup(sg) -> dict:
    return {
        "id": sg.id,
        "set_id": sg.set_id,
        "name": sg.name,
        "display_order": sg.display_order,
    }


@router.post(
    "/sets/{set_id}/pool/subgroups",
    response_model=PoolSubgroupResponse,
    status_code=201,
)
def api_subgroup_create(set_id: int, body: SubgroupCreateRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        if svc.get_set(set_id) is None:
            raise HTTPException(status_code=404, detail="Set not found")
        sg = svc.subgroup_create(set_id, body.name)
        session.commit()
        return _serialize_subgroup(sg)
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Subgroup create failed")
        raise HTTPException(status_code=500, detail="Subgroup create failed")
    finally:
        session.close()


@router.patch(
    "/sets/{set_id}/pool/subgroups/{subgroup_id}",
    response_model=PoolSubgroupResponse,
)
def api_subgroup_rename(set_id: int, subgroup_id: int, body: SubgroupRenameRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        sg = svc.subgroup_rename(set_id, subgroup_id, body.name)
        if sg is None:
            raise HTTPException(status_code=404, detail="Subgroup not found")
        session.commit()
        return _serialize_subgroup(sg)
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Subgroup rename failed")
        raise HTTPException(status_code=500, detail="Subgroup rename failed")
    finally:
        session.close()


@router.delete("/sets/{set_id}/pool/subgroups/{subgroup_id}", status_code=204)
def api_subgroup_delete(set_id: int, subgroup_id: int):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        deleted = svc.subgroup_delete(set_id, subgroup_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Subgroup not found")
        session.commit()
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Subgroup delete failed")
        raise HTTPException(status_code=500, detail="Subgroup delete failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/pool/subgroups/reorder")
def api_subgroup_reorder(set_id: int, body: SubgroupReorderRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.subgroup_reorder(set_id, body.subgroup_ids)
        if not ok:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Subgroup reorder failed")
        raise HTTPException(status_code=500, detail="Subgroup reorder failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/pool/subgroups/{subgroup_id}/members", status_code=201)
def api_subgroup_add_member(set_id: int, subgroup_id: int, body: SubgroupMemberRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        member, error = svc.subgroup_add_track(set_id, subgroup_id, body.pool_entry_id)
        if error:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True, "member_id": member.id}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Subgroup add member failed")
        raise HTTPException(status_code=500, detail="Subgroup add member failed")
    finally:
        session.close()


@router.delete(
    "/sets/{set_id}/pool/subgroups/{subgroup_id}/members/{pool_entry_id}",
    status_code=204,
)
def api_subgroup_remove_member(set_id: int, subgroup_id: int, pool_entry_id: int):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.subgroup_remove_track(set_id, subgroup_id, pool_entry_id)
        if not ok:
            raise HTTPException(status_code=404, detail=error)
        session.commit()
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Subgroup remove member failed")
        raise HTTPException(status_code=500, detail="Subgroup remove member failed")
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Tracklist endpoints
# ---------------------------------------------------------------------------


@router.post("/sets/{set_id}/tracklist", status_code=201)
def api_tracklist_add(set_id: int, body: TracklistAddRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        if svc.get_set(set_id) is None:
            raise HTTPException(status_code=404, detail="Set not found")
        entry, error = svc.tracklist_add(set_id, body.track_id)
        if error:
            raise HTTPException(status_code=409, detail=error)
        session.commit()
        return {"ok": True, "track_id": body.track_id}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Tracklist add failed")
        raise HTTPException(status_code=500, detail="Tracklist add failed")
    finally:
        session.close()


@router.delete("/sets/{set_id}/tracklist/{track_id}", status_code=204)
def api_tracklist_remove(set_id: int, track_id: int):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        removed = svc.tracklist_remove(set_id, track_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Track not found in tracklist")
        session.commit()
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Tracklist remove failed")
        raise HTTPException(status_code=500, detail="Tracklist remove failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/tracklist/reorder")
def api_tracklist_reorder(set_id: int, body: TracklistReorderRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.tracklist_reorder(set_id, body.track_id, body.new_position)
        if not ok:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Tracklist reorder failed")
        raise HTTPException(status_code=500, detail="Reorder failed")
    finally:
        session.close()


@router.patch("/sets/{set_id}/tracklist/{track_id}/note")
def api_tracklist_update_note(
    set_id: int, track_id: int, body: TracklistNoteUpdateRequest
):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.update_tracklist_note(set_id, track_id, body.note)
        if not ok:
            raise HTTPException(status_code=404, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Tracklist note update failed")
        raise HTTPException(status_code=500, detail="Note update failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/tracklist/move-to-pool")
def api_tracklist_move_to_pool(set_id: int, body: MoveRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.tracklist_move_to_pool(set_id, body.track_id)
        if not ok:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Tracklist move to pool failed")
        raise HTTPException(status_code=500, detail="Move failed")
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Explorer endpoints
# ---------------------------------------------------------------------------


@router.post("/sets/{set_id}/explorer/nodes", status_code=201)
def api_explorer_add_node(set_id: int, body: ExplorerAddNodeRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        if svc.get_set(set_id) is None:
            raise HTTPException(status_code=404, detail="Set not found")
        node, error = svc.explorer_add_node(
            set_id,
            body.track_id,
            body.parent_node_id,
            body.level,
        )
        if error:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {
            "ok": True,
            "node_id": node.node_id,
            "track_id": node.track_id,
            "level": node.level,
        }
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Explorer add node failed")
        raise HTTPException(status_code=500, detail="Add node failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/explorer/edges", status_code=201)
def api_explorer_add_edge(set_id: int, body: ExplorerAddEdgeRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        edge, error = svc.explorer_add_edge(
            set_id,
            body.parent_node_id,
            body.child_node_id,
        )
        if error:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Explorer add edge failed")
        raise HTTPException(status_code=500, detail="Add edge failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/explorer/delete-node")
def api_explorer_delete_node(set_id: int, body: ExplorerDeleteNodeRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        rewire_edges = (
            [
                {"parent_node_id": r.parent_node_id, "child_node_id": r.child_node_id}
                for r in body.rewire_edges
            ]
            if body.rewire_edges
            else None
        )
        ok, error = svc.explorer_delete_node(
            set_id,
            body.node_id,
            rewire_edges,
        )
        if not ok:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Explorer delete node failed")
        raise HTTPException(status_code=500, detail="Delete node failed")
    finally:
        session.close()


@router.delete("/sets/{set_id}/explorer/edges/{edge_id}", status_code=204)
def api_explorer_delete_edge(set_id: int, edge_id: int):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.delete_explorer_edge(set_id, edge_id)
        if not ok:
            raise HTTPException(status_code=404, detail=error)
        session.commit()
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Explorer delete edge failed")
        raise HTTPException(status_code=500, detail="Delete edge failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/explorer/swap")
def api_explorer_swap(set_id: int, body: ExplorerSwapRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.explorer_swap(set_id, body.node_a_id, body.node_b_id)
        if not ok:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Explorer swap failed")
        raise HTTPException(status_code=500, detail="Swap failed")
    finally:
        session.close()


@router.post("/sets/{set_id}/explorer/node-to-tracklist")
def api_explorer_node_to_tracklist(set_id: int, body: ExplorerNodeToTracklistRequest):
    from src.set_workspace.service import SetWorkspaceService

    session = _get_session()
    try:
        svc = SetWorkspaceService(session)
        ok, error = svc.explorer_node_add_to_tracklist(set_id, body.node_id)
        if not ok:
            raise HTTPException(status_code=400, detail=error)
        session.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Explorer node-to-tracklist failed")
        raise HTTPException(status_code=500, detail="Node to tracklist failed")
    finally:
        session.close()


@router.post(
    "/sets/{set_id}/explorer/edge-scores",
    response_model=ExplorerEdgeScoreResponse,
)
def api_explorer_edge_scores(set_id: int, body: ExplorerEdgeScoreRequest):
    """Compute transition scores for explorer edges."""
    from src.models.track import Track

    session = _get_session()
    try:
        finder = _get_match_finder()
        source_ids = {p[0] for p in body.pairs if len(p) == 2}
        match_cache: dict = {}
        for sid in source_ids:
            source = session.query(Track).filter_by(id=sid).first()
            if source is None:
                continue
            result = finder.get_transition_matches(source)
            if result is None:
                continue
            (same_key, higher_key, lower_key), _ = result
            scores: dict = {}
            for m in same_key + higher_key + lower_key:
                cid = m.metadata.get(TrackDBCols.ID)
                if cid is not None:
                    scores[cid] = round(m.get_score(), 2)
            match_cache[sid] = scores

        results = []
        for pair in body.pairs:
            if len(pair) != 2:
                results.append(None)
                continue
            sid, cid = pair
            source_scores = match_cache.get(sid, {})
            results.append(source_scores.get(cid))

        return {"scores": results}
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Explorer edge score computation failed")
        raise HTTPException(status_code=500, detail="Edge score computation failed")
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Admin / table preferences
# ---------------------------------------------------------------------------

_VALID_TABLE_IDS = {item.value for item in TableId}


def _serialize_table_preference(row) -> dict:
    updated = row.updated_at.isoformat() if row.updated_at else None
    return {
        "table_id": row.table_id,
        "column_order": row.column_order,
        "column_visibility": row.column_visibility,
        "column_widths": row.column_widths,
        "updated_at": updated,
    }


@router.get(
    "/admin/table-preferences",
    response_model=TablePreferencesListResponse,
)
def api_get_table_preferences():
    from sqlalchemy.exc import ProgrammingError

    from src.models.table_preference import TablePreference

    session = _get_session()
    try:
        rows = session.query(TablePreference).all()
        return {
            "preferences": [_serialize_table_preference(row) for row in rows],
        }
    except ProgrammingError:
        session.rollback()
        raise HTTPException(
            status_code=503,
            detail=(
                "table_preference table is missing. Run "
                "python -m src.scripts.migrate_table_preferences before using "
                "table preference endpoints."
            ),
        )
    except Exception:
        session.rollback()
        logger.exception("Failed to load table preferences")
        raise HTTPException(status_code=500, detail="Table preference load failed")
    finally:
        session.close()


@router.put(
    "/admin/table-preferences/{table_id}",
    response_model=TablePreferenceResponse,
)
def api_update_table_preferences(table_id: str, body: TablePreferenceConfig):
    from sqlalchemy.exc import ProgrammingError

    from src.models.table_preference import TablePreference

    if table_id not in _VALID_TABLE_IDS:
        raise HTTPException(status_code=400, detail="Unknown table_id")

    session = _get_session()
    try:
        row = session.query(TablePreference).filter_by(table_id=table_id).first()
        payload = {
            "column_order": body.column_order,
            "column_visibility": body.column_visibility,
            "column_widths": body.column_widths,
        }
        if row is None:
            row = TablePreference(table_id=table_id, **payload)
            session.add(row)
        else:
            row.column_order = payload["column_order"]
            row.column_visibility = payload["column_visibility"]
            row.column_widths = payload["column_widths"]
        session.commit()
        # No session.refresh(row): the custom __Session wrapper has no refresh()
        # method, and expire_on_commit=True already reloads fresh column values
        # lazily during serialization below.
        return _serialize_table_preference(row)
    except ProgrammingError:
        session.rollback()
        raise HTTPException(
            status_code=503,
            detail=(
                "table_preference table is missing. Run "
                "python -m src.scripts.migrate_table_preferences before using "
                "table preference endpoints."
            ),
        )
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        logger.exception("Failed to update table preferences for %s", table_id)
        raise HTTPException(status_code=500, detail="Table preference update failed")
    finally:
        session.close()
