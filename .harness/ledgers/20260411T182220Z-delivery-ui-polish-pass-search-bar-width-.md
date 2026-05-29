---
run_id: 20260411T182220Z-delivery-ui-polish-pass-search-bar-width-
mode: delivery
published_at: 2026-04-11T19:34:35.751991+00:00
qa_verdict: FAIL
build_status: PASS_WITH_NOTES
breaker_verdict: UNKNOWN
eval_verdict: UNKNOWN
eval_score: 0
regression_severity: UNKNOWN
---
# Run Ledger

## Outcome
- Task: Deliver five scoped UI-polish changes in `client/src/`: wider search/header cleanup, selected-track-in-search behavior, right-aligned weights/admin icons, labels below filter controls, and a roughly 30/70 top-bottom split.
- Result: Blocked at QA, not shipped. Review remained approved, but fresh QA failed the behavioral requirement that clearing the search input must clear both search text and selected-track state.
- Scope: Narrow client-side run for the four scoped UI files. Retry cap was exhausted (`2 / 2`), so the run was captured as blocked instead of being silently retried.

## Key Decisions
- Decision: Keep the run outcome recorded as blocked once QA found `searchInputValue=""` while `selectedRowsCount=1` and the matches heading still reflected the prior track.
  - Why: The task contract explicitly requires clearing the search input to clear both `searchText` and `selectedTrack`.
  - Tradeoff: The run preserves approved review feedback, but cannot be treated as complete because QA gates product behavior.
- Decision: Treat the Explorer drag-to-existing-node child-creation miss as non-gating context only for this ledger.
  - Why: The issue was already known and explicitly overridden for this run because a separate contract is addressing it.
  - Tradeoff: The behavior is still worth remembering as adjacent context, but it is not the reason this run is blocked.
- Decision: Stop the run at the QA failure instead of rerunning the downstream verification stack.
  - Why: Once the QA gate failed and retry allowance was exhausted, additional verifier/evaluator/regression passes would not change shipment status.
  - Tradeoff: Later-stage verification artifacts remain intentionally absent for this run state.

## Verification Learnings
- Review can stay `APPROVE` while shipment still blocks at QA; this run is a concrete example that behavioral gate evidence outranks review approval for completion.
- For this client flow, QA must verify both visible input state and latent selection state together. An empty search box is not sufficient evidence if row selection and matches context remain active.
- Verification beyond QA was not rerun after the failure, so the durable conclusion is limited to the QA-gated behavioral miss rather than full-stack signoff.

## Product / Stakeholder Learnings
- Moving selected-track context into the main search input remains the right product direction, but the clear-input interaction has to fully reset selection context or the UI becomes misleading.
- Non-gating known issues should be recorded explicitly in the run ledger when they are observed during QA so future readers do not mistake their absence for verification coverage.

## Technical / Architecture Learnings
- `searchText` and `selectedTrack` remain a coupled state contract in the client: clearing the input must clear both, not just the rendered text value.
- QA evidence should capture both DOM/input values and selection-derived UI state such as selected rows and matches headings when validating search-selection behavior.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: In search/selection UI flows, treat clear-input behavior as a full state-reset path and verify it against both control values and dependent selected-state UI.
- Scope: repo-wide
  - Guidance: When a run has exhausted its retry cap after a gate failure, record it as blocked and stop rather than manufacturing additional verification artifacts that imply forward progress.

## Deferred / Follow-up
- Follow-up belongs in a new contract/run that fixes the clear-input deselection path and reruns QA before any downstream verification stack work.
- Explorer drag-to-existing-node child creation remains recorded here as non-gating context only; it should be tracked through the separate contract already covering that behavior.
