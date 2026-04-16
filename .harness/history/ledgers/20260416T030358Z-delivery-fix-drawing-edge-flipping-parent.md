---
run_id: 20260416T030358Z-delivery-fix-drawing-edge-flipping-parent
mode: delivery
published_at: 2026-04-16T03:51:00.769528+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 87
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Eliminate the explorer edge-draw regression that made nodes appear to move, flip, or visually reparent during edge creation, with root-cause proof, focused regression coverage, and live UI evidence.
- Result: Production fix is review-ready and evidence-backed, but the run remains incomplete pending explicit human sign-off.
- Scope: Narrow production change in `ExplorerGrid.tsx`, targeted explorer regression tests, and live DOM/screenshot/console verification; breaker-raised regression-hardening work was pushed to a fresh follow-on run instead of widening this run.

## Key Decisions
- Decision: Fix the bug by removing the stale local `NODE_H = 27` from `ExplorerGrid.tsx` and using canonical `NODE_H_DEFAULT = 34`.
  - Why: The stale constant made grid `LEVEL_HEIGHT` 159 instead of the canonical 166, creating a progressive coordinate-space drift between CSS cells and SVG overlays and producing the observed overlay misalignment.
  - Tradeoff: This solved the live defect with the smallest coherent production patch, but left broader geometry-constant consolidation for follow-on work.
- Decision: Treat the result as a narrow production fix plus evidence package, not a same-run cleanup/refactor.
  - Why: QA, Design QA, build verification, and the breaker all agreed the production root cause was fixed correctly and that remaining concerns were about regression strength and residual duplication risk.
  - Tradeoff: The run stayed disciplined and review-ready, but did not fully harden the geometry regression suite in the same patch.
- Decision: Elevate breaker findings into a brand-new linked delivery run.
  - Why: The breaker showed that several new "position stability" tests would stay green even if the original geometry bug returned, and that `SetExplorerCanvas.tsx` still duplicated a geometry constant.
  - Tradeoff: This preserved auditability and scope control, but means the regression is fixed in production before the full long-term guardrail work is complete.

## Verification Learnings
- Targeted verification was strong for the shipped fix: affected Vitest suites passed, full client tests passed, `npm run build` passed, and live DOM verification showed stable node rects before and after forward and reverse draw gestures.
- The corrected geometry was directly observed in the live UI: the expected 166px level spacing and matching `16666px` grid/SVG height were measured, screenshot evidence was captured, and no browser console errors or warnings were reported for the exercised flow.
- A passing regression suite can still give false confidence when it asserts logical grid props rather than rendered SVG/CSS geometry; for this bug class, at least one guard must fail if the stale geometry constant is reintroduced.

## Product / Stakeholder Learnings
- For UI regressions that are visually subtle but user-facing, review-ready status requires live DOM/screenshot evidence, not only passing tests.
- Human sign-off is a real completion gate for this workflow: the run can be implementation-complete and review-ready while still blocked from final completion.

## Technical / Architecture Learnings
- Explorer layout math is a cross-layer invariant: `ExplorerGrid`, `ExplorerEdgeLayer`, and canvas interaction logic must share the same node-height and level-height assumptions or overlays drift from the DOM.
- The concrete production failure came from constant duplication, not algorithmic edge logic. A stale `NODE_H = 27` in one file produced 159px row math against the canonical 166px row math elsewhere, which scaled into visible misalignment.
- Test helpers for gesture flows must actually traverse the rendering path being protected. In this run, the breaker found that the helper path did not reliably exercise the SVG connect-drag overlay, limiting the durability of the new regression coverage.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: When the breaker finds actionable issues after a correct production fix, create a fresh follow-on contract/run rather than folding extra hardening into the source run.
- Scope: subsystem-specific
  - Guidance: Keep explorer geometry constants canonical and imported from shared sources; duplicated layout constants are a recurring drift vector because small numeric mismatches create large visual errors across levels.
- Scope: subsystem-specific
  - Guidance: For explorer drag/draw regressions, prefer assertions on rendered geometry, overlay coordinates, or cross-layer consistency over assertions on prop-derived DOM metadata alone.

## Deferred / Follow-up
- Breaker IMPORTANT findings on false-confidence geometry tests and remaining constant duplication were intentionally deferred into linked child run `20260416T034606Z-delivery-development-contract-source-inpu`.
- The follow-on contract focuses on making the regression suite exercise the actual connect-drag SVG path, assert real geometry, strengthen rapid-repeat behavior checks, and clean up the remaining `SetExplorerCanvas.tsx` node-height duplication if needed.
- This source run should be treated as review-ready but still blocked until explicit human sign-off is recorded.
