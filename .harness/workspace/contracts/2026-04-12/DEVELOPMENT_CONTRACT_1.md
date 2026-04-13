# Development Contract

## Source Inputs
- Prose-only live UI feedback items `1-7` and `9` supplied on `2026-04-12`
- Reference screenshots documenting the current UI state:
  - `/Users/alen/.cursor/projects/Users-alen-Dev-dj-tools/assets/Screenshot_2026-04-11_at_22.59.49-41415c90-9e5b-4fcf-aadb-bc4cd278d1d9.png`
  - `/Users/alen/.cursor/projects/Users-alen-Dev-dj-tools/assets/Screenshot_2026-04-11_at_23.00.10-13a45ca4-1ee0-4227-9602-86a1a480af6d.png`
  - `/Users/alen/.cursor/projects/Users-alen-Dev-dj-tools/assets/Screenshot_2026-04-11_at_23.00.20-058cbc49-daa3-447c-b0ea-1c845edb97fd.png`
- Additional global constraints from the user:
  - obey `.harness/rules/40-react-render-stability.mdc`
  - QA must use Chrome DevTools MCP for screenshot, DOM inspection, and console validation
  - max `2` retry rounds per run
  - preserve current good virtualization-era UX performance

## Selected Intent
- delivery

## Contract Driver
- design-driven

## Selected Recommendation IDs
- none provided; derived from prose-only user feedback items `1-7` and `9`

## Deferred Inputs / Non-goals
- Do not fix the drag-preview pointer offset in this contract; that is isolated in `DEVELOPMENT_CONTRACT_2.md`
- Do not redesign set-building workflows, add new controls, or reintroduce non-drag add flows
- Do not broaden this work into unrelated table virtualization refactors beyond the width/alignment corrections needed to satisfy the stated UI issues
- Do not let unrelated pre-existing TypeScript diagnostics outside the scoped files block acceptance

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Correct the top-workspace layout and table/explorer presentation issues in `client/src/App.tsx`, `client/src/components/DockBar.tsx`, `client/src/components/TrackTable.tsx`, `client/src/components/MatchesPanel.tsx`, `client/src/components/SearchPanel.tsx`, `client/src/components/FilterBar.tsx`, `client/src/components/SetExplorerCanvas.tsx`, and `client/src/styles.css`. Keep the change limited to the browse/matches/explorer surfaces and the styling or component wiring strictly required to satisfy items `1-7` and `9`.
DO: 1. Increase the default top anchor height by changing the default bottom-panel calculation from the current `~66%` of viewport height to `~51%`, so the search/table area opens at roughly `49%` of the viewport by default. 2. Make the anchor-to-bottom resize handle operable even when no bottom panel is currently active, including any JSX guards and active-state styling that presently disable the handle before a panel is summoned. 3. Remove the vestigial `+ Pool` and `+ TL` row-action buttons from both the browse track table and the matches table, and stop threading the corresponding props through the app for those two surfaces; preserve the existing single-set `+ Set` action if that mode still uses it. 4. Fix the browse-table header/body width mismatch introduced by virtualization so the `Label` and `Genre` body cells align with their headers, with drag-handle width accounted for consistently in both header and body width calculations. 5. Collapse the search bar and filters into a single horizontal control row, with aligned heights and reclaimed vertical space above the table rather than a stacked second row. 6. Reposition the Admin and Weights icon buttons into a vertical stack aligned with the table gutter instead of the current horizontal top-right placement. 7. Move the external `Columns` control into the header row for both browse and matches tables as a right-aligned three-dot menu trigger that visually belongs to the header, not the surrounding chrome. 8. Reduce the empty vertical space above root nodes and below leaf nodes in the Explorer canvas so the SVG height tracks the rendered tree more tightly, without clipping nodes or controls.
ACCEPTANCE: 1. On initial load at a standard desktop viewport, the top anchor visibly occupies about half of the window height rather than roughly one third. 2. The resize handle between the anchor and bottom zone is draggable before any bottom panel is opened and remains draggable after opening or closing panels. 3. Browse-table rows and matches-table rows no longer show `+ Pool` or `+ TL` controls anywhere in their action area, while any intentionally preserved `+ Set` behavior remains available. 4. In the browse table, the `Label` and `Genre` headers line up with their corresponding body cells during normal scrolling and after virtualization renders multiple rows. 5. The search field, Camelot filter, BPM filter, BPM range control, and Clear Filters control render on one row with visually matched control heights and no reclaimed dead space above the table. 6. The Admin and Weights controls render as a vertical stack aligned to the table gutter rather than floating as a horizontal pair against the window edge. 7. Both browse and matches tables expose their column chooser from a right-edge header-row three-dot control, with no duplicate external `Columns` button left outside the table. 8. Explorer root and leaf spacing is materially tighter than the current screenshots, with no clipped nodes, clipped action affordances, or excessive blank canvas above the first level or below the last level. 9. Search typing, filter changes, scrolling, and table virtualization remain subjectively as responsive as the current build, with no newly introduced lag or jank attributable to this change set. 10. The implementation preserves render-stability expectations from `.harness/rules/40-react-render-stability.mdc`, including no new volatile non-primitive props, no unstable component identifiers, and no regression of any existing deferred-search pattern. 11. UI validation is completed against the live stack with Chrome DevTools MCP evidence covering DOM structure, console warnings/errors, and before/after screenshots for the affected surfaces. 12. If `client/src/components/SetExplorerCanvas.tsx` still has a pre-existing TypeScript error after this work, acceptance is blocked only by new or worsened diagnostics caused by the change, not by unchanged pre-existing noise.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- Treat this as one coherent UI-polish run rather than a redesign; stop at the requested surfaces.
- Use the delivery pipeline with Chrome DevTools-backed UI QA and enforce the user-specified retry cap of `2` rounds.
- This contract is behaviorally independent from `DEVELOPMENT_CONTRACT_2.md`, but both may touch `client/src/App.tsx`; avoid concurrent implementation if merge churn would obscure verification.
