import { describe, expect, it } from 'vitest'
import {
  blockRestWidth,
  laneLabelWidth,
  minuteAtPointer,
  MIN_BLOCK_REST_PX,
  scrollLeftAfterZoom,
  sequencerLayout,
} from './sequencerLayout'

describe('sequencerLayout', () => {
  it('stretches a user-set end marker to fill the viewport at baseline zoom', () => {
    const layout = sequencerLayout({
      contentEndMin: 45,
      startMin: 0,
      endIsSet: true,
      targetEndMin: 60,
      storedPxPerMin: 6,
      viewportWidth: 1000,
      laneLabelPx: 140,
    })

    expect(layout.displayEndMin).toBe(60)
    expect(layout.effectivePxPerMin).toBeCloseTo((1000 - 140 - 16) / 60, 5)
    expect(layout.laneWidthPx).toBeCloseTo(1000 - 16, 5)
  })

  it('extends the ruler when no end is set so the lane fills at stored zoom', () => {
    const layout = sequencerLayout({
      contentEndMin: 12,
      startMin: 0,
      endIsSet: false,
      targetEndMin: 0,
      storedPxPerMin: 6,
      viewportWidth: 1000,
      laneLabelPx: 140,
    })

    expect(layout.displayEndMin).toBeCloseTo((1000 - 140 - 16) / 6, 5)
    expect(layout.effectivePxPerMin).toBe(6)
    expect(layout.laneWidthPx).toBeCloseTo(1000 - 16, 5)
  })

  it('shows a scrollbar once zoom exceeds the fit baseline', () => {
    const fit = sequencerLayout({
      contentEndMin: 60,
      startMin: 0,
      endIsSet: true,
      targetEndMin: 60,
      storedPxPerMin: 6,
      viewportWidth: 1000,
      laneLabelPx: 140,
    })
    const zoomed = sequencerLayout({
      contentEndMin: 60,
      startMin: 0,
      endIsSet: true,
      targetEndMin: 60,
      storedPxPerMin: 20,
      viewportWidth: 1000,
      laneLabelPx: 140,
    })

    expect(zoomed.laneWidthPx).toBeGreaterThan(fit.laneWidthPx)
    expect(zoomed.laneWidthPx).toBeGreaterThan(1000 - 16)
  })

  it('keeps jsdom-sized tests on the stored zoom when no viewport is known', () => {
    const layout = sequencerLayout({
      contentEndMin: 30,
      startMin: 0,
      endIsSet: false,
      targetEndMin: 0,
      storedPxPerMin: 6,
      viewportWidth: 0,
      laneLabelPx: 110,
    })

    expect(layout.effectivePxPerMin).toBe(6)
    expect(layout.displayEndMin).toBe(30)
    expect(layout.laneWidthPx).toBe(110 + 30 * 6)
  })
})

describe('blockRestWidth', () => {
  it('enforces a readable minimum for short tracks', () => {
    expect(blockRestWidth(8)).toBe(MIN_BLOCK_REST_PX)
    expect(blockRestWidth(80)).toBe(80)
  })
})

describe('laneLabelWidth', () => {
  it('grows with the viewport but stays within bounds', () => {
    expect(laneLabelWidth(0, 110)).toBe(110)
    expect(laneLabelWidth(640)).toBeGreaterThanOrEqual(128)
    expect(laneLabelWidth(2000)).toBeLessThanOrEqual(196)
  })
})

describe('scrollLeftAfterZoom', () => {
  it('preserves the minute under the pointer', () => {
    const scrollLeft = 120
    const clientX = 500
    const containerLeft = 100
    const laneLabelPx = 140
    const startMin = 0
    const pxPerMin = 6
    const nextPxPerMin = 10
    const minute = minuteAtPointer({
      scrollLeft,
      clientX,
      containerLeft,
      laneLabelPx,
      startMin,
      pxPerMin,
    })
    const after = scrollLeftAfterZoom({
      clientX,
      containerLeft,
      laneLabelPx,
      startMin,
      minute,
      nextPxPerMin,
    })
    const pointerMinute = minuteAtPointer({
      scrollLeft: after,
      clientX,
      containerLeft,
      laneLabelPx,
      startMin,
      pxPerMin: nextPxPerMin,
    })

    expect(pointerMinute).toBeCloseTo(minute, 5)
  })
})
