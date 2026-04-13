---
run_id: 20260411T124625Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-11T17:02:36.468669+00:00
qa_verdict: PASS
build_status: PASS_WITH_NOTES
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 53
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Complete Phase 2 single-pane UI delivery work on top of the Phase 1 shell, including the DnD contract items and their final remediation.
- Result: Completed as a post-crash continuation of the existing run without re-init. The original DnD blocker fixes were already landed and reviewer-approved before the final retry; the last retry narrowly hardened duplicate Pool no-op behavior and Explorer level-drop `MAX_COLS` rejection. Live QA and build verification ultimately passed their product checks, but build verification stayed `PASS_WITH_NOTES` because harness wrapper `pipeline.py run --intent test/build` commands appeared hung.
- Scope: Durable outcome includes accepted Phase 2 UI work, reviewer-approved DnD blocker remediation, final retry fixes for `isPoolAddInFlight` plus hook-level in-flight guarding, and the added `MAX_COLS` level-drop rejection guard. Breaker follow-on work was split into a new run at `.harness/runs/20260411T170106Z-delivery-development-contract-source-inpu`.

## Key Decisions
- Decision: Continue the existing run after the crash instead of re-initializing it.
  - Why: The run already contained accepted delivery work and approved remediation; the remaining job was bounded retry/verification rather than new scope discovery.
  - Tradeoff: Preserved momentum and audit continuity, but required the ledger to distinguish pre-existing accepted work from the final retry patch.
- Decision: Treat the original DnD blocker fixes as settled before the final retry and keep the retry patch narrow.
  - Why: Review had already approved the broader DnD remediation, so the final retry only needed to address duplicate Pool race behavior and missing level-drop rejection coverage.
  - Tradeoff: Reduced churn and re-review risk, but left breaker hardening work for a separate run instead of folding it into this one.
- Decision: Enforce duplicate Pool protection at both the drag handler and shared hook boundary.
  - Why: UI-only duplicate checks were not sufficient against stale state or in-flight race windows; the hook guard protects all callers that funnel through `addToPool`.
  - Tradeoff: Stronger correctness and fewer backend conflicts, but behavior for non-DnD callers now depends on shared no-op semantics that should stay consistent with UX expectations.
- Decision: Use deterministic live `DndContext.onDragEnd` driving for Chrome DevTools validation after drag-tool instability.
  - Why: The earlier QA failure came from unstable drag tooling rather than a reproduced product defect, and deterministic invocation still exercised the live app path with DOM, network, and console evidence.
  - Tradeoff: More reliable acceptance evidence for this app, but it does not replace the need for some real-library integration coverage in automated tests.
- Decision: Split breaker findings into a brand-new follow-on run.
  - Why: Breaker raised IMPORTANT hardening items after the delivery behavior was already live-validated, and repo policy prefers a fresh contract over same-run scope expansion.
  - Tradeoff: Shipping confidence for current behavior remains intact, but confidence debt and no-active-set explorer feedback are tracked separately instead of being silently absorbed.

## Verification Learnings
- Live Chrome DevTools validation passed once QA drove the live app deterministically through the real `DndContext.onDragEnd` path and verified DOM, network, and console outcomes for the contracted DnD routes.
- The prior QA miss was a tooling-stability problem, not durable evidence of a product defect; deterministic live-path validation is an acceptable fallback when pointer-drag tooling is unreliable.
- Targeted DnD tests and `tsc --noEmit` passed, and fresh DevTools checks found the client loaded cleanly with no runtime `error` or `warn` output during validated flows.
- Build verification remained `PASS_WITH_NOTES` because the harness wrapper `python3 .harness/bin/pipeline.py run --intent test` and `--intent build` appeared hung and were terminated, leaving infrastructure uncertainty even though targeted tests, typecheck, and live runtime evidence passed.
- Evaluation remained below threshold because breaker IMPORTANT findings and incomplete wrapper-path evidence still count against overall completion quality even when product behavior is live-validated.

## Product / Stakeholder Learnings
- Duplicate Pool drops should be a fast client-side no-op with immediate feedback, not a backend-conflict path that surfaces 409 noise.
- For DnD-heavy UI work, acceptance depends on proving the exact live interaction contract with DOM and network evidence; reviewer approval and unit tests alone are not enough.
- When browser automation is flaky, deterministic invocation of the live interaction path can still produce trustworthy acceptance evidence if it preserves real app state changes and backing API behavior.

## Technical / Architecture Learnings
- Duplicate-add protection belongs in shared state hooks as well as top-level DnD routing; the hook-level in-flight guard is the durable fix for racey repeat adds.
- Explorer capacity enforcement has distinct node-drop and level-drop surfaces; both need explicit guards and explicit verification rather than assuming one path covers the other.
- Fully mocked DnD tests are useful for routing logic, but they do not cover library wiring, sensor behavior, or registration mistakes; some real `@dnd-kit` coverage is still needed.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: If a delivery run crashes after meaningful accepted work exists, continue the same run when the remaining work is bounded remediation/verification rather than re-initializing and fragmenting the audit trail.
- Scope: subsystem-specific
  - Guidance: For `SetBuilder` / `Explorer` / DnD work, treat duplicate prevention and capacity limits as shared invariants that must be enforced below the UI event layer.
- Scope: subsystem-specific
  - Guidance: For live UI gates, prefer deterministic evidence against the real app path over repeated flaky browser gestures, but record the tooling caveat explicitly.
- Scope: repo-wide
  - Guidance: When breaker raises actionable IMPORTANT hardening items after a behaviorally correct delivery, spawn a fresh breaker follow-on run instead of broadening the completed delivery run.

## Deferred / Follow-up
- Breaker hardening work was intentionally deferred into `.harness/runs/20260411T170106Z-delivery-development-contract-source-inpu`, sourced from this run's `BREAKER_FOLLOW_ON_CONTRACT.md`.
- Follow-on scope includes DnD test-confidence restoration, no-active-set explorer-drop feedback, and reconciliation of dead or split DnD constraint logic.
- Harness wrapper instability for `pipeline.py run --intent test/build` remains an operational caveat until a later run proves those wrapper paths complete successfully.
