# Run Ledger

## Outcome
- Task: Complete `REMEDIATION_CONTRACT_B.md` for header and weights polish: move delete left of the selector with confirmation, widen the selector, remove duplicate title copy, preserve the `8px` left-cluster gap, center search, and fix responsive weight-control behavior.
- Result: COMPLETE. QA passed all 9 acceptance criteria, build passed, and the final client suite finished at `830 passed, 0 failed`. The header changes landed as intended and the weights popover now scrolls horizontally below `800px` instead of clipping.
- Scope: `WorkspaceHeader.tsx`, `WeightControls.tsx`, focused tests in `WorkspaceHeader.test.tsx` and `WeightControls.test.tsx`, plus the related header and responsive weights rules in `styles.css`.

## Key Decisions
- Decision: Keep the header remediation strictly local to `WorkspaceHeader` and supporting CSS/tests.
  - Why: The contract was about control order, spacing, confirmation behavior, and centered search, not broader workspace restructuring.
  - Tradeoff: Some adjacent App-level changes appeared in the shared diff, which increased review noise even though the B-lane work itself stayed correct.
- Decision: Fix the sub-`800px` weight-control bug by making `.weight-controls-outer` the horizontal scroll container.
  - Why: The failing state came from the inner row expanding past an overflow-hidden overlay, so row-level overflow could not expose clipped gauges. Moving the usable scroll path to the outer container restored access to off-screen controls.
  - Tradeoff: The narrow-layout behavior depends on container scroll rather than wrapping or compressing the gauges, but it preserves the existing control shape and avoids clipping.
- Decision: Accept the breaker scope-violation call as a false positive for this run.
  - Why: The reported `App.tsx` structural changes came from the parallel A lane in a shared working tree. The actual B-lane deliverable remained aligned to header and weights items.
  - Tradeoff: Diff-based verification became harder to audit, so the final ledger needs to preserve that context for future parallel runs.

## Verification Learnings
- The decisive verification for this run was responsive DOM measurement, not static structure alone. The passing proof for AC6 was that below `800px`, the outer container had `overflow-x: auto`, its `scrollWidth` exceeded `clientWidth`, and scrolling made previously hidden gauges reachable.
- Desktop proof mattered too: at `>=800px`, the same surface showed no clipping and no horizontal scroll requirement, confirming the CSS fix solved both sides of the breakpoint instead of only shifting the failure.
- Focused unit tests were useful for header order, modal behavior, duplicate-copy removal, and stable weight-control hooks, but responsive behavior still required live DOM inspection to prove the real scroll path.

## Product / Stakeholder Learnings
- Header polish here was about reducing friction in a dense control bar: delete belongs next to the selector, duplicate naming should disappear, and search should read as a centered global action rather than part of either side cluster.
- For weight controls, preserving access to every gauge on narrow widths mattered more than keeping the whole strip visible at once. Horizontal reachability was the correct user outcome.

## Technical / Architecture Learnings
- Responsive bugs caused by nested overflow rules can be misdiagnosed when the visible clipping happens on an ancestor. The durable fix is to put scroll ownership on the container that remains visible inside the overlay boundary.
- `data-testid` additions in `WeightControls.tsx` were justified here because they stabilized structural tests without changing the weighting logic or data flow.
- Shared working trees can contaminate scoped remediation diffs with unrelated changes from parallel lanes. Final evaluation should reconcile diff noise against the run contract before treating scope findings as real blockers.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For responsive popovers, verify which element actually owns the visible scroll path; row-level overflow is insufficient if an ancestor clips overflow.
- Scope: subsystem-specific
  - Guidance: Use focused DOM tests for header order and confirmation flow, but rely on live DOM measurement for breakpoint behavior where JSDOM cannot prove layout or scrolling.
- Scope: repo-wide
  - Guidance: When parallel lanes share a working tree, treat diff-only scope findings as provisional until they are checked against the contract's actual file ownership.

## Deferred / Follow-up
- No functional follow-on is required for the contracted B-lane behavior; the run is complete.
- The main process follow-up is operational: avoid shared-working-tree contamination when running parallel remediation lanes so breaker and regression artifacts stay audit-clean.
