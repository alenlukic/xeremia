# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260409T043041Z-product_thought_partner-set-building/PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User follow-up answers resolving all blocker questions for persistence, component relationships, explorer behavior, and UI placement
- `docs/ARCHITECTURE.md`
- `docs/CONVENTIONS.md`
- `docs/WORKFLOWS.md`
- `.harness/contracts/INDEX.md`
- Repo context: current set builder is client-local via `client/src/hooks/useSetBuilder.ts` and existing "Add to Set" entry points currently add directly to the tracklist

## Selected Intent
- delivery

## Contract Driver
- product-driven

## Selected Recommendation IDs
- none provided in source recommendations

## Deferred Inputs / Non-goals
- No migration of legacy `localStorage` set-builder data; existing local sets may be discarded
- No coupling where deleting from pool or tracklist mutates explorer state, or vice versa, beyond the explicitly requested manual "Add to Tracklist from Explorer" action
- No duplicate track entries inside either the pool or the tracklist
- No support for a track existing simultaneously in pool and tracklist
- No requirement to show transition scores inside the pool or tracklist; explorer edge labels are the only required transition-score surface in this expansion
- No requirement to make the explorer auto-fit the viewport, auto-layout around all edge-label collisions, or enforce sibling ordering swaps
- No collaborative editing, sharing, import/export beyond existing set capabilities, or cross-device conflict resolution in this contract
- No broad search-system changes beyond reusing the existing Elasticsearch-backed search behavior already used by Browse/Search surfaces

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
TITLE: Replace the client-local set builder with a server-persisted set workspace spanning pool, tracklist, and explorer
SCOPE: Deliver a full-stack expansion of the existing Sets tab so each named set owns one persisted pool, one persisted ordered tracklist, and one persisted explorer forest. Replace the current `localStorage`-backed set-builder workflow entirely with backend-backed persistence in PostgreSQL plus API endpoints and client bindings. Preserve the current top-level Set tab, but redesign it into sub-tabs: one "Set" workspace for pool + tracklist and one "Explorer" workspace for the planning canvas.
DO: Implement the feature as one coherent end-to-end delivery with the following required behavior and boundaries.

BACKEND:
- Add normalized SQLAlchemy models and a migration for a persisted set workspace. The final schema may use names other than the user-provided suggestions, but it must cover the equivalent responsibilities of: a set entity, pool membership rows, ordered tracklist membership rows, explorer nodes, and explorer edges.
- Model expectations:
  - `set`: durable set identity with name and timestamps; one row owns exactly one pool, one tracklist ordering, and one explorer graph.
  - Pool membership: per-set deduplicated membership keyed by set + track; preserve insertion order by default while allowing the frontend table to sort display columns independently.
  - Tracklist membership: per-set deduplicated ordered membership keyed by set + track with explicit order fields suitable for reorder operations.
  - Explorer nodes: per-set nodes that reference tracks and store depth/level information sufficient to enforce constraints and render the forest after reload.
  - Explorer edges: directed parent->child relationships between explorer nodes within the same set; edge rows must support async transition-score label hydration without making edge persistence depend on score availability.
- Enforce data invariants at the service/API layer and, where appropriate, via DB constraints:
  - A track cannot exist in both pool and tracklist for the same set at the same time.
  - A track can appear in explorer regardless of whether it is in pool or tracklist.
  - Pool deduplicates by track id within a set.
  - Tracklist deduplicates by track id within a set.
  - Explorer operations must reject cycles.
  - Explorer operations must reject writes that would create more than 5 nodes at any level within a set.
  - Explorer operations must reject writes that would create depth greater than 100.
  - Explorer graph size must remain bounded to 500 nodes maximum per set.
- Add API endpoints for:
  - Set CRUD and active-set hydration for pool, tracklist, and explorer state.
  - Pool add/remove/list operations and pool->tracklist move.
  - Tracklist add/remove/list/reorder operations and tracklist->pool move.
  - Explorer load/save mutations including add node, add edge, add child from a dropped/search-selected track, inline sibling-add with inherited relationship options, delete node with selective edge-resolution instructions, and parent/child swap.
  - Explorer node action to add that node's track to the tracklist when it is not already present there.
  - Async transition-score retrieval for explorer edges, reusing existing transition-scoring logic rather than inventing a second scoring system.
