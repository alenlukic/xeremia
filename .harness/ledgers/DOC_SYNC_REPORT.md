# Doc Sync Report

Sync date: 2026-04-08
Sync boundary: all ledgers through `20260407T134953Z` (12 total, none previously synced)

## Ledgers Consumed

| Run ID | Summary | Verdict |
|--------|---------|---------|
| `20260406T004047Z` | UI layout fix (margins, tooltips) | PASS |
| `20260406T013033Z` | UI border/divider/tab alignment | PASS |
| `20260406T063032Z` | AIFF Windows compatibility fix | PASS |
| `20260407T043338Z` | Ingestion pipeline fix (6 bugs) | PASS |
| `20260407T075202Z` | Product feedback pass (design/customer/SME) | N/A |
| `20260407T093555Z` | Error handling delivery | FAIL |
| `20260407T100758Z` | FilterBar BPM/Camelot UX | eval FAIL |
| `20260407T104609Z` | Weight save indicator | FAIL |
| `20260407T115052Z` | Matches table columns (TanStack) | PASS |
| `20260407T124201Z` | Fusion weight scoring integration | eval FAIL |
| `20260407T131432Z` | Match discoverability + chaining | eval FAIL |
| `20260407T134953Z` | Set/playlist builder MVP | eval FAIL |

Additionally consumed: session learnings from 2026-04-08 (harness operational pitfalls).

## Files Changed

| File | Nature of change |
|------|-----------------|
| `.harness/docs/core-beliefs.md` | Added "Harness Operational Constraints" section (6 items: no worktrees, no parallel git, preserve stash, QA starts stack, visual browser QA, Gate 7 static review) |
| `docs/CONVENTIONS.md` | Added client-side conventions: layout tokens, tooltips, ResizeObserver, StrictMode state, conditional render measurement, filter interactions, error states, client testing, ingestion pipeline patterns, audio format conversion |
| `docs/WORKFLOWS.md` | Added Flow 4 (set builder), renumbered Flow 5 (admin); updated scoring factors table with API display names and `Cosine Similarity` note; updated match detail flow for clickable titles, transition chaining, breadcrumb nav; added fusion weight normalization note; added `SetBuilder` to client architecture; updated app layout diagram to 4 tabs |
| `docs/ARCHITECTURE.md` | Expanded client test runner info; added "Known baseline failures" subsection documenting `test_layer_dependency_direction` |
| `docs/golden-principles.md` | Added principle 13 (visible controls → real behavior) and principle 14 (audit callers when widening return type) |
| `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md` | Updated set preparation workflow status (MVP shipped); updated weight experimentation status (fusion subweights active); updated "analysis dead end" fear (m3u8 export + chaining shipped); updated "silent failures" fear (error states distinguished); added `Cosine Similarity` to domain vocabulary |

## Durable Guidance Captured

### Harness operations (from session learnings, strong repeated evidence)
- No git worktrees in pipeline (`.env` not inherited → DB failures)
- No parallel agents on same git repo (stash/checkout cross-contamination)
- Preserve uncommitted work across delivery runs (stash drop caused regression)
- QA agents must start the stack themselves
- Visual browser QA mandatory for frontend changes (6/12 runs confirmed)
- Gate 7 static review acceptable for non-`start_web.sh` contracts

### Product/domain conventions (from ledger evidence)
- `Cosine Similarity` is the canonical API factor name (not `Similarity`)
- `--content-gutter` is the single horizontal layout token for Browse (2 runs)
- CSS-only tooltips via `data-tooltip` + `::after` (2 runs)
- TAG_COLUMNS shared base; stage-specific fields in `update_row()` overrides
- Fusion weights normalized at scoring boundary
- Error states must be distinct from empty results at every data-table surface
- Breaker IMPORTANT → follow-on contract/run (5 runs confirmed this pattern)

### Golden principles added
- #13: Visible controls must map to real behavior
- #14: Audit callers when widening return types

## Persona Guidance Changed

- Updated workflow progress annotations (set builder, fusion weights, m3u8 export)
- Updated fear/friction status (analysis dead end, silent failures)
- Added `Cosine Similarity` to domain vocabulary

All persona changes supported by strong repeated evidence across multiple delivery
and product-feedback runs.

## Deferred Items

- **Shared TanStack table extraction**: `MatchesPanel` and `TrackTable` have duplicated
  interaction chrome. Revisit only when a contract needs the same pattern. (Source: 115052Z)
- **Touch/mobile tooltip accessibility**: CSS `:hover` tooltips are not touch-accessible.
  Acceptable for desktop-only context; revisit if mobile surface added. (Source: 004047Z)
- **Negative fusion weight validation**: API/service boundary should reject negative inputs.
  Not captured as a convention because it is a single-run finding. (Source: 124201Z)
- **`test_layer_dependency_direction` fix**: Structural debt remains; tracked in
  ARCHITECTURE.md but not resolved by doc sync. (Source: 4 runs)
- **MatchDetail error rendering and retry UX**: Deferred from error handling delivery.
  (Source: 093555Z)
- **Null transition score warning state in set builder**: Follow-on run created but
  semantics not yet resolved. (Source: 134953Z)
- **Rekordbox/USB export integration**: Largest remaining workflow gap per persona spec.
  (Source: 075202Z)
