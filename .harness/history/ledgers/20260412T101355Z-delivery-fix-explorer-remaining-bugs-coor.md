---
run_id: 20260412T101355Z-delivery-fix-explorer-remaining-bugs-coor
mode: delivery
published_at: 2026-04-12T11:16:16.430354+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: PASS
eval_score: 88
regression_severity: MEDIUM
---
# Run Ledger

## Outcome
- Task: Fix the remaining Explorer bugs in `client/src/components/SetExplorerCanvas.tsx`: the confirmed coordinate-system inversion path and unreliable Add Track level drop targeting.
- Result: Shippable run. Review `APPROVE`, QA `PASS`, build verification `PASS`, evaluator `PASS` at `88/80`, regression check non-blocking, breaker `CONCERNS` only.
- Scope: Narrow Explorer-only delivery in `client/src/components/SetExplorerCanvas.tsx` plus supporting assertions in `client/src/components/SetExplorerCanvas.test.tsx`.

## Key Decisions
- Decision: Keep the Explorer camera in SVG space with a `viewBox` rather than CSS transforms.
  - Why: The diagnosed failure was a CSS-transform/screen-space mismatch that made `@dnd-kit` collision math feel inverted or offset; live QA confirmed the `viewBox` path preserves natural pan/zoom and connector drag behavior.
  - Tradeoff: Camera math becomes more sign-sensitive, so regression detection must assert origin/direction, not only that the `viewBox` changed.
- Decision: Expand each level-add drop target with an invisible transparent rect instead of changing visible button styling.
  - Why: It makes the droppable reliably hittable while preserving the existing Add Track appearance.
  - Tradeoff: The hit area is now dependent on exact offset math that deserves stronger test assertions.
- Decision: Treat artifact contamination as a run-artifact problem, not a reason to reopen product code.
  - Why: Review, QA, and build evidence already supported the scoped Explorer fix; the issue was global dirty-diff leakage into run artifacts.
  - Tradeoff: The run needed bounded artifact remediation and retry bookkeeping cleanup before final evaluation.

## Verification Learnings
- Live Chrome-based QA was the decisive correctness signal for this UI fix: it confirmed top-to-bottom Explorer orientation, a real `viewBox`, no CSS transform styling on the SVG, correct connector drag preview behavior, and a clean browser console.
- Breaker and regression passes found no current correctness blocker, but they did expose a false-confidence pattern: the tests do not yet pin the exact sign-sensitive `viewBox` origin, zoom-pivot math, and hit-zone centering strongly enough to catch a reintroduced inversion bug.
- Retry rounds stayed within policy because the second remediation repaired contaminated diff/eval artifacts without additional product-code churn.

## Product / Stakeholder Learnings
- For this Explorer workflow, preserving visible styling while improving drag/drop reliability was the right fix shape; usability improved through hit-target enlargement rather than UI restyling.
- The requirement to diagnose first was effectively satisfied when the root cause was captured in review evidence, but future runs should record the diagnosis outcome more directly when that is an explicit acceptance item.

## Technical / Architecture Learnings
- In this SVG canvas, `viewBox`-driven pan/zoom is more compatible with `@dnd-kit` than CSS transforms because `getBoundingClientRect()` and `getScreenCTM()` stay aligned with the rendered coordinate system.
- `ResizeObserver`-backed container sizing is the correct companion to the `viewBox` approach for a pannable canvas, even though the current test harness does not exercise dynamic resize behavior.
- The main residual risk after this run is not implementation correctness but test strength around sign-sensitive camera math.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For interactive SVG canvases that participate in drag/drop collision detection, prefer native SVG camera primitives like `viewBox` over CSS transforms so DOM geometry APIs stay trustworthy.
- Scope: repo-wide
  - Guidance: In a dirty multi-run workspace, generate run diff artifacts from scoped file paths rather than a blanket repo diff, or unrelated edits can contaminate `PATCH.diff`, policy artifacts, and downstream evaluation.
- Scope: subsystem-specific
  - Guidance: When a bug fix depends on sign-sensitive geometry math, tests should assert direction and origin explicitly; “changed from previous value” is not enough regression protection.

## Deferred / Follow-up
- Non-blocking breaker follow-on was correctly split into a separate P2 contract: strengthen Explorer regression tests for directional pan, `viewBox` origin restoration, zoom-to-cursor pivot math, and exact hit-zone centering assertions.
- Review nit deferred: remove unused `svgW`/`svgH` variables in a later maintenance pass.
