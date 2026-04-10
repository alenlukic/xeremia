# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260409T184735Z-product_feedback-design-red-team-explorer-ux-fixe/DESIGN_RECOMMENDATIONS.md`
- User issue list covering node action discoverability, `+TL` button visibility, Pool vs Tracklist header consistency, right-angle explorer arrows, per-column edge colors, and grid alignment expectations
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
- `F-004`
- `F-006`
- `F-007`
- `F-008`

## Deferred Inputs / Non-goals
- Do not use this contract to introduce new backend persistence semantics unless a tiny contract-aligned API shape adjustment is unavoidable to support the UI
- Do not revisit note persistence, child-add backend behavior, or explorer visibility bugs except as needed to integrate the polished UI on top of the first contract
- Do not broaden scope into unrelated Set tab copy, selector, export-button placement, or dead-type cleanup
- Do not invent a free-positioned graph editor; the target is a constrained aligned explorer layout

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Polish set-workspace explorer affordances, aligned list structure, and grid-based routing
SCOPE: Build the next UX layer on top of the restored set workspace by making explorer node actions discoverable, making the `+TL` affordance legible and correctly sized, bringing Tracklist headers into parity with Pool, and replacing the current free-positioned diagonal explorer drawing with a grid-aligned layout and orthogonal edge routing.
DO: Deliver one focused UI/interaction pass with explicit file guidance.

EXPLORER ACTION DISCOVERABILITY:
- In `client/src/components/SetExplorerCanvas.tsx` and the related set-workspace styles, remove the current hover-only discoverability model for core node actions. At minimum, the user must be able to see available actions without first hovering a tiny SVG target.
- Redesign the `+TL` affordance so it has a clear visual container, sufficient contrast against the node/background colors, and a minimum 28px target size. Its placement should read as an intentional node action instead of detached annotation text.
- If the node-action model from the first contract adds a child action, include that action in the discoverable action system rather than leaving it as a one-off affordance.

POOL / TRACKLIST PARITY:
- In `client/src/components/SetTracklist.tsx`, add a header row that matches the Pool surface’s information architecture for position, title, key, BPM, and actions.
- Keep Pool and Tracklist visually parallel when rendered side by side in `client/src/components/SetBuilder.tsx`. The implementation may use table semantics or a div-based grid, but the widths and labels must align predictably.
- Preserve row-level note alignment from the first contract while introducing the header structure.

EXPLORER LAYOUT / EDGES:
- Replace the current diagonal `<line>` edge rendering in `client/src/components/SetExplorerCanvas.tsx` with orthogonal SVG paths that use vertical and horizontal segments only.
- Position transition-score labels on the horizontal segment of the orthogonal path so labels remain legible and visually associated with the connection.
- Introduce a stable five-color edge palette keyed by explorer column position. The same column on every level must use the same color, and sibling columns should cycle predictably through the palette.
- Replace the current recursive free-width layout with a grid-constrained layout appropriate for a maximum of five nodes per level. Nodes at the same level should share the same row, and nodes assigned to the same column should line up vertically across levels.
- If the cleanest implementation requires extracted layout helpers, place them in a shared explorer utility module such as `client/src/utils/explorer.ts` and cover the pure layout/color logic with focused unit tests.

VALIDATION:
- Add or update frontend tests covering:
  - node actions visible/discoverable without hover-only interaction
  - a larger high-contrast `+TL` affordance with the expected behavior
  - Tracklist header rendering and parity with Pool labels
  - orthogonal edge rendering and score-label placement behavior
  - column-based edge color assignment
  - grid layout invariants for row alignment and maximum five columns
- Manual verification must confirm that explorer actions are obvious at a glance, `+TL` is easy to target, Pool and Tracklist read as a matched pair, and multi-level explorer trees render in a clean aligned grid with right-angle connections.

ACCEPTANCE:
- Core explorer node actions are visually discoverable without relying on hover over small SVG text targets.
- The `+TL` affordance is clearly visible, contrast-safe, and large enough to meet the 28px target expectation.
- Tracklist displays headers that match Pool’s visual pattern and information labeling for position, title, key, BPM, and actions.
- Pool and Tracklist appear structurally consistent when shown side by side.
- Explorer edges render as orthogonal paths with no diagonal connection segments.
- Edge score labels appear on the horizontal segment of the path rather than floating at an ambiguous midpoint.
- Edge colors follow a five-color palette keyed by column position, and the same column index uses the same color across levels.
- Explorer node layout is grid-aligned by level and column, with visually consistent spacing.
- The layout strategy does not place more than five node slots on a level.
- The polished UI builds on the restored child-add and note-row behavior from the first contract without regressing those workflows.
OUTPUT: schema=default
```

## Ordering Constraints
- Depends on `set-workspace-core-regressions-and-note-restoration.md`

## Notes to Orchestrator
- Keep this as a second delivery unit because it is mostly frontend polish and layout work that can be deferred until the core regressions are fixed
- This contract intentionally assumes the first contract has already restored visible explorer nodes, explicit child-add, and inline note rows; do not merge the two scopes unless a human explicitly asks for one larger run
- Prefer pure helper extraction for grid placement and column-color assignment so the brittle layout math is testable outside the SVG component
