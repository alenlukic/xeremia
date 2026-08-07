import { CAMELOT_ROWS, harmonyPaint, keyDotColor } from '../utils/harmonic'
import { PRIORITY_NAMES } from '../utils/harmonic'
import type { CellRelation, MatrixCell } from '../hooks/useExplorerMatrix'

// Custom hover card for a matrix cell. It replaces the native title tooltip so
// the relation swatch and the two pitch rows can be laid out properly.

/** Past this share of the viewport width the card flips to the cell's left. */
export const FLIP_THRESHOLD = 0.62
const CARD_WIDTH = 252
/** Tallest the card gets, used to keep it clear of the viewport bottom. */
const CARD_HEIGHT = 140

interface Props {
  hover: MatrixCell & { rect: { l: number; r: number; t: number } }
  range: [number, number]
  cohortCount: number
  relation: CellRelation | null
  viewportWidth: number
  viewportHeight: number
}

export function ExplorerTooltip({
  hover,
  range,
  cohortCount,
  relation,
  viewportWidth,
  viewportHeight,
}: Props) {
  const code = CAMELOT_ROWS[hover.r]
  const flip = hover.rect.l > viewportWidth * FLIP_THRESHOLD
  const paint = relation && relation.p >= 0 ? harmonyPaint(relation.p) : null

  return (
    <div
      className={`xm-tip${flip ? ' xm-tip--flip' : ''}`}
      role="tooltip"
      style={{
        left: flip ? hover.rect.l - (CARD_WIDTH + 10) : hover.rect.r + 10,
        top: Math.max(
          10,
          Math.min(hover.rect.t - 8, viewportHeight - CARD_HEIGHT),
        ),
      }}
    >
      <div className="xm-tip-title">
        <span
          className="key-dot"
          aria-hidden="true"
          style={{ background: keyDotColor(code) ?? 'transparent' }}
        />
        {code} · {range[0].toFixed(1)}–{range[1].toFixed(1)} BPM
      </div>
      <div className="xm-tip-sub">
        {cohortCount
          ? `${cohortCount} track${cohortCount === 1 ? '' : 's'} in cohort`
          : 'no tracks in cohort'}
      </div>
      {relation && relation.p >= 0 && (
        <div className="xm-tip-rel">
          <span
            className="xm-swatch xm-swatch--inline"
            style={{
              backgroundColor: paint
                ? `hsla(${paint.hue},${paint.sat}%,${paint.light}%,${paint.a})`
                : undefined,
              borderStyle: relation.borderStyle,
            }}
          >
            {PRIORITY_NAMES[relation.p]}
          </span>
          {relation.meet != null && (
            <span className="xm-tip-meet">
              meet ≈{relation.meet.toFixed(1)} BPM
            </span>
          )}
        </div>
      )}
      {relation && relation.p < 0 && (
        <div className="xm-tip-note">
          {relation.overlap
            ? 'no harmonic relation at any shared BPM'
            : 'BPM windows never meet'}
        </div>
      )}
    </div>
  )
}
