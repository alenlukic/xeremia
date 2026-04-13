# Development Contract

## Source Inputs
- `DESIGN_RECOMMENDATIONS.md` P1-4: match detail drill-down is not visually discoverable
- `DESIGN_RECOMMENDATIONS.md` P2-5: no way to pivot from match detail candidate to a new search
- `SME_RECOMMENDATIONS.md` P1-1: add transition chaining and visible history
- Repo inspection: `client/src/components/MatchesPanel.tsx`, `client/src/components/MatchDetail.tsx`, `client/src/App.tsx`, `client/src/hooks/useSelectedTrack.ts`, `client/src/types.ts`, `client/src/api/http.ts`

## Selected Intent
- delivery

## Deferred Inputs / Non-goals
- Playlist export and durable set-building are deferred to `07-set-playlist-builder.md`
- Do not redesign the full Matches table schema; that belongs to `04-matches-table-column-restructure.md`
- Avoid backend changes unless the client cannot satisfy chaining/history with current data and endpoints

## Contract
```md
DEVDSL-1
MODE: STRICT
TASK_KIND: ui_change
FLAGS: NO_EARLY_STOP PATCH_ONLY(require_file_read=true) TEST_GATE(full, flake_policy=rerun_once, extend_on_new_failure=true) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Make match detail discoverable and support transition chaining from match results
SCOPE: Improve the Matches experience so users can clearly discover how to open detail and can pivot from a candidate match into the next source track while preserving transition context.
DO: Add an obvious affordance for opening match detail from the Matches table, such as row-level click, a visible detail icon/button, or an unmistakably interactive score affordance, while preserving accessibility and avoiding hidden interactions. Add a "Use as source" action in the match result and/or detail surface that selects the candidate as the new source track, triggers match loading for that track, and records transition history in the client. Render the transition chain context as a breadcrumb or ordered history list so users can see the path they have built so far and move back through it if needed.
NON_GOALS: Do not implement playlist export, named sets, drag-and-drop set management, or persistence; do not add a new backend workflow if the current client cache and existing match endpoints can support the chaining flow; do not fold in the broad table-column migration from contract 04.
AFFECTED_AREAS: `client/src/App.tsx`, `client/src/components/MatchesPanel.tsx`, `client/src/components/MatchDetail.tsx`, `client/src/hooks/useSelectedTrack.ts`, related client types/styles/tests, and backend/API files only if genuinely required for missing data.
DEPENDENCIES: execute after `04-matches-table-column-restructure.md`
VALIDATION: Add focused client tests covering discoverable detail affordance, "Use as source" flow, and transition-history rendering/back-navigation. Manually verify a user can go from Track A to Track B to Track C without re-searching, and can still access match detail from the Matches view with an obvious interaction.
ACCEPTANCE: The Matches experience includes at least one visually obvious detail affordance that does not rely on hidden knowledge; users can choose a candidate match as the new source track from the match list or detail view; doing so loads matches for the candidate and preserves prior context as visible transition history; the history is readable and supports moving through the built chain; playlist export is explicitly not required in this contract.
OUTPUT: schema=default
```

## Notes to Orchestrator
- The SME recommendation raises chaining to P1 because it is core to DJ set-building; this contract captures the workflow without prematurely building the full set-management system.
- Prefer a client-first implementation using existing track cache and selection flow. Only expand to backend/API work if the current data model blocks a coherent chain UX.
