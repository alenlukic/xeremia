# Table design tokens

Ground-breaking pass for the Xeremia design system. Tokens are CSS custom
properties declared in `src/styles.css` `:root` **before** any layout, per the
UX handbook (`ux-guide.md` → "Design tokens"). Component rules reference the
semantic name, never the raw hex.

## Elevation & contrast

| Token             | Intent                                                          |
| ----------------- | -------------------------------------------------------------- |
| `--surface`       | Base panel/quadrant surface (existing).                        |
| `--surface-2`     | Raised surface for the table **header** and **control panel** zones — lifts them off the value rows. |
| `--row-alt`       | Alternating (odd) value-row wash. Kept very low-alpha to stay minimalist. |
| `--border`        | Hairline separators (existing).                                |
| `--border-strong` | Zone edges where the hairline reads too faint (table frame, active states). |

## Emphasis (use sparingly — one primary per view)

| Token               | Intent                                                       |
| ------------------- | ----------------------------------------------------------- |
| `--accent`          | Interactive accent (existing).                              |
| `--accent-emphasis` | Reserved primary emphasis, e.g. the search bar. Von Restorff: at most one per view. |
| `--focus-ring`      | Visible keyboard focus (`box-shadow`). Accessibility baseline — never rely on hover alone. |

## Score gradient (matches table)

Scores map onto a red → yellow → green scale (**0 = red, 100 = green**). Stops
are stored as **`H S% L%` triples** (not full colors) so a cell can interpolate
its hue from the normalized score and compose `hsl(...)` at the tint/hatch alpha.

| Token                 | Intent                                            |
| --------------------- | ------------------------------------------------- |
| `--score-red/-yellow/-green` | Gradient stops as `H S% L%`.               |
| `--score-tint-alpha`  | Flat hue tint alpha behind a score cell.          |
| `--score-hatch-alpha` | Cross-hatch (`repeating-linear-gradient`) overlay alpha. Keeps cell text AA-legible. |

Normalize before mapping: per-column `_score` fields are already `0–1`;
`overall_score` is `0–100` (divide by 100). See `table/scoreGradient.ts`.

## Group dots (pool follow-up)

`--dot-1 … --dot-8` — a categorical palette for colored group indicators.
Defined now; consumed when the pool group column lands.
