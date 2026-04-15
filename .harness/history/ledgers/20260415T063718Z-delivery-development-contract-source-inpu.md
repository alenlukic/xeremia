---
run_id: 20260415T063718Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-15T07:58:33.396786+00:00
qa_verdict: PASS_WITH_NOTES
build_status: FAIL
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 60
regression_severity: HIGH
---
---
ledger_schema_version: 2
tags: []
recommendation_ids: []
---

# Run Ledger

## Outcome
- Task: Deliver persistent set-scoped pool subgroups with many-to-many pool-track membership, persisted naming/order, hydrated API support, and pool UI management per `DEVELOPMENT_CONTRACT_3.md`.
- Mode: delivery
- Result: blocked/superseded evidence, not a clean ship unit
- Scope: the subgroup feature reached working runtime QA after two narrow same-run remediations, but mixed ship-gate results and breaker-elevated follow-on work prevented clean finalization.
- Key files changed: backend subgroup models, set-workspace service and API layers, client types/API/hooks/UI/tests, and a dedicated subgroup migration script.
- Follow-on runs:
  - `20260415T075224Z-delivery-development-contract-source-inpu`

## Key decisions
- Remediate only explicit same-run gate failures instead of broadening the run.
- Activate subgroup tables with a dedicated migration while keeping startup behavior unchanged.
- Route breaker findings into a fresh follow-on run instead of folding them into this parent run.

## Verification and breaker
- Tests/build:
  - subgroup backend tests, set-workspace tests, full backend suite, and backend lint all passed
  - targeted frontend subgroup tests passed
  - `BUILD_VERIFICATION.md` failed because the frontend production build/typecheck is not in a clean shippable state
- Breaker stack summary:
  - core subgroup runtime flow worked after schema activation
  - breaker raised important unresolved findings on subgroup set-scoping and reorder validation
- Verification gaps:
  - evaluator failed at `60/80`
  - regression detector reported `HIGH` severity because the parent diff includes broader ambient workspace changes

## Bad-state signals
- procedural bad-state blockers were resolved by reconciling stage history, retry artifacts, and follow-on linkage
- remaining blockers are substantive run outcomes, not orchestration drift

## Token efficiency notes
- Approx context size: large; `PATCH.diff` and multiple verification artifacts dominated the manifest
- Optimizations used: contract-first planning, diff-aware replanning, narrow same-run remediations, and breaker follow-on routing instead of further same-run churn

## Durable learnings
- persistent backend-backed UI features must include explicit schema activation evidence, not just model and test changes
- targeted QA can pass while ship readiness still fails on build, evaluation, regression, or breaker gates
- set-scoped many-to-many APIs need ownership validation and exact reorder-payload validation before being considered stable
- ambient diff growth materially lowers evaluator and regression confidence even when the feature lane itself works

## Deferred or follow-up
- linked follow-on run `20260415T075224Z-delivery-development-contract-source-inpu` was created from `BREAKER_REPORT.md`
- that follow-on is intended to fix subgroup set-scoping validation and reorder request validation
- the parent run should be referenced as evidence of runtime viability plus unresolved ship-gate concerns, not as a final successful delivery
