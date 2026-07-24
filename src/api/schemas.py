from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, validator


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
    highlight_color: Optional[str] = None
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


class PoolSubgroupResponse(BaseModel):
    id: int
    set_id: int
    name: str
    display_order: int


class PoolSubgroupMemberResponse(BaseModel):
    id: int
    subgroup_id: int
    pool_entry_id: int
    display_order: int


class ExplorerNodeResponse(BaseModel):
    id: int
    set_id: int
    node_id: str
    track_id: int
    x: float
    y: float
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
    pool_subgroups: List[PoolSubgroupResponse] = Field(default_factory=list)
    pool_subgroup_memberships: List[PoolSubgroupMemberResponse] = Field(
        default_factory=list
    )


class PoolAddRequest(BaseModel):
    track_id: int


class PoolReorderRequest(BaseModel):
    track_id: int
    new_position: int


class PoolHighlightRequest(BaseModel):
    # #RRGGBB, or null/empty to clear the highlight.
    highlight_color: Optional[str] = None


class TracklistAddRequest(BaseModel):
    track_id: int


class TracklistReorderRequest(BaseModel):
    track_id: int
    new_position: int


class MoveRequest(BaseModel):
    track_id: int


class SubgroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class SubgroupRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class SubgroupReorderRequest(BaseModel):
    subgroup_ids: List[int]


class SubgroupMemberRequest(BaseModel):
    pool_entry_id: int


class SubgroupMemberReorderRequest(BaseModel):
    pool_entry_id: int
    new_position: int


class SubgroupDropRequest(BaseModel):
    track_id: int
    source: Literal["browse", "tracklist", "pool"]


class ExplorerAddNodeRequest(BaseModel):
    track_id: int
    x: float = 0.0
    y: float = 0.0
    parent_node_id: Optional[str] = None


class ExplorerMoveNodeRequest(BaseModel):
    node_id: str
    x: float
    y: float


class ExplorerNodePosition(BaseModel):
    node_id: str
    x: float
    y: float


class ExplorerSetPositionsRequest(BaseModel):
    positions: List[ExplorerNodePosition]


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


# ---------------------------------------------------------------------------
# Table preferences (installation-global)
# ---------------------------------------------------------------------------

_MIN_COL_WIDTH = 40
_MAX_COL_WIDTH = 2000


class TableId(str, Enum):
    search = "search"
    matches = "matches"
    tracklist = "tracklist"
    pool = "pool"


class TablePreferenceConfig(BaseModel):
    column_order: List[str] = Field(..., min_length=1)
    column_visibility: Dict[str, bool]
    column_widths: Dict[str, float]

    @validator("column_order")
    def validate_column_order(cls, value: List[str]) -> List[str]:
        seen: set[str] = set()
        unique: List[str] = []
        for col_id in value:
            if not col_id or not isinstance(col_id, str):
                raise ValueError("column_order entries must be non-empty strings")
            if col_id in seen:
                raise ValueError("column_order must not contain duplicate ids")
            seen.add(col_id)
            unique.append(col_id)
        return unique

    @validator("column_visibility")
    def validate_visibility(cls, value: Dict[str, bool]) -> Dict[str, bool]:
        for key, visible in value.items():
            if not key:
                raise ValueError("column_visibility keys must be non-empty strings")
            if not isinstance(visible, bool):
                raise ValueError("column_visibility values must be booleans")
        return value

    @validator("column_widths")
    def validate_widths(cls, value: Dict[str, float]) -> Dict[str, float]:
        for key, width in value.items():
            if not key:
                raise ValueError("column_widths keys must be non-empty strings")
            if not isinstance(width, (int, float)) or not (
                _MIN_COL_WIDTH <= float(width) <= _MAX_COL_WIDTH
            ):
                raise ValueError(
                    "column_widths values must be finite numbers between "
                    f"{_MIN_COL_WIDTH} and {_MAX_COL_WIDTH}"
                )
        return {k: float(v) for k, v in value.items()}


class TablePreferenceResponse(TablePreferenceConfig):
    table_id: TableId
    updated_at: Optional[str] = None


class TablePreferencesListResponse(BaseModel):
    preferences: List[TablePreferenceResponse]
