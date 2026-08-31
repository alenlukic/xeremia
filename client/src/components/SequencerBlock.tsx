import { useState } from 'react'
import { createPortal } from 'react-dom'
import { PinIcon, PromoteIcon, StarIcon } from './table/icons'
import { PlayButton } from './PlayButton'
import { formatDuration, formatHM } from '../utils/time'
import { harmonyPaint, keyDotColor } from '../utils/harmonic'
import type { PairResult } from '../utils/harmonic'
import type { Track } from '../types'
import { displayTitle } from '../utils/trackTitle'

// One block on a lane. The tile carries only a key over a BPM; the full track
// details live in a hover popover.

const BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const

/**
 * Fixed footprint of a raised (hovered/selected) tile. Wide enough for the
 * key/BPM readout plus a row of full-size (24px) controls — the tile grows
 * sideways rather than downwards so the lift over neighbouring lanes is
 * unchanged.
 */
const RAISED_WIDTH_PX = 176
const RAISED_HEIGHT_PX = 40
/**
 * Half-width of the hover "hold" zone around the raised tile's centre. The
 * raise exists to read the popover and press the centred preview button, so
 * it only persists while the pointer stays near the centre; straying further
 * collapses it and lets the neighbouring tile underneath take the hover
 * instead of being shadowed by the enlarged footprint.
 */
const RAISE_HOLD_HALF_PX = 24

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
  /** Suppresses the hover raise, e.g. while another tile holds the selection. */
  raiseDisabled?: boolean
  bpm?: number | null
  onSelect: () => void
  onToggleStar?: () => void
  onTogglePin?: () => void
  onPromote?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
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
  raiseDisabled,
  bpm,
  onSelect,
  onToggleStar,
  onTogglePin,
  onPromote,
  onDragStart,
  onDragEnd,
}: Props) {
  // The tile is far too narrow for a title at any useful zoom, so the details
  // live in a popover. It is rendered through a portal because the block clips
  // its own overflow to keep the tile copy tidy, which would otherwise hide it.
  const [pop, setPop] = useState<{ x: number; y: number } | null>(null)
  // Hovering or selecting raises the tile: it lifts slightly above its row
  // and grows to a fixed 100×40 footprint around its own centre, overlapping
  // its neighbours, so a sliver becomes readable without a zoom change.
  // While another tile holds the selection, hover only shows the popover —
  // the raise stays off so the grid keeps still for relation reading.
  const raised = (pop != null && !raiseDisabled) || selected

  const paint = relation && relation.p >= 0 ? harmonyPaint(relation.p) : null
  const baseWidth = Math.max(1, width)
  // Never narrower than the resting tile, or raising a wide block would pull
  // its edges out from under the pointer and flicker.
  const raisedWidth = Math.max(baseWidth, RAISED_WIDTH_PX)
  const style: React.CSSProperties = raised
    ? {
        left: left + baseWidth / 2 - raisedWidth / 2,
        width: raisedWidth,
        height: RAISED_HEIGHT_PX,
      }
    : {
        left,
        // Keep a sliver discoverable without extending into the next span.
        width: baseWidth,
      }
  if (!starred && paint && relation) {
    style.backgroundColor = `hsla(${paint.hue},${paint.sat}%,${paint.light}%,${paint.a})`
    style.borderStyle = BORDER_STYLES[relation.effort]
    style.color = relation.p === 0 ? '#fff4f0' : '#0d1206'
  } else if (!starred && relation) {
    // Selected, but unrelated to the clicked block.
    style.opacity = 0.35
  }
  if (raised) {
    // Fully opaque even when the relation dimming would otherwise apply.
    style.opacity = 1
  }

  const label = track ? displayTitle(track, track.id) : 'Track'
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
        raised ? 'sq-block--raised' : '',
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
      aria-label={label}
      data-fallback={fallback ? 'true' : undefined}
      data-raised={raised ? 'true' : undefined}
      data-base-width={baseWidth}
      title={
        fallback
          ? 'No measured duration; the block uses the 5:00 fallback length.'
          : undefined
      }
      onPointerEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPop({ x: r.left + r.width / 2, y: r.top })
      }}
      onPointerMove={(e) => {
        // Only relevant while this tile's hover raise is showing.
        if (pop == null || selected || raiseDisabled) {
          return
        }
        // Collapse the hover raise once the pointer strays from the tile's
        // own span (plus room for the centred preview button); the pointer
        // then lands on whatever sits underneath, handing the hover to the
        // next tile instead of skipping it.
        const r = e.currentTarget.getBoundingClientRect()
        const centre = r.left + r.width / 2
        const holdHalf = Math.max(baseWidth / 2 + 4, RAISE_HOLD_HALF_PX)
        if (Math.abs(e.clientX - centre) > holdHalf) {
          setPop(null)
        }
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
      onDragEnd={() => {
        // A drag suppresses pointerleave, so drop the hover raise here or the
        // tile stays lifted after the drop.
        setPop(null)
        onDragEnd?.()
      }}
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
      {/* One control row, one visual language: every control is the same
          24px icon button and is told apart by its glyph alone. They appear
          only on a raised tile, which is the only size that can host them at
          a usable target size. */}
      {raised && (
        <span
          className="sq-block-controls"
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {track && (
            <PlayButton
              trackId={track.id}
              title={label}
              className="sq-ctl"
              variant="icon"
            />
          )}
          {/* Present for the whole life of a benched tile, like every other
              control. Revealing it on selection made it appear between two
              icons that were already there, shifting them sideways. */}
          {onPromote && (
            <button
              className="sq-ctl"
              type="button"
              draggable={false}
              aria-label={`Promote ${label}`}
              title="Promote into the committed lane"
              onClick={(e) => {
                e.stopPropagation()
                onPromote()
              }}
            >
              <PromoteIcon size={14} />
            </button>
          )}
          {onToggleStar && (
            <button
              className="sq-ctl"
              type="button"
              draggable={false}
              aria-label={`${starred ? 'Unstar' : 'Star'} ${label}`}
              aria-pressed={!!starred}
              title={starred ? 'Remove star' : 'Star track'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleStar()
              }}
            >
              <StarIcon size={14} filled={!!starred} />
            </button>
          )}
          {onTogglePin && (
            <button
              className="sq-ctl"
              type="button"
              draggable={false}
              aria-label={`${locationPinned ? 'Unpin' : 'Pin'} ${label}`}
              aria-pressed={!!locationPinned}
              title={
                locationPinned
                  ? 'Allow auto-arrange'
                  : 'Keep fixed during auto-arrange'
              }
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin()
              }}
            >
              <PinIcon size={14} pinned={locationPinned} />
            </button>
          )}
        </span>
      )}
      {pop &&
        track &&
        createPortal(
          <div
            className="sq-block-pop"
            role="tooltip"
            style={{ left: pop.x, top: pop.y }}
          >
            <span className="sq-block-pop-title">{displayTitle(track, track.id)}</span>
            {meta && <span className="sq-block-pop-meta">{meta}</span>}
          </div>,
          document.body,
        )}
    </div>
  )
}
