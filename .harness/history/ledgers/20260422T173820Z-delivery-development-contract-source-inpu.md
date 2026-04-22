---
run_id: 20260422T173820Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-22T18:15:41.946709+00:00
qa_verdict: FAIL
build_status: FAIL
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 92
regression_severity: UNKNOWN
---
# Run Ledger

## Outcome
- Task: Refactor the Phase C frontend foundation by decomposing `useSetBuilder`, adding typed Phase C models, and adding typed version/slot/candidate HTTP wrappers while preserving existing workspace behavior.
- Result: Core implementation was approved and appears directionally successful, but the run did not finish as a trustworthy terminal delivery record. `738/738` client tests passed and review approved the decomposition, yet completion was blocked by live-stack lifecycle failure, contradictory verification artifacts, and diff/stage bookkeeping drift.
- Scope: Intended scope was `client/src/` only. The durable scope notes are that the implementation centered on hook decomposition plus typed API plumbing, while the run also carried mild search-modal enablement drift and mismatched diff packaging.

## Key Decisions
- Decision: Keep `useSetBuilder` as a thin composition shim over focused hooks instead of forcing immediate consumer migration.
  - Why: This preserved the existing consumer surface while allowing the monolith to be split into workspace, tracklist, pool, and explorer responsibilities.
  - Tradeoff: The shim reduced delivery risk, but it also meant the promised provider/context shape was still deferred rather than fully landed.
- Decision: Add the Phase C HTTP wrappers and frontend interfaces in the same contract.
  - Why: Coupling the typed models with the new wire-layer wrappers reduced backend/frontend shape drift and made review easier.
  - Tradeoff: The wrappers compiled cleanly, but they shipped largely unconsumed and untested at runtime, so some risk was deferred to later UI contracts.
- Decision: Accept the structural refactor without broadening into full provider migration or deep test-suite restructuring.
  - Why: The contract was plumbing-first, and the lowest-risk path was to preserve behavior while moving ownership behind the current public API.
  - Tradeoff: Breaker findings remained around missing dedicated hook tests, missing wrapper tests, and the absence of a typed React context/provider surface.

## Verification Learnings
- A green composed test suite is not enough to certify a large hook decomposition. The run proved that passing behavior-level tests can coexist with missing dedicated hook coverage, zero wrapper coverage, and unresolved boundary assumptions.
- For UI-adjacent frontend refactors, completion evidence must include service lifecycle behavior, not just build, tests, and DOM checks. This run stayed blocked because the live stack did not shut down cleanly.
- Auditability is as important as correctness in the harness. When `PATCH.diff`, stage tracking, evaluator output, and run artifacts disagree about what happened, the run should be remembered as blocked even if the code itself looks acceptable.

## Product / Stakeholder Learnings
- Plumbing-first contracts should keep visible UX activation separate from internal refactors. The search trigger and modal enablement were low-risk, but they weakened scope accounting for a run whose main value was architectural groundwork.
- Preserving the existing set-workspace behavior during the decomposition was the right product choice. A compatibility-first refactor is easier to validate than a refactor that also asks users to absorb new Phase C workflow changes.

## Technical / Architecture Learnings
- The decomposition boundary was durable and sensible: workspace lifecycle, tracklist mutations, pool mutations, and explorer/tree mutations are viable long-term separations for the set-workspace state layer.
- A compatibility shim is a strong intermediate step for large hook refactors, but downstream contracts should not assume a provider/context surface exists unless that surface is explicitly delivered.
- Typed wrappers should be introduced alongside their model interfaces, then consumed and tested in a later narrow contract if the current run is intentionally plumbing-first.
- Dynamic import in stateful mutation paths is a needless sharp edge in this subsystem unless there is a clear loading reason; it complicates failure handling and makes refactor parity harder to reason about.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Do not treat a run as complete when the reviewed implementation, packaged diff, stage tracking, and verification artifacts do not agree; repair the evidence trail first.
- Scope: repo-wide
  - Guidance: For plumbing-first refactors, keep visible UX enablement in a separate contract unless the scope explicitly includes behavior activation.
- Scope: repo-wide
  - Guidance: For large module decompositions, preserve the old public entry point as a compatibility facade first, then land consumer-migration patterns such as context/providers in a follow-on run.
- Scope: subsystem-specific
  - Guidance: In the set-workspace client state layer, composition-level tests are necessary but insufficient; add focused hook tests and API-wrapper tests before treating the new seams as fully verified.

## Deferred / Follow-up
- Repair `src/scripts/start_web.sh` lifecycle handling so starting and stopping the live stack does not leave orphaned API/Vite processes or occupied ports.
- Rebuild `PATCH.diff`, `DIFF_STATS.json`, stage history, and evaluator/state artifacts so the run is auditable and reflects the actual reviewed implementation.
- Decide explicitly whether Phase C consumers require a typed React context/provider surface; if yes, scope that as a follow-on contract rather than assuming the shim satisfies it.
- Add focused tests for the extracted hooks and unit tests for the 12 new HTTP wrappers before Phase C UI work begins to depend on them.
- Verify `slotCreate()` request expectations before any UI starts calling it, even though the current backend schema appears to allow a missing `position`.
