---
run_id: 20260412T032222Z-delivery-ui-polish-batch-anchor-height-re
mode: delivery
published_at: 2026-04-12T04:50:35.227873+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: PASS
eval_verdict: PASS
eval_score: 85
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Deliver the scoped UI polish pass from `.harness/contracts/2026-04-12/DEVELOPMENT_CONTRACT_1.md` across the browse, matches, dock, and explorer surfaces.
- Result: Final closeout is `APPROVE` review, `PASS` live Chrome DevTools QA on `http://localhost:5173/`, `PASS` build verification with only the explicitly allowed unchanged `SetExplorerCanvas.tsx` residual, breaker `PASS`, regression `LOW` and non-blocking, and evaluation `PASS` at `85/80`.
- Scope: Dirty-worktree-aware validation of a mostly already-landed UI diff, with only a narrow supporting test cleanup in `client/src/components/TrackTable.test.tsx` during this orchestration pass.

## Key Decisions
- Decision: Preserve the partially implemented contract work already present in the dirty client files instead of redoing it.
  - Why: Intake and review confirmed several contract items were already landed in the worktree, and the run was expected to validate and finish that state rather than overwrite it.
  - Tradeoff: Kept patch churn low and respected in-flight edits, but made diff-aware review and evidence-backed verification more important than raw implementation volume.
- Decision: Keep code changes narrowly scoped to the supporting `TrackTable.test.tsx` fix while treating the broader client diff as the delivery candidate to validate.
  - Why: The remaining work was primarily closeout and verification, not a fresh UI rewrite.
  - Tradeoff: The run records a successful validation-driven delivery, but the ledger must be explicit that much of the shipped UI state predated the orchestration pass.
- Decision: Accept the final non-blocking breaker and regression findings as documented residual risk without spawning a remediation run.
  - Why: Live QA, review, build verification, and evaluation all passed, and the remaining findings were confidence gaps or adjacent low-risk behavior rather than delivery failures.
  - Tradeoff: The record stays accurate to the final shipped state, but future edits near browse/matches actions or no-panel resize behavior should add targeted regression coverage.

## Verification Learnings
- Live Chrome DevTools validation was sufficient to close the visual and DOM contract items when paired with clean console output, successful network activity, and populated cache evidence on the running app.
- Qualitative layout targets such as "roughly half the viewport" close more cleanly when backed by geometry evidence; the anchor ratio measured around `0.43`, which QA accepted as materially satisfying the requested move away from the prior one-third feel.
- Allowed residual build failures must be named precisely. This run stayed green because the only non-zero build condition was the unchanged pre-existing `SetExplorerCanvas.tsx` `TS2322` signature already permitted by the contract.
- Removing UI controls should be accompanied by automated negative assertions, not just deletion of older presence tests; the final breaker `IMPORTANT` shows how false confidence can remain even after strong live QA.

## Product / Stakeholder Learnings
- The stakeholder-visible polish goals all held on the live app: one-row search/filter controls, no browse or matches `+ Pool` / `+ TL` actions, in-header column chooser placement, draggable pre-panel resize handle, stable browse header/body alignment, tighter explorer whitespace, and clean runtime behavior.
- For UI-polish runs, stakeholders may care more about validated live behavior than about which portion of the diff was newly authored in-run; the durable record should therefore distinguish "validated final state" from "new code written this pass."

## Technical / Architecture Learnings
- Dirty-worktree delivery is workable when the run explicitly preserves user edits, limits any new patch to the minimum needed for closeout, and treats review plus runtime verification as first-class evidence.
- Enabling a previously inert interaction path, such as no-panel resize, can introduce real persistence semantics even when the visible change is framed as UI polish; that kind of adjacent behavior should be tracked as low-risk regression, not ignored.
- Incidental out-of-contract hardening like the `IntersectionObserver` sentinel path should either ship with focused tests or remain clearly documented as adjacent risk so later maintainers know it was not the contract center of gravity.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: In dirty-worktree client runs, preserve partially landed contract work when it already satisfies the ask, then narrow new edits to the smallest supporting fix and let review/QA/build artifacts carry the proof burden.
- Scope: repo-wide
  - Guidance: When a contract explicitly allows an unchanged residual failure, verification artifacts should confirm it is still the sole failure signature and avoid overstating the build as fully clean.
- Scope: subsystem-specific
  - Guidance: When UI controls are removed, replace former existence tests with absence assertions so future regressions are caught automatically rather than only through manual QA.

## Deferred / Follow-up
- No mandatory follow-on run was created from the final breaker/evaluation state.
- Optional follow-up: add negative regression tests proving browse and matches tables keep `+ Pool` / `+ TL` absent.
- Optional follow-up: if future work touches panel resizing or non-virtualized load-more behavior, add focused coverage for no-panel height persistence and the `IntersectionObserver` sentinel path.
