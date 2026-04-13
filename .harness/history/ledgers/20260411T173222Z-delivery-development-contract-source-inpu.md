---
run_id: 20260411T173222Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-11T20:19:02.537572+00:00
qa_verdict: FAIL
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 46
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: Deliver the client-shell and DnD contract covering persistent split layout, unified controls, Explorer drop behavior, and task-scoped drag/drop tests.
- Result: Partially successful but still blocked. The narrow `client/src/App.tsx` Explorer generic-drop fix was review-approved, live QA now passes all 5 required Explorer drop cases, and `BUILD_VERIFICATION.md` is `PASS`; however the run remains non-shippable because overlay/pointer-alignment proof was not captured, breaker blockers remain open, regression severity stays `HIGH`, and the run is already superseded by follow-on `20260411T191526Z-delivery-development-contract-source-inpu`.
- Scope: Intended scope was client-only shell/DnD work. The realized diff expanded into backend and harness drift, which became a blocking trust/scope issue and should be handled only via the follow-on run.

## Key Decisions
- Decision: Treat this run as final-state recorded and superseded, not a candidate for more same-run remediation.
  - Why: `BAD_STATE_REPORT.md` marks the run `BLOCKED` and explicitly points to recorded follow-on `20260411T191526Z-delivery-development-contract-source-inpu`.
  - Tradeoff: Preserves auditability and retry discipline, but leaves this run blocked even after meaningful UI progress.
- Decision: Preserve the approved Explorer drop fix as accepted baseline behavior for the follow-on.
  - Why: Focused review approved the `App.tsx` change and live QA verified the intended 3-way generic-drop behavior plus node-drop and MAX_COLS warning behavior.
  - Tradeoff: Follow-on work can stay focused on unresolved blockers instead of re-opening a fix that now has both review and live-runtime evidence.
- Decision: Keep build health separate from delivery acceptance.
  - Why: `BUILD_VERIFICATION.md` is `PASS`, while `QA_REPORT.md`, `BREAKER_REPORT.md`, and `REGRESSION_REPORT.json` still block acceptance.
  - Tradeoff: Avoids overstating failure in healthy build/runtime areas, but makes the final status intentionally mixed rather than simply green/red.
- Decision: Treat context minimization as a follow-on requirement.
  - Why: `CONTEXT_MANIFEST.json` now estimates about 20.7M tokens, which is too large for clean reuse.
  - Tradeoff: A smaller diff-first package requires more deliberate curation, but reduces stale-evidence drag and handoff noise.

## Verification Learnings
- Live UI proof can show the Explorer logic is fixed while the run still fails overall; all 5 required Explorer drop cases passed, but missing overlay/pointer-alignment capture still forced `QA_REPORT.md` to `FAIL`.
- Reviewer approval and green targeted tests are not enough when the contract also requires real runtime proof and breaker-specific coverage; the missing real `@dnd-kit/core` integration test and remaining DnD gaps still block confidence.
- Build/runtime health and acceptance health are separate gates in this repo. A run can legitimately have `BUILD_VERIFICATION.md = PASS` while remaining blocked on QA, breaker, and regression artifacts.

## Product / Stakeholder Learnings
- The Explorer contract is precise enough to validate as discrete user-visible cases: empty canvas creates level 0, non-full bottom level fills in place, full bottom level creates a new level, node drops create child paths, and full child levels must warn without adding a node.
- Pointer/overlay alignment evidence is part of the product acceptance bar for this DnD surface, not optional polish. If it cannot be captured live, the run should be treated as incomplete.

## Technical / Architecture Learnings
- Client-only UI contracts should not absorb backend cache, API, feature-extraction, or worker-count work. Even if tests pass, that drift creates separate regression and auditability problems.
- For DnD-heavy work, mocked handler-path tests are insufficient on their own. At least one unmocked `@dnd-kit/core` integration test is a durable requirement when the contract asks for real drag confidence.
- Oversized context bundles are themselves a delivery risk. Diff-first, artifact-minimal context is necessary once a run has already produced the decisive blocker set.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Once a breaker follow-on has been formally recorded, keep the original run limited to artifact hygiene and final-state recording; do not continue same-run remediation cycles.
- Scope: subsystem-specific
  - Guidance: Preserve review-approved, live-verified DnD behavior fixes in follow-on work instead of reopening them without new contrary evidence.
- Scope: repo-wide
  - Guidance: Keep follow-on context packages minimal and diff-first; very large manifests dilute decisive evidence and make blocker-focused continuation harder.

## Deferred / Follow-up
- Revert or split backend `src/` scope creep so the follow-on diff matches the client-only contract boundary.
- Change the default panel-height initialization to `Math.round(window.innerHeight * 0.70)` and re-verify first-render split geometry from a fresh session.
- Add at least one real, unmocked `@dnd-kit/core` integration test and close the remaining breaker-listed DnD coverage gaps.
- Decide upfront how overlay/pointer-alignment proof will be captured live so the next run does not fail on the same evidence gap.
