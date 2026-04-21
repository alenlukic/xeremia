---
run_id: 20260421T194156Z-delivery-bug-batch-remediation-column-ali
mode: delivery
published_at: 2026-04-21T20:42:27.660000+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 65
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: bug-batch-remediation-column-alignment-dnd-player-bar
- Result: The run remediated the three contracted client bugs: TrackTable header/body alignment, empty-row DnD insert-vs-fill behavior, and player-bar visibility at short viewport heights. QA issued an unqualified PASS with independent reviewer confirmation and live DOM evidence at `800x600`, `1280x800`, and `1440x900`.
- Scope: Contracted scope was `client/src/` only. Breaker scope blockers in the full working tree were noise from previously accumulated uncommitted changes, not the intended patch scope for this run.

## Key Decisions
- Decision: Make the TrackTable width contract explicit and integer-based across all rendered columns.
  - Why: `table-layout: fixed` plus fractional flex widths caused visible header/body drift; rounding flex widths to integers and driving `<col>` and `<th>` from the same sizing contract removed the mismatch.
  - Tradeoff: Width distribution is slightly less "perfectly proportional," but pixel-identical rendering is more important than preserving fractional math.
- Decision: Replace empty-row drop intent inference based on pointer edge position with deterministic adjacency-based intent.
  - Why: The prior pointer-Y threshold approach was unreliable at drag end; resolving insert vs fill from same-surface empty-row adjacency produced stable behavior and testable row-count transitions.
  - Tradeoff: The handler must rely on explicit structural state/metadata instead of opportunistic pointer geometry, but the behavior becomes predictable.
- Decision: Keep the player bar as an in-flow flex child and fix the flex shrink chain above it instead of adding shell padding or sticky/fixed positioning.
  - Why: The real failure was missing `min-height: 0` along scrollable flex ancestors, which prevented the content region from shrinking and pushed the bar off-screen.
  - Tradeoff: Multiple container classes need to maintain the flex/min-height contract, but the layout remains simpler and avoids overlay hacks.

## Verification Learnings
- Visual/layout regressions need live DOM verification, not just passing test counts. This run's decisive evidence came from viewport-specific DOM queries showing `aligned=true`, `allInts=true`, and a visible non-overlapping player bar.
- For DnD behavior, before/after row-count assertions were the most durable automated proof: adjacent-empty drops preserved placeholder count, while isolated-empty drops consumed the target empty row.
- Independent review added value here because the defects were UI-behavioral and easy to over-trust from unit tests alone.

## Product / Stakeholder Learnings
- These three bugs all damaged confidence in the core set-building workflow: browse-table readability, predictable empty-row drops, and always-available playback controls.
- Short-laptop viewport behavior matters for acceptance. `800x600` verification was not a nice-to-have; it exposed whether the player bar remained usable in realistic constrained layouts.

## Technical / Architecture Learnings
- In fixed-layout tables, always round computed flex column widths to integers before applying them to rendered columns. Fractional widths are enough to create header/body drift.
- In `@dnd-kit`, pointer-derived geometry at drag end is a poor source of intent for ambiguous targets. Use deterministic droppable/state data for disambiguation rather than pointer coordinates.
- In a flex column app shell, every scrollable content region above a bottom-anchored bar needs `min-height: 0`; missing it at any level can block shrinkage and hide the bottom control surface.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: QA for visual/layout contracts should include live DOM checks such as `getComputedStyle()` or viewport geometry scripts at multiple required viewport sizes, not just green unit tests.
- Scope: repo-wide
  - Guidance: Avoid letting multiple contract deliveries accumulate uncommitted changes in one working tree when patch-scope attribution matters; dirty trees create false-positive breaker scope findings and make `PATCH.diff` interpretation noisy.
- Scope: subsystem-specific
  - Guidance: For browse/set workspace table work, treat rendered column widths as a single source of truth that drives both `colgroup` and header sizing.
- Scope: subsystem-specific
  - Guidance: For drag-and-drop on empty rows, encode ambiguity-breaking intent in droppable/state data rather than reconstructing it from pointer thresholds.

## Deferred / Follow-up
- Consider committing or otherwise isolating contract deliveries between pipeline runs so future breaker reports can distinguish real scope drift from previously delivered but still-uncommitted work.
- If empty-row DnD continues to evolve, push adjacency/intent flags fully into droppable data so the rendered target contract and drag-end resolver stay explicitly aligned.
