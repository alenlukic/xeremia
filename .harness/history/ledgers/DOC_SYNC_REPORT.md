# Doc Sync Report

## Sync Boundary

- **Previous sync**: `20260410T004356Z-delivery-development-contract-source-inpu` (2026-04-10)
- **Latest consumed**: `20260412T163104Z-delivery-development-contract-source-inpu` (2026-04-12)
- **Ledgers consumed**: 30

## Ledgers Consumed

1. `20260410T034725Z` — Tracklist Note column CSS width
2. `20260410T034735Z` — Explorer Contract 6: raw titles, sizing, swap semantics, child dedup
3. `20260410T034738Z` — Explorer Contract 7: interaction model (add, drag-connect, edge delete)
4. `20260410T050627Z` — Breaker follow-on: Explorer interaction-isolation fixes
5. `20260410T060143Z` — Spectral score fix: descriptor prerequisite in orchestration
6. `20260410T091207Z` — Explorer C1 next-level add affordance
7. `20260410T204841Z` — Explorer edge-routing Y-base fix
8. `20260411T050526Z` — Explorer canvas performance: score-fetch topology key, memo, per-edge loading
9. `20260411T064618Z` — Persisted col_index + SetBuilder loading gate fix
10. `20260411T100912Z` — Single-pane shell Contract 1: activePanel, mounted panels, dock
11. `20260411T121237Z` — Breaker follow-on: BPM clear filters + DockBar keyboard
12. `20260411T124625Z` — Phase 2 DnD contract: drag routes, duplicate-add, MAX_COLS
13. `20260411T182220Z` — UI polish: search bar, selected-track-in-search, layout (blocked)
14. `20260411T173219Z` — Backend cache: LRU test stabilization, transition-score cache
15. `20260411T173222Z` — Client shell/DnD contract: Explorer generic drop (blocked)
16. `20260411T201054Z` — P0 performance: deferred search, clear-search, DragOverlay
17. `20260411T224600Z` — TrackTable virtualization: scroll sync, sentinel removal (blocked)
18. `20260411T235027Z` — TrackTable virtualization remediation: ResizeObserver spacer
19. `20260412T003046Z` — TrackTable regression coverage follow-on
20. `20260412T032222Z` — UI polish batch: anchor height, controls cleanup
21. `20260412T050810Z` — DnD drag-preview pointer offset (blocked)
22. `20260412T053212Z` — DnD drop-path diagnostic follow-on (blocked)
23. `20260412T063636Z` — Hover-to-open removal + layout fix (blocked)
24. `20260412T080202Z` — DnD tab drop targets: stretch tabs, restore hover-to-open
25. `20260412T090637Z` — Explorer DnD: viewBox zoom/pan (blocked)
26. `20260412T101355Z` — Explorer remaining bugs: coordinate inversion, level-drop targeting
27. `20260412T111629Z` — Contract 3: Pool/Tracklist bulk clear
28. `20260412T120144Z` — Contract 4: set-scoped starring
29. `20260412T130230Z` — Contract 5: audition playback v1
30. `20260412T163104Z` — Contract 6: multi-tree Explorer

## Files Changed

| File | Change summary |
|------|---------------|
| `docs/CONVENTIONS.md` | Added 7 new convention sections: Explorer viewBox/col_index/interaction-modes/edge-routing/multi-tree, React performance (memo, refs, keyed loading, parent-mount awareness, useDeferredValue), DnD (stretched tabs, hover-to-open, collision strategy, duplicate-add, acceptance evidence), virtualized TrackTable (scroll sync, ResizeObserver, single-owner pagination, test branch coverage), search/filter state coupling, cross-surface feature pattern, feature extraction orchestration prerequisite, testing hygiene (removal coverage, absence assertions) |
| `docs/WORKFLOWS.md` | Updated application layout diagram from tab-shell to single-pane dock model; added new API endpoints (audio streaming, starring, bulk clear, edge delete, explorer trees); updated Flow 4 (Build a set) with starring, bulk clear, multi-tree explorer, audition playback, DnD from browse; updated client architecture table with `PlayButton`, `PlayerBar`, `DockBar`, `useAudioPlayer` |
| `docs/ARCHITECTURE.md` | Added `SetExplorerTree` to ORM model listings in domain map, L1 table, and infrastructure table; updated set_workspace and API adapter descriptions for starring, bulk clear, multi-tree, transition-score caching, audio streaming |
| `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md` | Added starring, bulk clear, and DnD-from-browse to set preparation workflow; added DnD reliability trust requirement |

## Durable Guidance Captured

### Repeated patterns (3+ ledgers)

1. **Explorer viewBox over CSS transform** — CSS transforms on SVG break `getBoundingClientRect()` for `@dnd-kit`; `viewBox`-based camera is the established pattern. (7 ledgers)
2. **Explorer interaction mode isolation** — Canvas modes must be mutually exclusive; new mode entry clears conflicting state; global keyboard handlers guard editable focus. (5 ledgers)
3. **DnD acceptance requires state-mutation proof** — DevTools drag success text alone is not sufficient; require DB delta or visible state change. (8 ledgers)
4. **React.memo requires primitives or stable refs** — Never pass fresh wrapper objects; use callback refs for effects driven by topology keys; prefer keyed loading state over global boolean. (4 ledgers)
5. **Dirty-worktree diff contamination** — Run-scoped delta is the trustworthy attribution surface; raw repo-wide diff is unreliable. (8 ledgers)
6. **TrackTable virtualization invariants** — Right-edge maxScrollLeft parity, ResizeObserver-measured spacer width, single-owner pagination, forced virtual-path test coverage. (3 ledgers)
7. **Search/filter state coupling** — Clear-input must clear both searchText and selectedTrack; filter reset must prove data effect. (3 ledgers)
8. **Feature extraction orchestration** — Compact descriptors are a hard prerequisite for cosine similarity. (2 ledgers)
9. **DnD dock affordances** — Stretched tabs + hover-to-open + fixed panel height + pointerWithin collision strategy. (3 ledgers)

### Structural/feature additions

- `SetExplorerTree` model added for multi-tree explorer support
- Audio streaming endpoint (`GET /api/tracks/{id}/audio`) and centralized playback architecture
- Per-entry starring on Pool and Tracklist
- Surface-specific bulk clear endpoints
- Single-pane shell layout with dock and always-mounted panels
- Persisted `col_index` on explorer nodes for stable horizontal layout

## Persona Guidance Changed

- Added DnD reliability as an explicit trust requirement
- Updated set preparation workflow to reflect starring, bulk clear, and DnD-from-browse capabilities

## Deferred Items

1. **Dirty-worktree process guidance** — Multiple ledgers call out diff artifact contamination as a recurring problem. This could warrant a dedicated section in `.harness/docs/` about dirty-worktree run hygiene, but the evidence is primarily operational/harness process rather than product documentation. Deferring until a pattern emerges in harness doc sync or a specific contract requests it.
2. **Audio endpoint security hardening** — Ledger `20260412T163104Z` notes path-traversal hardening is still pending for `GET /api/tracks/{id}/audio`. This is a product code concern, not a doc concern.
3. **Explorer dead code cleanup** — `validate_swap` and disconnected tests remain from the Contract 6/7 transition. Deferred to a maintenance contract.
4. **Broader test-branch coverage** — Multiple ledgers note that jsdom tests don't exercise production virtualized/ResizeObserver paths. This is tracked in conventions but the actual test improvements are product code work.
