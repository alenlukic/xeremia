# Coding Conventions

## Language and Runtime

- Python 3.9+ (see `setup.py`; use a project-local virtualenv)
- Linter: ruff (see `ruff.toml`)
- ORM: SQLAlchemy
- Audio: librosa, soundfile, mutagen
- Environment config: python-dotenv
- API: FastAPI + uvicorn
- Search: Elasticsearch 8.x (Docker)
- Client: React 19 + TypeScript + Vite

## Code Style

- Follow ruff defaults with `lint.ignore = ["F405"]`
- Prefer clarity over cleverness
- Complete implementations only -- no pseudocode, no placeholder stubs
- No comments that merely narrate obvious code behavior

## Module Organization

- All application code under `src/`
- ORM models in `src/models/`, one model per file
- Database concerns in `src/db/` (connection, session, schema)
- Configuration in `src/config.py` via environment variables
- Shared utilities in `src/utils/` (file ops, logging, common helpers)
- API adapter layer in `src/api/` (routes, schemas, serializers, ES search)
- Entry points under `src/scripts/` -- leaf nodes that import but are never imported
- Client app under `client/` (React + TypeScript, isolated from Python)
- See [ARCHITECTURE.md](ARCHITECTURE.md) for the full layering diagram

## Import Rules

- Respect layer boundaries (see [ARCHITECTURE.md](ARCHITECTURE.md))
- No circular imports
- Prefer explicit imports over wildcard imports (F405 is suppressed but use sparingly)
- Standard library first, then third-party, then local imports

## Testing

- Tests under `src/tests/`
- Test data alongside tests in `test_data/` subdirectories
- Runner: `python -m pytest src/tests/ -v`
- Test naming: `test_<module_or_feature>.py`
- Prefer behavior-level tests over implementation-coupled tests
- Tests requiring external services (e.g., Elasticsearch) use `pytest.mark.skipif` to skip gracefully when unavailable

## Error Handling

- Custom exceptions in `src/errors.py`
- Validate at module entry points, not deep in call chains
- Prefer early returns over deeply nested conditionals

## Configuration

- Environment variables are the sole configuration mechanism
- `.env` for local development (gitignored)
- `.env.example` is the canonical configuration surface documentation

## Database

- SQLAlchemy ORM models define the schema
- Session management through `src/db/database.py`
- Migrations as standalone scripts under `src/scripts/migrations/`
- For new tables, the migration is the source of truth for sequence naming.
  Keep ORM defaults aligned to the exact created sequence name, typically
  `<table>_id_seq`.
- Add explicit `ForeignKey` declarations in SQLAlchemy models even when the
  migration already applies the constraint. Model-only omission obscures
  relationship intent for reviewers and ORM joins.
- When using the custom DB session wrapper in service code, confirm it exposes
  the SQLAlchemy primitives the service depends on (e.g., `flush()` for
  create-and-hydrate flows that read generated primary keys mid-transaction).
- Hydrate response payloads by batching dependent track lookups and
  serialization rather than resolving each membership row independently.
  Per-entry hydration invites N+1 regressions.
- When a migration uses raw `engine.execute()`, verify the schema change
  actually landed afterward (e.g., check column existence). Execution alone
  does not guarantee commit in this codebase's migration pattern.

## Client (React + TypeScript)

### Layout tokens

- `--content-gutter` (32px) is the single horizontal layout token for all Browse rows.
  New Browse rows must apply margins/padding via `var(--content-gutter)`. Do not
  reintroduce conditional framing (the old `track-table-wrapper--framed` pattern is
  fully removed).

### Tooltips

- CSS-only tooltips use `data-tooltip` + `::after` pseudo-elements. Suitable for
  label hints in this desktop-only context. Not accessible on touch devices.

### Cross-component alignment

- When a child component's internal layout must anchor a sibling's padding, use a
  `ResizeObserver` in the shared parent and pass computed offsets as inline style
  props. Do not reach into child DOM from CSS for dynamic alignment.

### State management under StrictMode

- Keep `React.useState` updater callbacks pure. Move debounced persistence side
  effects (e.g., `persistWeights`) outside updater callbacks. StrictMode double-runs
  updaters, which can double-fire timers and produce incorrect transient states.

### Conditional rendering and measurement

