# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260410T034002Z-product_feedback-product-thought-partner-set-work/PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User contracting brief for Contract B: Explorer correctness fixes spanning `client/src/components/SetExplorerCanvas.tsx`, `client/src/hooks/useSetBuilder.ts`, `src/api/routes.py`, and `src/set_workspace/service.py`
- Group B in the recommendations: title passthrough, node sizing correction, swap semantics fix, and child-add deduplication

## Selected Intent
- delivery

## Contract Driver
- mixed

## Selected Recommendation IDs
- `B1`
- `B2`
- `B3`
- `B4`

## Deferred Inputs / Non-goals
- Do not implement the Contract C interaction-model overhaul in this run
- Do not add edge-deletion endpoints, drag-to-connect behavior, per-level add controls, or node-selection animation in this contract
- Do not change `cleanTitle` usage outside the Explorer canvas
- Do not change Explorer graph structure semantics beyond making swap operate on `track_id` values only and making child-add deduplicate against an existing target-level node

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Correct the Explorer's core rendering and mutation behavior so titles display the raw track title, node sizing matches the requested readability targets, swapping exchanges track assignments rather than structure, and child-add reuses an existing node at the next level instead of duplicating it. Limit implementation to `client/src/components/SetExplorerCanvas.tsx`, `client/src/hooks/useSetBuilder.ts`, `src/api/routes.py`, `src/set_workspace/service.py`, and only the minimal directly invoked helper touched by those paths if a narrow swap-validation fix cannot be completed otherwise.
DO: 1. In `client/src/components/SetExplorerCanvas.tsx`, stop passing Explorer node titles through `cleanTitle`. Render the node label from `ln.node.track?.title ?? String(ln.node.track_id)`, then continue to pass that raw title string into `truncateForSvg` so truncation remains but metadata stripping is removed. 2. Update Explorer layout constants to the requested values: `NODE_W` from `120` to `180`, `SLOT_W` from `140` to `210`, `NODE_H` from `40` to `48`, node-title `fontSize` from `12` to `9`, and increase the `truncateForSvg` character limit so wider nodes at smaller text can show materially longer raw titles. 3. Fix swap semantics in the backend route/service flow so selecting node A's `↕` control and then selecting node B swaps only the two nodes' `track_id` values while leaving `node_id`, `level`, edges, and overall graph structure intact. Remove any adjacency-only requirement from the route/service validation path so swap works for any two nodes in the set. 4. Keep the `↕` icon in the UI but update its `aria-label` to `Swap track IDs`. 5. In `client/src/hooks/useSetBuilder.ts`, change `addExplorerNode` so it first checks `explorerState.nodes` for an existing node with `track_id === selectedTrack.id` and `level === parentNode.level + 1`. If one exists, call `addExplorerEdge(parentNode.node_id, existingNode.node_id)` instead of `explorerAddNode`, surface no error for the deduplication path, and rely on edge idempotency for already-connected pairs. 6. Add or update focused tests for the corrected swap semantics and child-add deduplication only where nearby coverage patterns already exist; avoid broad UI-test expansion.
ACCEPTANCE: 1. Explorer nodes display the raw stored title without `cleanTitle` stripping, falling back to `String(ln.node.track_id)` when no track object is available. 2. Explorer nodes render at `180px` wide with `SLOT_W = 210`, `NODE_H = 48`, and node-title text at `9px`, and the truncation limit is increased enough that the wider nodes actually show more of the raw title. 3. Selecting node A's `↕` control and then node B completes a swap successfully even when the nodes are not adjacent in the graph. 4. After swap, both nodes immediately reflect their new tracks while keeping the same `node_id`, `level`, and edge connectivity as before. 5. The swap control still uses the `↕` glyph, and its accessible label is `Swap track IDs`. 6. Adding a child whose `track_id` already exists at the target level creates an edge to the existing node instead of creating a duplicate node. 7. Adding a child whose `track_id` does not exist at the target level still creates a new node as before. 8. Existing edge-idempotency and cycle-protection behavior continue to apply to the deduplication path. 9. Contract C features remain out of scope for this run.
OUTPUT: schema=default
```

## Ordering Constraints
- Must land before `DEVELOPMENT_CONTRACT_7_explorer-interaction-model.md`

## Notes to Orchestrator
- This is the Explorer correctness prerequisite contract. Do not let the delivery agent absorb Contract C interaction work into the same run.
- If the current swap validation lives behind a helper invoked from `routes.py` or `service.py`, allow the smallest possible helper edit needed to remove the adjacency restriction without broadening scope.
- Favor validation that proves arbitrary-node swap and deduplicated child-add behavior against real state transitions, since Contract 7 depends on these semantics being correct first.
