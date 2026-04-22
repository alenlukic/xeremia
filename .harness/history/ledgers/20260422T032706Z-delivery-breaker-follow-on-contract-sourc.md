---
run_id: 20260422T032706Z-delivery-breaker-follow-on-contract-sourc
mode: delivery
published_at: 2026-04-22T03:51:05.681927+00:00
qa_verdict: PASS
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: UNKNOWN
eval_score: 0
regression_severity: UNKNOWN
---
# Run Ledger

## Outcome
- Task: Close the final breaker follow-on gaps for the Phase A + Phase C delivery series without widening scope.
- Result: PASS. HTTP-layer coverage was added for all eight existing uncovered CRUD routes, branch fidelity and note persistence assertions were strengthened, player-bar layout verification was tightened, and `TracklistNoteUpdateRequest.note` now enforces `max_length=10000`.
- Scope: `client/src/` test hardening for player-bar layout, plus `src/` route/schema test hardening and API-boundary validation for set workspace flows.

## Key Decisions
- Decision: Treat HTTP-layer CRUD coverage as required delivery evidence, not optional follow-on polish.
  - Why: The breaker correctly identified that route presence in a diff is not proof of behavior; direct `TestClient` coverage was needed to verify status and response-shape behavior.
  - Tradeoff: Added more route-level test maintenance, but removed a meaningful verification blind spot.
- Decision: Accept 8 of 9 route tests as complete because the ninth endpoint does not exist in the route layer.
  - Why: `GET /api/sets/{set_id}/explorer/trees/{tree_id}/nodes` was a speculative breaker finding; explorer nodes are served via the hydrated set response instead.
  - Tradeoff: Preserved scope discipline instead of inventing coverage for a nonexistent API surface.
- Decision: Tighten verification toward persisted state and concrete layout mechanisms, not just success envelopes.
  - Why: `{"ok": True}` and simple render checks can pass even when mutations or layout accommodations are broken.
  - Tradeoff: Tests became slightly more coupled to hydration and CSS structure, but confidence improved materially.

## Verification Learnings
- Mutation endpoints should not stop at `status == 200` and `{"ok": True}`; durable confidence comes from GET hydration read-back that proves persistence.
- Route-count coverage can still hide shallow assertions; breaker PASS with P2 hardening follow-ups is a valid outcome when contract items are met but assertion depth can improve.
- For UI layout accommodations in jsdom, asserting the actual container mechanism (here `.app-shell-v2` flex-column behavior) is stronger than asserting component presence alone.

## Product / Stakeholder Learnings
- HTTP-layer tests for CRUD delivery should be considered first-class acceptance criteria in future contracts; "the route exists" is not evidence the user-facing workflow works.
- Breaker findings that name missing endpoints should be checked against the actual route surface before they are turned into required work.

## Technical / Architecture Learnings
- Explorer tree nodes are not exposed through a dedicated `GET .../trees/{tree_id}/nodes` route; clients obtain nodes through the hydrated set response.
- Branch-boundary tests should verify copied candidate fidelity, not just counts; `track_id` and `is_inherited=True` are the durable signals that the inheritance contract held.
- Schema-boundary tests are the right place to lock note-size constraints; the `10000` character limit now has both schema and API-level evidence.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: For state-changing HTTP endpoints, prefer a mutation-plus-read-back test pattern over success-envelope assertions alone.
- Scope: repo-wide
  - Guidance: When a breaker cites uncovered routes, verify the endpoint actually exists before expanding scope or creating follow-on work.
- Scope: subsystem-specific
  - Guidance: In set-workspace explorer flows, treat the hydrated set response as the source of node data unless a dedicated nodes route is explicitly added later.

## Deferred / Follow-up
- P2 test-hardening remains optional: add read-back assertions for candidate select, version reorder, and slot reorder tests, and strengthen `test_list_trees_200` to prove non-empty content rather than only list shape.
