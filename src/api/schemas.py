from enum import Enum
import re
from typing import Any, Dict, List, Literal, Optional, Pattern

from pydantic import BaseModel, Field, validator

_SEQUENCER_BENCH_KEY_RE = re.compile(r"^\d+:\d+$")
_SEQUENCER_TILE_KEY_RE = re.compile(r"^(?:\d+|(?:\d+|committed):\d+)$")
_MAX_SEQUENCER_MAP_ENTRIES = 4096


def _validate_sequencer_map_keys(
    value: Optional[Dict[str, Any]],
    field_name: str,
    *,
    key_pattern: Pattern[str],
    key_description: str,
) -> Optional[Dict[str, Any]]:
    if value is None:
        return value
    if len(value) > _MAX_SEQUENCER_MAP_ENTRIES:
        raise ValueError(
            f"{field_name} may not contain more than {_MAX_SEQUENCER_MAP_ENTRIES} entries"
        )
    for key in value.keys():
        if not key_pattern.match(key):
            raise ValueError(
                f"{field_name} keys must be {key_description}"
            )
    return value


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
    duration_seconds: Optional[float] = None


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
    # Sequencer view state for this set; null until the DJ changes something.
    sequencer: Optional[dict] = None


class SequencerBenchOverride(BaseModel):
    """Preview values for a track while it remains on an alternative lane."""

    durOv: Optional[float] = Field(default=None, ge=0.1, le=600)
    endPin: Optional[float] = Field(default=None, ge=0, le=2880)
    bpmOv: Optional[float] = Field(default=None, ge=40, le=300)


class SetSequencerRequest(BaseModel):
    """Sequencer view state. Every field is optional so a partial save works."""

    start_minutes: Optional[float] = Field(default=None, ge=0, le=1440)
    end_minutes: Optional[float] = Field(default=None, ge=0, le=2880)
    tick_minutes: Optional[int] = Field(default=None, ge=1, le=240)
    px_per_min: Optional[float] = Field(default=None, ge=0.5, le=200)
    view: Optional[str] = Field(default=None, max_length=32)
    # Keys are lane-scoped placement ids (for example "12:417"). Legacy
    # numeric track-id keys remain valid strings for backwards compatibility.
    bench_times: Optional[Dict[str, float]] = None
    bench_overrides: Optional[Dict[str, SequencerBenchOverride]] = None
    starred_tiles: Optional[Dict[str, bool]] = None
    pinned_tiles: Optional[Dict[str, bool]] = None

    @validator("end_minutes")
    def validate_time_window(
        cls,
        value: Optional[float],
        values: Dict[str, Any],
    ) -> Optional[float]:
        start = values.get("start_minutes")
        if start is not None and value is not None and value <= start:
            raise ValueError("end_minutes must be greater than start_minutes")
        return value

    @validator("bench_times")
    def validate_bench_times(
        cls,
        value: Optional[Dict[str, float]],
    ) -> Optional[Dict[str, float]]:
        typed = _validate_sequencer_map_keys(
            value,
            "bench_times",
            key_pattern=_SEQUENCER_BENCH_KEY_RE,
            key_description="'<laneId>:<trackId>'",
        )
        if typed is None:
            return typed
        for key, minute in typed.items():
            minute_value = float(minute)
            if minute_value < 0 or minute_value > 2880:
                raise ValueError(f"bench_times[{key}] must be between 0 and 2880")
            typed[key] = minute_value
        return typed

    @validator("bench_overrides")
    def validate_bench_overrides(
        cls,
        value: Optional[Dict[str, SequencerBenchOverride]],
    ) -> Optional[Dict[str, SequencerBenchOverride]]:
        return _validate_sequencer_map_keys(
            value,
            "bench_overrides",
            key_pattern=_SEQUENCER_BENCH_KEY_RE,
            key_description="'<laneId>:<trackId>'",
        )

    @validator("starred_tiles")
    def validate_starred_tiles(
        cls,
        value: Optional[Dict[str, bool]],
    ) -> Optional[Dict[str, bool]]:
        return _validate_sequencer_map_keys(
            value,
            "starred_tiles",
            key_pattern=_SEQUENCER_TILE_KEY_RE,
            key_description="'committed:<trackId>', '<laneId>:<trackId>', or '<trackId>'",
        )

    @validator("pinned_tiles")
    def validate_pinned_tiles(
        cls,
        value: Optional[Dict[str, bool]],
    ) -> Optional[Dict[str, bool]]:
        return _validate_sequencer_map_keys(
            value,
            "pinned_tiles",
            key_pattern=_SEQUENCER_TILE_KEY_RE,
            key_description="'committed:<trackId>', '<laneId>:<trackId>', or '<trackId>'",
        )


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
    play_minutes: Optional[float] = None
    pinned_end_minutes: Optional[float] = None
    bpm_override: Optional[float] = None
    track: Optional[TrackResponse] = None


class TracklistNoteUpdateRequest(BaseModel):
    note: str = ""


class TracklistOverridesRequest(BaseModel):
    """Sequencer overrides for one tracklist entry.

    PUT replaces the whole override triple, so a null or omitted field clears
    that override and restores the derived value.
    """

    play_minutes: Optional[float] = Field(default=None, ge=0.1, le=600)
    pinned_end_minutes: Optional[float] = Field(default=None, ge=0, le=2880)
    bpm_override: Optional[float] = Field(default=None, ge=40, le=300)

    @validator("pinned_end_minutes")
    def validate_pinned_vs_play(
        cls,
        value: Optional[float],
        values: Dict[str, Any],
    ) -> Optional[float]:
        play_minutes = values.get("play_minutes")
        if play_minutes is not None and value is not None and value < play_minutes:
            raise ValueError("pinned_end_minutes must be greater than play_minutes")
        return value


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


class ExplorerCrateResponse(BaseModel):
    id: int
    name: str
    display_order: int


class ExplorerCrateMemberResponse(BaseModel):
    id: int
    crate_id: int
    track_id: int


class ExplorerCratesResponse(BaseModel):
    crates: List[ExplorerCrateResponse] = Field(default_factory=list)
    memberships: List[ExplorerCrateMemberResponse] = Field(default_factory=list)


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


class CrateCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class CrateRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class CrateTrackRequest(BaseModel):
    track_id: int


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
    # Not a column-based table: this row carries the workspace grid layout for
    # one device in the ``layout`` payload.
    workspace_layout = "workspace-layout"


COLUMN_TABLE_IDS = frozenset(
    {
        TableId.search.value,
        TableId.matches.value,
        TableId.tracklist.value,
        TableId.pool.value,
    }
)


class TablePreferenceConfig(BaseModel):
    # Column config is empty for the workspace-layout row; the route requires a
    # non-empty order for every column-based table id.
    column_order: List[str] = Field(default_factory=list)
    column_visibility: Dict[str, bool] = Field(default_factory=dict)
    column_widths: Dict[str, float] = Field(default_factory=dict)
    layout: Optional[Dict[str, Any]] = None

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
