# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260410T003620Z-product_feedback-design-perfectionist-review-of-s/DESIGN_PERFECTIONIST_REVIEW.md`
- User grouping for Contract B: `R02`, `R03`, `R04`, and `R06` are the coupled Explorer plus accordion polish items spanning `client/src/components/SetExplorerCanvas.tsx`, `client/src/components/SetBuilder.tsx`, `client/src/styles.css`, and `client/src/utils/explorer.ts`
- Set workspace scope: Explorer subtab and Pool accordion affordance polish only; Tracklist structural migration is intentionally excluded

## Selected Intent
- delivery

## Contract Driver
- design-driven

## Selected Recommendation IDs
- `R02`
- `R03`
- `R04`
- `R06`

## Deferred Inputs / Non-goals
- Do not touch `client/src/components/SetTracklist.tsx` structure
- Do not absorb the Tracklist table migration, Actions column alignment, or dedicated key/BPM column work from Contract 3
- Do not add new Explorer features such as zoom controls, drag-reorder, or swap-workflow redesign beyond clearer labels and affordances
- Do not widen scope into toast exit animation, selector copy, modal CTA sizing, or checkbox restyling unless required by these targeted fixes
- Defer `R07` through `R15` unless one is strictly necessary to implement the requested polish without regressions

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Polish the Set workspace Explorer subtab and Pool accordion affordances so high-frequency controls are legible, discoverable, and token-consistent. Limit implementation to `client/src/components/SetExplorerCanvas.tsx`, `client/src/components/SetBuilder.tsx`, `client/src/styles.css`, `client/src/utils/explorer.ts`, and a minimal shared token/config file if needed to remove inline Explorer palette literals. Do not change Tracklist structure in this contract.
DO: 1. In `client/src/components/SetBuilder.tsx` and supporting CSS, widen the Pool collapse handle from the current undersized state to a concrete `min-width` between `28px` and `32px`, with the preferred default at `28px`. Ensure the entire visible handle remains clickable, preserves the existing tooltip/aria copy, and gains a clearer hover treatment that communicates collapse. 2. In `client/src/components/SetBuilder.tsx`, add an explicit directional indicator to the collapsed Pool expand tab, using a visible chevron such as `›` or `▸` positioned above or alongside the rotated label, and add `title="Expand pool"` so the affordance is discoverable on hover. 3. In `client/src/components/SetExplorerCanvas.tsx`, rework the per-node action row so five actions no longer feel cramped inside a `120px` node. Increase action sizing from `20px` to `22px`, adjust the action-row slot width accordingly, and replace ambiguous labels: use a swap symbol that reads as swap rather than sort, and replace `+Sib` and `+Ch` with unambiguous shorter labels or icons paired with clear tooltip text. 4. Keep Explorer action tooltips available in a browser-reliable way; SVG `<title>` support alone is not sufficient, so add an implementation that exposes clear hover text consistently. 5. In `client/src/styles.css`, add semantic color tokens with exact starting values `--danger: #e53935`, `--danger-dim: rgba(229, 57, 53, 0.15)`, `--success: #43a047`, and `--info: #1e88e5`, then replace the workspace’s scattered danger-red literals with these tokens. 6. In `client/src/utils/explorer.ts` and any related Explorer rendering code, remove raw hex palettes from inline arrays and source them from a central token/config export so Explorer node, edge, and action colors are defined in one place rather than repeated literals. 7. Update focused tests for accordion affordances, Explorer action labeling, and tokenized Explorer color configuration; keep them scoped to these UX-polish behaviors.
ACCEPTANCE: 1. The Pool collapse handle renders with `min-width >= 28px`, the whole handle is clickable, and the hover state clearly indicates collapse. 2. The collapsed Pool expand tab shows a directional chevron and exposes `title="Expand pool"` on hover. 3. Explorer nodes can render all five action controls without overlap or unreadable crowding at default zoom, using the updated `22px` action sizing. 4. The old ambiguous `⇅`, `+Sib`, and `+Ch` affordances are replaced with clearer labels, icons, or symbols, and each action exposes understandable tooltip text. 5. The workspace defines and uses the semantic tokens `--danger`, `--danger-dim`, `--success`, and `--info`; danger literals `#e85858` and `#e06c75` are eliminated from CSS in favor of the tokenized values. 6. Explorer palettes are no longer defined as inline raw hex arrays inside `client/src/utils/explorer.ts`; they come from one central token/config source. 7. No Tracklist structural migration is performed in this contract. 8. Targeted automated tests covering accordion affordance visibility, Explorer action clarity, and tokenized palette wiring pass.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- This contract is logically independent from Contract 3 and can be delivered in any order, but both contracts may edit `client/src/styles.css`; coordinate merges if they run concurrently.
- Keep the delivery agent focused on polish and consistency, not feature expansion. If deeper Explorer workflow issues emerge, spin a follow-on contract rather than broadening this run.
- Prefer Design QA after delivery because the acceptance criteria are affordance-heavy and visually observable.
