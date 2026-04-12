---
run_id: 20260412T050810Z-delivery-dnd-pointer-offset-fix-drag-prev
mode: delivery
published_at: 2026-04-12T05:33:17.143438+00:00
qa_verdict: FAIL
build_status: PASS_WITH_NOTES
breaker_verdict: CONCERNS
eval_verdict: FAIL
eval_score: 48
regression_severity: MEDIUM
---
# Run Ledger

## Outcome
- Task: Close the narrow drag-preview fix by centering the shared `DragOverlay` on the pointer with `snapCenterToCursor`.
- Result: Blocked. The intended fix was already present and reviewed as correct and low-risk, and build/test verification passed, but live QA could not clear acceptance because pool drop proved live while exact-target tracklist and explorer drops produced no state change and the overlay position could not be proven during drag.
- Scope: Intended scope was the shared overlay change in `client/src/App.tsx` plus the package dependency only; `client/vite.config.ts` remained protected and out of scope.

## Key Decisions
- Decision: Treat the existing `snapCenterToCursor` wiring as the candidate fix instead of broadening into general DnD cleanup.
  - Why: Review and build evidence indicated the modifier change itself was already in place, code-correct, and not implicated by TypeScript or test failures.
  - Tradeoff: Scope stayed narrow, but the run could not explain whether live drop failures came from the fix or from unrelated worktree drift.
- Decision: Escalate to a breaker-driven follow-on run rather than patch further in the same run.
  - Why: Mixed-scope `client/src/App.tsx` drift made attribution unreliable once live QA found target-specific drop failures.
  - Tradeoff: Slower closure, but better auditability and cleaner causality isolation.

## Verification Learnings
- `tsc --noEmit` and `vitest run` passing did not provide evidence for the drag-preview acceptance criteria; this fix can remain unverified without live interaction coverage.
- Live QA established that shared DnD was not globally broken because pool drop worked, but exact-target tracklist and explorer drops still showed no state change.
- Chrome DevTools MCP could not capture a stable in-drag overlay frame, so the primary visual acceptance criterion remained unresolved even after retries.

## Product / Stakeholder Learnings
- For this workflow, success is not "drag works somewhere"; each required destination using the shared DnD path must show a visible state change.
- Visual interaction fixes need evidence of the user-visible in-drag state, not just post-drop behavior or code inspection.

## Technical / Architecture Learnings
- Shared DnD behavior in `client/src/App.tsx` is difficult to attribute when unrelated panel/layout changes accumulate in the same file.
- The current test suite is weak at distinguishing drag-preview wiring from real drag/drop outcomes; green tests can coexist with unresolved live interaction risk.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: Keep drag-preview fixes isolated from unrelated `client/src/App.tsx` UI restructuring so live QA failures can be attributed cleanly.
- Scope: subsystem-specific
  - Guidance: Treat protected `client/vite.config.ts` changes as separate work; do not fold them into DnD interaction runs.
- Scope: subsystem-specific
  - Guidance: When acceptance depends on in-drag visuals, require tooling or tests that can prove overlay state mid-drag; post-drop-only tooling is insufficient.

## Deferred / Follow-up
- Breaker-driven follow-on run should isolate the narrow overlay fix from mixed-scope `App.tsx` drift and determine whether tracklist/explorer drop failures are pre-existing or introduced by adjacent changes.
- Add drag-specific verification that can prove both modifier wiring and visible state change for each required drop target before treating this class of fix as complete.
