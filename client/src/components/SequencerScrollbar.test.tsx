import { describe, expect, it } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import { SequencerScrollbar } from './SequencerScrollbar'

// jsdom does not lay out, so the scrollport is a real div with its metrics
// stubbed. That is enough: the component only ever reads the three numbers.
function harness(view: number, total: number) {
  function Host() {
    const ref = useRef<HTMLDivElement | null>(null)
    return (
      <div
        ref={(el) => {
          if (el) {
            Object.defineProperty(el, 'clientWidth', {
              value: view,
              configurable: true,
            })
            Object.defineProperty(el, 'scrollWidth', {
              value: total,
              configurable: true,
            })
          }
          ref.current = el
        }}
      >
        <SequencerScrollbar scrollRef={ref} endOffset={total} />
      </div>
    )
  }
  return render(<Host />)
}

describe('SequencerScrollbar', () => {
  it('draws a centred track spanning ~60% of the visible width', () => {
    const { container } = harness(1000, 4000)

    const bar = container.querySelector('.sq-scrollbar') as HTMLElement
    expect(bar).toBeTruthy()
    // Matches the scrollport, so the track can centre against the view.
    expect(bar.style.width).toBe('1000px')

    const track = container.querySelector('.sq-scrollbar-track') as HTMLElement
    expect(track.style.width).toBe('600px')
    // A quarter of the run is visible, so the thumb is a quarter of the track.
    const thumb = container.querySelector('.sq-scrollbar-thumb') as HTMLElement
    expect(thumb.style.width).toBe('150px')
  })

  it('stays out of the way when nothing overflows', () => {
    const { container } = harness(1000, 1000)

    expect(container.querySelector('.sq-scrollbar')).toBeNull()
  })

  it('scrolls the timeline when the thumb is dragged', () => {
    const { container } = harness(1000, 4000)
    const port = container.firstElementChild as HTMLElement
    const thumb = container.querySelector('.sq-scrollbar-thumb') as HTMLElement

    fireEvent.pointerDown(thumb, { button: 0, clientX: 0 })
    act(() => {
      window.dispatchEvent(
        new window.PointerEvent('pointermove', { clientX: 45 }),
      )
    })

    // 45px along 450px of travel is a tenth of the 3000px scrollable run.
    expect(port.scrollLeft).toBe(300)
  })
})
