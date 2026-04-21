---
run_id: 20260421T153817Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-21T17:00:29.115845+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 50
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: Deliver Phase C backend foundation for versioned set tracklists (`TECH-01`, `TECH-02`, `TECH-08`): new ORM models, additive schema/data migrations, and hydrated `versions` reads.
- Result: Landed the new version/slot/candidate model and nested hydration shape; breaker-raised gaps were remediated (`level` added, `track_id` delete behavior changed to `SET NULL`, idempotence hardened, migration tests added). Focused backend verification passed, but rollout sequencing still required a follow-on write-path contract.
- Scope: Backend-only additive change. Legacy `SetTracklistEntry` remained in place; no frontend changes and no version mutation endpoints were added.

## Key Decisions
- Decision: Ship the new tracklist model as an additive layer instead of replacing `SetTracklistEntry`.
  - Why: The contract required safe backfill and compatibility during rollout, and the repo uses standalone migration scripts rather than an Alembic cutover.
  - Tradeoff: Reads could move to `versions` before writes were migrated, creating a temporary split-brain risk that had to be handled as follow-on work.
- Decision: Keep derived explorer nodes computed in hydration instead of persisting them to `SetExplorerNode`.
  - Why: The contract explicitly wanted read-only projections from version/slot/candidate state.
  - Tradeoff: Hydration logic became more responsible for schema parity, including derived fields like `level`, `position`, `col_index`, and selection metadata.
- Decision: Preserve candidates when source tracks are deleted by using nullable `track_id` with `ON DELETE SET NULL`.
  - Why: The required API shape was "candidate plus `track: null` if the track row no longer exists," which is incompatible with cascading candidate deletion.
  - Tradeoff: Consumers must tolerate candidates whose track reference is absent.
- Decision: Treat pre-migration safety as a first-class deployment concern by returning `versions: []` when version hydration cannot run yet.
  - Why: This allowed safe deploy ordering before the new tables existed everywhere.
  - Tradeoff: The API temporarily under-reports version data until migrations complete, so deploy sequencing still matters.

## Verification Learnings
- Breaker/QA were valuable here because the first pass missed contract-shape details (`level`), migration resilience (partial-state idempotence), and migration/API coverage.
- Idempotence checks for backfills must validate completeness, not just existence of a parent row; a shallow "version exists" guard can preserve broken partial state.
- SQLite-focused tests were good for logic coverage but weak evidence for FK semantics and PostgreSQL-specific nullable-unique behavior; this run relied on schema review rather than a live PostgreSQL migration exercise.

## Product / Stakeholder Learnings
- Rollout safety beat completeness for this phase: additive schema, preserved legacy reads/writes, and no frontend coupling were the right scope boundaries for foundation work.
- The split between "new reads" and "legacy writes" is a product-facing sequencing risk, not just a technical cleanup item; versioned payloads should not be treated as fully live until write paths are migrated too.

## Technical / Architecture Learnings
- `explorer_tree_id` as nullable unique on `SetTracklistVersion` is a good fit for the "optionally bound version" model and relies on PostgreSQL's multiple-`NULL` behavior.
- Derived explorer nodes should map directly from slot/candidate structure: `level` from slot position, `col_index` from candidate order, and selection state from candidate flags.
- Backfill safety benefited from comparing migrated slot counts against legacy entries rather than assuming any existing `v1` row is valid.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For additive data-model migrations, keep schema creation and backfill in separate repo-native migration scripts so they can be reviewed, retried, and tested independently.
- Scope: repo-wide
  - Guidance: If a new read model is introduced before write paths are migrated, call out the split-brain risk explicitly and treat follow-on write-path work as release-blocking sequencing, not optional cleanup.
- Scope: subsystem-specific
  - Guidance: When hydrating computed projections that mirror persisted entities, test the full response shape at both service and API layers; parity bugs hide in omitted fields more easily than in missing rows.

## Deferred / Follow-up
- Migrate tracklist write paths from `SetTracklistEntry` to the new version/slot/candidate tables (handled in Contract 5).
- Add `(version_id, position)` uniqueness on `SetTracklistSlot` if duplicate slot positions become a realistic source of ambiguity.
- Add deterministic candidate ordering in hydration/query paths so derived `col_index` is stable by contract, not by current DB behavior.
