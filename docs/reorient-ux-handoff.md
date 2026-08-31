# Reorient UX refactor — change summary

Branch: `reorient-ux-refactor`. All five areas of the request are implemented.
Verification: **808 client tests pass**, production build succeeds, and lint and
typecheck are back to their pre-existing baselines (7 TS errors and 13 lint
problems, none in the files touched here).

---

## Nav bar

- Set controls moved out of `headerExtras` (right of the spacer) into a new
  `headerControls` slot, grouped with the layout picker behind a `Set` label.
  Only the admin gear stays on the right.
- Both pickers are now the same component with the same styling — see below.
- The bar floats over the canvas instead of taking a 46px row from it, so
  hiding it hands the whole shell to the widgets. It reveals after **300ms** of
  hover and hides **600ms** after the pointer leaves.
- When hidden it collapses to a 6px hover strip with a faint accent hairline.
  That strip sits inside `.ws-grid-wrap`'s existing 8px padding, so it never
  swallows a click meant for the widget underneath.
- `:focus-within` pins the bar open for keyboard users with no JS, and the new
  `NavBarHoldContext` pins it while any menu inside it is open — so reaching for
  an open dropdown never pulls the bar out from under it.

**Note:** the bar starts hidden on load. That is the literal reading of
"auto-hide", but if you would rather it show on first paint and hide once, say
so — it is a one-line change.

## Dropdown UX

New `client/src/components/Dropdown.tsx` backs both pickers.

- Right-click a row → Rename/Delete, offered only where the item declares
  support. Delete is two-step (`Delete` → `Confirm delete`).
- Double-click a row → inline rename, seeded from the item's real name.
- Escape unwinds one layer at a time: context menu → rename → the menu itself.

One design wrinkle worth flagging: a single click used to select **and** close
the menu, which meant a double-click could never land — the row was gone before
the second click arrived. Renameable rows now hold the commit for a 220ms
double-click window while highlighting immediately, so the wait is not
perceptible. Rows that cannot be renamed commit instantly as before.

Supporting changes: `useSetBuilder` gained `renameSet` (the `PUT /api/sets/{id}`
endpoint already existed but was never exposed); `useWorkspaceLayout` gained
`deletePreset`, and `renamePreset` now takes an optional `from` so any row can be
renamed rather than only the active one. Built-in presets are neither renameable
nor deletable; saved layouts are both.

## Explorer

- **Add to another crate now works from any cohort.** The inspector previously
  received `crates`/`onAddToCrate` only when no crate was active, which is
  exactly why there was no way to file a track elsewhere while viewing a crate.
  It now always receives them and drops the crate on screen from the menu.
- Magnifying-glass button beside the cohort title expands a filter **in place of**
  the title, so it costs the panel no height. Empty results say so.
- Escape closes the cohort. The handler moved from the panel's `onKeyDown` to the
  window, so it still fires once focus has moved into the grid.
- The inspector is portalled to `<body>` and pinned **beside** the widget rather
  than drawn over it, on whichever side has more viewport room, remeasured on
  resize and scroll. It only overlaps when neither side can take it.

## Sequencer

- Hover popover offset raised from 8px to 26px, clearing the raised tile's lift
  so it no longer covers the centred preview button or the star/pin column.
- The promote arrow moved from `bottom: 1px` to `top: 27px`. Star, pin and
  promote now form one 13px column that exactly fills the 40px raised tile,
  instead of the arrow colliding with the pin.
- Clicking a tile scrolls the Explorer to the matching cohort. Most of this path
  already existed (`onFocusTrack` → `sequencerFocus` → `focus`); the hook now
  exports `focusDriven` so the grid can tell a focus-lit cell from a clicked one
  and only scrolls for the former.

## Widgets

Maximize/restore button in every widget's title bar. Maximizing renders that
panel at the full canvas rect and hides the rest; drag and resize are suspended
while it is up.

The state deliberately lives **outside** the persisted layout object, so it is
never written to the server and restoring is a no-op on the stored rectangles —
the original layout cannot change, by construction rather than by careful
bookkeeping. `maximized` is derived rather than reconciled in an effect, so a
widget removed from the canvas stops being maximized in the same render.

---

## Files

**New:** `components/Dropdown.tsx`, `hooks/useNavBarHold.ts`.

**Changed:** `App.tsx`, `components/{LayoutPicker,SetPickerControls,WorkspaceGrid,WidgetFrame,ExplorerMatrix,ExplorerInspector,workspace.css}`,
`components/table/icons.tsx` (new `MaximizeIcon`, `SearchIcon`),
`hooks/{useWorkspaceLayout,useSetBuilder,useExplorerMatrix}.ts`.

**Tests:** `SetPickerControls.test.tsx` rewritten for the dropdown; new coverage
for maximize/restore, nav-bar dwell timing, menu-hold, layout delete, inspector
placement/search/Escape/cross-crate add, and the focus-driven auto-scroll.
`App.test.tsx` and `useExplorerMatrix.test.ts` updated where they asserted
behaviour the spec changed (`+ New`, `inspectorSide`).

## Not done

Nothing from the request. This file can be deleted — it exists only because the
session that planned the work could not write to the repo.
