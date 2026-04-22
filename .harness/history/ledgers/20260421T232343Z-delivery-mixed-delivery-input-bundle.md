---
run_id: 20260421T232343Z-delivery-mixed-delivery-input-bundle
mode: delivery
published_at: 2026-04-22T00:16:53.692557+00:00
qa_verdict: PASS_WITH_NOTES
build_status: FAIL
breaker_verdict: UNKNOWN
eval_verdict: FAIL
eval_score: 66
regression_severity: HIGH
---
# Run Ledger

## Outcome
- Task: Deliver Contract 2 (Phase A shell rewrite) and Contract 5 (backend Phase C CRUD) in one bundled run.
- Result: Both contracts landed with green scoped verification at handoff (`PASS_WITH_NOTES` overall, reviewer `APPROVE`, breaker with 10 IMPORTANT and no BLOCKER findings), and a breaker follow-on contract was generated instead of broadening the same run.
- Scope: Client shell direction was reset to a single-page workspace with persistent tracklist/pool zones and nodes-only explorer toggle; backend exposed the version/slot/candidate CRUD surface plus branch/inheritance lifecycle behavior for later frontend integration.

## Key Decisions
- Decision: Replace the DockBar-era multi-panel shell with a single-page workspace, but defer search restoration and richer CRUD UI to later phases instead of keeping legacy panels mounted.
  - Why: The new shell simplifies navigation and establishes a stable layout baseline for later modal-driven flows.
  - Tradeoff: Removing persistent Browse/Matches-era entry points created real regression risk around direct search/add workflows, so later phases must restore those flows without backsliding to the old shell.
- Decision: Centralize Phase C version/slot/candidate invariants in backend service logic before wiring all 17 FastAPI endpoints.
  - Why: Limits, contiguous ordering, single-selected-candidate rules, and `is_inherited` lifecycle are easier to keep consistent when enforced once at the service layer.
  - Tradeoff: Service-heavy coverage can look comprehensive while still missing HTTP-layer status mapping, payload-shape, and rollback behavior that frontend consumers depend on.
- Decision: Treat breaker findings as follow-on work instead of folding them into the original delivery.
  - Why: The client shell rewrite and backend CRUD work were already large, and preserving the breaker report as first-class evidence keeps the remediation auditable.
  - Tradeoff: Known non-blocking gaps remained open at run close, so downstream contracts must use the breaker follow-on as input rather than assuming this bundle is the final word.

## Verification Learnings
- Large shell rewrites can invalidate broad swaths of existing UI tests; high pass counts only become meaningful again after old-behavior tests are replaced with workflow-level assertions for the new shell.
- Backend service tests are not enough for new API surfaces. When routes contain status-code selection or response-shape assembly, add `TestClient` coverage before frontend integration begins.
- Review and QA can create false confidence if placeholder/stub requirements are interpreted loosely. If a contract expects a visible affordance, the affordance must exist or be explicitly deferred in the acceptance language.
- Parallel contracts can be implementation-disjoint but still create verification ambiguity and diff-budget pressure when their evidence is packaged into one run.

## Product / Stakeholder Learnings
- The single-page workspace is the preferred direction for set-building. Future work should extend that shell rather than revive tabbed DockBar navigation.
- Search/add flows remain product-critical even when deferred. Contract 3 should restore a discoverable search path via modal/overlay UX, not by reintroducing always-mounted legacy panels.
- Nodes-only explorer presentation was acceptable as a focused alternate view, which supports continuing to defer edge rendering while the core workflow is stabilized.

## Technical / Architecture Learnings
- The backend CRUD layer now has a durable server-side contract: max-version/max-slot/max-candidate limits, contiguous slot ordering, exactly one selected candidate per non-empty slot, branch copy through a branch point, and mutation-driven clearing of `is_inherited`.
- `is_inherited` should be treated as transient server-owned state. Contract 6 should read and react to it from API payloads rather than trying to infer it in the client.
- Boundary hardening still matters even when service behavior is correct: note-size limits, `track_id` existence checks, duplicate candidate prevention, explorer-tree cleanup, and branch-point boundary handling are all better enforced at the API/data layer than by UI convention.
- Cache acceptance needs to exercise the production path, not the helper in isolation. The durable lesson is to verify write-on-compute behavior through `api_transition_scores()` whenever cache behavior is part of an acceptance criterion.

## Durable Repo Guidance
- Scope: repo-wide
  - Guidance: Use parallel delivery only when contracts are clearly disjoint by subsystem, but prefer a new follow-on run over same-run expansion once breaker findings appear.
- Scope: subsystem-specific
  - Guidance: For the workspace shell, preserve the fixed-header + tracklist/pool layout baseline and add future capabilities as overlays or modal flows; do not reintroduce standalone Browse, Matches, or Explorer shell regions.
- Scope: subsystem-specific
  - Guidance: For frontend CRUD integration, treat the FastAPI route layer as the contract boundary and verify representative `201`/`204`/`404`/`409` behaviors before wiring optimistic UI around the new endpoints.
- Scope: repo-wide
  - Guidance: When a contract accepts placeholders, specify that explicitly and test for visible presence. Do not rely on adjacent controls or reviewer interpretation to satisfy a missing affordance.
- Scope: one-off
  - Guidance: The diff-budget waiver was expected for this combined bundle, but it should not be treated as precedent for unrelated multi-contract deliveries.

## Deferred / Follow-up
- Contract 3 should restore search and add-track workflows inside the new shell, including subgroup-aware add behavior, without undoing the single-page layout decision.
- Contract 6 should consume the new CRUD APIs with UX that reflects server-owned invariants and conflict states rather than duplicating backend rules in the client.
- The generated breaker follow-on should be treated as the immediate hardening path for missing UI stubs, route-level tests, player-bar/sort-isolation coverage, and backend data-integrity gaps.
