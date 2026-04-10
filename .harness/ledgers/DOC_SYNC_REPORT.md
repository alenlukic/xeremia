# Doc Sync Report

Sync boundary: `20260409T091130Z-delivery-development-contract-source-inpu` → `20260410T004356Z-delivery-development-contract-source-inpu`

## Ledgers Consumed

| Run ID | Mode | Summary |
|--------|------|---------|
| `20260409T190051Z-delivery-development-contract-source-inpu` | delivery | Explorer viewport restoration, cleanTitle extraction, note persistence, explicit child-add workflow |
| `20260409T192223Z-delivery-development-contract-source-inpu` | delivery | Explorer UX polish: orthogonal edge routing, grid layout, per-column edge colors, +TL pill |
| `20260409T231234Z-delivery-development-contract-source-inpu` | delivery | Explorer canvas fixes (Contract A): cleanTitle hardening, hover opacity, clipped root-node actions |
| `20260409T231235Z-delivery-development-contract-source-inpu` | delivery | Contract B validation: Tracks tab labeling, Pool/Tracklist layout, note-path closure |
| `20260410T004351Z-delivery-development-contract-source-inpu` | delivery | Contract 3: Tracklist semantic table markup, dedicated Key/BPM columns, shared colgroup widths |
| `20260410T004356Z-delivery-development-contract-source-inpu` | delivery | Contract 4: Explorer accordion polish, action sizing/labels/accessibility, CSS token cleanup |

## Files Updated

### `docs/CONVENTIONS.md`
- **Database section**: Added migration verification guidance — when a migration uses raw `engine.execute()`, verify the schema change landed afterward because execution alone does not guarantee commit (evidence: ledger `20260409T190051Z`)
- **Client section**: Added `Set workspace UI` subsection with 6 conventions:
  - `cleanTitle()` reuse for user-facing track labels across set workspace surfaces (evidence: ledgers `20260409T190051Z`, `20260409T231234Z`)
  - Explorer SVG sizing: computed pixel dimensions + explicit `viewBox` over percentage sizing (evidence: ledgers `20260409T190051Z`, `20260409T192223Z`, `20260409T231234Z`)
  - Explicit visible action controls over hidden gesture targets for core Explorer authoring (evidence: ledgers `20260409T190051Z`, `20260410T004356Z`)
  - SVG-backed interactive controls need `aria-label`, keyboard activation, and visible labeling (evidence: ledger `20260410T004356Z`)
  - Semantic CSS tokens and named Explorer palette constants over inline color literals (evidence: ledger `20260410T004356Z`)
  - Semantic table markup with shared colgroup widths for Pool/Tracklist alignment (evidence: ledger `20260410T004351Z`)

### `docs/WORKFLOWS.md`
- Added `client/src/utils/` row to the client architecture table, listing `trackTitle.ts` (shared `cleanTitle()`) and `explorer.ts` (layout grid, edge routing, color palette helpers)

### `.harness/product-feedback/CUSTOMER_PERSONA_SPEC.md`
- Updated workflow 2 (Set preparation) to mention per-track notes on tracklist entries for cue/mix reminders

### `.harness/ledgers/INDEX.md`
- Added 6 new ledger entries for the consumed runs

## Durable Guidance Captured

### Database (refined — from ledger `20260409T190051Z`)
- Raw `engine.execute()` migrations need explicit post-run schema verification; execution is not proof of commit

### Set workspace UI (new — from ledgers `20260409T190051Z`, `20260409T192223Z`, `20260409T231234Z`, `20260410T004351Z`, `20260410T004356Z`)
- Shared `cleanTitle()` for all user-facing track labels across Pool, Tracklist, Explorer
- Explorer SVG sizing via computed pixels + `viewBox`
- Visible controls over hidden gesture targets for core authoring
- Accessibility wiring for SVG-backed interactive controls
- Semantic CSS tokens and named palette constants
- Semantic table markup with shared colgroup widths for Pool/Tracklist

## Persona Guidance Changes

- `CUSTOMER_PERSONA_SPEC.md` workflow 2 (Set preparation): Added mention of per-track notes on tracklist entries. This reflects a shipped feature (note persistence via `PATCH /api/sets/{id}/tracklist/{track_id}/note`) confirmed across ledgers `20260409T190051Z` and `20260409T231235Z`.

## Deferred Items

- **QA live-stack lifecycle gate separation** (from ledger `20260409T231234Z`): "When QA fails on the mandatory live-stack lifecycle gate, record it as a repo-level blocker separately from scoped feature behavior." This is harness-process guidance, not a code convention. Deferred until a second run reinforces it as a pattern worth formalizing in harness docs.
- **Contract/brief disagreement recording** (from ledger `20260410T004356Z`): "When contract text and the operative brief disagree, record which source won and why." Single-run harness-process learning; deferred until the pattern recurs.
- **Dirty-worktree regression report caveat** (from ledger `20260409T231234Z`): "In dirty worktrees, treat regression reports on shared files as provisional until the run's diff is isolated." Harness-operational guidance; deferred pending recurrence.
- **Verify-and-close run recording** (from ledger `20260409T231235Z`): "When a supervisor run validates pre-existing implementation, record the true outcome as verification and closure." Single-run process observation; deferred.
- **Sticky-header verification depth** (from ledger `20260410T004351Z`): Available dataset didn't create enough rows to exercise sticky behavior. Deferred until a run depends on sticky-header correctness.
- **Tracklist test hardening** (from ledgers `20260410T004351Z`, `20260410T004356Z`): Colgroup class assertions, column-order lock, BPM absence from title cell, sibling-add modal coverage, edge-score rendering tests. These are follow-on contract items, not doc changes, and the durable registry now tracks this verification scope as `REC-012`.
- **Build retry for non-behavioral TS issues** (from ledger `20260410T004351Z`): "If build verification fails on a narrow, non-behavioral TypeScript issue after otherwise-correct scoped changes, prefer a targeted retry." Single-run observation; may warrant harness-level guidance if it recurs.
