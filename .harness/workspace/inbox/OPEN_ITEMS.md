# Open Items

## Known Issues

### KI-001 — Tracklist DnD: drop between adjacent empty rows does not place track between them

**Surface:** `client/src/App.tsx` → `handleDragEnd`, empty-row branch

**Symptom:** When a track is dragged and dropped on an empty row that has an immediately adjacent empty row (positions P and P+1), the track is not placed visually between the two empty rows. Neither empty row is consumed (correct), but the track either does not appear at the expected position or does not move at all.

**Root cause (diagnosed, not fully fixed):**
- `empty_rows.position` is a *display index* (merged track + empty-row list), but `reorderTracklist` / `addToTracklistAtPosition` expect a *tracklist-only index*. The two diverge when empty rows precede the drop target.
- The adjacent empty row is not shifted after the insert, so the display algorithm places the new track after both empty rows rather than between them.

**Fix attempts:**
1. Quick-follow: pointer-Y threshold heuristic (`_lastPointerY`) — did not reliably prevent empty-row fill.
2. Full pipeline: `hasAdjacentEmpty` flag — correctly prevented fill but track still appeared at wrong position.
3. Post-pipeline: added `reorderEmptyRow(lowerRow, position + 1)` + corrected `tracklistPos = insertDisplayPos − emptysBefore` — tests pass but not confirmed fixed in live browser.

**Status:** Punted. To be addressed in the full tracklist redesign (DEVELOPMENT_CONTRACT_2+).
