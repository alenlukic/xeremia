import { useCallback, useMemo, useState } from 'react'
import type { PoolEntry, Track } from '../types'
import {
  BPM_BASE,
  BPM_RATIO,
  CAMELOT_ROWS,
  MATRIX_COLS,
  PRIORITY_NAMES,
  colForBpm,
  harmonyPaint,
  pairTracks,
  shiftCode,
} from '../utils/harmonic'

// BPM cohort matrix: 24 literal Camelot rows × 26 ×1.0293 BPM buckets.
// Axes never shift; harmony is hue-only; pitch effort is border style.
// Data source: the active set's pool. Dropping a track anywhere files it
// into its own cohort (poolAdd) — there is no free positioning, so the old
// explorer node/edge endpoints are not used here.

interface Cell { r: number; c: number }

interface Props {
  pool: PoolEntry[]
  onDropTrack: (trackId: number) => void
  /** Reuse the app's standard track drag payload. */
  trackDragKey?: string
}

const BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const

export function ExplorerMatrix({ pool, onDropTrack, trackDragKey = 'text/track' }: Props) {
  const [cell, setCell] = useState<Cell | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [hover, setHover] = useState<(Cell & { rect: { l: number; r: number; t: number } }) | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)

  const tracks = useMemo(
    () => pool.map((e) => e.track).filter((t): t is Track => !!t && t.camelot_code != null && t.bpm != null),
    [pool],
  )

  const buckets = useMemo(() => {
    const map = new Map<string, Track[]>()
    for (const t of tracks) {
      const key = `${CAMELOT_ROWS.indexOf(t.camelot_code!)}:${colForBpm(t.bpm!)}`
      const list = map.get(key) ?? []
      list.push(t)
      map.set(key, list)
    }
    return map
  }, [tracks])

  /** Representative BPM: cohort mean when populated, else geometric bucket centre. */
  const bpmOf = useCallback(
    (r: number, c: number) => {
      const list = buckets.get(`${r}:${c}`)
      if (list && list.length) return list.reduce((s, t) => s + t.bpm!, 0) / list.length
      return BPM_BASE * Math.pow(BPM_RATIO, c + 0.5)
    },
    [buckets],
  )

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      const isSel = !!cell && cell.r === r && cell.c === c
      const hasTracks = (buckets.get(`${r}:${c}`)?.length ?? 0) > 0
      setCell(isSel ? null : { r, c })
      // The inspector opens ONLY from a populated cell; never on its own.
      setInspectorOpen(isSel ? false : hasTracks)
    },
    [cell, buckets],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(trackDragKey)
      if (raw === '') return
      e.preventDefault()
      onDropTrack(Number(raw))
    },
    [onDropTrack, trackDragKey],
  )

  const selCode = cell ? CAMELOT_ROWS[cell.r] : null
  const cohort = cell ? (buckets.get(`${cell.r}:${cell.c}`) ?? []) : []
  // Overlay side: opposite half of the matrix from the selected cell.
  const overlaySide = cell && cell.c >= MATRIX_COLS / 2 ? 'left' : 'right'

  return (
    <div className="xm-body" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <div className="xm-scroll">
        <div className="xm-col-heads">
          {Array.from({ length: MATRIX_COLS }, (_, c) => (
            <span key={c} className={cell?.c === c ? 'xm-head xm-head--on' : 'xm-head'}>
              {Math.round(BPM_BASE * Math.pow(BPM_RATIO, c))}
            </span>
          ))}
        </div>
        {CAMELOT_ROWS.map((code, r) => (
          <div key={code} className="xm-row">
            <span className={cell?.r === r ? 'xm-row-head xm-row-head--on' : 'xm-row-head'}>{code}</span>
            {Array.from({ length: MATRIX_COLS }, (_, c) => {
              const list = buckets.get(`${r}:${c}`) ?? []
              const isSel = !!cell && cell.r === r && cell.c === c
              const style: React.CSSProperties = {}
              if (cell && !isSel) {
                const pair = pairTracks(bpmOf(cell.r, cell.c), CAMELOT_ROWS[cell.r], bpmOf(r, c), code)
                if (pair.p >= 0) {
                  const g = harmonyPaint(pair.p)
                  style.backgroundColor = `hsla(${g.hue},${g.sat}%,${g.light}%,${g.a})`
                  style.border = `1px ${BORDER_STYLES[pair.effort]} hsla(${g.hue},${g.sat}%,68%,.92)`
                  style.color = pair.p === 0 ? '#fff4f0' : '#0d1206'
                }
              }
              return (
                <button
                  key={c}
                  className={[
                    'xm-cell',
                    list.length ? `xm-cell--n${Math.min(list.length, 4)}` : '',
                    isSel ? 'xm-cell--sel' : '',
                    cell && !isSel && !style.backgroundColor ? 'xm-cell--dim' : '',
                  ].join(' ')}
                  style={style}
                  onClick={() => handleCellClick(r, c)}
                  onMouseEnter={(e) => {
                    const rc = e.currentTarget.getBoundingClientRect()
                    setHover({ r, c, rect: { l: rc.left, r: rc.right, t: rc.top } })
                  }}
                  onMouseLeave={() => setHover((h) => (h && h.r === r && h.c === c ? null : h))}
                >
                  {list.length || ''}
                </button>
              )
            })}
          </div>
        ))}
        {legendOpen && (
          <div className="xm-legend">
            {[4, 3, 2, 1, 0].map((p) => {
              const g = harmonyPaint(p)
              return (
                <span key={p} className="xm-swatch" style={{ backgroundColor: `hsla(${g.hue},${g.sat}%,${g.light}%,${g.a})` }}>
                  {PRIORITY_NAMES[p]}
                </span>
              )
            })}
          </div>
        )}
        <button className="ws-pill" onClick={() => setLegendOpen((v) => !v)}>Legend</button>
      </div>

      {inspectorOpen && cell && cohort.length > 0 && (
        <div className={`xm-inspector xm-inspector--${overlaySide}`}>
          <div className="xm-inspector-head">
            <div className="xm-inspector-title">
              {selCode} · {(BPM_BASE * Math.pow(BPM_RATIO, cell.c)).toFixed(1)}–
              {(BPM_BASE * Math.pow(BPM_RATIO, cell.c + 1)).toFixed(1)} BPM
            </div>
            <button className="xm-inspector-close" onClick={() => setInspectorOpen(false)} aria-label="Close inspector">×</button>
          </div>
          <div className="xm-inspector-sub">
            pitched up → {shiftCode(selCode!, 7)} · pitched down → {shiftCode(selCode!, -7)}
          </div>
          <div className="xm-inspector-tracks">
            {cohort.map((t) => (
              <div
                key={t.id}
                className="xm-track-card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData(trackDragKey, String(t.id))}
              >
                [{t.camelot_code} · {Math.round(t.bpm!)}] {t.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {hover && (
        <HoverTip hover={hover} cell={cell} buckets={buckets} bpmOf={bpmOf} />
      )}
    </div>
  )
}

function HoverTip({
  hover,
  cell,
  buckets,
  bpmOf,
}: {
  hover: Cell & { rect: { l: number; r: number; t: number } }
  cell: Cell | null
  buckets: Map<string, Track[]>
  bpmOf: (r: number, c: number) => number
}) {
  const code = CAMELOT_ROWS[hover.r]
  const lo = BPM_BASE * Math.pow(BPM_RATIO, hover.c)
  const n = buckets.get(`${hover.r}:${hover.c}`)?.length ?? 0
  const pair =
    cell && !(cell.r === hover.r && cell.c === hover.c)
      ? pairTracks(bpmOf(cell.r, cell.c), CAMELOT_ROWS[cell.r], bpmOf(hover.r, hover.c), code)
      : null
  const flip = hover.rect.l > window.innerWidth * 0.62
  return (
    <div
      className="xm-tip"
      style={{
        left: flip ? hover.rect.l - 262 : hover.rect.r + 10,
        top: Math.max(10, Math.min(hover.rect.t - 8, window.innerHeight - 170)),
      }}
    >
      <div className="xm-tip-title">
        {code} · {lo.toFixed(1)}–{(lo * BPM_RATIO).toFixed(1)} BPM
      </div>
      <div className="xm-tip-sub">{n ? `${n} track${n === 1 ? '' : 's'} in cohort` : 'no tracks in cohort'}</div>
      {pair && pair.p >= 0 && (
        <>
          <div className="xm-tip-rel">{PRIORITY_NAMES[pair.p]} · meet ≈{pair.meet!.toFixed(1)} BPM</div>
          <div className="xm-tip-move">selected {pair.aName === 'as-is' ? 'plays as-is' : `pitched ${pair.aName} →`} {pair.aCode}</div>
          <div className="xm-tip-move">this cell {pair.bName === 'as-is' ? 'plays as-is' : `pitched ${pair.bName} →`} {pair.bCode}</div>
        </>
      )}
      {pair && pair.p < 0 && (
        <div className="xm-tip-note">{pair.overlap ? 'no harmonic relation at any shared BPM' : 'BPM windows never meet'}</div>
      )}
    </div>
  )
}
