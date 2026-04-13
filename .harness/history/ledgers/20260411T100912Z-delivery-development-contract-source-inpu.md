---
run_id: 20260411T100912Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-11T12:13:55.562005+00:00
qa_verdict: PASS
build_status: FAIL
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 42
regression_severity: MEDIUM
---
# Run Ledger

## Outcome
- Task: Deliver Contract 1 of the single-pane client-shell redesign in `client/src/` with the two-zone shell, `activePanel` state model, mounted panel roots, dock interactions, and focused client tests.
- Result: The implementation is currently passable in contracted scope, but the run is still blocked at the pipeline level. `REVIEW_NOTES.md` is `APPROVE`, `QA_REPORT.md` is `PASS`, and `DESIGN_QA_REPORT.md` is `PASS_WITH_NOTES`; however `BUILD_VERIFICATION.md` is `FAIL`, `EVAL_REPORT.json` is failing on test/build evidence, and `BAD_STATE_REPORT.md` marks the run terminal because retries are exhausted and several downstream artifacts are stale or contradictory.
- Scope: The delivery diff stayed narrow inside `client/src/` plus related tests/styles. The blockage is now orchestration and verification-state integrity, not scope drift in the UI patch itself.

## Key Decisions
- Decision: Treat the shell refactor as substantively accepted in-scope even though the run cannot complete.
  - Why: Current reviewer, QA, and design-QA artifacts all agree that the Contract 1 behaviors landed and are usable on the live stack.
  - Tradeoff: The run cannot be declared complete because repo-level build/test gates still failed outside that narrow acceptance story.
- Decision: Stop same-run remediation and preserve auditability instead of patching around the latest blockage in-band.
  - Why: `BAD_STATE_REPORT.md` cites exhausted retry bookkeeping and the core-beliefs retry cap; continued same-run edits would violate the execution contract.
  - Tradeoff: The run ends with a blocked pipeline result even though the feature work itself is in a credible state.
- Decision: Record the current run as blocked primarily by build verification and stale artifact reconciliation, not by the older breaker narrative.
  - Why: The latest evidence shows the earlier QA/blocker story is outdated, while `BUILD_VERIFICATION.md` remains the fresh hard failure.
  - Tradeoff: Existing follow-on bookkeeping now needs human/orchestrator review before reuse, because a breaker-derived contract may no longer match the real blocker.

## Verification Learnings
- In this repo, UI-shell work can be functionally acceptable on the live stack and still be pipeline-blocked by unrelated or pre-existing build/test failures; feature acceptance and pipeline completion are separate gates.
- The most trustworthy current state came from the latest artifact set, not from already-generated downstream summaries. `BAD_STATE_REPORT.md` explicitly documents contradictions across QA, eval, breaker, and follow-on bookkeeping.
- Always-mounted hidden panels still create false-confidence risk in tests. Both reviewer and breaker artifacts agree that visibility-aware assertions are needed to validate active-panel behavior rather than mere DOM presence.
- Large verification payloads are poor handoff material. The run accumulated oversized duplicate snapshot artifacts, which weakens future context packaging without adding durable signal.

## Product / Stakeholder Learnings
- The Contract 1 product direction held up: persistent search and browse context, docked lower panels, background Matches refresh, and preserved access to Set/Explorer/Admin all validated live.
- The current implementation is good enough to treat the redesign direction as correct for Phase 1, while leaving Phase 2 cleanup and legacy-surface smoothing for later scoped work.
- Small-screen clipping at `1280x720` is a real but non-blocking UX note for future work: the architecture is acceptable, but top-anchor overflow behavior still deserves follow-on attention.

## Technical / Architecture Learnings
- The `activePanel` model plus mounted panel roots is a workable foundation for this shell, but it pushes more responsibility into test design and visibility-state verification.
- The temporary dual-`SetBuilder` bridge remains a medium regression risk because hidden and visible instances share hook-backed state while keeping independent local UI behavior.
- Follow-on contracts generated before verifier state settles can become stale. Here, a breaker-driven follow-on was recorded even though the freshest hard blocker became build verification and artifact inconsistency.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Distill run ledgers from the latest authoritative artifacts, not earlier gate failures; stale eval/bad-state/breaker summaries can outlive the actual state of the run.
- Scope: repo-wide
  - Guidance: When retry caps are exhausted, stop same-run remediation and explicitly hand off a fresh next step rather than continuing under a contradictory artifact set.
- Scope: subsystem-specific
  - Guidance: For `client/src/` shell work that keeps panels mounted, require visibility-aware tests and DOM checks because hidden content can make naive assertions look green.
- Scope: repo-wide
  - Guidance: Keep context manifests lean; reference large screenshots or snapshots instead of forwarding full duplicated dumps into follow-on runs.

## Deferred / Follow-up
- The recorded follow-on artifacts exist (`BREAKER_FOLLOW_ON_CONTRACT.md`, `FOLLOW_ON_RUN.json`), but they should be treated as potentially stale until reconciled against the latest build-verification and bad-state evidence.
- Contract 2 or the next run should start from this current truth: the shell redesign is acceptable in scope, the pipeline is blocked by failing build/test evidence plus stale bookkeeping, and no further same-run retries are allowed.
- The next orchestrated step should decide whether to replace the current breaker-driven follow-on with a narrow build-remediation or artifact-reconciliation contract, or to explicitly disposition the unrelated pre-existing build failures before resuming delivery work.
- If the breaker-derived follow-on is reused, keep its scope narrow and avoid reopening Phase 2 shell/design work, regression-risk cleanup, or unrelated backend/Python failures unless they are explicitly selected as the next contract.
