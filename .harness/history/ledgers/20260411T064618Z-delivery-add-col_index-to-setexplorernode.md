---
run_id: 20260411T064618Z-delivery-add-col_index-to-setexplorernode
mode: delivery
published_at: 2026-04-11T07:13:13.399729+00:00
qa_verdict: FAIL
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: UNKNOWN
eval_score: 0
regression_severity: UNKNOWN
---
# Run Ledger

## Outcome
- Task: Persist a stable explorer `col_index` so add/delete node and add edge stop shifting unrelated explorer nodes horizontally and memoized explorer items can stay mounted.
- Result: The run added persisted `col_index` storage plus end-to-end API/frontend wiring, and it also confirmed that the remaining full-canvas churn was caused by `SetBuilder.tsx` unmounting the SVG subtree during `hydrateSet()` loading transitions rather than by `React.memo` itself.
- Scope: `set_explorer_node` migration/model/API/service wiring, `SetExplorerCanvas` layout/tests, and the `SetBuilder` loading gate behavior that affected explorer remounting.

## Key Decisions
- Decision: Persist `col_index` on `set_explorer_node` and assign new columns with the smallest-gap-first rule per level.
  - Why: Array-order-derived columns caused unrelated siblings to move whenever inserts or deletes changed level ordering.
  - Tradeoff: Deleted columns remain visually sparse, but gaps are filled on future inserts before extending farther right.
- Decision: Keep deletion non-compacting and backfill legacy rows with deterministic per-level ranks during migration.
  - Why: Existing explorer data needed stable separation immediately, and delete-time renumbering would reintroduce horizontal drift.
  - Tradeoff: Canvas width and right-edge calculations must respect sparse `col_index` values instead of relying on node counts.
- Decision: Remove the loading gate that unmounted the entire canvas in `SetBuilder.tsx` and reserve the loading message for the empty initial state only.
  - Why: `{activeSet && !loading && (...)}` tore down the SVG tree whenever `hydrateSet()` flipped `loading` to `true`, masking the real memoization behavior.
  - Tradeoff: The builder now keeps prior canvas content visible during refreshes, so any future loading UX changes should avoid subtree-level mount/unmount toggles.

## Verification Learnings
- Build verification passed with clean TypeScript, Vitest, pytest, and migration execution evidence.
- Chrome DevTools MutationObserver validation showed the memoization path was healthy once the canvas stopped unmounting: all 12 original nodes survived both add and delete flows with `0` mutations each.
- The durable verification lesson is that explorer performance checks need DOM-identity evidence, not only prop-level reasoning or unit coverage.

## Product / Stakeholder Learnings
- User-visible explorer stability depends on preserving DOM identity as much as preserving coordinates; a visually correct relayout still feels broken if the whole SVG remounts during routine hydration.

## Technical / Architecture Learnings
- Stable layout in the explorer should be persisted as data (`col_index`) rather than recomputed from transient array order.
- The actual root cause of the perceived full-tree rerender was parent-level subtree unmounting in `SetBuilder.tsx`, not a failure of `React.memo`.
- `React.memo` behaved correctly after the mount lifecycle was stabilized, so future performance debugging in this area should check parent conditional rendering before revisiting child memoization.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For explorer nodes, treat horizontal placement as persisted workspace state. Use stored `col_index` values and smallest-gap-first assignment instead of deriving columns from list position.
- Scope: repo-wide
  - Guidance: Before blaming memoization for render churn, first rule out parent conditionals that unmount and remount the entire subtree during loading or hydration.
- Scope: subsystem-specific
  - Guidance: Sparse layout indices are an accepted invariant in the set explorer, so width, rightmost-node, and edge-slot logic must use occupied indices rather than sibling counts.

## Deferred / Follow-up
- Audit adjacent Set workspace loading guards to ensure other panels do not hide subtree remounts behind `loading` conditionals during refreshes.
