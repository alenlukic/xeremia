from typing import Any, Dict, List, Literal, Optional

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
    date_added: Optional[str] = None


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


class TransitionScoreCacheStats(BaseModel):
    used: int
    capacity: int
    hits: int
    misses: int
    hit_rate: float


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
    transition_score_cache: Optional[TransitionScoreCacheStats] = None


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
        max_length=100,
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
    starred: bool = False
    track: Optional[TrackResponse] = None


class TracklistEntryResponse(BaseModel):
    id: int
    set_id: int
    track_id: int
    position: int
    note: str = ""
    starred: bool = False
    track: Optional[TrackResponse] = None


class TracklistNoteUpdateRequest(BaseModel):
    note: str = ""


class StarToggleRequest(BaseModel):
    starred: bool


class ExplorerTreeResponse(BaseModel):
    id: int
    set_id: int
    name: str


class ExplorerNodeResponse(BaseModel):
    id: int
    set_id: int
    tree_id: int
    node_id: str
    track_id: int
    level: int
    col_index: int
    track: Optional[TrackResponse] = None


class ExplorerEdgeResponse(BaseModel):
    id: int
    set_id: int
    tree_id: int
    parent_node_id: str
    child_node_id: str


class PoolSubgroupResponse(BaseModel):
    id: int
    set_id: int
    name: str
    display_order: int


class PoolSubgroupMemberResponse(BaseModel):
    id: int
    subgroup_id: int
    pool_entry_id: int


class EmptyRowResponse(BaseModel):
    id: int
    set_id: int
    surface: str
    position: int


class HydratedSetResponse(BaseModel):
    set: SetSummary
    pool: List[PoolEntryResponse]
    tracklist: List[TracklistEntryResponse]
    explorer_trees: List[ExplorerTreeResponse]
    explorer_nodes: List[ExplorerNodeResponse]
    explorer_edges: List[ExplorerEdgeResponse]
    pool_subgroups: List[PoolSubgroupResponse] = Field(default_factory=list)
    pool_subgroup_memberships: List[PoolSubgroupMemberResponse] = Field(default_factory=list)
    empty_rows: List[EmptyRowResponse] = Field(default_factory=list)


class PoolAddRequest(BaseModel):
    track_id: int


class PoolReorderRequest(BaseModel):
    track_id: int
    new_position: int


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
    tree_id: Optional[int] = None
    col_index: Optional[int] = None


class ExplorerAddEdgeRequest(BaseModel):
    parent_node_id: str
    child_node_id: str


class DeleteNodeEdgeRewire(BaseModel):
    parent_node_id: str
    child_node_id: str


class ExplorerDeleteNodeRequest(BaseModel):
    node_id: str
    rewire_edges: List[DeleteNodeEdgeRewire] = Field(default_factory=list)


class ExplorerMoveNodeRequest(BaseModel):
    node_id: str
    target_level: Optional[int] = None
    target_col_index: Optional[int] = None
    new_parent_node_id: Optional[str] = None


class ExplorerSwapRequest(BaseModel):
    node_a_id: str
    node_b_id: str


class ExplorerNodeToTracklistRequest(BaseModel):
    node_id: str


class ExplorerEdgeScoreRequest(BaseModel):
    pairs: List[List[int]] = Field(
        ...,
        max_length=100,
        description="List of [parent_track_id, child_track_id] pairs",
    )


class ExplorerEdgeScoreResponse(BaseModel):
    scores: List[Optional[float]]


class ExplorerTreeCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    mode: Literal["empty", "full_copy", "subtree_copy"] = "empty"
    source_tree_id: Optional[int] = None
    source_node_id: Optional[str] = None


class ExplorerTreeRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


# ---------------------------------------------------------------------------
# Pool subgroup requests
# ---------------------------------------------------------------------------


class SubgroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class SubgroupRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class SubgroupReorderRequest(BaseModel):
    subgroup_ids: List[int]


class SubgroupMemberRequest(BaseModel):
    pool_entry_id: int


# ---------------------------------------------------------------------------
# Empty row requests
# ---------------------------------------------------------------------------


class EmptyRowAddRequest(BaseModel):
    surface: str = Field(..., pattern="^(tracklist|pool)$")
    count: int = Field(1, ge=1, le=50)
    position: int = -1


class EmptyRowReorderRequest(BaseModel):
    new_position: int
