---
run_id: 20260411T173219Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-11T19:51:51.028971+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 84
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Stabilize the backend cache lane by shrinking the oversized LRU regression test and adding transition-score cache reuse, invalidation, and admin observability.
- Result: Delivered and approved. Full backend verification passed, final lint-only remediation cleared the remaining `ruff check src/` gate, and QA confirmed live cache invalidation plus transition-score cache stats exposure.
- Scope: Backend/Python only for cache, routes, schemas, config/test lint cleanup, and related tests.

## Key Decisions
- Decision: Keep the transition-score work as a narrow backend cache layer keyed by `(source_track_id, candidate_track_id)` instead of redesigning scoring flows.
  - Why: The contract was cache reuse and observability, not scoring-formula or API redesign.
  - Tradeoff: Some improvement opportunities remain for broader cache-path integration coverage, but the delivery stayed low-risk and reviewable.
- Decision: Use whole-cache invalidation on `PUT /api/weights` rather than source-scoped eviction.
  - Why: Weight updates are global in the current API shape, so preserving other source entries would risk stale scores.
  - Tradeoff: Recomputations are broader after weight changes, but correctness wins over narrower reuse until the API can represent per-source updates.
- Decision: Close the run with a separate lint-only remediation instead of reopening the approved cache behavior.
  - Why: The remaining gate was `ruff check src/` in untouched files, not a backend logic defect.
  - Tradeoff: The run contains a final cross-file cleanup step, but the behaviorally significant backend work remained stable.

## Verification Learnings
- Passing `python -m pytest src/tests/ -v` is strong backend evidence for this repo, and this run closed with the full suite green (`608 passed`, `11 skipped`).
- For cache-oriented backend changes, live API checks matter in addition to unit tests: this run verified both `PUT /api/weights` cache flushing and `GET /api/admin/cache-stats` transition-score metrics against the running service.
- A reduced regression test can preserve confidence while removing operational drag: the LRU eviction coverage stayed intact while the targeted test now runs quickly enough to remain part of normal verification.

## Product / Stakeholder Learnings
- The current product contract favors safe global cache invalidation after weight changes over selective reuse. That is the right behavior until the API supports narrower update semantics.

## Technical / Architecture Learnings
- Adding a new cache attribute to a shared finder/service object creates an immediate compatibility contract for test doubles. Mocks must set cache attributes explicitly instead of relying on default `MagicMock` truthiness.
- `invalidate_source()` is presently future-facing infrastructure rather than active production behavior; the live system currently uses full cache clears for global weight changes.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: When route handlers or shared services start reading a new cache attribute, update all relevant mocks to use explicit `None` or realistic stubs so stats serialization and cache-hit paths do not accept accidental `MagicMock` values.
- Scope: repo-wide
  - Guidance: If a scoped backend run is already behaviorally approved, clear residual lint debt with a mechanical remediation pass rather than reopening the implementation decision set.
- Scope: repo-wide
  - Guidance: Treat run-level diff artifacts from a dirty worktree as audit-noisy. Use scoped file lists or a clean baseline when summarizing blast radius or publishing ledger-backed evidence.

## Deferred / Follow-up
- Add integration-level coverage for warm-path population and route-level cache read/write paths if this cache layer changes again.
- Either remove or document `invalidate_source()` as reserved API surface unless a future contract introduces per-source weight updates.
- Regenerate scoped diff artifacts from a cleaner baseline before using this run as a reference audit example.
