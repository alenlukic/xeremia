// Shared layout math for the Sequencer lanes view. Kept pure so wheel zoom,
// fit-to-viewport sizing, and block min widths can be unit-tested without DOM.

export const LANE_LABEL_DEFAULT_PX = 110
export const LANE_LABEL_MIN_PX = 128
export const LANE_LABEL_MAX_PX = 196
export const LANE_LABEL_VIEWPORT_FRACTION = 0.17
export const SQ_LANES_H_PADDING_PX = 16
export const MIN_BLOCK_REST_PX = 44

/** Resting tile width: never narrower than key + BPM readout. */
export function blockRestWidth(durationPx: number): number {
  return Math.max(MIN_BLOCK_REST_PX, durationPx)
}

/** Lane label column width scales with the widget, within sane bounds. */
export function laneLabelWidth(
  viewportWidth: number,
  fallback = LANE_LABEL_DEFAULT_PX,
): number {
  if (viewportWidth <= 0) {
    return fallback
  }
  return Math.round(
    Math.min(
      LANE_LABEL_MAX_PX,
      Math.max(LANE_LABEL_MIN_PX, viewportWidth * LANE_LABEL_VIEWPORT_FRACTION),
    ),
  )
}

export interface SequencerLayoutInput {
  contentEndMin: number
  startMin: number
  endIsSet: boolean
  targetEndMin: number
  storedPxPerMin: number
  viewportWidth: number
  laneLabelPx?: number
  minPxPerMin?: number
  maxPxPerMin?: number
}

export interface SequencerLayout {
  laneLabelPx: number
  displayEndMin: number
  effectivePxPerMin: number
  timelineWidthPx: number
  laneWidthPx: number
}

/**
 * Fit the timeline to the scrollport at baseline zoom, stretch to a user-set
 * end marker via effective px/min, and extend the ruler when no end is chosen.
 */
export function sequencerLayout({
  contentEndMin,
  startMin,
  endIsSet,
  targetEndMin,
  storedPxPerMin,
  viewportWidth,
  laneLabelPx = laneLabelWidth(viewportWidth),
  minPxPerMin = 2,
  maxPxPerMin = 40,
}: SequencerLayoutInput): SequencerLayout {
  const clampedStored = Math.min(
    maxPxPerMin,
    Math.max(minPxPerMin, storedPxPerMin),
  )
  let displayEndMin = contentEndMin
  let effectivePxPerMin = clampedStored

  const timelinePx =
    viewportWidth > 0
      ? Math.max(1, viewportWidth - laneLabelPx - SQ_LANES_H_PADDING_PX)
      : 0

  if (timelinePx > 0) {
    if (endIsSet) {
      const span = Math.max(1, targetEndMin - startMin)
      const fit = timelinePx / span
      effectivePxPerMin = Math.min(
        maxPxPerMin,
        Math.max(clampedStored, fit),
      )
      displayEndMin = Math.max(contentEndMin, targetEndMin)
    } else {
      const minSpan = timelinePx / clampedStored
      displayEndMin = Math.max(contentEndMin, startMin + minSpan)
    }
  }

  const spanMin = Math.max(1, displayEndMin - startMin)
  const timelineWidthPx = spanMin * effectivePxPerMin

  return {
    laneLabelPx,
    displayEndMin,
    effectivePxPerMin,
    timelineWidthPx,
    laneWidthPx: timelineWidthPx + laneLabelPx,
  }
}

/** Keep the same minute under the pointer after a zoom change. */
export function scrollLeftAfterZoom({
  clientX,
  containerLeft,
  laneLabelPx,
  startMin,
  minute,
  nextPxPerMin,
}: {
  clientX: number
  containerLeft: number
  laneLabelPx: number
  startMin: number
  minute: number
  nextPxPerMin: number
}): number {
  const pointerInView = clientX - containerLeft
  const minuteX = laneLabelPx + (minute - startMin) * nextPxPerMin
  return Math.max(0, minuteX - pointerInView)
}

/** Minute under a pointer inside the scrollport. */
export function minuteAtPointer({
  scrollLeft,
  clientX,
  containerLeft,
  laneLabelPx,
  startMin,
  pxPerMin,
}: {
  scrollLeft: number
  clientX: number
  containerLeft: number
  laneLabelPx: number
  startMin: number
  pxPerMin: number
}): number {
  const contentX = scrollLeft + (clientX - containerLeft)
  return startMin + (contentX - laneLabelPx) / pxPerMin
}
