# Development Contract

## Source Inputs
- `SME_RECOMMENDATIONS.md` P1-4: add set / playlist builder
- `SME_RECOMMENDATIONS.md` P1-1 overlap: export as playlist connects to transition chaining
- `CUSTOMER_PERSONA_SPEC.md`: DJs build transition chains into real sets and export to performance media
- Repo inspection: current client has no set entity, playlist export path, or drag-reorder surface; likely touchpoints include `client/src/App.tsx`, `client/src/components/MatchesPanel.tsx`, `client/src/components/MatchDetail.tsx`, `client/src/components/TrackTable.tsx`, `client/src/api/http.ts`, `src/api/routes.py`

## Selected Intent
- delivery

## Deferred Inputs / Non-goals
- Advanced library management, crate organization, cloud sync, sharing, and multi-user collaboration are out of scope
- Do not bundle fusion-weight work, filter UX, or generic error-handling changes into this contract
- Avoid broad playlist-format support beyond the required `m3u8` export

## Contract
```md
DEVDSL-1
MODE: STRICT
TASK_KIND: ui_change
FLAGS: NO_EARLY_STOP PATCH_ONLY(require_file_read=true) TEST_GATE(full, flake_policy=rerun_once, extend_on_new_failure=true) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Add a minimal set builder with ordered transitions and playlist export
SCOPE: Introduce the smallest coherent set-management feature that lets a DJ accumulate tracks into a named ordered set, inspect transition quality between adjacent tracks, reorder tracks, and export the final set as an `m3u8` playlist.
DO: Add a first-class set-builder flow reachable from existing browse/match surfaces so users can add tracks into a named set. Represent the set as an ordered list, compute or display transition scores between adjacent items, highlight weak transitions, support user-driven reordering, and provide `m3u8` export for the resulting order. If persistence is required to support named sets coherently, add the minimal data model, API routes, and client API bindings needed for that workflow.
NON_GOALS: Do not build a full DJ preparation suite; do not add collaborative features, waveform editing, or USB device sync; do not broaden export beyond `m3u8`; do not rely on ephemeral hidden state for a feature that presents itself as a named set unless that limitation is made explicit and intentionally accepted.
AFFECTED_AREAS: New client set-builder components/state, likely `client/src/App.tsx`, `client/src/components/MatchesPanel.tsx`, `client/src/components/MatchDetail.tsx`, `client/src/components/TrackTable.tsx`, `client/src/api/http.ts`; backend additions likely in `src/api/routes.py` plus new model/service/export code and corresponding backend/client tests.
DEPENDENCIES: preferably execute after `05-match-discoverability-and-transition-chaining.md`
VALIDATION: Add focused client and backend tests for creating a named set, adding tracks from supported surfaces, reordering, weak-transition highlighting, and `m3u8` export shape. Manually verify that a user can build a short ordered set, inspect adjacent transition quality, reorder tracks, and download or retrieve a valid `m3u8` export.
ACCEPTANCE: Users can create or select a named set; tracks can be added to that set from match results or browse; the set is shown as an ordered list with transition scores between adjacent entries; users can reorder tracks via drag-and-drop or an equivalently clear direct-manipulation interaction; weak transitions are visibly highlighted; the set can be exported as `m3u8`.
OUTPUT: schema=default
```

## Notes to Orchestrator
- This is the broadest contract in the batch and should remain an MVP. Resist the urge to turn it into a generalized library-management subsystem.
- If persistence becomes necessary, prefer the smallest durable model and API that can truthfully support "named set" semantics.
