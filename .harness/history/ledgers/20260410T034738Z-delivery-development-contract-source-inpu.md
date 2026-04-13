---
run_id: 20260410T034738Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-10T05:08:02.517234+00:00
qa_verdict: FAIL
build_status: PASS
breaker_verdict: CONCERNS
eval_verdict: FAIL
eval_score: 65
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: Deliver Contract 7 explorer interaction-model changes: per-level `+Add Track`, adjacent-level drag-to-connect, direct edge deletion, and selected-node-only action controls while preserving Contract 6 behavior.
- Result: Contract 7 functionality landed after a narrow retry to stop phantom connect-drag on plain clicks. Focused explorer frontend tests passed (`36/36`), backend service/API tests passed (`40/40`), and the client build passed. A broader full-client run still showed 6 out-of-scope `App.test.tsx` failures, and repository QA remained `FAIL` under live-stack policy.
- Scope: Explorer canvas interaction surface plus minimal hook/API/backend wiring for edge deletion; breaker-discovered interaction-isolation regressions were split into a follow-on run at `/Users/alen/Dev/dj-tools/.harness/runs/20260410T050627Z-delivery-development-contract-source-inpu`.

## Key Decisions
- Decision: Keep the Contract 7 delivery narrowly centered on the explorer interaction model and preserve prior Contract 6 correctness guarantees instead of reopening adjacent explorer behavior.
  - Why: The contract depended on raw-title rendering, fixed sizing constants, swap semantics, and child-add dedup already being correct, so widening scope would have increased drift risk.
  - Tradeoff: Some nearby interaction-state issues remained latent and were surfaced later by breaker/regression rather than being absorbed into the first delivery slice.
- Decision: Separate plain-click node selection from drag-to-connect with an explicit retry after phantom connect-drag behavior appeared.
  - Why: When click and drag share the same pointer path, a movement threshold or equivalent guard is required to keep normal clicks from mutating graph structure.
  - Tradeoff: The retry added a small second pass, but it preserved the intended interaction model without broad refactoring.
- Decision: Treat breaker/regression interaction-isolation findings as a new follow-on contract instead of silently folding them into the completed Contract 7 run.
  - Why: The repository harness favors auditability and fresh scoped remediation once user-impacting findings are independently confirmed.
  - Tradeoff: The original run records a landed feature set plus unresolved completion gates rather than ending as a single all-green pass.

## Verification Learnings
- Focused evidence was strong for the scoped feature work: explorer frontend tests passed (`36/36`), backend service/API tests passed (`40/40`), and the client production build passed.
- Full-repo completion is gated by live-stack policy, not by scoped unit/integration success alone. This run stayed `FAIL` at the QA layer because live search responsiveness breached the repository `<=500ms` rule (`1339.9ms`) and service lifecycle verification was not completed end-to-end.
- Out-of-scope suite failures in `App.test.tsx` can coexist with a credible scoped delivery result, but they should be recorded as non-blocking only when clearly separated from contract evidence.

## Product / Stakeholder Learnings
- Explorer interaction work is highly sensitive to mode isolation. Users experience click, drag, swap, edge selection, and modal entry as one continuous surface, so stale state leaking across those modes creates surprising destructive behavior.
- Direct-manipulation affordances like drag-connect and keyboard edge delete improve flow, but only if plain clicks remain safe and predictable; accidental mutation on normal selection is a high-cost trust break.

## Technical / Architecture Learnings
- Canvas interaction state needs explicit boundaries between selection, dragging, swap mode, edge selection, and modal-driven flows. Two durable regressions were confirmed after Contract 7:
  - Keyboard edge-delete must never fire while focus is inside modal search/input fields or other editable controls.
  - Pending swap state must clear when the user transitions into other interaction modes such as edge selection or level-add.
- Breaker/regression review is effective at catching interaction-isolation bugs that callback-only tests can miss. Focused tests for nominal behavior were not enough to prove safe behavior during cross-mode transitions.
- For mixed click/drag gestures, regression coverage should include the non-drag boundary, not just successful drags and obvious invalid drops.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: In `SetExplorerCanvas`, any new interaction mode should explicitly clear or suppress incompatible modes on entry; do not rely on incidental state replacement.
- Scope: subsystem-specific
  - Guidance: Keyboard shortcuts bound at `window` scope must guard against active editable focus before performing destructive explorer actions.
- Scope: repo-wide
  - Guidance: A run with strong focused tests and a passing build still does not clear completion if repository live-stack QA gates fail; live responsiveness and lifecycle checks remain authoritative.
- Scope: repo-wide
  - Guidance: When breaker/regression findings expose narrow, user-impacting issues after delivery, prefer a fresh follow-on run over widening the original patch set.

