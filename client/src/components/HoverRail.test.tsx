import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import styles from '../styles.css?raw'
import { HoverRail } from './HoverRail'

function renderRail(orientation: 'horizontal' | 'vertical' = 'horizontal') {
  return render(
    <HoverRail orientation={orientation} className="test-rail">
      <button>Item</button>
    </HoverRail>,
  )
}

describe('HoverRail', () => {
  it('opens and closes when its chevron is clicked', () => {
    const { container } = renderRail()
    const rail = container.querySelector('.hover-rail')!
    const openButton = screen.getByRole('button', {
      name: 'Open horizontal navigation',
    })

    expect(rail.classList.contains('hover-rail--visible')).toBe(false)
    expect(openButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(openButton)

    expect(rail.classList.contains('hover-rail--visible')).toBe(true)
    const closeButton = screen.getByRole('button', {
      name: 'Close horizontal navigation',
    })
    expect(closeButton).toHaveAttribute('aria-expanded', 'true')
    expect(closeButton).toHaveClass('hover-rail-chevron--open')

    fireEvent.click(closeButton)

    expect(rail.classList.contains('hover-rail--visible')).toBe(false)
    expect(openButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not change state in response to pointer hover', () => {
    const { container } = renderRail()
    const rail = container.querySelector('.hover-rail')!
    const chevron = screen.getByRole('button', {
      name: 'Open horizontal navigation',
    })

    fireEvent.mouseEnter(chevron)
    fireEvent.mouseLeave(chevron)
    expect(rail.classList.contains('hover-rail--visible')).toBe(false)

    fireEvent.click(chevron)
    fireEvent.mouseEnter(rail)
    fireEvent.mouseLeave(rail)
    expect(rail.classList.contains('hover-rail--visible')).toBe(true)
  })

  it('renders orientation variants without a separate mouse trigger', () => {
    const { container } = renderRail('vertical')
    expect(
      container.querySelector('.hover-rail-chevron--vertical'),
    ).toBeTruthy()
    expect(container.querySelector('.hover-rail--vertical')).toBeTruthy()
    expect(container.querySelector('.test-rail')).toBeTruthy()
    expect(container.querySelector('.hover-rail-trigger')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Open vertical navigation' }),
    ).toBeInTheDocument()
  })

  it('keeps child navigation actions usable while open', () => {
    const onSelect = vi.fn()
    render(
      <HoverRail orientation="horizontal">
        <button onClick={onSelect}>Item</button>
      </HoverRail>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open horizontal navigation' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Item' }))

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('does not apply opacity styling to rail components', () => {
    const railStyles = styles.slice(
      styles.indexOf('/* === Hover Rail'),
      styles.indexOf('.tab {'),
    )

    expect(railStyles).not.toMatch(/\bopacity\s*:/)
    expect(railStyles).not.toContain('hover-rail--opaque')
  })
})
