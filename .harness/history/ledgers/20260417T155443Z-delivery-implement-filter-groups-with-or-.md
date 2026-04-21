---
run_id: 20260417T155443Z-delivery-implement-filter-groups-with-or-
mode: delivery
published_at: 2026-04-17T17:36:24.964932+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 87
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Implement full grouped OR browse filters across all in-scope per-track dimensions in the frontend-local track table flow.
- Result: Delivered grouped OR filtering for key, BPM min/max, artist, label, genre, and date-added min/max, while keeping free-text search as the sole global post-group narrowing step. Final artifacts show `QA PASS`, `Design QA PASS`, `Build Verification PASS`, evaluator `PASS`, and regression severity `LOW`.
- Scope: Narrow client-side change in `useTrackFilters`, `FilterBar`, `App`, styles, and focused frontend tests; no backend browse API, table architecture, or search redesign.

## Key Decisions
- Decision: Keep the feature entirely in the existing frontend-local browse filtering path.
  - Why: The contract explicitly scoped the work to grouped client filtering plus `filterCacheKey`-driven pagination behavior.
  - Tradeoff: Hook and UI state management became more complex, but the run avoided backend/API churn and preserved the broader browsing architecture.
- Decision: Move every in-scope browse dimension into group-owned state and apply AND-within-group / OR-across-groups semantics.
  - Why: The delivered feature needed true grouped browse logic across key, BPM, artist, label, genre, and date-added rather than a partial key/BPM-only variant.
  - Tradeoff: Empty-group handling, deduplication, and cache-key stability became critical correctness invariants.
- Decision: Keep free-text search outside the groups as a global narrowing pass after the grouped OR result is computed.
  - Why: QA and design QA both validated that search remains separate from group panels and preserves the existing global search mental model.
  - Tradeoff: The filtering model is intentionally asymmetric, so future browse-filter changes must preserve that distinction unless a new contract explicitly changes it.
- Decision: Treat breaker findings as follow-on hardening work, not same-run scope expansion.
  - Why: The refreshed artifacts show the delivered feature is functionally accepted, while breaker concerns focus on residual invariant coverage and cache-key hardening rather than a confirmed shipped defect.
  - Tradeoff: The run can publish as delivered, but maintenance safety depends on the spawned breaker follow-on closing the highest-value test blind spots.

## Verification Learnings
- For UI filtering work in this repo, final closure requires both focused automated coverage and live DOM/runtime validation; refreshed QA, design QA, and build verification artifacts were necessary to establish the true final state.
- `filterCacheKey` behavior is part of acceptance, not an internal detail: grouped-state changes must reset pagination, and equivalent grouped states must remain stable enough to restore cached progress.
- Residual breaker concerns are primarily false-confidence risks: null-path handling, cache-key normalization/order independence, whitespace activation, and debounce-boundary behavior can regress without obvious failures unless they are directly tested.

## Product / Stakeholder Learnings
- Grouped browse filters are only successful if the OR semantics are visible in the UI. The group panels, OR divider, add-group affordance, remove controls, and clear/reset state were all acceptance-critical behavior, not cosmetic polish.
- Preserving baseline browse behavior when no grouped criteria are active is a product requirement. Users should be able to ignore grouped filtering without changing the normal table-browsing experience.
- Free-text search remaining global is an important UX invariant: it continues to narrow the already grouped result set instead of becoming another per-group field.

## Technical / Architecture Learnings
- Grouped browse logic in this subsystem should stay frontend-local unless a future contract explicitly widens scope; the current delivery demonstrates the existing client path can support richer OR grouping without backend changes.
- Deduplication is safest when the OR result is produced from a single pass over tracks rather than concatenating per-group results.
- Cache-key serialization must reflect filter semantics closely enough to avoid spurious pagination resets for equivalent grouped states; this is now an explicit hardening target for follow-on work.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For browse-filter enhancements, prefer extending the existing client-side hook/UI path and preserve the `filterCacheKey` pagination contract unless backend expansion is explicitly approved.
- Scope: subsystem-specific
  - Guidance: When filter groups can be empty or partially filled, add explicit invariant tests so inactive or whitespace-only inputs cannot silently behave as wildcard OR matches.
- Scope: repo-wide
  - Guidance: If refreshed QA/build/design evidence is green but breaker findings expose residual test-confidence gaps, publish the accepted delivery and spawn a dedicated breaker follow-on rather than broadening the original run.

## Deferred / Follow-up
- Breaker follow-on hardening was intentionally separated from the accepted delivery. The follow-on contract targets null-path coverage and cache-key normalization/order-independence without reopening the shipped grouped-OR feature scope.
- A breaker-driven follow-on run was spawned for residual invariant hardening: `20260417T173415Z-delivery-development-contract-source-inpu`.
