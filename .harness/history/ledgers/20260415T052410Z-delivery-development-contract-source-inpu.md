---
run_id: 20260415T052410Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-15T06:35:57.624360+00:00
qa_verdict: PASS
build_status: FAIL
breaker_verdict: CONCERNS
eval_verdict: FAIL
eval_score: 73
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: Restore set-workspace usability by fixing set-tracklist reorder persistence and making tracklist/pool horizontal scrolling reachable during long vertical scroll.
- Result: The contract-scoped UI fix was implemented and independently approved by review, QA, and design QA, but the overall run remained blocked because the realized diff was contaminated by unrelated changes, the client production build failed, and breaker findings required follow-on work.
- Scope: Intended scope was six frontend files for the set workspace; realized run evidence covered a 30-file cross-stack diff, so the run is not publishable as a clean single-contract delivery.

## Key Decisions
- Decision: Use a shared inner table scroll-shell pattern instead of redesigning the set workspace tables.
  - Why: It preserved sticky headers, existing controls, and current table behavior while making horizontal scrollbars reachable in long vertically scrolling views.
  - Tradeoff: Narrow layouts still require substantial horizontal scrolling because table min-widths are preserved rather than compressed.
- Decision: Repair reorder through the existing drag-end and persisted reorder path instead of replacing the DnD workflow.
  - Why: This kept the fix narrow and preserved the existing interaction model while restoring persistence after refresh.
  - Tradeoff: Verification remained stronger on handler wiring and persistence than on true browser drag interaction.
- Decision: Treat the CORS PATCH bug as a breaker-driven follow-on instead of broadening this run further.
  - Why: The issue was concrete, production-facing, and separable from the approved UI fix.
  - Tradeoff: The current run remains blocked and should not be treated as the authoritative delivery vehicle for adjacent backend or infra changes.

## Verification Learnings
- Passing review, QA, and design QA can prove the contract-scoped UI behavior, but they do not validate unrelated changes mixed into the same diff.
- A green dev-runtime check is not a substitute for the repository build gate; `npm --prefix client run build` failing keeps the run blocked even when targeted tests and manual UI checks pass.
- Mock-driven DnD tests are useful for handler-path regression coverage, but they leave a confidence gap around real drag wiring and live browser behavior.

## Product / Stakeholder Learnings
- The minimal UX win was to keep the existing table layout and controls intact while making horizontal scrolling continuously reachable; a broader redesign was unnecessary for this contract.
- In the constrained set-mode-left layout, preserving full column widths was accepted as the better tradeoff versus compressing columns, as long as the scrollbar remains accessible and actions stay reachable.

## Technical / Architecture Learnings
- The shared scroll-shell pattern is effective for both set-tracklist and pool tables when overflow moves to an inner flex child and the parent flex chain preserves `min-height: 0`.
- DnD ownership needs to stay scoped to the active panel instance; threading `dndDisabled` through the set workspace prevents cross-panel drag target conflicts.
- Evidence integrity matters as much as implementation correctness: stale or contradictory stage artifacts and mixed diffs undermine auditability even when the intended feature itself is sound.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Keep delivery runs aligned to a single contract-sized diff; if unrelated work is present in the worktree, isolate it or move it into separate follow-on contracts before treating verification as authoritative.
- Scope: repo-wide
  - Guidance: Treat failed production builds as blocking evidence even when manual QA and targeted tests pass.
- Scope: subsystem-specific
  - Guidance: For set-workspace drag/drop changes, pair handler-level tests with at least one verification method that exercises real DnD identifiers or real browser drag behavior.
- Scope: repo-wide
  - Guidance: When breaker findings expose a bounded production bug, prefer a fresh follow-on contract over silently folding remediation into an already contaminated run.

## Deferred / Follow-up
- A breaker follow-on contract was created for the PATCH CORS issue in `src/api/app.py`, and a new follow-on run was started to fix and verify that bug in isolation.
- Explorer tree rename/delete work, explorer-only fixes, and port or harness configuration changes should only proceed under separate contracts with dedicated verification.
- If the explorer rename/delete feature is retained, it still needs its own backend coverage and contract-specific acceptance criteria.