- If a responsive table's measurement target is conditionally rendered, mount-only
  sizing effects are insufficient. Remeasure on the state transition that makes
  the container exist (e.g., `selectedTrack` change).

### Filter interactions

- BPM exact and range modes are mutually exclusive. Mode switches must cancel pending
  debounce timers explicitly in component logic rather than depending on blur or
  focus behavior.
- Camelot dropdown stays open during multi-select; dismissal via outside click or Escape.

### Error state conventions

- Distinguish "request failed" from "request succeeded with zero results" at every
  data-table surface. Keep error copy and zero-result copy as separate branches and
  test both paths explicitly.

### localStorage persistence

- When a component already owns a tightly related preference bundle (e.g.,
  column sizing + order + visibility), prefer co-located `localStorage`
  persistence over lifting state upward just to persist it.
- Persist related preferences as one JSON record and validate restored data
  with `unknown` narrowing plus per-field sanitization before hydrating state.
  Stale or malformed saved preferences should never destabilize the UI.
- When extending a client-local feature's persisted shape, normalize legacy
  payloads at the deserialization boundary so the in-memory TypeScript type can
  remain strict everywhere else. Do not spread optional-field handling
  throughout the component tree.

### Set workspace UI

- Reuse `client/src/utils/trackTitle.ts` (`cleanTitle()`) for all user-facing
  track labels across Pool, Tracklist, and Explorer surfaces. Do not
  re-implement prefix stripping locally; title drift between surfaces is a
  visible product defect.
  (evidence: ledgers `20260409T190051Z`, `20260409T231234Z`)
- For Explorer canvas SVG sizing, use computed pixel dimensions paired with an
  explicit `viewBox` rather than percentage-only `width`/`height`. Percentage
  sizing in this codebase's layout produces invisible-node regressions.
  (evidence: ledgers `20260409T190051Z`, `20260409T192223Z`, `20260409T231234Z`)
- For zoomable/pannable Explorer SVG, prefer native `viewBox`-based coordinate
  transforms over CSS `transform` on the SVG root. CSS transforms break
  `getBoundingClientRect()` for `@dnd-kit` droppable measurement and cause
  inverted or column-shifted drop targeting. `viewBox` keeps DOM geometry APIs
  trustworthy for drag/drop hit testing.
  (evidence: ledgers `20260410T204841Z`, `20260412T090637Z`, `20260412T101355Z`)
- Prefer explicit visible action controls (buttons, pills) over hidden
  drag/drop affordances for core Explorer authoring workflows. Invisible
  gesture targets are undiscoverable and block P0 flows.
  (evidence: ledgers `20260409T190051Z`, `20260410T004356Z`)
- SVG-backed interactive controls (Explorer action buttons) must ship with
  visible labeling, `aria-label`, keyboard activation (`onKeyDown`), and a
  browser-default hover-text mechanism. Nested SVG `<title>` alone is
  insufficient for reliability and accessibility.
  (evidence: ledger `20260410T004356Z`)
- Prefer semantic CSS tokens (`--danger-*`) and named Explorer palette
  constants (`explorer.ts`) over inline color literals when touching shared
  Set workspace styling.
  (evidence: ledger `20260410T004356Z`)
- Pool and Tracklist tables use semantic `<table>` markup with explicit
  `<colgroup>` width contracts. Preserve shared width primitives across both
  surfaces instead of reintroducing flex-row layouts for one side. `Key` and
  `BPM` are dedicated fixed-width columns, not inline metadata in the title
  cell.
  (evidence: ledger `20260410T004351Z`)
- Explorer horizontal node placement is persisted as `col_index` on
  `SetExplorerNode`. Use stored `col_index` values and smallest-gap-first
  assignment instead of deriving columns from array position. Sparse indices
  are an accepted invariant — width, rightmost-node, and edge-slot logic must
  use occupied indices rather than sibling counts.
  (evidence: ledgers `20260411T064618Z`, `20260410T034725Z`)
- Explorer interaction modes (node selection, edge selection, swap mode,
  drag-to-connect, modal editing) must be mutually exclusive with explicit
  handoff rules. Any new mode entry must explicitly clear conflicting
  transient state (`swapSource`, `selectedEdgeId`). `Escape` should clear
  all transient selection/swap state.
  (evidence: ledgers `20260410T034738Z`, `20260410T050627Z`, `20260411T050526Z`)
