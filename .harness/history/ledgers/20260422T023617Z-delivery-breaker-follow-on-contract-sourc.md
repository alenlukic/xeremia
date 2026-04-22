---
run_id: 20260422T023617Z-delivery-breaker-follow-on-contract-sourc
mode: delivery
published_at: 2026-04-22T03:08:33.445686+00:00
qa_verdict: PASS_WITH_NOTES
build_status: PASS
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 80
regression_severity: LOW
---
# Run Ledger

## Outcome
- Task: Close the narrow breaker follow-on for the prior shell-plus-CRUD delivery by addressing nine IMPORTANT findings without reopening product scope.
- Result: The run landed the requested UI placeholders, route hardening, and verification upgrades; client finished at `711 passed`, backend at `836 passed`, QA closed `PASS_WITH_NOTES`, and the breaker still reported `CONCERNS` with follow-on work rather than blocker-level defects.
- Scope: Focused hardening only: `[Columns]` placeholder affordances, cross-view pool sort isolation coverage, player-bar smoke coverage, 27 new `TestClient` route tests across 8 of 17 endpoints, note-length boundary enforcement, `candidate_add` 404/409 handling, explorer-tree orphan cleanup on `version_delete`, and branch-point boundary tests.

## Key Decisions
- Decision: Standardize phased UI affordances as visible disabled placeholders with tooltip/test hooks rather than omitting the control entirely.
  - Why: The missing `[Columns]` affordances created product ambiguity and breaker churn even though the feature was intentionally deferred.
  - Tradeoff: Placeholder buttons preserve layout and communicate roadmap intent, but they must be explicitly marked non-functional so they do not create false expectations.
- Decision: Treat `TestClient` route tests as the required verification layer for new FastAPI CRUD surfaces, not as optional follow-up after service tests pass.
  - Why: Service tests proved domain rules, but they did not guarantee route status mapping, error payload shape, or response contracts that the frontend will consume.
  - Tradeoff: Route-level coverage adds test count and maintenance cost, but it catches contract-boundary regressions earlier than breaker review.
- Decision: Keep boundary and invariant enforcement at the API/service seam.
  - Why: Note-length caps, missing-track detection, duplicate-candidate rejection, branch-point validation, and explorer-tree cleanup are safer when enforced mechanically at the boundary.
  - Tradeoff: The current string-matching error discrimination in `routes.py` is workable for narrow follow-on fixes, but it does not scale as cleanly as structured exceptions.

## Verification Learnings
- HTTP-layer tests are first-class acceptance evidence for route-heavy contracts. New endpoint families should ship with representative `201`/`204`/`404`/`409`/`422` coverage before breaker review, not after it.
- High test counts can still hide boundary gaps: this run added 27 backend tests, but breaker evidence still matters because endpoint breadth and assertion strength are separate dimensions.
- UI placeholder work should be verified as visible and intentionally disabled; smoke-only tests are acceptable for phased affordances, but behaviorally specific claims like "push-up accommodation" need assertions that prove layout semantics, not just component presence.

## Product / Stakeholder Learnings
- The `[Columns]` placeholder pattern is now the preferred way to reserve future workspace controls in phased delivery: keep the affordance visible, disabled, and testable instead of silently deferring it.
- Search and add-track workflows remain product-critical. Contract 3 should restore them through modal/overlay UX inside the single-page shell rather than reintroducing legacy always-mounted panels.
- Frontend CRUD integration should reflect server-owned conflict and inheritance states in the UI. Contract 6 should surface backend outcomes clearly instead of masking them with client-side assumptions.

## Technical / Architecture Learnings
- Route-contract verification is a separate architectural seam from service-rule verification; both are required when the frontend depends on status codes and response shapes.
- `candidate_add` and `version_delete` showed the right hardening direction: reject invalid state transitions with explicit HTTP semantics and clean up linked data during destructive flows.
- The branch-point boundary tests established durable edge semantics worth preserving: negative indices fail at validation, branch points beyond the last slot copy all slots, and empty versions branch to zero slots.
- The current `"Maximum" in error -> 409` pattern in `routes.py` is acceptable as a local bridge, but future CRUD growth should move toward typed exceptions so route mapping stays legible and harder to break.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: For new API surfaces, require at least representative `TestClient` coverage of route-layer success and failure semantics before considering the contract verification-complete.
- Scope: subsystem-specific
  - Guidance: In the set-workspace UI, use disabled placeholder buttons with clear labels, tooltip copy, and stable test IDs when a future affordance must reserve layout space before implementation.
- Scope: subsystem-specific
  - Guidance: For Contract 3 search-modal work, extend the current single-page shell with modal/overlay search flows and subgroup-aware add actions; do not restore persistent legacy browse panes.
- Scope: subsystem-specific
  - Guidance: For Contract 6 frontend CRUD integration, treat FastAPI responses as the source of truth for conflict handling, inheritance state, and post-mutation refresh behavior rather than recreating backend rules in React state.

## Deferred / Follow-up
- Complete HTTP-layer coverage for the remaining 9 uncovered CRUD endpoints so the full route surface is protected before broader frontend integration.
- Strengthen the player-bar accommodation test to assert layout behavior directly, not just `PlayerBar` presence.
- Strengthen branch-boundary and slot-note tests with data-fidelity and read-back assertions where the breaker identified false-green risk.
- Consider replacing string-based route error discrimination with structured exception types if CRUD endpoint count continues to grow.