## Deferred / Follow-up
- Breaker/regression findings were spun into a new breaker-driven run at `/Users/alen/Dev/dj-tools/.harness/runs/20260410T050627Z-delivery-development-contract-source-inpu`.
- Follow-on scope should remain narrow: guard keyboard edge-delete during editable focus, clear edge selection when modal add flows open, clear stale swap mode when entering edge-selection or level-add interactions, and add focused regression coverage for those paths.
- Repository live-stack QA remains unresolved for this delivery slice until responsiveness and lifecycle policy gates are satisfied end to end.
# Run Ledger

## Outcome
- Task: Deliver Contract 7 explorer interaction-model changes: per-level `+Add Track`, adjacent-level drag-to-connect, selectable/deletable edges, and selected-node-only action rows while preserving Contract 6 behavior.
- Result: Core delivery landed and passed review, QA, build, and automated tests, but the run did not close cleanly because breaker/regression findings required follow-on run `20260410T050308Z-delivery-development-contract-source-inpu`.
- Scope: Narrow explorer-canvas slice only: canvas interactions, edge-delete frontend/backend wiring, supporting styles/hooks/API/service changes, and focused regression tests.

## Key Decisions
- Decision: Replace per-node sibling affordances with one always-visible per-level add control positioned at the row edge, including level-0 root add.
  - Why: This reduced repeated UI clutter and matched the contract’s level-based interaction model without reopening prior explorer sizing/title behavior.
  - Tradeoff: Add behavior now depends on level context and inherited-parent rules instead of the simpler per-node trigger.
- Decision: Gate drag-to-connect to adjacent levels only and normalize parent/child direction by level.
  - Why: The contract explicitly limited connection creation to one-level transitions and required a predictable lower-level-as-parent rule.
  - Tradeoff: Multi-level linking remains intentionally unsupported even if a user can visually imagine a longer jump.
- Decision: Make edge deletion an explicit select-then-delete flow backed by a dedicated `DELETE /api/sets/{set_id}/explorer/edges/{edge_id}` path.
  - Why: This kept destructive behavior visible and reversible at the interaction-model layer while aligning frontend state with a narrow backend capability.
  - Tradeoff: Selection state became another interaction mode that required careful isolation from node selection, swap mode, and modal typing.
- Decision: Hide node action rows until node selection and clear them on background click.
  - Why: The explorer needed less ambient control noise and clearer focus on the currently selected node.
  - Tradeoff: More UI state transitions increased the risk of mode leaks, which later surfaced in breaker/regression findings.

## Verification Learnings
- Review closed `APPROVE` with all acceptance criteria marked satisfied; only a glyph/aria nit remained.
- QA closed `PASS` with requirement trace coverage for C1-C4 plus Contract 6 preservation, and live runtime checks confirmed search/filter responsiveness, cache population after match loading, and `DELETE` edge removal returning `204`.
- Build verification closed `PASS`: client tests `250 passed`, backend API tests `40 passed`, and `npm run build` succeeded.
- Strong feature coverage did not prevent interaction-state regressions; focused callback assertions were not enough to catch keyboard-delete behavior while typing in modal inputs.

## Product / Stakeholder Learnings
- The explorer interaction model is easier to reason about when actions are organized by level and explicit selection state rather than always-on per-node controls.
- Destructive keyboard shortcuts in mixed modal/canvas workflows are user-facing blockers even when primary task flows otherwise test green.

## Technical / Architecture Learnings
- Canvas interaction features should treat node selection, edge selection, swap mode, drag-connect, and modal editing as mutually exclusive modes with explicit handoff rules.
- Thin backend endpoints are still worth adding when a frontend interaction becomes first-class; the dedicated edge-delete route kept deletion semantics clearer than overloading broader set-update flows.
- Regression artifacts were correct to escalate this run despite passing review/QA/build, because the remaining failures were interaction-isolation bugs rather than cosmetic gaps.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For explorer-canvas work, verify keyboard shortcuts against focused editable controls and modal flows, not only against bare-window events.
- Scope: subsystem-specific
  - Guidance: When breaker or regression lanes find actionable interaction bugs after a green delivery pass, close the run with a fresh follow-on contract instead of silently widening the same run.
- Scope: one-off
  - Guidance: Keep run ledgers strictly outcome-focused; malformed placeholder ledgers should be replaced with the final compact structure rather than incrementally appended.

## Deferred / Follow-up
- Breaker and regression findings remained blocking at closeout: selected-edge `Delete`/`Backspace` could fire while typing in modal inputs, and swap mode could leak into later interactions.
- Those issues were intentionally not folded back into this run; they spawned follow-on run `20260410T050308Z-delivery-development-contract-source-inpu` per the repository breaker-follow-on policy.