- Validation and mutation rules:
  - "Move to Tracklist" removes the track from pool and appends it to the end of tracklist unless the caller explicitly requests a supported insertion index.
  - "Move to Pool" removes the track from tracklist and appends it to pool.
  - Adding to pool or tracklist when no set exists must support the frontend flow that prompts the user to create a new set or cancel; the API should return a clear error or require a set id rather than silently creating hidden state.
  - Explorer delete must accept an explicit resolution payload describing which affected parent/child edges should be removed and which new edges should be created, so the modal can drive deterministic behavior instead of server-side guessing.
  - Parent/child swap means vertical swap only between directly connected nodes; sibling swaps are out of scope.
  - Edge transition-score labels must be fetchable asynchronously and must not block the initial explorer render or graph persistence.
- Keep backend implementation aligned with repo conventions: SQLAlchemy models under `src/models/`, migrations under `src/scripts/migrations/`, API adapter changes under `src/api/`, and any graph/business rules in appropriate service-layer code rather than burying them inside route handlers.

FRONTEND:
- Replace the current `useSetBuilder` local persistence workflow with API-backed state and loading/error handling suitable for server-persisted sets.
- Redesign the existing Set tab into two sub-tabs:
  - "Set": contains the pool and tracklist surfaces.
  - "Explorer": contains the explorer canvas and related controls.
- In all existing add-entry surfaces that currently expose one "Add to Set" action, replace that single action with two stacked actions:
  - "Add to Pool"
  - "Add to Tracklist"
- Required entry points for the dual-action update:
  - Matches panel
  - Match detail
  - Browse / track table
  - Search panel
- Set workspace behavior:
  - If the user triggers Add to Pool or Add to Tracklist with no active set, prompt to create a new set or cancel.
  - Selecting or creating a set must hydrate its pool, tracklist, and explorer from the backend.
  - Reloading the page must restore the persisted state for the selected set through backend data, not `localStorage`.
- Pool surface:
  - Use the existing table component patterns as the base so sortable columns are available through the established table UI.
  - Default order is insertion order.
  - Pool rows need per-row action(s) to move the track into the tracklist and to remove it from the pool.
  - Include a search bar that uses the same Elasticsearch-backed search source/index as Browse/SearchPanel so users can add search results directly into the pool while respecting dedup rules.
- Tracklist surface:
  - Show an ordered list for the set's committed sequence.
  - Support reorder via up/down controls, drag-and-drop, or another direct-manipulation interaction that is clear and testable.
  - Provide per-row actions to move the track back to the pool and to delete it from the tracklist.
  - Include a search bar that reuses the same Elasticsearch-backed search source/index as Browse/SearchPanel and appends added tracks to the bottom by default.
- Explorer surface:
  - Render a top-down zoomable/pannable N-ary tree/forest for the set's explorer graph.
  - Multiple root nodes are allowed.
  - Node bubbles show title only.
  - Node color cycles by depth: level 0 = red, level 1 = blue, level 2 = green, then repeat by `level % 3`.
  - Directed edges display transition-score labels when data becomes available; labels should update asynchronously without blocking initial tree render.
  - Users can drag a track from pool or tracklist onto an explorer node to add it as a child node.
  - Users can also search to add explorer nodes without first placing the track in pool or tracklist.
  - Provide inline sibling-add UI with the requested parent/child inheritance behavior, driven by explicit user choice rather than opaque automatic merging.
  - Provide parent/child swap for directly connected nodes only.
  - Provide delete-node modal UX that enumerates affected edges and allows selective edge removal / rewiring choices before commit.
  - Provide an "Add to Tracklist" action on each explorer node when that track is not already in the tracklist.
