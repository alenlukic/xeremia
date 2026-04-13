---
run_id: 20260412T080202Z-delivery-fix-dnd-tab-drop-targets-stretch
mode: delivery
published_at: 2026-04-12T08:49:07.722156+00:00
qa_verdict: PASS_WITH_NOTES
build_status: CONDITIONAL
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 81
regression_severity: UNKNOWN
---
# Run Ledger

## Outcome
- Task: Fix DnD tab drop targets by stretching dock tabs, restoring hover-to-open, and re-enabling reliable Set/Explorer drop access.
- Result: PASS_WITH_NOTES
- Scope: `client/src/styles.css` and `client/src/App.tsx`; the run addressed the three reported regressions in live QA, with one remaining manual-validation gap for precise Explorer follow-through.

## Key Decisions
- Decision: Make each dock tab fill the bar with `flex: 1`, `min-width: 0`, centered text, and reduced padding.
  - Why: The original fixed-width tabs left most of the dock bar as dead, non-droppable space, making tab targeting unnecessarily precise.
  - Tradeoff: Equal-width tabs prioritize drag/drop hit area and consistent layout over content-sized tab labels.
- Decision: Restore hover-to-open on dock tabs during drag with a 400ms timer.
  - Why: Opening `Explorer` or `Set` mid-drag is the ergonomic path that lets users continue into the real target area instead of dropping blindly onto a tiny tab target.
  - Tradeoff: Timed panel switching adds drag-state complexity and required explicit timer cleanup on drag end/cancel.
- Decision: Treat hover-to-open as safe because panel-zone height is shared and constant across panel switches.
  - Why: The run confirmed the prior removal was based on a false layout-shift assumption; switching active panels does not move the dock bar when panel height stays fixed.
  - Tradeoff: Shared panel height simplifies drag stability, but gives up per-panel persisted heights.
- Decision: Prefer pointer-based collision detection with `pointerWithin` before `rectIntersection`.
  - Why: Thin dock-tab droppables were being missed when the drag overlay position diverged from the actual pointer during `snapCenterToCursor`.
  - Tradeoff: Pointer-priority behavior is more faithful for tab drops, but changes collision semantics relative to pure rectangle intersection.

## Verification Learnings
- Live QA verified the three reported regressions are addressed: dock tabs now stretch evenly, hover-to-open reactivates `Explorer` without geometry shift, and dropping onto `Set` with an active set appends to the tracklist.
- Automated confidence is strong but incomplete: typecheck passed, `76/76` Vitest tests passed, and live DOM/runtime checks were clean.
- Explorer precision drops remain manually unverified because Chrome DevTools automation could not reproduce the continuous mid-drag pointer path from a hovered tab into live Explorer SVG/node targets.

## Product / Stakeholder Learnings
- For dock-based DnD, large tab hit areas are not just visual polish; they are part of the core affordance for discoverable drop behavior.
- Hover-to-open is required for practical Explorer placement because users need the panel to reveal its internal drop zones before releasing a dragged track.

## Technical / Architecture Learnings
- Keeping panel-zone height constant during panel switches prevents the anchor pane and dock bar from shifting, so panel activation during drag is safe when layout height is shared.
- `@dnd-kit` drag correctness for small targets depends heavily on collision strategy; pointer-driven collision is more reliable than overlay-rectangle intersection for narrow tab bars.
- Re-measuring droppables while dragging is necessary when hidden panel content becomes visible mid-drag.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: In the dock/panel DnD flow, preserve full-width tab droppables and hover-open behavior together; removing either one recreates the same usability failure mode.
- Scope: subsystem-specific
  - Guidance: When panel content must open during a drag, stabilize container height first; fixed geometry is what makes hover-activated panel switches safe.
- Scope: one-off
  - Guidance: Treat Explorer precision-drop validation as a manual QA item when automation cannot reproduce the required continuous drag steering into live canvas/SVG targets.

## Deferred / Follow-up
- Manually verify the full Explorer precision-drop path: hover open `Explorer`, steer into a specific level/node drop zone, and confirm placement is not forced to root.
- If Explorer precision-drop issues are reported again, investigate whether additional runtime instrumentation or a different browser automation surface is needed for reproducible drag-path testing.
