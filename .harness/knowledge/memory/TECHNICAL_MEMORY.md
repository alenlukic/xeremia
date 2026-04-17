## Repo-Wide

- Explorer rendering geometry should be derived from SVG `viewBox` coordinates, not CSS transforms.
- Explorer interaction modes should stay isolated so hover, drag, connect, and selection logic do not cross-couple.
- Drag-and-drop acceptance changes are only durable when backed by state-mutation proof, not hover-only affordances.
- `React.memo` boundaries should receive primitives or stable references; unstable objects erase memoization value.
- Dirty worktrees are a recurring contamination risk; adjacent changes should not be folded into task conclusions by default.
- Dirty-worktree adjacent changes must be called out explicitly in diff, ledger, and verification artifacts.
- `TrackTable` virtualization changes must preserve row measurement, scroll anchoring, and visible-window invariants.
- Search and filter state are one behavioral surface; updates must preserve query, key, BPM, and result coupling.
- When intentionally ignoring an exception, prefer a short explanatory comment in the `catch` block over a bare empty `catch`.
- For UI geometry or rendered-position bugs, live DOM verification is the deciding evidence.
- Retry rounds should target the proven failure mechanism only, not broaden into adjacent cleanup.

## Subsystem-Specific

- Explorer dock and drop affordances need explicit visual and behavioral alignment so users can predict valid targets.
- Explorer hit-zone logic, drag-state refs, and duplicate-edge guards should be treated as one behavioral surface during fixes and regression checks.
- Geometry-sensitive tests should include at least one non-default dimension case and one degenerate fallback case.
