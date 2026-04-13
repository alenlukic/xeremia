# Development Contract

## Source Inputs
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/CONVENTIONS.md`
- `.harness/runs/20260412T-product-thought-partner-client-features/PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User-resolved decisions from the 2026-04-12 contract request: set-scoped stars stored on `SetPoolEntry` and `SetTracklistEntry`

## Selected Intent
- delivery

## Contract Driver
- product-driven

## Selected Recommendation IDs
- `R1`

## Deferred Inputs / Non-goals
- No global library-wide favorites model
- No star controls on Explorer nodes in v1
- No star-based filtering or sorting in v1
- No ratings scale or metadata beyond a boolean starred state
- No expansion into cross-set recommendation or reporting workflows

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Add a set-scoped starring workflow for Pool and Tracklist membership only, persisted on `SetPoolEntry` and `SetTracklistEntry`, surfaced as interactive toggles in Pool and Tracklist and as read-only indicators in Browse and Matches for the active set.
DO: Add the minimal persistence and API surface needed to toggle `starred` on pool and tracklist membership rows; render star toggle controls in the first column of Pool and Tracklist tables with immediate visual feedback; expose derived star state in Browse and Matches whenever the track is already present in the active set; define the set-scoped behavior explicitly so if a track exists in both Pool and Tracklist, toggling the star in either surface keeps both membership rows aligned to the same boolean value for that set.
ACCEPTANCE: Pool and Tracklist rows each expose a star toggle that persists across reloads; toggling a star updates the correct set membership server-side and reflects immediately in the active surface; Browse and Matches show a read-only filled star when the active set contains the track in a starred state and an outline or no emphasis otherwise; if the same track is present in both Pool and Tracklist, the set-scoped star value remains synchronized rather than diverging by surface; no global favorites state is introduced; automated coverage verifies persistence, synchronization, and read-only indicator derivation.
OUTPUT: schema=default
```

## Ordering Constraints
- No hard dependency; recommended after `DEVELOPMENT_CONTRACT_3.md` and before `DEVELOPMENT_CONTRACT_5.md`

## Notes to Orchestrator
- Treat this as a set-workspace curation aid, not as the start of a reusable library-favorites subsystem.
- Validation should include backend persistence plus client behavior across Pool, Tracklist, Browse, and Matches.

