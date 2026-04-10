# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260409T184735Z-product_feedback-design-red-team-explorer-ux-fixe/DESIGN_RECOMMENDATIONS.md`
- User issue list covering missing full titles, missing child-add workflow, missing node actions, missing Tracklist notes, note alignment drift, explorer arrow/grid expectations, and Pool vs Tracklist header inconsistency
- Code context from `client/src/components/SetExplorerCanvas.tsx`
- Code context from `client/src/components/SetTracklist.tsx`
- Code context from `client/src/components/SetPoolTable.tsx`
- Code context from `client/src/components/SetBuilder.tsx`
- Code context from `client/src/hooks/useSetBuilder.ts`
- Code context from `client/src/types.ts`

## Selected Intent
- delivery

## Contract Driver
- design-driven

## Selected Recommendation IDs
- `F-001`
- `F-002`
- `F-003`
- `F-005`
- `F-009` folded into note-restoration implementation because alignment is part of restoring the missing note workflow safely

## Deferred Inputs / Non-goals
- Do not use this contract for broad explorer visual polish such as always-visible action bars, larger/high-contrast `+TL` styling, orthogonal edge routing, per-column edge colors, or full grid-slot layout
- Do not rework Pool/Tracklist header parity beyond any minimal adjustments strictly required to restore notes without layout breakage
- Do not broaden scope into legacy type cleanup, dead-code removal, or unrelated Set tab refinements
- Drag-and-drop child insertion may remain as a supplemental path, but it must not remain the only child-add path

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Restore blocked set-workspace workflows in Explorer and Tracklist notes
SCOPE: Repair the broken core workflows in the new set workspace without taking on secondary styling polish. The repair includes making explorer nodes visibly render in the viewport, showing meaningful track titles instead of metadata prefixes, providing a real child-add interaction per node, and restoring persisted editable Tracklist notes end to end.
DO: Deliver one coherent regression-restoration pass with explicit file guidance.

FRONTEND EXPLORER:
- In `client/src/components/SetExplorerCanvas.tsx`, fix the rendering/viewport path so existing explorer nodes are visibly rendered inside the viewport without requiring accidental pan/zoom states. The delivery may adjust SVG sizing, initial pan, `viewBox`, `preserveAspectRatio`, container sizing assumptions, or related explorer viewport CSS, but the result must keep pan and zoom working.
- Add a shared display-title normalization path for explorer, pool, and tracklist titles. Strip the leading metadata prefix in the stored title format (`[key - scale - BPM] ...`) before rendering user-facing labels, and use a truncation strategy that still leaves enough of the artist/title text to identify the track quickly.
- In `client/src/components/SetExplorerCanvas.tsx`, add an explicit child-add action on each node that opens a search-driven selection flow for attaching a child to that node. The current root search should remain root-only. The child-add path must create the new node at the target parent’s next level and must not depend on cross-tab drag-and-drop.
- If the cleanest implementation needs a small helper, place it in an appropriate shared frontend utility such as `client/src/utils/explorer.ts` rather than duplicating title-cleaning logic across components.

FRONTEND TRACKLIST:
- In `client/src/components/SetTracklist.tsx`, restore a visible editable note control for each tracklist row.
- Implement the note field inline with the row structure so note inputs stay vertically paired with their track rows as tracks are added, removed, or reordered. Avoid detached note columns or independently scrolling note surfaces.
- Wire note edits through the existing set workspace state path in `client/src/hooks/useSetBuilder.ts` and the typed API client in `client/src/api/http.ts`.

BACKEND / API:
- Add persisted note support to the set workspace backend model and transport layer. Update the relevant SQLAlchemy model, migration, API schema, and mutation path so each tracklist entry can store and return a note value.
- Expected touchpoints include the current set-workspace data model under `src/models/`, the workspace/API schema layer under `src/api/`, and the current migration area under `src/scripts/migrations/`.
- The hydration payload returned for an active set must include the note field on tracklist entries, and there must be an explicit update path for changing a note without requiring a full destructive rewrite of the tracklist.

TYPING / STATE SHAPE:
- Update `client/src/types.ts` so the persisted `TracklistEntry` type includes `note`.
- Ensure the client state returned by `useSetBuilder` stays aligned with the API contract and does not rely on the legacy unused `SetTrackEntry` type.

VALIDATION:
- Add or update focused backend tests covering note persistence, note update behavior, and hydrated-set responses including notes.
- Add or update focused frontend tests covering:
  - visible explorer node rendering when nodes/edges exist
  - cleaned title display in explorer and at least one list surface
  - explicit child-add interaction creating a child under the selected node
  - note field rendering, editing, and persistence wiring
- Manual verification must confirm: existing explorer data is visible on load, a child can be added without drag-and-drop from another sub-tab, cleaned titles show artist/title instead of the metadata prefix, and edited notes persist across reload.

ACCEPTANCE:
- Explorer data that already exists for a set is visibly rendered inside the explorer viewport on initial load.
- Explorer nodes appear anchored in the usable viewport area rather than effectively hidden by clipping, collapse, or off-screen default transforms.
- Explorer pan and zoom still function after the visibility fix.
- Explorer node labels display cleaned track titles rather than only the metadata prefix.
- Pool and Tracklist also render cleaned user-facing titles rather than the raw prefixed string.
- Each explorer node exposes an explicit child-add action that opens a search/select flow.
- Selecting a search result from that child-add flow adds the new node as a child of the targeted node at the next level.
- Cross-tab drag-and-drop is no longer required as the only way to create child nodes.
- Each tracklist row exposes a visible editable note field.
- Tracklist notes persist in the database and survive a reload of the set workspace.
- Tracklist note inputs remain vertically aligned with their corresponding rows as list length changes.
- The backend model, API schema/response shape, TypeScript types, and client state flow all include the note field consistently.
- Normal happy-path note and explorer interactions do not introduce new 4xx/5xx errors.
OUTPUT: schema=default
```

## Ordering Constraints
- Must land before `set-workspace-explorer-ux-polish.md` because the follow-on UX contract assumes the restored child-add action, stable note row structure, and visible explorer canvas exist first

## Notes to Orchestrator
- Keep this as the first delivery unit even though it spans frontend and backend: the broken note regression and blocked explorer workflows are both P0 workflow blockers and represent the smallest coherent restoration pass
- Treat `F-009` as absorbed here rather than deferred, because restoring notes without row-stable alignment would knowingly reintroduce the reported regression shape
- Prefer narrowly scoped API/model changes for notes; do not reopen broader set-workspace schema decisions
