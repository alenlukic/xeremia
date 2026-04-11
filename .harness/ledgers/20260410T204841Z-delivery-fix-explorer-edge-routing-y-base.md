---
run_id: 20260410T204841Z-delivery-fix-explorer-edge-routing-y-base
mode: delivery
published_at: 2026-04-10T21:15:53.290604+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 91
regression_severity: NONE
---
---
ledger_schema_version: 2
run_id: 20260410T204841Z-delivery-fix-explorer-edge-routing-y-base
date: 2026-04-10
mode: delivery
status: completed
scope:
  - client/src/components/SetExplorerCanvas.tsx
  - client/src/components/SetExplorerCanvas.test.tsx
tags:
  - set-explorer
  - edge-routing
  - geometry
  - frontend
---

# Run Ledger

## Outcome
- Task: Fix the explorer edge-routing Y-base bug with a narrow two-file delivery.
- Result: Successful delivery. Edge routing now uses Y-based horizontal lanes,
  child arrival `endX` uses `parentColIdx`, label/delete geometry follows the
  lane position, and obsolete X-lane helpers/constants were removed.
- Scope: Limited to `SetExplorerCanvas.tsx` and `SetExplorerCanvas.test.tsx`;
  no follow-on run was created.

## Key decisions
- Replaced X-based diagonal lane routing with the four-point Y-lane path
  `M startX parentBottom L startX laneY L endX laneY L endX childTop`.
- Computed `laneY` from `laneIndex = parentColIdx * EDGE_SLOTS + childColIdx`
  with `LANE_STUB = 10` and `LANE_S = 6`.
- Fixed child arrival geometry to use
  `endX = edgeSlotX(child.x, parentColIdx)`.
- Let same-column transitions render as straight vertical lines naturally when
  `startX == endX` instead of adding special-case branching.

## Verification and breaker
- Frontend verification passed with `cd client && npx vitest run`: 13 files
  passed, 285 tests passed, 0 failed.
- Live Playwright validation on `localhost:5173` confirmed the new routing
  formulas on the set 6 explorer, including natural straight-line same-column
  behavior.
- Review approved; QA passed after live evidence was added; build verification
  passed; breaker passed with only non-blocking nits; regression detector
  reported no regressions.

## Bad-state signals
- Initial QA failed because live runtime evidence was missing even though the
  code diff and automated tests were strong.
- The run recovered cleanly once targeted live Playwright validation was
  supplied against the actual explorer view.
- Durable signal: under this repo’s QA gates, UI geometry changes are not
  complete until live runtime evidence exists.

## Token efficiency notes
- The run stayed narrow: two files, one defect family, no adjacent refactor.
- The fix removed obsolete routing concepts (`TOTAL_LANES`, `LANE_PITCH`,
  `STUB_H`, `edgeLaneX()`) instead of layering compatibility logic on top.
- Targeted geometry tests plus one live explorer check provided enough evidence
  without broadening into canvas cleanup.

## Durable learnings
- For explorer edge routing, model lane placement by Y-based per-edge lane
  indices, not by shared X-lane helpers.
- Preserve formula-driven invariants when possible; same-column straight lines
  are better as an emergent property than a special-case branch.
- Frontend test success is necessary but not sufficient for QA on visual/runtime
  behavior in this repo; live verification must be attached before closure.
- When geometry shifts from midpoint-based placement to lane-based placement,
  update all dependent affordances together, especially labels and delete
  controls.

## Deferred or follow-up
- No contractable follow-up was warranted.
- Optional hardening left on the table: explicit tests for delete-button
  transform coordinates, cross-column label X placement, and multi-edge lane
  separation. These were judged low risk and non-blocking.
