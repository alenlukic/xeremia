---
run_id: 20260414T051029Z-delivery-mixed-delivery-input-bundle
mode: delivery
published_at: 2026-04-14T06:15:28.358417+00:00
qa_verdict: PASS_WITH_NOTES
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 38
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Deliver the mixed client-side Explorer/workspace interaction bundle from the input bundle.
- Result: The client-only delivery landed with green client tests and build verification `PASS`, but the breaker verdict `CONCERNS` converted four important findings into a follow-on contract.
- Scope: React/TypeScript Explorer drag semantics, workspace accordion/control placement, playback dead-zone guarding, shared workspace extraction, CSS reconciliation, and targeted test additions.

## Key Decisions
- Decision: Replace modifier-key drag mode selection with a spatial split where the top `2/3` of a node starts move-drag and the bottom `1/3` starts connect-drag.
  - Why: This made the interaction more discoverable and let move-drags suppress phantom edge previews without relying on `Alt`.
  - Tradeoff: The behavior now depends on live geometry, so tests that hard-code one node height can prove mock arithmetic rather than real boundary behavior.
- Decision: Preserve drag-source direction when creating edges and then add a bidirectional reverse-edge guard.
  - Why: The contract wanted source-to-target semantics, and remediation showed the new direction model needed both forward and reverse duplicate-edge checks.
  - Tradeoff: The UI now permits source-directed edges that may invert the older implicit level ordering, so backend/domain compatibility became a follow-on verification item.
- Decision: Remove the occupied-cell warning path and its dead warning-node state, and instead add the dropped track as a child of the occupant.
  - Why: The accepted behavior changed from rejecting occupied drops to treating them as valid child placement.
  - Tradeoff: The old `setDndWarningNodeId` path became dead code and had to be removed cleanly to avoid stale state and lint drift.
- Decision: Extract `SetWorkspacePanel` and reuse it in both the Set tab and the Explorer top workspace.
  - Why: Reuse kept the workspace behavior coherent across both surfaces while containing the change to one shared component boundary.
  - Tradeoff: CSS became the main integration seam, and the workspace-hide behavior exposed a control-reachability gap once `Weights` and `Admin` moved into the hidden strip.
- Decision: Hide the expanded-workspace controls strip with inline style rather than a dedicated CSS class.
  - Why: It was the narrowest patch for the immediate UI state change.
  - Tradeoff: Broad review flagged this as a maintainability nit because nearby visibility toggles already use class-based patterns.

## Verification Learnings
- The run finished with `466` passing client tests and build verification `PASS`, but evaluation still failed because QA remained `PASS_WITH_NOTES` and the breaker surfaced `7` important findings.
- Live QA was strongest on DOM geometry and visible shell behavior; Explorer drag semantics still relied partly on implementation inspection plus targeted tests, which left room for breaker follow-on findings around lost-`mouseUp` state and backend edge compatibility.
- This repo's lint posture still treats bare `catch {}` as actionable noise. Intentionally ignored storage failures needed `/* storage unavailable */` comments to satisfy `no-empty`.
- Geometry-dependent tests are easy to overfit to mocks. The run proved that global `getBoundingClientRect` stubs and non-zero width mocks can hide real fallback gaps like the `rect.width === 0` dead-zone branch.

## Product / Stakeholder Learnings
- Passing acceptance items independently is not enough when they intersect in the same UI state. Hiding the controls strip while also moving `Weights` and `Admin` into it created a real workflow hole in expanded Explorer mode.
- The hit-zone split is a better user-facing interaction model than modifier-key dragging, but the boundary itself is now product behavior and needs explicit verification rather than implicit trust.
- Reusing the same Tracklist/Pool workspace inside Explorer improved coherence, but global controls still need a reachability check in every workspace state, not just the default collapsed view.

## Technical / Architecture Learnings
- `activeConnectSourceRef` became the logical source of truth for connect-drags while `connectDrag` only controls preview rendering. That split enables phantom-preview suppression, but it also makes blur/visibility cleanup a correctness requirement.
- The reverse-edge fix showed that preserving drag direction and preventing duplicate/bidirectional edges must be treated as one invariant, not two separate tweaks.
- The shared `SetWorkspacePanel` extraction was the right narrow reuse boundary for this run; it reduced duplication without pulling backend or data-model code into scope.
- When correctness depends on DOM measurement, fallback behavior must be intentional. Returning `false` for zero-width play-cell geometry silently disables the dead zone unless that path is explicitly tested and justified.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: Treat Explorer hit-zone logic, drag-state refs, and duplicate-edge guards as one behavioral surface; if source-direction semantics change, verify backend/domain assumptions before considering the work closed.
- Scope: repo-wide
  - Guidance: When intentionally ignoring an exception in this repo, prefer a short comment in the `catch` block over a bare empty catch so lint intent stays explicit.
- Scope: subsystem-specific
  - Guidance: Prefer class-based visibility toggles over inline `display: none` when a UI state may need future consistency, animation, or targeted testing hooks.
- Scope: subsystem-specific
  - Guidance: For geometry-sensitive UI tests, always include at least one non-default dimension case and one degenerate fallback case such as `width === 0`.

## Deferred / Follow-up
- `BREAKER_FOLLOW_ON_CONTRACT.md` was created from the parent `BREAKER_REPORT.md` because four actionable `IMPORTANT` findings warranted a new narrow run: keep `Weights`/`Admin` reachable in expanded workspace, clear stale drag refs on blur/visibility loss, harden the width-0 dead-zone path, and verify or gate level-inverted source-directed edges.
- The remaining breaker-important test-confidence gaps remain useful evidence, but they were not promoted into this first follow-on contract because the requested follow-on scope was limited to the four contractable items already identified.
