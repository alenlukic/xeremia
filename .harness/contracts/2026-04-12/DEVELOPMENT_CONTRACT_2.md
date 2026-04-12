# Development Contract

## Source Inputs
- Prose-only live UI feedback item `8` supplied on `2026-04-12`
- Reference screenshots documenting the current UI state:
  - `/Users/alen/.cursor/projects/Users-alen-Dev-dj-tools/assets/Screenshot_2026-04-11_at_23.00.10-13a45ca4-1ee0-4227-9602-86a1a480af6d.png`
  - `/Users/alen/.cursor/projects/Users-alen-Dev-dj-tools/assets/Screenshot_2026-04-11_at_23.00.20-058cbc49-daa3-447c-b0ea-1c845edb97fd.png`
- Additional global constraints from the user:
  - obey `.harness/rules/40-react-render-stability.mdc`
  - QA must use Chrome DevTools MCP for screenshot, DOM inspection, and console validation
  - max `2` retry rounds per run
  - no performance regressions versus the current virtualized build

## Selected Intent
- delivery

## Contract Driver
- technical-driven

## Selected Recommendation IDs
- none provided; derived from prose-only user feedback item `8`

## Deferred Inputs / Non-goals
- Do not fold in the layout, table-action, control-placement, or Explorer-spacing changes from `DEVELOPMENT_CONTRACT_1.md`
- Do not replace the drag-and-drop system or rewrite table virtualization; keep the fix scoped to the pointer/overlay alignment regression
- Do not accept a cosmetic-only workaround that leaves the overlay offset during real dragging

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Fix the track-row drag preview so it stays visually anchored to the pointer during drag operations in the virtualized browse/set workflow. Limit implementation to `client/src/App.tsx` and any directly required drag-preview helper or style file already participating in this specific interaction, with no broader table or DnD architecture rewrite.
DO: 1. Identify and correct the regression that causes the drag overlay or preview to render noticeably to the right of the pointer when dragging a track row after the virtualization changes. 2. Prefer the smallest coherent change that makes the preview stay under the pointer for real row drags, whether by correcting overlay anchoring, modifier usage, preview sizing/offset logic, or equivalent pointer-relative positioning. 3. Preserve existing drag-and-drop behavior for pool, tracklist, matches, and related drop targets; do not regress drag start, drop completion, or overlay rendering stability. 4. Keep the change render-stable by avoiding new volatile props or state churn on hot drag paths, and preserve the current good performance characteristics of the virtualized UI.
ACCEPTANCE: 1. When dragging a browse-table row or other affected track row, the drag preview stays visually centered on or otherwise correctly anchored to the pointer instead of rendering offset to the right. 2. The drag preview remains correctly aligned from drag start through movement and drop, rather than snapping into place only after movement. 3. Existing drop targets still accept the dragged track as before, with no regressions in add-to-pool, add-to-tracklist, or related drag flows that depend on the shared DnD infrastructure. 4. The fix does not introduce new jitter, lag, or visible frame drops during drag interactions compared with the current virtualized build. 5. The implementation preserves `.harness/rules/40-react-render-stability.mdc` expectations, including no new unstable component IDs and no volatile non-primitive props on critical render paths. 6. Validation is performed against the live stack with Chrome DevTools MCP evidence and a real manual drag interaction, including screenshot/DOM evidence sufficient to show correct overlay placement and console cleanliness.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- Treat this as an interaction-regression fix, not a general DnD cleanup.
- If the first attempted remedy fails, require evidence-backed second-pass planning before the next retry; cap retries at `2` rounds as requested by the user.
- This contract may share `client/src/App.tsx` with `DEVELOPMENT_CONTRACT_1.md`, but it does not depend on that contract’s layout changes for correctness.
