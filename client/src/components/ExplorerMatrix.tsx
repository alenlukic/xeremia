import { useMemo, useState } from 'react'
import { ExplorerInspector } from './ExplorerInspector'
import { ExplorerTooltip } from './ExplorerTooltip'
import {
  CELL_GAP_PX,
  CELL_HEIGHT_PX,
  CELL_WIDTH_PX,
  useExplorerMatrix,
} from '../hooks/useExplorerMatrix'
import type { MatrixFocus } from '../hooks/useExplorerMatrix'
import { useExternalTrackDrop } from '../hooks/useExternalTrackDrop'
import { bucketLoBpm, harmonyPaint } from '../utils/harmonic'
import type { PoolEntry } from '../types'
import { POOL_ROW_MIME, TRACK_DRAG_MIME } from '../utils'

// BPM cohort matrix: 24 literal Camelot rows × 26 ×1.0293 BPM buckets. Axes
// never shift, harmony is hue-only, and pitch effort is the border style.
// Dropping a track anywhere files it into its own cohort (poolAdd), so the
// legacy explorer node/edge endpoints are not used here.

interface Props {
  pool: PoolEntry[]
  onDropTrack: (trackId: number) => void
  /** Track the workspace has focused, lit here as if its cell were clicked. */
  focus?: MatrixFocus | null
  /** Tracks the Sequencer's committed lane already holds; Prune reads these. */
  committedTrackIds?: ReadonlySet<number>
  /** Bulk pool removal. Prune and Clear stay hidden without it. */
  onRemoveTracks?: (trackIds: number[]) => void
}

export function ExplorerMatrix({
  pool,
  onDropTrack,
  focus,
  committedTrackIds,
  onRemoveTracks,
}: Props) {
  const matrix = useExplorerMatrix(pool, focus)
  const dropTargets = useMemo(
    () => [
      { mime: TRACK_DRAG_MIME, onDropTrack },
      { mime: POOL_ROW_MIME, onDropTrack, dropEffect: 'move' as const },
    ],
    [onDropTrack],
  )
  const { dropHandlers } = useExternalTrackDrop(dropTargets)

  // Clear empties every cohort, so it asks once in the toolbar rather than
  // relying on an undo the workspace does not have.
  const [confirmingClear, setConfirmingClear] = useState(false)
  const prunableIds = useMemo(
    () =>
      pool
        .filter((entry) => committedTrackIds?.has(entry.track_id))
        .map((entry) => entry.track_id),
    [pool, committedTrackIds],
  )

  const cellStyle = {
    width: CELL_WIDTH_PX,
    height: CELL_HEIGHT_PX,
  }

  return (
    <div className="xm-body" {...dropHandlers}>
      <div className="xm-scroll">
        {/* No legend: the relation colours read on their own, and the row
            it occupied is vertical space the matrix needs more. */}
        {(matrix.selected || onRemoveTracks) && (
          <div className="xm-toolbar">
            {matrix.selected && (
              <button className="ws-pill" onClick={matrix.clearSelection}>
                Clear selection
              </button>
            )}
            {onRemoveTracks && !confirmingClear && (
              <>
                <button
                  className="ws-pill"
                  title="Remove pool tracks the committed lane already holds"
                  disabled={prunableIds.length === 0}
                  onClick={() => onRemoveTracks(prunableIds)}
                >
                  Prune
                </button>
                <button
                  className="ws-pill"
                  title="Remove every track from the pool"
                  disabled={pool.length === 0}
                  onClick={() => setConfirmingClear(true)}
                >
                  Clear
                </button>
              </>
            )}
            {onRemoveTracks && confirmingClear && (
              <>
                <span className="xm-confirm">Remove every track?</span>
                <button
                  className="ws-pill"
                  aria-label="Confirm clear"
                  onClick={() => {
                    setConfirmingClear(false)
                    onRemoveTracks(pool.map((entry) => entry.track_id))
                  }}
                >
                  Confirm
                </button>
                <button
                  className="ws-pill"
                  aria-label="Cancel clear"
                  onClick={() => setConfirmingClear(false)}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
        <div className="xm-col-heads" style={{ gap: CELL_GAP_PX }}>
          {Array.from({ length: matrix.cols }, (_, c) => (
            <span
              key={c}
              className={
                matrix.selected?.c === c ? 'xm-head xm-head--on' : 'xm-head'
              }
              style={{ width: CELL_WIDTH_PX }}
            >
              {Math.round(bucketLoBpm(c))}
            </span>
          ))}
        </div>
        {matrix.rows.map((code, r) => (
          <div key={code} className="xm-row" style={{ gap: CELL_GAP_PX }}>
            <span
              className={
                matrix.selected?.r === r
                  ? 'xm-row-head xm-row-head--on'
                  : 'xm-row-head'
              }
            >
              {code}
            </span>
            {Array.from({ length: matrix.cols }, (_, c) => {
              const count = matrix.cohort(r, c).length
              const isSelected =
                !!matrix.selected &&
                matrix.selected.r === r &&
                matrix.selected.c === c
              const relation = matrix.relationTo(r, c)
              const style: React.CSSProperties = { ...cellStyle }
              if (relation && relation.p >= 0) {
                const paint = harmonyPaint(relation.p)
                style.backgroundColor = `hsla(${paint.hue},${paint.sat}%,${paint.light}%,${paint.a})`
                style.border = `1px ${relation.borderStyle} hsla(${paint.hue},${paint.sat}%,68%,.92)`
                style.color = relation.p === 0 ? '#fff4f0' : '#0d1206'
              }
              return (
                <button
                  key={c}
                  className={[
                    'xm-cell',
                    count ? `xm-cell--n${Math.min(count, 4)}` : '',
                    isSelected ? 'xm-cell--sel' : '',
                    relation && relation.p < 0 ? 'xm-cell--dim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={style}
                  aria-label={`${code} bucket ${c + 1}, ${count} tracks`}
                  aria-pressed={isSelected}
                  onClick={() => matrix.selectCell(r, c)}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    matrix.setHover({
                      r,
                      c,
                      rect: { l: rect.left, r: rect.right, t: rect.top },
                    })
                  }}
                  onMouseLeave={() =>
                    matrix.setHover((h) =>
                      h && h.r === r && h.c === c ? null : h,
                    )
                  }
                >
                  {count || ''}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {matrix.inspectorOpen &&
        matrix.selected &&
        matrix.selectedCohort.length > 0 && (
          <ExplorerInspector
            row={matrix.selected.r}
            range={matrix.bucketRange(matrix.selected.c)}
            cohort={matrix.selectedCohort}
            side={matrix.inspectorSide}
            onClose={matrix.closeInspector}
          />
        )}

      {matrix.hover && (
        <ExplorerTooltip
          hover={matrix.hover}
          range={matrix.bucketRange(matrix.hover.c)}
          cohortCount={matrix.cohort(matrix.hover.r, matrix.hover.c).length}
          relation={matrix.relationTo(matrix.hover.r, matrix.hover.c)}
          viewportWidth={window.innerWidth}
          viewportHeight={window.innerHeight}
        />
      )}
    </div>
  )
}
