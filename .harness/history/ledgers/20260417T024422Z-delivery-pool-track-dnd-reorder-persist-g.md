---
run_id: 20260417T024422Z-delivery-pool-track-dnd-reorder-persist-g
mode: delivery
published_at: 2026-04-17T03:34:08.414680+00:00
qa_verdict: FAIL
build_status: FAIL
breaker_verdict: CONCERNS
eval_verdict: FAIL
eval_score: 79
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Pool manual reorder and persisted user sort for the set-workspace pool UI/API slice.
- Result: The implementation improved materially through one retry round and reviewer approval, but the run remains blocked because live verification is not cleanly closed and the verification/state artifacts do not agree on the current workspace state.
- Scope: Stayed narrow to the contracted pool reorder slice across the React pool UI, grouped custom sort behavior, set-workspace persistence path, and focused tests.

## Key Decisions
- Decision: Keep one persisted manual-order source of truth for pool reorder, refresh re-hydration, and grouped custom sort.
  - Why: The task explicitly required manual pool ordering to persist and be reusable as the grouped pool's custom/user-defined sort.
  - Tradeoff: This tied client affordances and backend persistence to the same order domain, so rank/boundary bugs affected multiple surfaces until remediated.
- Decision: Use ordered entry rank, not raw persisted `insertion_order`, for move targeting and UI boundary logic.
  - Why: Review round 1 and retry round 1 both exposed that real pool data can have empty rows and non-contiguous persisted order values, which broke index-based assumptions.
  - Tradeoff: The fix required normalizing persisted order after moves and aligning client disablement logic with the backend's effective order domain.
- Decision: After the retry fix, treat remaining gaps primarily as verification/artifact-reconciliation work, not open-ended same-run coding.
  - Why: `SECOND_PASS_PLAN.md` and `BAD_STATE_REPORT.md` both point to stale or contradictory QA/build/eval/state artifacts as the main blocker, while code scope remained task-shaped.
  - Tradeoff: Some breaker-overlapping test/API hardening items were left for explicit follow-on handling unless a human overrides the default policy.

## Verification Learnings
- Automated review and targeted tests were strong enough to catch an initial empty-row/order-domain bug and then validate the rank-based retry fix, but they were not sufficient to clear the run without fresh live evidence on real pool data.
- Live verification is the remaining gate: `QA_REPORT.md` still records `FAIL` because grouped/custom sort runtime proof is incomplete and the report still carries a failed live-verification verdict.
- The artifact set is internally inconsistent: `DESIGN_QA_REPORT.md` says `PASS_WITH_NOTES`, `BUILD_VERIFICATION.md` says `FAIL` because live DOM did not show the reorder controls, `EVAL_REPORT.json` still scores the run below threshold from an earlier verification state, and `BAD_STATE_REPORT.md` calls out stale bookkeeping plus contradictory gate artifacts.
- `REGRESSION_REPORT.json` is low-risk/non-blocking, which supports the conclusion that the blocker is verification integrity and artifact reconciliation rather than broad regression drift.

## Product / Stakeholder Learnings
- For this workflow, "manual order" is not just a local table affordance; it must survive refresh and be discoverable as the grouped pool's custom/user sort to feel like one coherent feature.
- Users will notice boundary-state mistakes even when the backend clamps invalid moves safely, so correct enabled/disabled affordances matter as part of feature credibility, not just polish.
- Preserving starred state, subgroup membership, and empty-row behavior is part of the feature contract; reorder cannot be treated as isolated list movement.

## Technical / Architecture Learnings
- Pool reorder logic must operate on ordered rank over actual pool entries, not raw persisted `insertion_order` values, because deletions and empty-row interleaving can leave gaps in the stored sequence.
- Boundary checks must use the same global order domain as persistence. Local subgroup counts or visible-row counts are not a safe proxy when persisted order is global.
- If the backend normalizes persisted order after real moves, the client should derive move targets from rank and then refresh from server state rather than trying to preserve its own numeric order model.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: In the set-workspace pool, derive reorder targets and button disablement from ordered entry rank/global pool-entry count, then normalize persisted `insertion_order` after moves.
- Scope: repo-wide
  - Guidance: Do not promote a UI-affecting delivery run when QA, build verification, evaluation, and state-summary artifacts were generated against different verification moments; rerun the live gates on the same workspace state and reconcile summary artifacts together.
- Scope: repo-wide
  - Guidance: Treat bad-state findings about stale stage bookkeeping as blocking when `RUN_LEDGER.md`, `RUN_SUMMARY.md`, or stage-result files no longer match the produced QA/build/eval artifacts.

## Deferred / Follow-up
- Re-run clean live-stack QA on the current workspace state and explicitly prove arrow reorder, pool DnD reorder, refresh persistence, grouped/custom manual-order behavior, and absence of normal-operation 4XX/5XX.
- Re-run build verification against the same live state and confirm the delivered reorder controls are actually present in the DOM.
- Regenerate `EVAL_REPORT.json` only after QA/build artifacts are refreshed, and reconcile stale run-state artifacts so the run no longer reports conflicting completion status.
- Unless a human explicitly overrides breaker policy, keep the remaining route/test hardening items identified in `SECOND_PASS_PLAN.md` as follow-on contract work rather than expanding this run further.
