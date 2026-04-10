# Development Contract

## Source Inputs
- `/Users/alen/Dev/dj-tools/.harness/runs/20260410T034002Z-product_feedback-product-thought-partner-set-work/PRODUCT_THOUGHT_PARTNER_RECOMMENDATIONS.md`
- User contracting brief for Contract A: Tracklist column width adjustment in `client/src/components/SetTracklist.tsx` and `client/src/styles.css`
- Group A in the recommendations: widen the Note column by 200px while relying on the fixed-layout table to let the Title column absorb the corresponding reduction

## Selected Intent
- delivery

## Contract Driver
- product-driven

## Selected Recommendation IDs
- `A1`

## Deferred Inputs / Non-goals
- Do not change Explorer behavior or Explorer API routes in this contract
- Do not restructure the Tracklist table beyond the targeted column-width adjustment needed to widen Note and preserve safe Title sizing
- Do not add new responsive breakpoints, new columns, or note-editing behavior changes
- Do not alter title-cleaning, track actions, or toast behavior

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Adjust the Set Builder Tracklist column sizing so the Note column becomes materially wider without introducing overflow or collapsing the Title column below a usable width. Limit implementation to `client/src/components/SetTracklist.tsx` and `client/src/styles.css`.
DO: 1. Update the Tracklist table column sizing so the Note column widens by exactly `200px`, moving it from the current `130px` width to `330px`. 2. Preserve the existing fixed-layout table behavior so the Title column, which has no explicit width, auto-narrows to absorb the same `200px` delta instead of forcing layout overflow. 3. If the width is expressed in the `<colgroup>`, header cells, or CSS class definitions, keep the implementation coherent and ensure the rendered widths match the requested visual outcome rather than splitting conflicting definitions across JSX and CSS. 4. Keep existing truncation and ellipsis behavior for the Title column intact so narrower titles still render cleanly inside the fixed table. 5. Add or update focused validation coverage only if there is an existing nearby pattern that can verify column sizing or overflow safety without introducing brittle snapshot noise.
ACCEPTANCE: 1. At a `1280px` viewport, the Tracklist Note column renders at `>= 300px`, with the preferred target at `330px`. 2. At a `1280px` viewport, the Title column remains at `>= 300px` after the Note-column change. 3. The Tracklist does not introduce horizontal overflow, clipped headers, or broken cell layout at `1280px`, `1440px`, or wider standard desktop widths. 4. Title cells continue to truncate with the existing overflow treatment rather than wrapping or visually breaking the table. 5. No Explorer files or non-Tracklist set-workspace surfaces are changed by this contract unless a tiny shared style dependency is strictly required.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- Keep this run narrow and visual: it is a small layout correction, not a Tracklist redesign.
- This contract is independent from Contracts 6 and 7, but it may touch `client/src/styles.css`; coordinate merges if another run edits the same stylesheet concurrently.
- Prefer lightweight validation that demonstrates viewport safety over broader UI churn.
