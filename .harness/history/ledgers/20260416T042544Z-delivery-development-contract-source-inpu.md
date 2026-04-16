---
run_id: 20260416T042544Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-16T05:53:41.086794+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 84
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Deliver contract-1 pool subgroup UI rework for the client pool view.
- Result: Scoped delivery completed with review `APPROVE`, QA `PASS`, build verification `PASS`, evaluation `PASS` (84/80), and only low/non-blocking regression risk; breaker concerns were split into follow-on run `20260416T055156Z-delivery-development-contract-source-inpu`.
- Scope: Client-only pool subgroup navigation, `All`/`Groups` rendering, subgroup-tab behavior, grouped-section reorder behavior, and adjacent React tests.

## Key Decisions
- Decision: Keep this run scoped to contract-1 pool work and treat sibling-run edits as artifact contamination unless explicitly scope-filtered.
  - Why: Parallel runs touched nearby client files and ledger artifacts, and unfiltered `PATCH.diff` / `DIFF_STATS.json` would make diff-first review, regression, and evaluation untrustworthy for this run.
  - Tradeoff: Added artifact-curation overhead, but preserved contract-local evidence quality.
- Decision: Accept the verified delivery and spawn a breaker follow-on instead of reopening this run.
  - Why: Live QA, build verification, and evaluation all passed; breaker findings were important hardening items, not proof that the shipped contract behavior failed.
  - Tradeoff: Some visual/test debt remains deferred, but auditability and scope discipline were preserved.
- Decision: Reuse strong existing full-suite evidence and add fresh targeted runtime/build checks rather than rerunning every verification layer broadly.
  - Why: `TEST_REPORT.json` already showed 619/619 client tests and clean typecheck; fresh `build`, targeted `SetPoolTable` tests, and live DOM checks were enough to reconfirm the scoped UI behavior.
  - Tradeoff: Faster verification, but aggregate summary artifacts must be kept synchronized with the refreshed evidence.

## Verification Learnings
- Live Chrome DevTools validation on `http://localhost:5174` resolved the key behavioral question around subgroup creation: the new subgroup appended at the tail, the active tab stayed on `Groups`, scroll stayed stable, and no console errors/warnings appeared.
- The run had strong rendering/state coverage, but breaker review still exposed that the actual section drag handler and some tab-fallback/search-guard paths lacked interaction-level regression tests; live QA can prove current behavior while still leaving test-confidence gaps.
- In parallel-run conditions, detailed QA/build artifacts may be more trustworthy than stale aggregate summaries; final disposition should be reconciled from the current scoped evidence, not from outdated rollups.

## Product / Stakeholder Learnings
- `All` and `Groups` work better as stable top-level modes than as peers of subgroup tabs; making them visually distinct improves wayfinding without reducing subgroup access.
- Appending new subgroup tabs and grouped sections without auto-switching focus preserves the DJ's current working context and avoids disorienting jumps during curation.

## Technical / Architecture Learnings
- Modeling pool navigation as `PoolTab = 'all' | 'groups' | number` cleanly separates default modes from subgroup-specific behavior and keeps subgroup-only actions easy to gate.
- A nested `DndContext` for subgroup sections is a practical way to support vertical reorder behavior without interfering with broader drag/drop surfaces.
- Contract-visible visual treatments should not depend on undefined theme tokens; the `--bg-raised` gap showed that CSS logic can be correct while the rendered contract outcome is still missing.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: When sibling runs execute in parallel, regenerate run-local diff artifacts from scope-filtered sources before diff-first review, regression, or evaluation.
- Scope: repo-wide
  - Guidance: If live QA/build/eval pass and breaker findings are non-blocking, convert them into a fresh follow-on run instead of patching the original delivery opportunistically.
- Scope: subsystem-specific
  - Guidance: For pool UI work, pair broad React rendering coverage with at least one interaction-level regression check for DnD handlers and active-tab fallback paths.

## Deferred / Follow-up
- Breaker follow-on run `20260416T055156Z-delivery-development-contract-source-inpu` was started to define `--bg-raised` and close targeted regression-coverage gaps for section drag reorder, active-subgroup deletion fallback, and `Groups`-tab search-add guarding.
- Lower-priority edge-case coverage noted by the breaker remains intentionally deferred so the follow-on stays narrow.