- Global destructive keyboard handlers in the Explorer (e.g., `Delete`,
  `Backspace` for edge deletion) must guard against active editable focus
  (`input`, `textarea`) before performing destructive actions.
  (evidence: ledgers `20260410T034738Z`, `20260410T050627Z`)
- Explorer edge routing uses Y-based horizontal lanes computed from
  `laneIndex = parentColIdx * EDGE_SLOTS + childColIdx`. Camera math is
  sign-sensitive; regression tests should assert direction and origin
  explicitly, not only that values changed.
  (evidence: ledgers `20260410T204841Z`, `20260412T101355Z`)
- For explorer-level add affordances, expand drop targets with invisible
  transparent rects rather than changing visible button styling, so the
  droppable is reliably hittable while preserving existing appearance.
  (evidence: ledger `20260412T101355Z`)
- Explorer multi-tree support uses persisted `SetExplorerTree` records with
  `tree_id` scoping for nodes and edges. Tree-aware backend mutations must
  carry or validate `tree_id` explicitly on every path; frontend selection
  alone is not sufficient isolation.
  (evidence: ledger `20260412T163104Z`)

### React performance

- `React.memo` is only effective when memoized children receive primitives or
  stable references. Never pass fresh wrapper objects (e.g., `{ ln: LayoutNode }`)
  created during render or layout recomputation — wrapper identity changes every
  render even when underlying values do not.
  (evidence: ledgers `20260411T050526Z`, `20260411T064618Z`)
- When an effect should respond only to topology/content changes, store
  unstable callbacks in refs and drive the effect from a stable primitive key
  (e.g., `edgePairKey`) instead of function identities or array references.
  (evidence: ledger `20260411T050526Z`)
- Prefer keyed `Set`/`Map` loading state over a single global boolean when
  only one row, edge, or item should visibly update. A global `scoresLoading`
  flag makes every component appear dirty on any loading change.
  (evidence: ledger `20260411T050526Z`)
- Before blaming memoization for render churn, first rule out parent
  conditionals that unmount and remount the entire subtree during loading or
  hydration. Verify DOM identity, not just prop-level reasoning.
  (evidence: ledger `20260411T064618Z`)
- `useDeferredValue` is appropriate for non-empty search/filter work, but
  clear-to-empty is a special-case boundary that should bypass deferred state
  to avoid stale-result lag. Protect this invariant with an explicit test.
  (evidence: ledger `20260411T201054Z`)

### Drag and drop (`@dnd-kit`)

- For dock DnD, preserve full-width tab droppables (`flex: 1`) and
  hover-to-open behavior together. Removing either recreates the same
  usability failure: tiny drop targets or blind drops without seeing panel
  content. Hover-to-open uses a 400ms timer with explicit cleanup on drag
  end/cancel.
  (evidence: ledgers `20260412T080202Z`, `20260412T063636Z`)
- When panel content must open during a drag, stabilize container height
  first. Fixed panel geometry makes hover-activated panel switches safe.
  (evidence: ledger `20260412T080202Z`)
- Prefer `pointerWithin` before `rectIntersection` for collision detection
  when using `snapCenterToCursor`. Thin dock-tab droppables are missed when
  overlay position diverges from pointer under pure rectangle intersection.
  (evidence: ledger `20260412T080202Z`)
- Duplicate-add protection belongs in shared state hooks as well as top-level
  DnD routing. UI-only duplicate checks are insufficient against stale state
  or in-flight race windows.
  (evidence: ledger `20260411T124625Z`)
- For DnD acceptance evidence, require proof of backend/state mutation (DB
  delta or visible state change). DevTools drag-path success text or
  drop-affordance evidence alone is not a PASS signal.
  (evidence: ledgers `20260412T050810Z`, `20260412T053212Z`, `20260412T063636Z`)
- Keep drag-preview fixes isolated from unrelated `client/src/App.tsx` UI
  restructuring so live QA failures can be attributed cleanly.
  (evidence: ledgers `20260412T050810Z`, `20260412T053212Z`)

### Virtualized table (`TrackTable`)

- `TrackTable` uses row virtualization with bidirectional horizontal scroll
  sync. Treat exact right-edge `maxScrollLeft` parity as a first-class
  acceptance check; mid-range scroll mirroring alone does not prove sync
  correctness.
  (evidence: ledgers `20260411T224600Z`, `20260411T235027Z`)
