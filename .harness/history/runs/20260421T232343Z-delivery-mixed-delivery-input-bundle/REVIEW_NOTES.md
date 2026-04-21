# Review Notes

## [Contract 2] Phase A Single-Page Workspace Shell Rewrite

### What was implemented

**Layout Architecture** — Replaced the DockBar-era multi-tab shell with a single-page layout:
- Fixed 48px `WorkspaceHeader` containing set selector, + New Set, search trigger (disabled placeholder for Phase B), weights toggle, and admin toggle
- Upper tracklist zone (~55vh) with its own header actions: + Slots, Clear All, column config, export, and a reversible explorer toggle
- Lower pool zone (permanently visible, ~45vh) with independent scrolling
- Vertical flex layout with a non-draggable zone divider

**New components:**
- `WorkspaceHeader.tsx` — Global header bar with all top-level controls
- `ExplorerNodesView.tsx` — Nodes-only explorer table (no edges), using Row/Position terminology instead of implementation-facing coordinates

**Modified components:**
- `App.tsx` — Complete shell rewrite; removed DockBar, Browse table, Matches panel, FilterBar, SearchPanel mounts; simplified DnD logic (removed references to dock tabs, explorer cells); added explorer toggle and tracklist zone header actions
- `SetWorkspacePanel.tsx` — Switched from accordion layout to vertical split; pool is always expanded
- `SetPoolTable.tsx` — Implemented per-view sort isolation (`sortByView: Record<string, SortDescriptor[]>`); removed always-visible "Search to add" input (fill-mode search retained)
- `SetTracklist.tsx` — Removed always-visible "Search to add" input (fill-mode search retained)
- `styles.css` — Added layout tokens for workspace-header, workspace-body, tracklist-zone, pool-zone, zone-divider, explorer-nodes-view, explorer-nodes-table

**Removed from shell (internals preserved for Phase B reuse):**
- `DockBar.tsx` — No longer imported or rendered
- Standalone Matches panel mount
- Standalone Explorer canvas mount
- Persistent Browse panel / TrackTable mount
- FilterBar mount
- SearchPanel mount

### Test changes

**`App.test.tsx`** — Rewritten:
- Removed all tests for Browse table, DockBar tabs, Matches panel, FilterBar, SearchPanel, old two-column explorer
- Retained: Reset Weights, DragOverlay snapCenterToCursor modifier guard
- Added: WorkspaceHeader rendering, workspace layout with active set, explorer toggle, pool permanent visibility, absence of removed UI

**`App.dnd.test.tsx`** — Updated:
- Removed tests for `dock-matches`, `dock-explorer`, `dock-set` tab targets
- Removed `drop-matches-header` and `drop-explorer-cell-*` target tests
- Added `alt-` prefix normalization handling in App.tsx and corresponding test coverage
- Updated multi-select expectations to reflect that `payload.title` is used for all selections (no browse track lookup)

**`SetBuilder.test.tsx`** — Updated:
- Replaced 5 accordion expand/collapse tests with 4 tests asserting permanently visible pool zone
- Scoped `#` header text query to tracklist table to avoid ambiguity with pool table

**`SetPoolTable.test.tsx`** — Updated:
- Removed `subgroup auto-assign on search-add` test block (always-visible search removed)
- Updated cancel-fill-mode test to assert search input hides entirely

**`SetTracklist.test.tsx`** — Updated cancel-fill-mode test similarly

### Tradeoffs

1. **Search trigger is a disabled placeholder.** The header includes a `[Search]` button but it's `disabled` since the universal search modal is Phase B scope. This preserves the header layout slot without implementing out-of-scope functionality.

2. **Column config and export buttons are placeholders.** The tracklist zone header renders `[Columns]` and `[Export]` buttons that trigger `alert()` stubs. The contract requires these affordances to be present in the zone header, but their full implementation depends on downstream infrastructure.

3. **Pool sort isolation uses a `Record<string, SortDescriptor[]>` keyed by view name.** The "all" view, each subgroup name, and group-level views each get independent sort state. This is stored in component state (not persisted to localStorage) — intentional, as sort preferences are session-scoped.

4. **Explorer toggle is a simple boolean swap.** When toggled, the tracklist zone body switches between `SetWorkspacePanel` and `ExplorerNodesView`. The explorer view renders tree data as a flat table with Row/Position columns. No edges are rendered.

5. **DnD simplification.** The `handleDragEnd` handler was simplified to only handle `drop-tracklist`, `drop-pool`, `drop-tracklist-empty-*`, and `alt-drop-*` targets. All explorer cell and dock tab targets were removed. The `alt-` prefix normalization ensures correct routing.

### Deferred items

| Item | Reason |
|------|--------|
| Universal search modal (Phase B) | Explicitly out of scope per contract |
| Candidate-per-slot UI, version tabs (Phase C) | Explicitly out of scope per contract |
| Explorer edges | Explicitly excluded from contract scope |
| Draggable split between tracklist and pool | Explicitly excluded from contract scope |
| localStorage persistence for column visibility | Not required by contract; can be added in a follow-up |
| Removing `DockBar.tsx` file from disk | Component is no longer imported but file deletion was not required; keeping it preserves git history for reference |
