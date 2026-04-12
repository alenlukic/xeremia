---
run_id: 20260412T191001Z-delivery-re-imagine-explorer-as-a-100x5-g
mode: delivery
published_at: 2026-04-12T20:41:13.265606+00:00
qa_verdict: PASS_WITH_NOTES
build_status: CONDITIONAL
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 84
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Replace the Explorer freeform SVG canvas with a deterministic `100 x 5` grid while preserving tree scoping, edge behavior, and core node actions.
- Result: Delivered and verified as a fixed-grid Explorer with exact-slot placement support, scrollbar navigation, and preserved edge-score/tree workflows; quality gate passed (`PASS`, score `84`) with follow-on notes.
- Scope: Explorer UI architecture, Explorer DnD target migration, exact-slot backend/client plumbing for `explorer_add_node`, and focused regression coverage.

## Key Decisions
- Decision: Replace the canvas/tree surface with an `ExplorerGrid -> Level -> Cell` hierarchy and render all `100 x 5` slots regardless of node count.
  - Why: The grid needed stable geometry, deterministic slot addresses, and UI behavior based on `(level, col_index)` rather than freeform coordinates.
  - Tradeoff: More always-rendered UI surface in exchange for simpler placement semantics, predictable layout, and easier future grid-based behavior.
- Decision: Make `(level, col_index)` the canonical slot key and extend `explorer_add_node` with optional `col_index`.
  - Why: Exact cell drops and cell-local add flows are only real if the backend can honor a requested slot instead of auto-picking the first free column.
  - Tradeoff: Slightly broader API/service surface and validation logic in exchange for true slot-authoritative placement; backward-compatible first-free fallback remains when `col_index` is omitted.
- Decision: Migrate Explorer placement to `drop-explorer-cell-${level}-${colIndex}` and reject occupied-cell overwrite.
  - Why: Grid placement must target a specific slot; old explorer-wide, node-wide, and level-wide drop targets no longer match the interaction model.
  - Tradeoff: Simpler and safer DnD semantics, but any flow still relying on implicit placement must be updated explicitly.
- Decision: Enforce fixed overlay stacking for grid work: edges at `z-index: 1` with container `pointer-events: none`, cells at `z-index: 2`, drag preview at `z-index: 3`.
  - Why: Edge visuals and hit targets must not block cell buttons, add affordances, or hover actions.
  - Tradeoff: Overlay work must follow stricter layering discipline instead of ad hoc pointer-event patches.
- Decision: Use a static title-length threshold (`40` chars) to choose `48px` vs `60px` node height.
  - Why: The heuristic was fast to implement, stable enough for this run, and good enough to unblock edge-anchor math and wrapped-title rendering.
  - Tradeoff: Simpler but imprecise compared with measured layout; future refinement may need real measurement if title behavior becomes more dynamic.

## Verification Learnings
- Live QA and design QA both confirmed the delivered Explorer as a true `100 x 5` DOM surface with `500` cells, `overflow: auto`, exact `48px`/`60px` node heights, no extra canvas margin, and no edge-layer click interference.
- The most reusable scrollbar rule is structural: size the scroll content to exactly `100` levels by `5` columns and rely on `overflow: auto`; do not reintroduce canvas-style margin or pan/zoom padding.
- Breaker review surfaced the main remaining contract gap: `handleChildSelect` still omits `colIndex`, so child-add falls back to backend first-free placement instead of exact slot targeting.
- Regression risk was judged low overall, but test-hardening remains the main blind spot around explicit `colIndex` pass-through, dedupe bypass for explicit placement, and `nodeHeight()` / `node-wrapped` coverage.
- Pre-existing TypeScript test/build debt remains outside this run: `App.test.tsx` (`TS2307`) and `SetPoolTable` / `SetTracklist` (`TS2322` / `TS2741`) still need a separate maintenance contract.

## Product / Stakeholder Learnings
- The fixed-grid Explorer is easier to reason about when empty state, partial state, and populated state all use the same surface. Future Explorer work should prefer stable affordances over context-dependent layout changes.
- Occupied-cell drops should warn and no-op rather than silently overwrite. Predictable failure is better than “helpful” relocation in a slot-based workflow.
- Child-add now stands out as the main UX inconsistency because sibling add and drag/drop are slot-aware while child-add still auto-assigns. That inconsistency is noticeable enough to justify a P1 follow-on.

## Technical / Architecture Learnings
- Grid-based Explorer work is cleaner when slot identity is persisted, not inferred. Freeform rendering logic was replaced successfully once `(level, col_index)` became the shared client/server contract.
- The backend slot contract is: accept optional `col_index`, reject values outside `0..4`, reject occupied requested slots, and fall back to first-free only when the caller omits `col_index`.
- DnD migration should be treated as complete: `drop-explorer-cell-${level}-${colIndex}` is the only Explorer placement target, and old Explorer drop IDs should stay retired unless a new contract explicitly reintroduces them.
- Overlay-heavy grid components should reuse this z-index pattern rather than inventing local exceptions: edge SVG beneath cells, pointer-events disabled on the overlay container, targeted hit areas opting back in only where needed.
- Static height heuristics can be acceptable when they also drive anchor math and CSS classing, but they need regression tests because changing the threshold alters both visual wrapping and edge geometry.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For Explorer and similar grid surfaces, treat `(level, col_index)` as the canonical persisted address and keep the full matrix rendered even when many cells are empty.
- Scope: subsystem-specific
  - Guidance: Exact-slot UI actions must pass `colIndex` end-to-end; any flow that omits it implicitly opts into first-free placement and should be considered a separate behavior, not an equivalent shortcut.
- Scope: repo-wide
  - Guidance: For interactive overlays, keep visual layers and hit-testing separate. Default overlay containers to `pointer-events: none`, then opt individual interactive elements back in.
- Scope: subsystem-specific
  - Guidance: Scroll containers should own navigation for large deterministic surfaces. Size content to the real geometry and avoid leftover canvas margin, drag background, or pan/zoom scaffolding.

## Deferred / Follow-up
- P1 follow-on: make child-add slot-aware so `handleChildSelect` passes a concrete `colIndex` instead of relying on first-free backend placement.
- Maintenance follow-on: fix the unrelated TypeScript test/build failures in `App.test.tsx`, `SetPoolTable`, and `SetTracklist` under a dedicated maintenance contract rather than folding them into Explorer delivery work.
- Test-hardening follow-on: add explicit coverage for hook-level `colIndex` forwarding, dedupe bypass when `colIndex` is present, and the `40`-character node-height threshold / `node-wrapped` class behavior.
