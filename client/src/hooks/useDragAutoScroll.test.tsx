import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useDragAutoScroll } from './useDragAutoScroll'

const VIEWPORT_TOP = 100
const VIEWPORT_HEIGHT = 400

function Harness() {
  const { scrollRef, onDragOver, onDragLeave } =
    useDragAutoScroll<HTMLDivElement>()
  return (
    <div
      data-testid="scroller"
      ref={scrollRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <div data-testid="row" />
    </div>
  )
}

/**
 * jsdom gives every element a zero-size rect and a non-writable scrollTop, so
 * both are stubbed: the rect describes a 400px-tall viewport at y=100, and
 * scrollTop is a plain clamped accessor over a 2000px scroll range.
 */
function setUpScroller(initialScrollTop: number): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-testid="scroller"]')!
  el.getBoundingClientRect = () =>
    ({
      top: VIEWPORT_TOP,
      bottom: VIEWPORT_TOP + VIEWPORT_HEIGHT,
      left: 0,
      right: 300,
      width: 300,
      height: VIEWPORT_HEIGHT,
      x: 0,
      y: VIEWPORT_TOP,
      toJSON: () => ({}),
    }) as DOMRect

  let scrollTop = initialScrollTop
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.min(2000, Math.max(0, v))
    },
  })
  return el
}

/**
 * jsdom has no `DragEvent`, so testing-library's `fireEvent.dragOver` degrades
 * to a bare `Event` and silently drops `clientY`. Dispatch a `MouseEvent` named
 * "dragover" instead — in a real browser `DragEvent` extends `MouseEvent`, so
 * React reads the coordinate the same way.
 */
function dragOverAt(el: HTMLElement, clientY: number) {
  fireEvent(el, new MouseEvent('dragover', { bubbles: true, clientY }))
}

function dragLeaveAt(el: HTMLElement, clientX: number, clientY: number) {
  fireEvent(
    el,
    new MouseEvent('dragleave', { bubbles: true, clientX, clientY }),
  )
}

/** Drive the rAF queue forward by `frames` steps of `stepMs` each. */
function advanceFrames(frames: number, stepMs = 16) {
  for (let i = 0; i < frames; i++) {
    now += stepMs
    const due = pending
    pending = []
    for (const cb of due) {
      cb(now)
    }
  }
}

let now = 0
let pending: FrameRequestCallback[] = []

beforeEach(() => {
  now = 0
  pending = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending.push(cb)
    return pending.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = []
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDragAutoScroll', () => {
  it('scrolls up while a drag hovers the top edge of the viewport', () => {
    render(<Harness />)
    const el = setUpScroller(500)

    // 10px below the container's top — well inside the edge zone.
    dragOverAt(el, VIEWPORT_TOP + 10)
    advanceFrames(5)

    expect(el.scrollTop).toBeLessThan(500)
  })

  it('scrolls down while a drag hovers the bottom edge', () => {
    render(<Harness />)
    const el = setUpScroller(500)

    dragOverAt(el, VIEWPORT_TOP + VIEWPORT_HEIGHT - 10)
    advanceFrames(5)

    expect(el.scrollTop).toBeGreaterThan(500)
  })

  it('accelerates the longer the pointer is held at the edge', () => {
    render(<Harness />)
    const el = setUpScroller(1000)

    dragOverAt(el, VIEWPORT_TOP + 10)
    const start = el.scrollTop
    advanceFrames(5)
    const earlyDistance = start - el.scrollTop

    // Keep the pointer parked at the same spot; the ramp keeps building.
    dragOverAt(el, VIEWPORT_TOP + 10)
    advanceFrames(40)
    dragOverAt(el, VIEWPORT_TOP + 10)
    const before = el.scrollTop
    advanceFrames(5)
    const lateDistance = before - el.scrollTop

    expect(lateDistance).toBeGreaterThan(earlyDistance)
  })

  it('stops once the pointer leaves the edge zone', () => {
    render(<Harness />)
    const el = setUpScroller(500)

    dragOverAt(el, VIEWPORT_TOP + 10)
    advanceFrames(3)
    expect(el.scrollTop).toBeLessThan(500)

    // Back to the middle of the viewport.
    dragOverAt(el, VIEWPORT_TOP + VIEWPORT_HEIGHT / 2)
    const parked = el.scrollTop
    advanceFrames(10)

    expect(el.scrollTop).toBe(parked)
  })

  it('keeps scrolling when a child row reports a dragleave', () => {
    render(<Harness />)
    const el = setUpScroller(500)
    const row = document.querySelector<HTMLElement>('[data-testid="row"]')!

    dragOverAt(el, VIEWPORT_TOP + 10)
    advanceFrames(3)

    // Rows slide out from under a stationary pointer while auto-scroll runs;
    // their bubbled dragleave still points inside the container's box.
    dragLeaveAt(row, 150, VIEWPORT_TOP + 10)
    const parked = el.scrollTop
    advanceFrames(5)

    expect(el.scrollTop).toBeLessThan(parked)
  })

  it('stops when the pointer leaves the container entirely', () => {
    render(<Harness />)
    const el = setUpScroller(500)

    dragOverAt(el, VIEWPORT_TOP + 10)
    advanceFrames(3)
    // Above the container's top edge — a genuine exit.
    dragLeaveAt(el, 150, VIEWPORT_TOP - 20)
    const parked = el.scrollTop
    advanceFrames(10)

    expect(el.scrollTop).toBe(parked)
  })

  it('stops when the drag ends', () => {
    render(<Harness />)
    const el = setUpScroller(500)

    dragOverAt(el, VIEWPORT_TOP + 10)
    advanceFrames(3)
    fireEvent.dragEnd(el)
    const parked = el.scrollTop
    advanceFrames(10)

    expect(el.scrollTop).toBe(parked)
  })

  it('does not scroll past the start of the range', () => {
    render(<Harness />)
    const el = setUpScroller(0)

    dragOverAt(el, VIEWPORT_TOP + 10)
    advanceFrames(10)

    expect(el.scrollTop).toBe(0)
  })
})