- Preserve separation of concerns:
  - Explorer membership is independent of pool/tracklist membership.
  - Deleting from pool does not mutate tracklist or explorer.
  - Deleting from tracklist does not mutate pool or explorer.
  - Deleting from explorer does not mutate pool or tracklist.

API SHAPE AND INTEGRATION EXPECTATIONS:
- Keep HTTP contracts typed and explicit in both backend schemas and `client/src/api/http.ts`.
- Reuse existing track search APIs/indexes where possible instead of creating a second search backend for set building.
- Reuse existing transition-scoring APIs/services where practical; if a thin explorer-specific adapter endpoint is added, it should still delegate to the same underlying scoring implementation.

VALIDATION:
- Add backend tests covering:
  - set CRUD and hydration
  - pool deduplication and pool<->tracklist mutual exclusivity
  - tracklist deduplication and reorder behavior
  - explorer cycle prevention
  - explorer level-cap, depth-cap, and max-node enforcement
  - delete-node resolution behavior
  - parent/child swap behavior
  - edge-score fetch behavior and non-blocking response shape
- Add client tests covering:
  - Set-tab sub-tab layout
  - dual "Add to Pool" / "Add to Tracklist" entry points in the required surfaces
  - no-active-set prompt behavior
  - persisted reload behavior using mocked API responses
  - pool and tracklist move actions
  - explorer node color cycling logic
  - edge-label async update behavior at the component level where feasible
- Perform manual validation against the live stack for the full core workflow:
  - create a set
  - add tracks to pool and tracklist from the updated entry points
  - move tracks between pool and tracklist
  - build explorer nodes from search and drag/drop
  - verify reload persistence
  - verify delete-node modal behavior
  - verify edge labels populate after initial render
- Manual/live validation must respect repo QA gates for search responsiveness and error-free normal operations.

ACCEPTANCE:
- A named set is persisted server-side and survives page reload.
- Each set owns exactly one pool, one tracklist, and one explorer graph/forest in persisted storage.
- The previous client-local `useSetBuilder` persistence path is replaced for this feature; no migration of old local data is required.
- The Set tab exposes two sub-tabs: one for pool + tracklist and one for explorer.
- All required entry surfaces expose stacked "Add to Pool" and "Add to Tracklist" actions instead of the single legacy add-to-set action.
- A track cannot exist in both pool and tracklist for the same set simultaneously.
- A track can be present in explorer even if it is in neither pool nor tracklist.
- Pool membership is deduplicated per set and defaults to insertion-order display.
- Tracklist membership is deduplicated per set and supports explicit reorder plus move-back-to-pool and delete actions.
- Both pool search and tracklist search use the same Elasticsearch-backed search source/index already used elsewhere in the web client.
- Explorer supports multiple roots, top-down layout, zoom/pan, title-only node bubbles, and depth-based color cycling where `0 -> red`, `1 -> blue`, `2 -> green`, repeating thereafter.
- Dragging a track from pool or tracklist onto an explorer node creates a child node when the mutation passes validation.
- Explorer search-based add works even for tracks not currently in pool or tracklist.
- Explorer prevents cycles.
- Explorer rejects adds that would exceed 5 nodes at any level, depth 100, or total size 500 nodes.
- Explorer parent/child swap works for directly connected nodes only.
- Explorer delete uses a modal that enumerates affected edges and supports selective removal/rewiring choices.
- Explorer exposes a per-node "Add to Tracklist" action that is unavailable or no-op when the track is already in tracklist.
- Explorer edge labels fetch transition scores asynchronously and render/update without blocking initial canvas render.
- Normal feature usage does not introduce 4xx/5xx API errors in the happy path.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- Keep this as one delivery contract because persistence, invariants, and UI affordances are tightly coupled; splitting pool/tracklist from explorer here would create duplicated schema and API churn.
- The delivery agent should inspect the existing set-builder, search, and transition-scoring code first, then choose the smallest normalized schema that preserves the requested behavior and invariants.
- The product source explicitly accepts starting fresh with no migration from client-local sets; do not spend delivery scope on legacy-data import.