- Horizontal parity depends on measuring the wrapper's real `scrollWidth`
  (via `ResizeObserver`), not just theoretical table width. Absolutely
  positioned virtual rows can make reachable wrapper range diverge.
  (evidence: ledger `20260411T235027Z`)
- Single-owner pagination: the virtual-range trigger plus dedupe guard is the
  canonical load-more path. Do not mix `IntersectionObserver` sentinels with
  range-based triggers.
  (evidence: ledger `20260411T224600Z`)
- Test harnesses must exercise the production virtualized render branch, not
  the non-virtual fallback. Force the virtual path explicitly or the tests
  only prove pre-fix behavior.
  (evidence: ledgers `20260411T224600Z`, `20260412T003046Z`)

### Search and filter state

- `searchText` and `selectedTrack` are a coupled state contract. Clearing the
  search input must clear both, not just the rendered text value. Verify both
  DOM/input values and selection-derived UI state (selected rows, matches
  heading) when validating clear behavior.
  (evidence: ledger `20260411T182220Z`)
- For client filter-reset tests, assert the data effect as well as control
  state. Clearing a filter must prove browse results return to the expected
  baseline, not only that the input looks empty.
  (evidence: ledger `20260411T121237Z`)
- For tablist keyboard coverage, treat "focus moves without activation" as a
  first-class invariant. Encode it directly with `aria-selected` assertions
  alongside roving-tabindex checks.
  (evidence: ledger `20260411T121237Z`)

### Cross-surface features

- For cross-surface features (e.g., playback), prefer one shared
  controller/provider with thin per-surface consumers instead of parallel
  surface-specific implementations. The centralized `AudioPlayerProvider` /
  `useAudioPlayer` / `PlayerBar` / `PlayButton` pattern is the current
  canonical example.
  (evidence: ledger `20260412T130230Z`)

### Testing

- Client test runner: `npm test` (Vitest). Note: `--watchAll=false` is not a valid
  Vitest CLI flag in this repo.
- `getBoundingClientRect()` returns zeroes in jsdom — alignment/measurement logic
  cannot be unit-tested via Vitest. Live browser validation is required.
- Transient UI states (`Saving`, `Saved`, error banners) require at least one
  integrated assertion exercising real async flow, not only prop-level or
  fake-timer-heavy tests.
- When removing a legacy UI mechanism that tests assert on, replacement
  coverage is part of closure work, not optional cleanup.
  (evidence: ledgers `20260411T224600Z`, `20260412T032222Z`)
- When UI controls are removed, replace former existence tests with absence
  assertions so future regressions are caught automatically.
  (evidence: ledger `20260412T032222Z`)

### Feature extraction orchestration

- Treat compact descriptor generation as a hard prerequisite for cosine
  similarity and any runtime path that expects spectral scores. If descriptors
  are missing, both precompute and runtime spectral scoring degrade to `0.0`.
  (evidence: ledger `20260410T060143Z`)
- When tests patch modules that rely on module-global wiring, assert the
  actual injected objects and argument passthrough explicitly; otherwise
  orchestration regressions stay falsely green.
  (evidence: ledger `20260410T060143Z`)

### Ingestion pipeline

- `TAG_COLUMNS` in `ingestion_pipeline/config.py` is a shared base for ALL factory
  stages. Only add a column if ALL stages' DB tables have that column. Stage-specific
  fields go in `update_row()` overrides (Template Method pattern).
- When `_get_final_bpm` or `_get_final_key` returns `None`, downstream write
  operations must guard before numeric conversions.
- When changing a function from "always returns a value" to "may return None",
  audit all callers for `float(x)`, `int(x)`, and attribute access on the result.

### Audio format conversion

- AIFF subtype selection uses a strict PCM allowlist (`PCM_S8`, `PCM_16`, `PCM_24`,
  `PCM_32`) plus `sf.check_format`. Non-conforming inputs (FLOAT/DOUBLE) fall back
  to `PCM_24` for Windows compatibility. Assert output metadata (subtype) in tests,
  not just file existence.

## Naming

- Modules: `snake_case` directories and files
- Classes: `PascalCase`
- Functions/methods: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- ORM models: singular nouns (`Track`, `Artist`, not `Tracks`)
