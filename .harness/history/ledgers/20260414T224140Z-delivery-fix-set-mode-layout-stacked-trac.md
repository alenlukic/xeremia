---
run_id: 20260414T224140Z-delivery-fix-set-mode-layout-stacked-trac
mode: delivery
published_at: 2026-04-15T00:05:26.941717+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 80
regression_severity: MEDIUM
---
# Run Ledger

## Outcome
- Task: Deliver the Set Mode two-column layout (`37%` / `63%`, left `50%` / `50%` stack), remove the row above the split, reduce Explorer node/text size by `25%`, and fix the Explorer edge-offset bug.
- Result: Delivered and verified. QA, Design QA, and Build Verification all passed after a narrow retry that fixed the long-title edge-anchor mismatch.
- Scope: Contract scope was Set Mode / Explorer work under `client/src/`; the run also carried adjacent dirty-worktree changes outside that contract, which created audit noise but were not reopened in retry.

## Key Decisions
- Decision: Treat live DOM measurements as the source of truth for the edge-offset fix rather than relying on unit assertions alone.
  - Why: The user explicitly called out failed prior fixes, and the defect was a rendered-geometry problem.
  - Tradeoff: Verification cost was higher, but it produced decisive runtime evidence (`0px` anchor deltas) instead of another false green.
- Decision: Keep the retry narrowly focused on edge-height parity in `ExplorerEdgeLayer` instead of reopening Set Mode layout implementation.
  - Why: Review and second-pass planning showed the remaining failure was a mismatch between edge math and rendered title cleaning, not a fresh layout problem.
  - Tradeoff: Unrelated cleanup and carried-forward drift remained deferred, but the retry stayed minimal and evidence-based.

## Verification Learnings
- Live verification is decisive for visual-coordinate bugs: the final pass confirmed both prior failures in runtime (`0px` long-title edge deltas and `0px` Explorer overflow) and revalidated console, network, cache, responsiveness, and lifecycle gates.
- Passing tests were not sufficient on their own: a drag mock still used `36px` height while production nodes were `27px`, so green tests alone would have overstated confidence.
- Non-blocking breaker concerns still matter when they affect auditability or future trust in tests; they should be captured as follow-on work rather than folded back into a passing run.

## Product / Stakeholder Learnings
- The requested Set Mode shape is now a verified contract: no DockBar/header row above the split, exact `37%` / `63%` geometry, left-column `50%` / `50%` stacking, and Explorer filling the full right column.
- Non-Set UX changes can ride along in a dirty worktree without breaking the target feature, but they still create stakeholder risk until they are justified and verified under their own contract.

## Technical / Architecture Learnings
- The edge-offset bug came from using raw track-title height in `ExplorerEdgeLayer` while rendered cells use the `cleanTitle(...) -> nodeHeight(...)` path. Sharing that rendered-title height logic via `nodeHeightForTrack(...)` removed the long-title mismatch and restored exact anchor alignment.
- Explorer height overflow in flex layouts depends on explicitly resetting child `min-height`. The durable fix was `.set-mode-right .set-explorer { flex: 1; min-height: 0; }`, which lets the Explorer honor container height instead of the base `400px` minimum.
- Explorer coordinate and sizing behavior remains fragile while the same constants are duplicated across multiple files; this run stayed correct because parity was manually maintained, not enforced structurally.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: For UI geometry or rendered-position bugs, require live DOM verification as the deciding evidence; tests alone can miss coordinate mismatches and mock drift.
- Scope: repo-wide
  - Guidance: Narrow retry rounds should target the proven failure mechanism only. Use second-pass planning to avoid reopening already-correct layout work when the remaining issue is a smaller parity bug.
- Scope: repo-wide
  - Guidance: Dirty-worktree adjacent changes must be called out explicitly in the ledger and verification artifacts. If possible, isolate unrelated work before a narrow delivery run so the final diff does not blur contract scope.
- Scope: repo-wide
  - Guidance: Cross-cutting harness policy changes should not piggyback on a frontend-scoped contract unless the policy shift is explicitly intended, documented, and verified as a separate concern.

## Deferred / Follow-up
- Fix the `SetExplorerCanvas` drag mock to use production node height (`27px`) so drag-boundary tests stop signaling false confidence.
- Clean maintenance items surfaced by the run but not required for completion: dead wrapped-node path, dead `bpm` filter state, and duplicated Explorer coordinate constants.
- Formalize or isolate the carried-forward non-Set UX changes and the `.harness/control/` evaluator policy change in separate contracts so audit scope stays clean.
