---
run_id: 20260408T214806Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-09T01:11:37.623814+00:00
qa_verdict: PASS
build_status: CONDITIONAL
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 85
regression_severity: MEDIUM
---
# Run Ledger

## Outcome
- Task: Deliver the contracted React/TypeScript UI changes for sortable Matches/Browse columns, relocated `+ Set` affordances, restored `SCORE`, and a dedicated `DETAILS` column.
- Result: Run 1 completed successfully: evaluation `PASS` (85 / B), review `APPROVED`, QA `PASS`, and Design QA `PASS_WITH_NOTES`. Build verification remained `CONDITIONAL` because repo-wide pytest still contained two pre-existing unrelated backend failures. Breaker, design, and regression findings were non-blocking and were preserved as a separate breaker-driven follow-on contract rather than reopened in the completed run.
- Scope: Narrow client-side table and search-bar UI work, plus directly related styling and E2E updates, centered on `MatchesPanel`, `TrackTable`, `SearchPanel`, and `App`.

## Key Decisions
- Decision: Add sorting through the existing TanStack column/state model instead of refactoring table architecture.
  - Why: This preserved resize, drag-reorder, show/hide, and row-selection behavior while adding sortable headers to both tables.
  - Tradeoff: Shared table state became a higher regression-risk surface, so coexistence had to be validated explicitly.
- Decision: Accept Run 1 once the core contract passed live QA and review, while leaving small UX/testing gaps to follow-on work.
  - Why: The remaining issues were narrow, non-blocking, and did not invalidate the shipped sortable-column / `+ Set` relocation outcome.
  - Tradeoff: The run closed with acknowledged polish and regression-coverage debt instead of full verification cleanliness.
- Decision: Preserve breaker/design/regression concerns as a breaker-driven follow-on contract instead of broadening the accepted run.
  - Why: Repo policy favors auditability and narrow remediation over silently folding adversarial findings back into the original delivery.
  - Tradeoff: Completion requires reading both the accepted run and the follow-on contract to understand the full remediation path.

## Verification Learnings
- Live-stack QA was the decisive evidence for this UI-heavy run: search responsiveness, filter responsiveness, match loading, cache population, and API health were all validated against the real stack.
- Automation lagged the delivered behavior: the passing E2E suite did not directly assert the new three-click sorting cycle, neutral sort affordance, or Browse-table regression paths.
- `CONDITIONAL` build verification can be acceptable for a UI-only run when live-stack gates pass and failing repo-wide tests are clearly evidenced as pre-existing and unrelated, but it should remain an exception.
- Verification artifacts must be cross-checked rather than trusted in isolation; this run depended on reconciling evaluator, QA, build-verification, breaker, and regression outputs to reach the right completion call.

## Product / Stakeholder Learnings
- Active-set actions should render only in active-set contexts; a disabled or no-op `+ Set` affordance still creates misleading UX.
- Small table affordances affect perceived completeness: blank action-column width in no-set state and missing neutral sort indicators were treated as legitimate follow-on items, not noise.

## Technical / Architecture Learnings
- For existing TanStack tables, the lowest-risk way to add sorting is to keep the current column-order/personalization model as the source of truth and explicitly opt action columns out of sorting.
- No-active-set behavior is a first-class state for this UI surface; it should be treated as a separate verification path, not an incidental empty-state detail.
- Breaker, design, and regression outputs worked as intended here: they surfaced real issues without overturning the accepted run and fed a narrow remediation contract.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Do not treat any single summary artifact as the source of truth when gate artifacts disagree; reconcile evaluator, QA, build-verification, breaker, and regression outputs before declaring completion.
- Scope: repo-wide
  - Guidance: When breaker findings are non-blocking but actionable, preserve them as a separate follow-on contract instead of reopening the accepted run.
- Scope: subsystem-specific
  - Guidance: For `MatchesPanel` and `TrackTable` changes, verify sorting together with resize, drag-reorder, column visibility, and no-active-set layouts because these behaviors share state and can regress together.
- Scope: subsystem-specific
  - Guidance: New UI controls tied to active-set workflows should be conditionally rendered, not merely disabled or implemented as no-ops.

## Deferred / Follow-up
- Breaker-driven follow-on contract already captures the non-blocking remediation scope for Run 1.
- Prioritized follow-on items are: restore the active-set render guard for the search-bar `+ Set` button, remove the blank `add_to_set` column in no-set table states, add the neutral `⇅` sort indicator, and add targeted E2E coverage for Matches sorting and Browse-table behavior.
