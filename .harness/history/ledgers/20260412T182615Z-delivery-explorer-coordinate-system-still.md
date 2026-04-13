---
run_id: 20260412T182615Z-delivery-explorer-coordinate-system-still
mode: delivery
published_at: 2026-04-12T19:05:26.920161+00:00
qa_verdict: PASS_WITH_NOTES
build_status: FAIL
breaker_verdict: UNKNOWN
eval_verdict: PASS
eval_score: 84
regression_severity: NONE
---
# Run Ledger

## Outcome
- Task: Fix `Matches -> Explorer` drag/drop targeting that looked inverted or misplaced in Explorer.
- Result: Resolved the shipped bug by treating it as an Explorer target-precedence problem in shared DnD collision resolution, not as a new SVG/viewBox coordinate-system bug.
- Scope: Narrow client-side fix for Explorer collision selection plus focused regression coverage; no Explorer UI/tree/playback refactor.

## Key Decisions
- Decision: Preserve `drop-explorer` as the generic background destination, but filter it out of collision results whenever specific Explorer targets are also present.
  - Why: `@dnd-kit` `pointerWithin()` can return all containers under the pointer, sorted ascending by intersection ratio; the large generic `drop-explorer` container can sort first and become `event.over`, masking `drop-explorer-node-*` and `drop-explorer-level-*`.
  - Tradeoff: This keeps true background drops working while adding Explorer-specific precedence logic to the shared collision path.
- Decision: Keep the fix in `dndCollisionDetection` instead of reopening the earlier camera/transform diagnosis.
  - Why: RCA showed the visible symptom came from wrong target resolution during cross-panel drag/drop, not from steady-state Explorer coordinate math.
  - Tradeoff: The deeper hidden-to-visible timing race was not addressed in this run because the smallest coherent fix was sufficient for the observed root cause.

## Verification Learnings
- Focused tests proved downstream `handleDragEnd` behavior for node targets, level targets, and generic Explorer fallback, but they do not execute `dndCollisionDetection` directly because `DndContext` is mocked.
- Manual UI checks showed the client remained healthy, but the exact one-gesture hidden-to-visible `Matches -> Explorer` hover-open drop could not be reproduced deterministically with available MCP drag primitives.
- Pre-existing TypeScript build failures in `SetExplorerCanvas.tsx`, `App.test.tsx`, `SetPoolTable.test.tsx`, and `SetTracklist.test.tsx` were confirmed as existing debt and not introduced by this fix.

## Product / Stakeholder Learnings
- A user-visible "inverted drop" symptom in Explorer can come from generic-vs-specific droppable precedence, even when the visual camera math is already correct.
- For cross-panel drag flows, preserving precise intent matters more than preserving raw collision ordering from the library when a broad fallback container overlaps finer-grained targets.

## Technical / Architecture Learnings
- In this codebase, `pointerWithin()` behavior is a drag/drop hazard when a large fallback droppable (`drop-explorer`) overlaps more specific Explorer droppables; shared collision strategies need local precedence rules.
- Shared DnD fixes are safer when they are ID-scoped and surgical: only Explorer-specific targets were reprioritized, so Pool, Tracklist, Matches, and dock flows stayed untouched.
- Filtering only the `pointerWithin()` path is incomplete; the same Explorer-specific filter should also guard the `rectIntersection()` fallback to fully close the failure mode.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For future Explorer or cross-panel drag/drop work, never let coarse fallback droppables outrank `drop-explorer-node-*` or `drop-explorer-level-*` when both are present in the same collision set.
- Scope: subsystem-specific
  - Guidance: When a DnD bug looks like bad placement or inverted coordinates, inspect `event.over` selection and collision ordering before re-diagnosing geometry or camera transforms.
- Scope: repo-wide
  - Guidance: If a production DnD fix lives in collision-detection logic, add a direct unit test for that logic rather than relying only on handler tests that inject `over.id`.

## Deferred / Follow-up
- P1: Export or extract `dndCollisionDetection`, add direct unit tests that fail if the Explorer filter is removed, and apply the same `drop-explorer` filtering to the `rectIntersection()` fallback path.
