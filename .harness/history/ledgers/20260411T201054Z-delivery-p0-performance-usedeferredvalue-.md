---
run_id: 20260411T201054Z-delivery-p0-performance-usedeferredvalue-
mode: delivery
published_at: 2026-04-11T21:52:20.032140+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 81
regression_severity: LOW
---
---
ledger_schema_version: 2
tags: []
recommendation_ids: []
---

# Run Ledger

## Outcome
- Task: P0 frontend performance retry for deferred search responsiveness, clear-search restore latency, and DragOverlay pointer-offset verification in the React client.
- Result: Final state is a settled pass for the implementation run: corrected live QA `PASS`, design QA `PASS_WITH_NOTES`, broad review `APPROVE`, build verification `PASS`, evaluation `PASS` above threshold, and breaker `CONCERNS` without blocking completion. A separate breaker follow-on run was explicitly created to harden test coverage for retry-specific invariants.
- Scope: Narrow retry limited to `client/src/components/SearchPanel.tsx`, `client/src/App.tsx`, and CSS ancestor inspection in `client/src/styles.css`; final attribution relies on scoped verification artifacts because the shared worktree diff remained noisy.

## Key Decisions
- Decision: Keep the retry limited to sub-fixes A/B/C instead of reopening the broader render-stability work.
  - Why: Prior render fixes were already review-approved; the remaining failures were isolated to debounce timing, clear-to-restore behavior, and DragOverlay alignment fallback.
  - Tradeoff: This preserved auditability and minimized churn, but left broader client-shell noise in the dirty worktree untouched.
- Decision: Treat empty-query search as a fast path that bypasses deferred search behavior.
  - Why: The contracted UX issue was slow restore after clearing search, so the fix canceled pending debounce work, cleared suggestions, skipped autocomplete, and propagated `''` immediately.
  - Tradeoff: Empty-query handling now intentionally diverges from non-empty deferred search behavior and needs explicit regression coverage to protect that invariant.
- Decision: Accept the structural DragOverlay fallback (`DragOverlay` as a direct child of the outer `DndContext` with `adjustScale={false}`) and corrected static verification criteria instead of forcing broader CSS churn or a tooling-driven retry.
  - Why: Scoped inspection found no containing-block culprit on the named DnD ancestor containers, and the corrected QA gate explicitly allowed static evidence when Chrome DevTools could not capture a real `@dnd-kit` pointer drag frame.
  - Tradeoff: The code fix is structurally verified, but active in-flight visual proof remains a lower-priority manual confidence improvement.
- Decision: Close this run as implementation-complete, but treat the false-green breaker findings as a separate contract that must be addressed in a new delivery run.
  - Why: Live correctness evidence is sufficient for completion, while the remaining `IMPORTANT` breaker findings are about regression protection rather than current runtime correctness.
  - Tradeoff: The delivered behavior is accepted now, but future edits to these search/DnD paths remain under-guarded until the follow-on lands.

## Verification Learnings
- Measurement methodology can change run outcome. Once the typing gate was clarified to measure keypress-to-input update latency instead of deferred table mutation, QA moved from failure to `PASS` without requiring broader code changes.
- Clear-search restore must be verified as its own path, not inferred from generic typing responsiveness. Live checks consistently showed full-list restoration well under the `<500ms` requirement.
- Static evidence can be an acceptable completion gate for DragOverlay alignment when the contract names structural criteria and the automation stack cannot capture a real pointer-sensor drag frame.
- Breaker findings on missing tests should be treated as regression-protection gaps, not current-correctness blockers, when live QA and build verification independently pass.
- Dirty-worktree attribution is still a meaningful risk signal even when the run is otherwise healthy; the right operational stance is `WATCH / continue`, not false certainty from the raw saved diff.

## Product / Stakeholder Learnings
- The most important user-facing gain from this retry was instant recovery from clear-to-empty search, because that path determines how quickly the user gets back to full browsing.
- `PASS_WITH_NOTES` is a workable design verdict when all P0/P1 UI requirements pass and the only remaining note is a tooling-limited proof gap.
- Broad-review nits and neighboring maintainability concerns should stay as future cleanup notes rather than reopening a passing run once the scoped UX contract is satisfied.

## Technical / Architecture Learnings
- `useDeferredValue` is appropriate for non-empty search/filter work, but clear-to-empty is a special-case boundary that should bypass deferred state to avoid stale-result lag.
- For `@dnd-kit` overlay-offset issues, the preferred narrow diagnostic order is: inspect ancestor containing-block CSS first, then confirm overlay placement under the outer `DndContext`, then disable overlay scale adjustment if needed.
- Automation can verify DnD structure and side effects, but not every pointer-sensor visual invariant. Contracts should distinguish between runtime proof and static structural proof when browser tooling cannot exercise the real sensor path.
- Green jsdom tests were a false-confidence signal for this retry. The empty-string bypass, debounce constant, DragOverlay props, and clear-then-retype cancellation can all regress without failing the current suite.
- A breaker follow-on on `IMPORTANT` false-green findings means "code accepted, guardrails still missing": it is not a rollback of the pass verdict, but a durable instruction to open a clean, isolated test-hardening run.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: If QA failure hinges on measurement semantics, resolve the contract and gate definition before escalating scope; incorrect measurement can create false blockers.
- Scope: subsystem-specific
  - Guidance: In the React search flow, preserve the empty-string bypass around deferred search state and protect it with an explicit test rather than relying on jsdom behavior.
- Scope: subsystem-specific
  - Guidance: For `SearchPanel` responsiveness changes, pair debounce tweaks with fake-timer tests that guard both the timing constant and clear-then-retype cancellation behavior.
- Scope: subsystem-specific
  - Guidance: For `DragOverlay` fixes, treat `adjustScale={false}` and direct-child placement as regression-sensitive configuration and add test visibility for those props instead of letting mocks swallow them.
- Scope: repo-wide
  - Guidance: When a run shares a dirty worktree, use a `WATCH / continue` posture and trust the scoped task, review, QA, build, evaluation, and regression artifacts over the raw `PATCH.diff` for final attribution.

## Deferred / Follow-up
- Breaker follow-on `20260411T212320Z-delivery-development-contract-source-inpu` is the explicit handoff for the four `IMPORTANT` false-green gaps: empty-string deferred bypass, `100ms` debounce timing, DragOverlay prop coverage, and clear-then-retype timer cancellation.
- The meaning of that follow-on is test hardening and clean re-verification in a fresh run, not remediation of a still-failing implementation in this one.
- If these files are touched again, prefer a manual drag-alignment spot check in addition to structural verification, but do not treat that missing screenshot as retroactive blocker evidence for this completed run.
