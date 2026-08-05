import { PromoteIcon } from './table/icons'
import { detailFor } from '../hooks/useSequencer'
import { formatHM, formatMinutes } from '../utils/time'
import { harmonyPaint, keyDotColor } from '../utils/harmonic'
import type { PairResult } from '../utils/harmonic'
import type { Track } from '../types'

// One block on a lane. Detail drops out progressively as the block narrows, and
// the auto-scale factor never appears here — only in the footer and the
// Tracklist Length column.

const BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const

interface Props {
  track: Track | null
  left: number
  width: number
  /** Minutes since midnight; omitted on a benched block. */
  start?: number
  end?: number
  playMinutes?: number
  selected: boolean
  pinned?: boolean
  benched?: boolean
  /** True when the length rests on the fallback rather than a measured duration. */
  fallback?: boolean
  /** Harmony relation to the selected block, when another block is selected. */
  relation?: PairResult | null
  bpm?: number | null
  onSelect: () => void
  onPromote?: () => void
  onDragStart?: (e: React.DragEvent) => void
}

export function SequencerBlock({
  track,
  left,
  width,
  start,
  end,
  playMinutes,
  selected,
  pinned,
  benched,
  fallback,
  relation,
  bpm,
  onSelect,
  onPromote,
  onDragStart,
}: Props) {
  const detail = detailFor(width)
  const paint = relation && relation.p >= 0 ? harmonyPaint(relation.p) : null
  const style: React.CSSProperties = {
    left,
    width: Math.max(6, width),
  }
  if (paint && relation) {
    style.backgroundColor = `hsla(${paint.hue},${paint.sat}%,${paint.light}%,${paint.a})`
    style.borderStyle = BORDER_STYLES[relation.effort]
    style.color = relation.p === 0 ? '#fff4f0' : '#0d1206'
  } else if (relation) {
    // Selected, but unrelated to the clicked block.
    style.opacity = 0.35
  }

  const label = [
    detail.showCode ? track?.camelot_code : null,
    detail.showTitle ? track?.title : null,
  ]
    .filter(Boolean)
    .join(' ')

  const sub = [
    detail.showBpm && bpm != null ? `${bpm.toFixed(1)}` : null,
    // A trailing tilde marks a length the fallback produced.
    detail.showBpm && playMinutes != null
      ? `${formatMinutes(playMinutes)}m${fallback ? '~' : ''}`
      : null,
    detail.showRange && start != null && end != null
      ? `${formatHM(start)}–${formatHM(end)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={[
        'sq-block',
        selected ? 'sq-block--sel' : '',
        pinned ? 'sq-block--pinned' : '',
        benched ? 'sq-block--benched' : '',
        fallback ? 'sq-block--fallback' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={track?.title ?? 'Block'}
      data-fallback={fallback ? 'true' : undefined}
      title={
        fallback
          ? 'No measured duration; the block uses the 5:00 fallback length.'
          : undefined
      }
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
    >
      <span className="sq-block-line">
        {detail.showDot && (
          <span
            className="key-dot"
            aria-hidden="true"
            style={{
              background: keyDotColor(track?.camelot_code) ?? 'transparent',
            }}
          />
        )}
        {label}
      </span>
      {sub && <span className="sq-block-sub">{sub}</span>}
      {benched && onPromote && (
        <button
          className="sq-promote"
          aria-label={`Promote ${track?.title ?? 'track'}`}
          title="Promote into the committed lane"
          onClick={(e) => {
            e.stopPropagation()
            onPromote()
          }}
        >
          <PromoteIcon size={11} />
        </button>
      )}
    </div>
  )
}
