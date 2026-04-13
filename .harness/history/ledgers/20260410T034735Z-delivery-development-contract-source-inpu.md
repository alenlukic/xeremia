---
run_id: 20260410T034735Z-delivery-development-contract-source-inpu
mode: delivery
published_at: 2026-04-10T04:28:30.706734+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: PASS
eval_verdict: PASS
eval_score: 100
regression_severity: NONE
---
# Run Ledger

## Outcome
- Task: Deliver Contract 6 explorer correctness fixes: raw node titles, wider/taller explorer nodes, track-id-only swap semantics, and child-add deduplication.
- Result: PASS. The run landed the requested explorer behavior changes and held final product edits to `SetExplorerCanvas.tsx`, `useSetBuilder.ts`, and `service.py`; `routes.py` required no change.
- Scope: Narrow delivery run with a second-pass correction to remove an out-of-scope first draft change in `explorer_rules.py` and keep Contract 7 interaction work out of the diff.

## Key Decisions
- Decision: Keep arbitrary-node swap behavior in `SetWorkspaceService.explorer_swap()` instead of broadening `explorer_rules.py`.
  - Why: The first draft drifted outside the scope lock by changing shared swap validation logic. Moving the contract behavior into the service preserved the requested runtime behavior while restoring narrow scope.
  - Tradeoff: `validate_swap` became dead code and its legacy tests still pass even though runtime swap no longer uses them.
- Decision: Reuse existing child nodes through `addExplorerEdge()` rather than adding a separate dedup path.
  - Why: This preserved the existing edge idempotency and cycle-protection behavior while meeting the contract requirement to avoid duplicate child nodes.
  - Tradeoff: Dedup remains client-state-driven, so rapid repeated adds can still race in the UI.
- Decision: Treat `routes.py` as unchanged pass-through code.
  - Why: The contract named it, but the required semantic fix was fully satisfied in the service layer and reviewer/QA accepted leaving the route untouched.
  - Tradeoff: Future readers need to verify where behavior actually lives instead of assuming every named file changed.

## Verification Learnings
- Strong evidence came from focused plus broad automated checks, not just unit-level edits: `npm test -- --run` passed for the full client suite, `pytest src/tests/test_set_workspace_api.py` passed for the backend suite, and `npm run build` passed.
- Requirement-specific confidence came from targeted reruns and runtime API smokes: canvas/hook tests passed, swap-focused backend tests passed, and `/api/search`, `/api/tracks/{id}/matches`, and `/api/admin/cache-stats` all returned `200`.
- The meaningful remaining gap is UI-runtime depth, not code correctness breadth: QA relied on focused runtime/API checks rather than a full interactive explorer browser walkthrough.

## Product / Stakeholder Learnings
- Explorer usability improved by showing raw stored titles instead of `cleanTitle` output; this preserves bracketed/key-prefixed metadata users rely on when scanning candidate transitions.
- The swap affordance is clearer when the control says `Swap track IDs` and keeps the `↕` glyph, aligning the UI with the corrected behavior that swaps track assignments rather than graph positions.

## Technical / Architecture Learnings
- Swap semantics belong to track assignment, not graph topology: the durable invariant is that `node_id`, `level`, and edges remain stable while only `track_id` changes.
- Child-add dedup is safest when it reuses existing graph mutation primitives rather than introducing parallel edge creation logic.
- False confidence can come from tests attached to unused helpers; once service code bypasses a validator, its passing tests no longer prove runtime policy.

## Durable Repo Guidance
- Scope: subsystem-specific
  - Guidance: For set-explorer behavior changes, prefer service-layer mutations and reuse existing edge-creation paths before changing shared rule helpers; this keeps graph invariants local and reduces scope drift.
- Scope: subsystem-specific
  - Guidance: When a contract names multiple files, verify whether each one truly needs a code change; preserving a no-op file is preferable to making a cosmetic diff just to match the contract wording.
- Scope: one-off
  - Guidance: Interpret this run’s `PATCH.diff` carefully because it also contained a pre-existing `styles.css` change from another contract and should not be attributed to Contract 6.

## Deferred / Follow-up
- Remove dead `validate_swap` code and its disconnected tests in a hygiene pass or follow-on contract.
- Add a truncation-boundary test only if regressions recur; the contract required a materially wider title window, not a specific exact cutoff.
