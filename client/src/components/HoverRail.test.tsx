import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { HoverRail } from './HoverRail'

function renderRail(orientation: 'horizontal' | 'vertical' = 'horizontal') {
  return render(
    <HoverRail orientation={orientation} className="test-rail">
      <button>Item</button>
    </HoverRail>,
  )
}

describe('HoverRail', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens only after the pointer dwells on the trigger for the show delay', () => {
    const { container } = renderRail()
    const rail = container.querySelector('.hover-rail')!
    const trigger = container.querySelector('.hover-rail-trigger')!

    expect(rail.classList.contains('hover-rail--visible')).toBe(false)
    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(rail.classList.contains('hover-rail--visible')).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(rail.classList.contains('hover-rail--visible')).toBe(true)
  })

  it('does not open when the pointer leaves the trigger before the delay', () => {
    const { container } = renderRail()
    const trigger = container.querySelector('.hover-rail-trigger')!

    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.mouseLeave(trigger)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(
      container
        .querySelector('.hover-rail')!
        .classList.contains('hover-rail--visible'),
    ).toBe(false)
  })

  it('hides again after the hide delay unless the rail is hovered', () => {
    const { container } = renderRail()
    const rail = container.querySelector('.hover-rail')!

    fireEvent.mouseEnter(container.querySelector('.hover-rail-trigger')!)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(rail.classList.contains('hover-rail--visible')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(rail.classList.contains('hover-rail--visible')).toBe(false)
  })

  it('stays open while hovered and hides after the pointer leaves the rail', () => {
    const { container } = renderRail()
    const rail = container.querySelector('.hover-rail')!

    fireEvent.mouseEnter(container.querySelector('.hover-rail-trigger')!)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    fireEvent.mouseEnter(rail)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(rail.classList.contains('hover-rail--visible')).toBe(true)

    fireEvent.mouseLeave(rail)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(rail.classList.contains('hover-rail--visible')).toBe(false)
  })

  it('renders orientation variant classes on trigger, chevron, and rail', () => {
    const { container } = renderRail('vertical')
    expect(
      container.querySelector('.hover-rail-trigger--vertical'),
    ).toBeTruthy()
    expect(
      container.querySelector('.hover-rail-chevron--vertical'),
    ).toBeTruthy()
    expect(container.querySelector('.hover-rail--vertical')).toBeTruthy()
    expect(container.querySelector('.test-rail')).toBeTruthy()
  })
})
