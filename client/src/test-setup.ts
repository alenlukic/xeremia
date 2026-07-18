import '@testing-library/jest-dom/vitest'

// jsdom reports offsetWidth/offsetHeight as 0, which makes @tanstack/react-virtual
// mount zero rows. Give the virtualized browse-table scroll container a tall
// viewport so every row renders in tests, matching pre-virtualization behavior.
// Scoped by class name so coordinate math elsewhere is unaffected.
const VIRTUAL_VIEWPORT = { width: 1024, height: 100_000 }

const origOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetHeight',
)
const origOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetWidth',
)

Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement): number {
    if (this.classList.contains('track-table-wrapper')) {
      return VIRTUAL_VIEWPORT.height
    }
    return (origOffsetHeight?.get?.call(this) as number) ?? 0
  },
})

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get(this: HTMLElement): number {
    if (this.classList.contains('track-table-wrapper')) {
      return VIRTUAL_VIEWPORT.width
    }
    return (origOffsetWidth?.get?.call(this) as number) ?? 0
  },
})
