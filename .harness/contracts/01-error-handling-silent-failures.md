# Development Contract

## Source Inputs
- `DESIGN_RECOMMENDATIONS.md` P0-2: silent failure on API errors
- Repo inspection: `client/src/App.tsx`, `client/src/hooks/useSelectedTrack.ts`, `client/src/hooks/useCollectionCache.ts`, `client/src/components/MatchesPanel.tsx`, `client/src/components/MatchDetail.tsx`, `client/src/api/http.ts`

## Selected Intent
- delivery

## Deferred Inputs / Non-goals
- Weight save status, saving spinners, and transient "Saved" confirmation are deferred to `03-weight-save-status-indicator.md`
- Filter UX, matches-table restructuring, transition chaining, fusion scoring, and set-building are out of scope
- Do not redesign the Admin tab beyond preserving its existing explicit error behavior

## Contract
```md
DEVDSL-1
MODE: STRICT
TASK_KIND: ui_change
FLAGS: NO_EARLY_STOP PATCH_ONLY(require_file_read=true) TEST_GATE(full, flake_policy=rerun_once, extend_on_new_failure=true) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Surface client-side load failures instead of empty-state fallthrough
SCOPE: Add explicit error-state plumbing for match loading, browse collection loading, trait hydration, and match-detail fetches so the client distinguishes "no data" from "failed to load". Keep the work narrowly scoped to existing client hooks/components and the current API contract.
DO: Update the selected-track and collection-cache hooks to retain structured load/error state instead of collapsing failures to empty arrays or empty maps. Render distinct error UI in the Matches surface when match retrieval fails, in the Browse surface when tracks or traits fail to load, and in match detail when detail fetch fails. Preserve normal empty-state copy for real zero-result cases only. Reuse current `fetch*` error messages where practical so API failures remain diagnosable without inventing a new error model.
NON_GOALS: Do not add retry orchestration beyond simple user-visible messaging; do not introduce global toast infrastructure; do not change backend endpoints or response shapes; do not fold weight save/error affordances into this contract.
AFFECTED_AREAS: `client/src/hooks/useSelectedTrack.ts`, `client/src/hooks/useCollectionCache.ts`, `client/src/App.tsx`, `client/src/components/MatchesPanel.tsx`, `client/src/components/MatchDetail.tsx`, optionally nearby client styles and tests such as `client/src/App.test.tsx`.
DEPENDENCIES: none
VALIDATION: Run the existing client test suite and extend focused component/app tests to cover failed match fetch, failed track/trait fetch, and preservation of the normal empty state when the API succeeds with zero rows. Manually verify that the Matches and Browse tabs show explicit failure copy instead of "No matches in this bucket" or "No tracks found" during simulated API failure.
ACCEPTANCE: Selecting a track whose `/api/tracks/{id}/matches` request fails produces a visible failure state that is textually distinct from the normal zero-results state; browse-data failures for `/api/tracks` and `/api/track-traits` are surfaced in the UI rather than silently treated as empty data; match-detail fetch failure remains visible and actionable; successful zero-result responses still render the existing empty-state behavior; users can distinguish normal emptiness from backend/load failure in the affected client surfaces without consulting logs.
OUTPUT: schema=default
```

## Notes to Orchestrator
- This is the highest-priority contract because it addresses the main trust break: the UI currently lies by omission when data fetches fail.
- Keep the implementation local to existing hooks/components rather than introducing a cross-app error framework.
- Treat Admin as already partially compliant because `AdminDashboard` renders `error`; only touch it if shared plumbing changes require it.
