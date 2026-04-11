from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TrackResponse(BaseModel):
    id: int
    title: str
    artist_names: List[str] = Field(default_factory=list)
    bpm: Optional[float] = None
    key: Optional[str] = None
    camelot_code: Optional[str] = None
    genre: Optional[str] = None
    label: Optional[str] = None
    energy: Optional[int] = None


class SearchSuggestion(BaseModel):
    id: int
    title: str
    artist_names: List[str]
    bpm: Optional[float]
    key: Optional[str]
    camelot_code: Optional[str]


class TransitionMatchResponse(BaseModel):
    candidate_id: int
    title: str
    overall_score: float
    bucket: str
    camelot_score: float
    bpm_score: float
    energy_score: float
    similarity_score: float
    freshness_score: float
    genre_similarity_score: float
    mood_continuity_score: float
    vocal_clash_score: float
    instrument_similarity_score: float


class MatchDetailFactorScore(BaseModel):
    name: str
    score: float
    weight: float


class MatchDetailTrackInfo(BaseModel):
    id: int
    title: str
    bpm: Optional[float]
    key: Optional[str]
    camelot_code: Optional[str]
    energy: Optional[int]
    genre: Optional[str]
    label: Optional[str]
    traits: Optional[Dict[str, Any]]


class MatchDetailResponse(BaseModel):
    overall_score: float
    factors: List[MatchDetailFactorScore]
    on_deck: MatchDetailTrackInfo
    candidate: MatchDetailTrackInfo


class TrackTraitResponse(BaseModel):
    track_id: int
    traits: Optional[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Admin / cache stats
# ---------------------------------------------------------------------------


class CacheEventEntry(BaseModel):
    pair: List[int]
    timestamp: float


class CacheExitEntry(BaseModel):
    pair: List[int]
    timestamp: float
    reason: Optional[str] = None


class KeyDistributionEntry(BaseModel):
    key: str
    count: int


class BpmBinEntry(BaseModel):
    bin_start: float
    bin_end: float
    count: int


class CacheStatsResponse(BaseModel):
    used: int
    capacity: int
    usage_ratio: float
    hits: int
    misses: int
    hit_rate: float
    hit_rate_numerator: int
    hit_rate_denominator: int
    hit_rate_basis: str
    key_distribution: List[KeyDistributionEntry]
    bpm_distribution: List[BpmBinEntry]
    recent_entries: List[CacheEventEntry]
    recent_exits: List[CacheExitEntry]


# ---------------------------------------------------------------------------
# Weight controls
# ---------------------------------------------------------------------------


class WeightResponse(BaseModel):
    raw_weights: Dict[str, float]
    effective_weights: Dict[str, float]
    raw_sum: float
    target_sum: float = Field(default=100)
    is_sum_valid: bool
    message: Optional[str] = None


class WeightUpdateRequest(BaseModel):
    weights: Dict[str, float] = Field(
        ...,
        description="Factor name → value on 0-100 scale",
    )


# ---------------------------------------------------------------------------
# Set builder
# ---------------------------------------------------------------------------


class TransitionScoreRequest(BaseModel):
    pairs: List[List[int]] = Field(
        ...,
        description="List of [source_id, candidate_id] pairs",
    )


class TransitionScoreResponse(BaseModel):
    scores: List[Optional[float]]


class SetExportRequest(BaseModel):
    track_ids: List[int]
    name: str = "set"


class SetExportResponse(BaseModel):
    content: str
    filename: str


# ---------------------------------------------------------------------------
# Set workspace
# ---------------------------------------------------------------------------


class SetSummary(BaseModel):
    id: int
    name: str
    created_at: str
    updated_at: str
    pool_count: int = 0
    tracklist_count: int = 0


class SetCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class SetUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class PoolEntryResponse(BaseModel):
    id: int
    set_id: int
    track_id: int
    insertion_order: int
    track: Optional[TrackResponse] = None


class TracklistEntryResponse(BaseModel):
    id: int
    set_id: int
    track_id: int
    position: int
    note: str = ""
    track: Optional[TrackResponse] = None


class TracklistNoteUpdateRequest(BaseModel):
    note: str = ""


class ExplorerNodeResponse(BaseModel):
    id: int
    set_id: int
    node_id: str
    track_id: int
    level: int
    col_index: int
    track: Optional[TrackResponse] = None


class ExplorerEdgeResponse(BaseModel):
    id: int
    set_id: int
    parent_node_id: str
    child_node_id: str


class HydratedSetResponse(BaseModel):
    set: SetSummary
    pool: List[PoolEntryResponse]
    tracklist: List[TracklistEntryResponse]
    explorer_nodes: List[ExplorerNodeResponse]
    explorer_edges: List[ExplorerEdgeResponse]


class PoolAddRequest(BaseModel):
    track_id: int


class TracklistAddRequest(BaseModel):
    track_id: int


class TracklistReorderRequest(BaseModel):
    track_id: int
    new_position: int


class MoveRequest(BaseModel):
    track_id: int


class ExplorerAddNodeRequest(BaseModel):
    track_id: int
    parent_node_id: Optional[str] = None
    level: int = 0


class ExplorerAddEdgeRequest(BaseModel):
    parent_node_id: str
    child_node_id: str


class DeleteNodeEdgeRewire(BaseModel):
    parent_node_id: str
    child_node_id: str


class ExplorerDeleteNodeRequest(BaseModel):
    node_id: str
    rewire_edges: List[DeleteNodeEdgeRewire] = Field(default_factory=list)


class ExplorerSwapRequest(BaseModel):
    node_a_id: str
    node_b_id: str


class ExplorerNodeToTracklistRequest(BaseModel):
    node_id: str


class ExplorerEdgeScoreRequest(BaseModel):
    pairs: List[List[int]] = Field(
        ...,
        description="List of [parent_track_id, child_track_id] pairs",
    )


class ExplorerEdgeScoreResponse(BaseModel):
    scores: List[Optional[float]]
