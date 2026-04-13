# Development Contract

## Source Inputs
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/CONVENTIONS.md`
- `.harness/runs/20260412T-product-thought-partner-client-features/PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User-resolved sequencing and scope directions from the 2026-04-12 contract request

## Selected Intent
- delivery

## Contract Driver
- product-driven

## Selected Recommendation IDs
- `R2`

## Deferred Inputs / Non-goals
- No undo flow after confirm
- No partial-clear variants such as "clear unstarred only"
- No changes to Explorer data or semantics
- No movement between Pool and Tracklist during clear operations
- No broader set-management redesign beyond the two clear actions

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Add the smallest coherent bulk-clear workflow for the active set's Pool and Tracklist surfaces only, spanning the existing set-workspace API and client UI, while preserving current Explorer behavior and all other set semantics.
DO: Introduce one batch-clear operation for Pool and one for Tracklist; expose them through dedicated set-workspace API routes; add header-level "Clear All" actions with confirmation dialogs that include the exact item count and target surface; update client state immediately after a successful clear so table contents and set counts stay in sync; keep the semantics strict so clearing Pool removes pool entries only and clearing Tracklist removes tracklist entries only.
ACCEPTANCE: Pool and Tracklist each show a "Clear All" action only when their list has at least one entry; confirming the dialog issues exactly one batch API request for that surface; successful clear leaves the target table empty and updates all visible counts without reload; clearing Tracklist does not move tracks into Pool; clearing Pool does not alter Tracklist or Explorer nodes/edges; cancel leaves data unchanged; empty-state surfaces do not expose an active clear action; automated coverage verifies API semantics and client confirmation/update behavior.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`; recommended first in the four-contract delivery sequence

## Notes to Orchestrator
- Keep this contract narrow: it is the smallest standalone feature and should not absorb starring, playback, or explorer-tree work.
- Validation should cover set-workspace API behavior plus client confirmation-state transitions for both Pool and Tracklist.

