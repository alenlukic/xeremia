# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260410T034002Z-product_feedback-product-thought-partner-set-work/PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User contracting brief for Contract C: Explorer interaction-model overhaul spanning `client/src/components/SetExplorerCanvas.tsx`, `client/src/hooks/useSetBuilder.ts`, `src/api/routes.py`, `src/set_workspace/service.py`, and `client/src/styles.css`
- Group C in the recommendations: per-level add control, drag-to-connect, edge deletion, and selected-node-only control visibility

## Selected Intent
- delivery

## Contract Driver
- mixed

## Selected Recommendation IDs
- `C1`
- `C2`
- `C3`
- `C4`

## Deferred Inputs / Non-goals
- Do not reopen Contract B sizing, raw-title rendering, swap semantics, or child-add deduplication except as needed to consume the landed correctness behavior
- Do not add non-adjacent multi-level edge creation
- Do not redesign the root search flow outside the targeted per-level add control
- Do not change unrelated Tracklist or Pool behavior in this contract

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Overhaul the Explorer interaction model so add controls are organized by level, edges can be created by drag between adjacent levels, edges can be selected and deleted directly on the canvas, and per-node controls only appear for the selected node with a short unfurl animation. Limit implementation to `client/src/components/SetExplorerCanvas.tsx`, `client/src/hooks/useSetBuilder.ts`, `src/api/routes.py`, `src/set_workspace/service.py`, `client/src/styles.css`, and the minimal API helper/client wiring directly required for the new edge-deletion flow.
DO: 1. Remove the per-node `+Sibling` control from the Explorer node action row and instead render one `+Add Track` SVG control per distinct level row, positioned to the right of the last node at that level. Wire it into the existing sibling-add search modal flow, adapted so it targets the level rather than a specific reference node, using the last node on that level as the inherited-parent reference when needed or allowing add-without-parent at level `0`. 2. Add drag-to-connect on node `<g>` elements: `onMouseDown` begins a connect-drag, a temporary dashed `<line>` follows the cursor during drag, and `onMouseUp` on a target node calls `addExplorerEdge(parentId, childId)` only when the source and target levels differ by exactly `1`, with the lower-numbered level treated as the parent. Release anywhere else or onto a non-adjacent level must cancel silently. 3. Add direct edge deletion: render a transparent wider edge-hitbox path over each visible edge path, allow clicking an edge to select it, show a `×` delete affordance at the edge midpoint, support delete via either that affordance or `Delete`/`Backspace`, and add a backend endpoint `DELETE /api/sets/{set_id}/explorer/edges/{edge_id}` wired to `service.delete_explorer_edge(set_id, edge_id)`. 4. Add node-selection-driven control visibility: node action rows should be hidden by default with `opacity: 0` and `transform: scaleY(0)`, reveal with `opacity: 1` and `transform: scaleY(1)` using a `150ms` opacity/transform transition when their node is selected, and hide again when the user clicks elsewhere on the SVG canvas. The selected node's action row must still expose the existing delete, swap, `+Child`, and `+TL` controls. 5. Ensure selection, drag-connect, swap mode, and edge selection do not conflict: swap completion should still work when active, empty-canvas clicks should clear node selection, and edge selection should clear appropriately when the user clicks elsewhere. 6. Add or update focused tests for adjacent-level drag-connect gating, edge deletion wiring, and selected-node control visibility where existing coverage patterns support it without excessive UI-test churn.
ACCEPTANCE: 1. No per-node `+Sibling` control remains; each distinct Explorer level row shows exactly one visible `+Add Track` affordance to the right of that row's last node. 2. Dragging from a level-0 node to a level-1 node creates an edge, while dragging to a level-2 node or releasing off-node does nothing and surfaces no error. 3. While connect-drag is active, a temporary dashed line follows the cursor from the drag-source node center. 4. Clicking an edge selects it and reveals a delete affordance at the edge midpoint; activating that affordance removes the edge from the canvas. 5. Pressing `Delete` or `Backspace` while an edge is selected also deletes that edge. 6. The backend exposes `DELETE /api/sets/{set_id}/explorer/edges/{edge_id}` and the frontend uses it via `deleteExplorerEdge(edgeId)` wiring. 7. On a fresh canvas, no node action rows are visible. Clicking a node reveals only that node's controls with the requested unfurl animation, and clicking elsewhere hides them again. 8. The selected node's revealed controls still include the existing delete, swap, `+Child`, and `+TL` actions. 9. Non-adjacent multi-level edge creation remains unsupported by design. 10. This contract assumes Contract 6 has already landed so swap and deduplicated add-edge semantics are already correct.
OUTPUT: schema=default
```

## Ordering Constraints
- Depends on `DEVELOPMENT_CONTRACT_6_explorer-correctness.md`

## Notes to Orchestrator
- Start this delivery run only after Contract 6 has landed, because this interaction work depends on the corrected swap and edge-state behavior from the prior contract.
- Keep the node-selection and edge-selection state model cohesive; if the implementation starts to sprawl, prefer a narrow local refactor inside `SetExplorerCanvas.tsx` rather than broad workspace changes.
- Validation should explicitly exercise adjacent-level drag-connect and direct edge deletion, since those are new user-facing primitives with backend coupling.
