# Development Contract

## Source Inputs
- User-specified requirement: replace Matches tab columns with `Spectral | Key | BPM | Genre | Recency | Energy (MIK) | Mood | Instruments | Vocals`
- User-specified requirement: Matches tab table behavior must match Browse tab table behavior, including column resizing and column rearranging via TanStack Table
- Repo inspection: `client/src/components/MatchesPanel.tsx`, `client/src/components/TrackTable.tsx`, `client/src/types.ts`, `client/src/components/WeightControls.tsx`, `client/src/App.tsx`

## Selected Intent
- delivery

## Deferred Inputs / Non-goals
- Discoverability and chaining actions on match rows are deferred to `05-match-discoverability-and-transition-chaining.md`
- Do not redesign bucket tabs or match-detail behavior in this contract
- Do not alter backend scoring or add new match fields unless the existing API truly lacks one of the requested columns

## Contract
```md
DEVDSL-1
MODE: STRICT
TASK_KIND: ui_change
FLAGS: NO_EARLY_STOP PATCH_ONLY(require_file_read=true) TEST_GATE(full, flake_policy=rerun_once, extend_on_new_failure=true) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Migrate the Matches tab table to the Browse-table interaction model and requested factor columns
SCOPE: Replace the current Matches tab table structure with a TanStack-driven table that supports the same resize and reorder affordances as the Browse table while exposing the exact requested factor columns in the requested order.
DO: Rework `MatchesPanel` to use the Browse-table interaction pattern from `TrackTable`, including column sizing state, draggable column order, resize handles, and overflow handling where needed. Map match fields to the requested labels as follows: `similarity_score -> Spectral`, `camelot_score -> Key`, `bpm_score -> BPM`, `genre_similarity_score -> Genre`, `freshness_score -> Recency`, `energy_score -> Energy (MIK)`, `mood_continuity_score -> Mood`, `instrument_similarity_score -> Instruments`, `vocal_clash_score -> Vocals`. Preserve bucket segmentation and loading/empty states.
NON_GOALS: Do not add extra default columns such as Track, Score, or action buttons unless the user revises the requirement; do not fold in row-click/detail discoverability work from contract 05; do not change scoring calculations.
AFFECTED_AREAS: `client/src/components/MatchesPanel.tsx`, shared styles used by table chrome, `client/src/types.ts` if field naming or typing adjustments are required, and client tests covering table rendering and interactions.
DEPENDENCIES: none, but execute before `05-match-discoverability-and-transition-chaining.md` to reduce overlap in `MatchesPanel`
VALIDATION: Add or extend client tests for the visible header labels/order and for column-resize / column-reorder behavior if practical at the component level. Manually verify the Matches table supports the same resizing and rearranging behaviors as Browse and that bucket switching still works with the new column set.
ACCEPTANCE: The Matches tab displays exactly these columns in the default order: `Spectral`, `Key`, `BPM`, `Genre`, `Recency`, `Energy (MIK)`, `Mood`, `Instruments`, `Vocals`; the table supports column resizing and column rearranging using the same interaction model as the Browse table; bucket tabs and loading/empty states still function; no scoring labels are misleadingly mapped to the wrong underlying field.
OUTPUT: schema=default
```

## Notes to Orchestrator
- Use `client/src/components/TrackTable.tsx` as the implementation baseline rather than inventing a second table system.
- This contract intentionally removes the current `Track` and `Score` columns from the default Matches grid. If that creates a usability blocker, escalate instead of silently reintroducing them.
