# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260409T230523Z-product_feedback-design-thought-partner-explorer-/DESIGN_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User-stated outcomes: rename the `"Set"` subtab to `"Tracks"`; put Tracklist on the left; make Pool a right-side collapsible accordion that starts collapsed; restore the Note field end-to-end; replace persistent inline errors with a transient auto-dismiss toast
- User grouping for Contract B: `client/src/components/SetBuilder.tsx`, `client/src/components/SetTracklist.tsx`, `client/src/components/SetPoolTable.tsx`, `client/src/hooks/useSetBuilder.ts`, and supporting styles/types/backend note plumbing as needed for full-stack note restoration

## Selected Intent
- delivery

## Contract Driver
- design-driven

## Selected Recommendation IDs
- `R6`
- `R7`
- `R8`
- `R9`
- `R10`

## Deferred Inputs / Non-goals
- Do not change the Explorer canvas sizing, action-row layout, title cleanup, or swap icon behavior here; those belong to Contract 1
- Do not add new third-party toast or panel-layout dependencies; prefer the existing stack and local styling
- Do not redesign set-building workflows beyond the requested Tracks/Pool layout, note restoration, and error treatment
- Do not introduce drag-and-drop rearchitecture, persistence for accordion state across reloads, or unrelated schema work beyond ensuring the existing Note column path works end-to-end
- Do not keep raw persistent inline API error banners once the toast path is introduced

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Remediate the Set workspace Tracks view so terminology, layout, notes, move controls, and error feedback match the agreed UX. Primary touchpoints are `client/src/components/SetBuilder.tsx`, `client/src/components/SetTracklist.tsx`, `client/src/components/SetPoolTable.tsx`, `client/src/hooks/useSetBuilder.ts`, `client/src/styles.css`, and any necessary typed/backend note-plumbing files already present for the existing Note feature.
DO: 1. In `client/src/components/SetBuilder.tsx`, rename the workspace subtab label from `Set` to `Tracks`, render Tracklist before Pool so Tracklist is the left panel and Pool is the right panel, and add local state for a right-side Pool accordion that starts collapsed. 2. Implement the Pool accordion as a right panel that is collapsed by default and expands on header click to roughly a `50/50` split; use a visible left-edge collapse handle so clicking that handle collapses the panel again. The expanded width should be about `50%`, the collapsed width should be `0px` or a narrow header strip, and the transition should animate over about `200ms`. 3. In `client/src/styles.css`, update the workspace container styling to support the collapsed and expanded states cleanly, keep the Tracklist full-width when Pool is collapsed, and ensure the collapsed Pool header/control remains visible and keyboard-focusable. 4. In `client/src/hooks/useSetBuilder.ts` and `client/src/components/SetBuilder.tsx`, replace the persistent inline error banner with a transient toast-style message that auto-dismisses after `4000ms`; map known backend/raw errors to human-readable copy and do not surface raw HTTP codes or backend strings in normal UI. 5. In `client/src/components/SetTracklist.tsx` and `client/src/components/SetPoolTable.tsx`, correct move-button directionality and text so controls match the new spatial layout; if arrows remain, they must point toward the actual destination, but explicit labels such as `Move to Pool` and `Move to Tracklist` are acceptable and preferred if they reduce ambiguity. 6. In `client/src/components/SetTracklist.tsx`, remove the extra key/BPM metadata subrow or compress that information into a subtle inline suffix on the title line so rows are single-line by default. 7. Restore the Note field end-to-end: verify `client/src/types.ts` includes `note?: string` for tracklist entries, confirm `SetTracklist.tsx` renders and updates the Note input, and ensure the existing backend/model/migration path persists notes correctly. If the already-authored migration for `set_tracklist_entry.note` exists but has not been applied in the active environment, make the contract execution include applying or re-running the migration rather than inventing a new schema path. 8. Add or update focused tests that cover Tracks tab labeling/layout behavior, toast dismissal behavior, and note round-trip or note-aware API plumbing where the current test suite allows.
ACCEPTANCE: 1. The subtab label reads `Tracks`, not `Set`. 2. In the Tracks workspace, Tracklist is on the left and Pool is on the right. 3. Pool starts collapsed so the Tracklist initially occupies the full content width; clicking the Pool header expands it to an approximately `50/50` split, and clicking the left-edge collapse handle collapses it again with an animation around `200ms`. 4. Pool count/identity remains visible in the collapsed state, and the expand/collapse affordance is keyboard accessible. 5. Persistent inline error banners are removed from the workspace; errors appear as a toast-style transient message, auto-dismiss after about `4s`, and use friendly wording instead of raw backend strings or status codes. 6. Tracklist rows are single-line by default and no longer render a separate key/BPM subrow. 7. Move controls between Tracklist and Pool have directionality/text that matches the post-layout destinations and no longer visually imply the opposite side. 8. The Note field is visible, editable, persists through the intended save path, and reloads correctly after refresh with no API errors in the supported happy path. 9. Changes stay within the Tracks/Pool/note/error scope and do not absorb unrelated Explorer canvas polish. 10. Targeted automated tests covering the changed workspace behavior pass, and contract execution explicitly includes whatever migration/application step is needed for Note persistence in the active environment.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- This contract is independent from the Explorer canvas contract and can be assigned concurrently.
- The note-restoration portion is full-stack in effect, but should prefer the already-existing model and migration path rather than new schema design.
- If the active environment still lacks the `note` column after applying the existing migration, treat that as execution evidence and open a narrow follow-on contract rather than broadening this one into database redesign.
