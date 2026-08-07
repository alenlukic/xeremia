import { useState } from 'react'
import { createPortal } from 'react-dom'
import { PinIcon, PromoteIcon } from './table/icons'
import { formatDuration, formatHM } from '../utils/time'
import { harmonyPaint, keyDotColor } from '../utils/harmonic'
import type { PairResult } from '../utils/harmonic'
import type { Track } from '../types'

// One block on a lane. The tile carries only a key over a BPM; the full track
// details live in a hover popover.

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
  starred?: boolean
  locationPinned?: boolean
  pinned?: boolean
  benched?: boolean
  /** True when the length rests on the fallback rather than a measured duration. */
  fallback?: boolean
  /** Harmony relation to the selected block, when another block is selected. */
  relation?: PairResult | null
  bpm?: number | null
  onSelect: () => void
  onToggleStar?: () => void
  onTogglePin?: () => void
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
  starred,
  locationPinned,
  pinned,
  benched,
  fallback,
  relation,
  bpm,
  onSelect,
  onToggleStar,
  onTogglePin,
  onPromote,
  onDragStart,
}: Props) {
  const paint = relation && relation.p >= 0 ? harmonyPaint(relation.p) : null
  const style: React.CSSProperties = {
    left,
    // Keep a sliver discoverable without extending into the next logical span.
    width: Math.max(1, width),
  }
  if (!starred && paint && relation) {
    style.backgroundColor = `hsla(${paint.hue},${paint.sat}%,${paint.light}%,${paint.a})`
    style.borderStyle = BORDER_STYLES[relation.effort]
    style.color = relation.p === 0 ? '#fff4f0' : '#0d1206'
  } else if (!starred && relation) {
    // Selected, but unrelated to the clicked block.
    style.opacity = 0.35
  }

  // The tile is far too narrow for a title at any useful zoom, so the details
  // live in a popover. It is rendered through a portal because the block clips
  // its own overflow to keep the tile copy tidy, which would otherwise hide it.
  const [pop, setPop] = useState<{ x: number; y: number } | null>(null)
  const meta = [
    track?.camelot_code,
    bpm != null ? `${Math.round(bpm)} BPM` : null,
    // A trailing tilde marks a length the fallback produced.
    playMinutes != null
      ? `${formatDuration(playMinutes)}${fallback ? '~' : ''}`
      : null,
    start != null && end != null ? `${formatHM(start)}–${formatHM(end)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={[
        'sq-block',
        selected ? 'sq-block--sel' : '',
        starred ? 'sq-block--starred' : '',
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
      onPointerEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPop({ x: r.left + r.width / 2, y: r.top })
      }}
      onPointerLeave={() => setPop(null)}
      onClick={onSelect}
      onDoubleClick={
        benched && onPromote
          ? (e) => {
              e.stopPropagation()
              onPromote()
            }
          : undefined
      }
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
        <span
          className="key-dot"
          aria-hidden="true"
          style={{
            background: keyDotColor(track?.camelot_code) ?? 'transparent',
          }}
        />
        {track?.camelot_code}
      </span>
      {bpm != null && <span className="sq-block-sub">{Math.round(bpm)}</span>}
      {onToggleStar && (
        <button
          className="sq-star"
          type="button"
          draggable={false}
          aria-label={`${starred ? 'Unstar' : 'Star'} ${track?.title ?? 'track'}`}
          aria-pressed={!!starred}
          title={starred ? 'Remove star' : 'Star track'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onToggleStar()
          }}
        >
          {starred ? '★' : '☆'}
        </button>
      )}
      {onTogglePin && (
        <button
          className="sq-pin"
          type="button"
          draggable={false}
          aria-label={`${locationPinned ? 'Unpin' : 'Pin'} ${track?.title ?? 'track'}`}
          aria-pressed={!!locationPinned}
          title={
            locationPinned
              ? 'Allow auto-arrange'
              : 'Keep fixed during auto-arrange'
          }
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin()
          }}
        >
          <PinIcon size={11} pinned={locationPinned} />
        </button>
      )}
      {pop &&
        track &&
        createPortal(
          <div
            className="sq-block-pop"
            role="tooltip"
            style={{ left: pop.x, top: pop.y }}
          >
            <span className="sq-block-pop-title">{track.title}</span>
            {meta && <span className="sq-block-pop-meta">{meta}</span>}
          </div>,
          document.body,
        )}
      {benched && selected && onPromote && (
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
