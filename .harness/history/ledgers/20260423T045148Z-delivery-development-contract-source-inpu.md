---
run_id: 20260423T045148Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-23T05:41:09.378554+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 84
regression_severity: MEDIUM
---
# Run Ledger

## Outcome
- Task: Restore the set-workspace remediation contract in `REMEDIATION_CONTRACT_A.md`: dual tracklist/pool visibility, correct node-based explorer routing, working Columns action, and removal of export `m3u8`.
- Result: The contracted A-lane behavior was fixed and verified. Both legacy and versioned workspaces now keep tracklist and pool zones visible together, explorer uses `ExplorerNodesView` instead of the removed derived path, the selected candidate is visually marked, the Columns control opens its popover, and the export affordance is removed.
- Scope: Narrow to the client workspace remediation, with one important caveat: the delivered diff also carried `WorkspaceHeader` and `WeightControls` changes that belong to the deferred B lane, so the run closed with a breaker-created follow-on instead of same-run cleanup.

## Key Decisions
- Decision: Accept the A-lane functional fix as complete once review, QA, design QA, build verification, evaluation, and regression checks all cleared the contracted behavior.
  - Why: Review marked all 11 acceptance criteria met, QA and design QA both passed, build verification passed, and evaluation scored `84` against an `80` threshold.
  - Tradeoff: The run ships with non-blocking cleanliness debt rather than reopening implementation after verification.
- Decision: Do not fold breaker findings back into the same run.
  - Why: Bad-state review concluded the remaining risk was post-verification scope drift and thin regression protection, and repo policy prefers breaker findings to become a fresh contract/run.
  - Tradeoff: Resolution is split across two runs, but auditability and scope discipline are preserved.

## Verification Learnings
- Green evidence was strong for the contracted behaviors: review approved, QA passed, design QA passed, build verification passed, and the evaluator cleared threshold.
- The strongest proof came from combining focused rendered-HTML tests with live DOM inspection on the running app; together they covered dual-zone layout, explorer levels with no edges, Columns popover visibility, and export absence.
- High test counts can still false-green UI structure. Breaker found that AC2 split-layout structure, the legacy empty-explorer path, and selected-node specificity were not regression-hardened despite the full suite being green.
- An ad hoc `vitest` invocation outside the project’s expected environment produced misleading DOM failures; the contract command (`cd client && npx vitest run`) was the reliable source of truth.

## Product / Stakeholder Learnings
- The user-facing regression that mattered most was structural, not visual polish: a workspace that hides the pool, sends users to the wrong explorer surface, or exposes dead actions feels broken even when most UI still renders.
- For this workflow, “Columns works” only needed a visible, reachable configuration surface in the active header; persistent column-state behavior remained acceptable to defer.

## Technical / Architecture Learnings
- The clean architectural fix was to restore a unified split layout that always renders the pool zone and swaps only the top tracklist surface by context, rather than branching the whole workspace composition by `activeVersion`.
- Explorer correctness depended on routing both legacy and versioned flows onto the same node-based surface and treating the flat derived view as non-canonical for this workflow.
- Fallback-heavy UI logic and point-in-time DOM QA need complementary structural tests; otherwise empty-data paths and selection logic can regress without breaking broad green suites.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: When breaker findings arrive after verification and the core contract already passes, route them into a new contract/run instead of quietly extending the original lane.
- Scope: subsystem-specific
  - Guidance: For set-workspace UI changes, pair live DOM verification with targeted structural tests for layout containers, empty-data explorer states, and selection specificity; presence-only assertions are not enough.
- Scope: subsystem-specific
  - Guidance: Keep `REMEDIATION_CONTRACT_A` and `REMEDIATION_CONTRACT_B` ownership separate around `WorkspaceHeader`, `WeightControls`, and shared CSS to avoid parallel-lane merge conflicts and ambiguous source of truth.

## Deferred / Follow-up
- Breaker follow-on created: `20260423T053937Z-delivery-development-contract-source-inpu`, sourced from `BREAKER_FOLLOW_ON_CONTRACT.md`, to isolate B-lane scope drift and add the missing regression tests for AC2, AC3, and AC5.
- Explicitly deferred from this run: cleanup or ownership isolation for `WorkspaceHeader` / `WeightControls`, stronger structural explorer/layout tests, and other WATCH items such as functional Columns wiring and dead-code cleanup.
