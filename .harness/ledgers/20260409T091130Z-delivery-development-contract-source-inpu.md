---
run_id: 20260409T091130Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-09T10:49:42.345264+00:00
qa_verdict: PASS_WITH_NOTES
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: CONDITIONAL
eval_score: 73
regression_severity: NONE
---
# Run Ledger

## Outcome
- Task: Replace the client-local set builder with a persisted set workspace spanning PostgreSQL schema, service/API layers, typed client bindings, and Set/Explorer UI flows.
- Result: Functional full-stack delivery landed across 5 new models, a migration, service-layer orchestration, 10+ set-workspace endpoints, 4 new React components, and dual add-entry updates; final evaluator verdict was `CONDITIONAL` at `73/100` because security hardening and several interaction-proof tests were deferred.
- Scope: One coherent set-workspace slice only; no legacy localStorage migration, no collaboration/export redesign, and no broader graph-editor expansion beyond the contract.

## Key Decisions
- Decision: Align new table/model sequence naming with the migration-owned `<table>_id_seq` pattern.
  - Why: A model/migration mismatch (`dj_set_seq` vs `dj_set_id_seq`) broke live set creation until both sides used the same sequence contract.
  - Tradeoff: Migration-defined naming is less ad hoc than model-local defaults, but it prevents ORM/schema drift on new tables.
- Decision: Keep service writes on the custom DB session abstraction and add `flush()` to that wrapper instead of bypassing it.
  - Why: Set creation needed generated IDs before response assembly; missing `flush()` in the custom session caused real runtime failure.
  - Tradeoff: The wrapper must track more SQLAlchemy surface area, but repo session usage stays consistent and service code avoids raw-session escapes.
- Decision: Fix hydration by batching track serialization instead of row-by-row lookups.
  - Why: Broad review flagged the original hydration path as an N+1 risk; the batched serializer removed a P0 correctness/performance concern.
  - Tradeoff: The serializer/query layer became slightly more explicit, but hydration cost is predictable and scales better.
- Decision: Keep foreign-key intent in SQLAlchemy models even when the migration already creates the constraints.
  - Why: Broad review required explicit `ForeignKey` declarations so ORM metadata, joins, and future reviewers can see relationship intent directly in the model layer.
  - Tradeoff: There is some duplication between models and migrations, but the schema contract is clearer and less fragile.

## Verification Learnings
- Live API checks and targeted automated suites were enough to prove the main persistence and mutation paths, but browser-level re-execution did not cover every explorer interaction permutation.
- Test confidence remained weaker than the green suite suggested: the breaker called out missing receive-side drag/drop proof, shallow sibling-add coverage, shallow delete-modal coverage, and no real edge-score path test.
- Security verification surfaced a trust-boundary regression rather than a functional bug: widening CORS-exposed methods to `POST`/`DELETE` under wildcard origins materially changed risk even though feature behavior passed.

## Product / Stakeholder Learnings
- The Set/Explorer split plus dual `Add to Pool` / `Add to Tracklist` actions is a workable replacement for the old single-action local builder without requiring legacy data migration.
- Explorer editing remains the highest-risk user workflow in this feature family; it needs stronger interaction proof than table/search CRUD paths because correctness depends on multi-step UI choices.

## Technical / Architecture Learnings
- Large full-stack deliveries in this repo are sensitive to schema-contract drift: sequence names, ORM FK declarations, and session-wrapper capabilities all need to be verified together, not in isolation.
- The custom session abstraction must expose the SQLAlchemy transaction primitives that new service code depends on; `flush()` became mandatory once parent rows were created and read back within one transaction.
- Frontend type/build verification caught real delivery issues that tests did not, including invalid SVG `title` props; keeping the production TypeScript build in the verification loop is necessary for UI-heavy changes.
- Batch hydration is the preferred pattern for any workspace response that fans out from membership rows to track payloads; per-entry hydration invites N+1 regressions quickly.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: For new persisted tables, treat the migration as the source of truth for sequence naming and keep ORM defaults aligned to the exact created sequence name, typically `<table>_id_seq`.
- Scope: subsystem-specific
  - Guidance: When using the custom DB session wrapper in service code, confirm it exposes `flush()` before implementing create-and-hydrate flows that need generated primary keys mid-transaction.
- Scope: repo-wide
  - Guidance: Add explicit `ForeignKey` declarations in SQLAlchemy models even if the migration already applies the constraint; model-only omission is likely to be flagged in review.
- Scope: subsystem-specific
  - Guidance: Hydrating pool/tracklist/explorer responses should batch dependent track lookups and serialization rather than resolving each row independently.
- Scope: repo-wide
  - Guidance: Treat full-backend-suite red status carefully in this repository because pre-existing failures can coexist with a passing delivery slice; isolate new feature tests and note unrelated failures explicitly.

## Deferred / Follow-up
- Security hardening was intentionally deferred to the follow-on contract at `.harness/contracts/2026-04-09/set-workspace-security-hardening.md`, covering wildcard CORS tightening and bounds on edge-score request size.
- Add targeted follow-up tests for explorer receive-side drag/drop, full sibling-add interaction, delete-modal selective rewire payloads, and the real edge-score path so green tests better match contract confidence.
