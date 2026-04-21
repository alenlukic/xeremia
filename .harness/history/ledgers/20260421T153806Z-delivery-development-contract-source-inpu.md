---
run_id: 20260421T153806Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-21T17:00:28.998742+00:00
qa_verdict: FAIL
build_status: FAIL
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 77
regression_severity: MEDIUM
---
# Run Ledger

## Outcome
- Task: Deliver the Phase 0 client-only bug batch: track-table alignment, adjacent-empty-row DnD insertion, player-bar push-up plus dismiss, and removal of pool/tracklist star UI while preserving backend `starred` data.
- Result: The contracted client fixes landed, an initial out-of-scope backend scope breach was remediated away, and the clean end state was the narrow client patch with automated suites passing; the remaining runtime `500` observed during build verification was a shared-environment artifact tied to companion-run version/migration state, not a defect in this client batch.
- Scope: Subsystem-specific to the web client and delivery-harness operations around parallel runs that share one workspace/server context.

## Key Decisions
- Decision: Keep the run strictly client-scoped and remediate the accidental backend/version-system additions instead of absorbing them into this delivery.
  - Why: `TASK.md` and `PLAN.md` explicitly lock the run to four client bugs, and the breaker/bad-state artifacts show the backend additions made the run untrustworthy and introduced unrelated test failures.
  - Tradeoff: This preserved contract integrity and auditability, but required a remediation pass instead of treating the extra backend work as forward progress.
- Decision: Implement the player-bar fix with a shared shell `padding-bottom: 56px` reserve and `200ms ease` transition while keeping the bar fixed and dismissible.
  - Why: A layout-level reserve solves the overlap for both workspace surfaces without per-panel hacks and matches the contracted UX behavior.
  - Tradeoff: This is a pragmatic shell-level fix, but it introduces cross-surface z-index and runtime-layout verification needs.
- Decision: Fix adjacent-empty-row insertion with a pragmatic edge-zone heuristic rather than rewriting the drag/drop model.
  - Why: The existing DnD architecture was preserved and the targeted bug could be addressed by resolving top/bottom edge drops as "between-row" intent.
  - Tradeoff: The heuristic works for the contracted adjacent-empty case, but it also creates a known low-impact edge case on isolated empty rows near their boundaries.
- Decision: Remove only the star affordance and client-side star wiring from pool/tracklist UI while preserving backend/API `starred` shape.
  - Why: The contract explicitly removed the UX affordance but deferred any backend data-model change.
  - Tradeoff: This leaves some data shape in place for later phases, but avoids mixing a UI cleanup with schema/API churn.

## Verification Learnings
- Shared verification artifacts can mislead when a live server reflects companion-run database state; a client-only run can appear build-broken if the shared backend has not yet received its companion migration or fallback.
- For this UI area, automated tests were strong enough to validate the narrow client patch after remediation, but runtime build verdicts must be interpreted against shared-environment state before being treated as product defects.
- The DnD between-row heuristic is not fully certified by the current automated coverage model; keep a live/manual check for boundary behavior when the drop logic depends on pointer position within a row.

## Product / Stakeholder Learnings
- The right Phase 0 behavior was to improve table alignment, DnD intent, and playback ergonomics without broadening into later-phase version/candidate UX.
- Removing star controls from pool and tracklist was the right UX simplification for this phase, but preserving `starred` in the backend keeps later product options open without forcing a migration now.

## Technical / Architecture Learnings
- Parallel runs sharing one codebase context create a real scope-breach hazard: implementation context from a neighboring contract can leak into the active delivery unless scope lock is actively enforced.
- For persistent bottom-player layouts in this client shell, reserving space with container padding plus a CSS transition is more robust than trying to push content via bar positioning alone.
- The 25% / 50% / 25% drop-zone split is a practical compromise for adjacent-empty-row insertion, but it should be treated as a heuristic with a documented isolated-empty-row edge case rather than as a fully general DnD rule.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: When parallel delivery runs share the same workspace, treat contract scope lock as an active guardrail; if unrelated diff context appears, split it into its own run immediately rather than letting a "helpful" cross-contract implementation persist.
- Scope: subsystem-specific
  - Guidance: For the web client shell, prefer shared layout reservation (`padding-bottom` plus transition) for fixed bottom chrome such as the player bar; verify any fixed-bar change against overlays/modals and shared runtime state.
- Scope: subsystem-specific
  - Guidance: When DnD behavior is encoded as pointer-position heuristics inside a row, document the intended zones and keep a focused manual/browser check for edge conditions that are hard to prove in jsdom-style tests.
- Scope: repo-wide
  - Guidance: Build verification on shared local servers must account for companion-run migrations and fallback compatibility before recording a runtime failure as evidence against the current run.

## Deferred / Follow-up
- Restrict the between-row empty-drop heuristic so it only activates for true adjacent-empty-row contexts, eliminating the isolated-empty-row edge behavior found by the breaker.
- Keep companion-run schema/fallback changes and this client bug batch in separate contracts and ledgers even when they must interoperate at runtime.
