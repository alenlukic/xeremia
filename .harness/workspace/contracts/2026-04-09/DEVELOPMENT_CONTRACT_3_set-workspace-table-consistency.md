# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260410T003620Z-product_feedback-design-perfectionist-review-of-s/DESIGN_PERFECTIONIST_REVIEW.md`
- User grouping for Contract A: `R01`, `R05`, and `R16` are tightly coupled table-structure issues centered on `client/src/components/SetTracklist.tsx`, `client/src/components/SetPoolTable.tsx`, and `client/src/styles.css`
- Set workspace scope: Tracks subtab only; Explorer changes are intentionally excluded from this contract

## Selected Intent
- delivery

## Contract Driver
- design-driven

## Selected Recommendation IDs
- `R01`
- `R05`
- `R16`

## Deferred Inputs / Non-goals
- Do not touch `client/src/components/SetExplorerCanvas.tsx`
- Do not broaden scope into Explorer node controls, accordion affordances, toast behavior, modal sizing, or selector copy
- Do not redesign the data model or backend APIs for set workspace tracks
- Do not introduce new dependencies or replace the existing pool table with a different component abstraction
- Defer `R10`, `R14`, and `R15` unless one becomes strictly necessary to complete the table migration without regressions

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Normalize the Set workspace Tracks subtab so Tracklist and Pool use a consistent table-based structure with aligned headers/cells and always-visible musical metadata. Limit implementation to `client/src/components/SetTracklist.tsx`, `client/src/components/SetPoolTable.tsx`, `client/src/styles.css`, and focused tests or helpers required to validate the table layout contract. Do not edit Explorer components in this contract.
DO: 1. In `client/src/components/SetTracklist.tsx`, replace the current flex-row Tracklist structure with semantic `<table>/<thead>/<tbody>` markup that mirrors the Pool table model closely enough to share alignment behavior. Use explicit columns for order/index, title, key, BPM, note, and actions instead of embedding key/BPM inside the title cell. 2. Add a stable column-width contract for the Tracklist using `colgroup`, CSS classes, or an equally explicit mechanism. Use concrete minimums: key column `min-width: 48px`, BPM column `min-width: 40px`, note column wide enough to preserve current note usability, and actions column fixed to match the rendered action group width. The default target for the actions column is `148px`; if the final rendered controls require a slightly different fixed width, keep header and row cells identical and document the chosen width in code. 3. In `client/src/components/SetPoolTable.tsx`, align the pool table’s column sizing primitives and class naming with the Tracklist where practical so the two panels behave like sibling tables rather than unrelated layouts; preserve Pool-specific columns and actions. 4. In `client/src/styles.css`, add or update the table styles needed to keep both headers sticky, cell padding visually consistent, and title truncation isolated to the title cell only. The title column must consume remaining space while the key and BPM cells stay nowrap and fully visible. 5. Remove the inline `.set-tracklist-meta-inline` pattern from the title cell so long titles can ellipsize independently of musical metadata. 6. Preserve existing tracklist actions and note editing behavior during the table migration; if action button widths change, keep the rendered action group width and the header cell width in lockstep. 7. Add or update focused frontend tests covering Tracklist rendering structure, dedicated key/BPM cells, and the presence of a fixed actions column contract; keep tests narrow to this layout migration.
ACCEPTANCE: 1. Both the Pool and Tracklist panels render semantic HTML tables in the Tracks subtab. 2. At desktop workspace widths around `1200px`, Tracklist headers align to their row cells within `±2px`, including the Actions column. 3. The Tracklist Actions header uses the same fixed width as the rendered action-button group, with the header text fully visible. 4. Key and BPM are always visible in their own dedicated fixed-width cells even when the title truncates. 5. Long titles truncate independently while the key and BPM cells remain nowrap and readable. 6. Sticky table headers continue to function after the Tracklist migration. 7. Existing tracklist note editing and row action workflows continue to work. 8. No Explorer canvas code is changed in this contract. 9. Targeted automated tests for the Tracklist table structure and metadata columns pass.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- This contract is intentionally limited to the Tracks subtab’s structural consistency and should not absorb Explorer or accordion polish.
- The contract is independent from Contract 4 in product logic, but both may touch `client/src/styles.css`; if they are executed concurrently, expect merge coordination rather than scope expansion.
- Prefer a design-verification pass after delivery because the core acceptance is visual alignment and information visibility.
