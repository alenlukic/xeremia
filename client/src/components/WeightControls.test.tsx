import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WeightControls } from './WeightControls'

const INITIAL_WEIGHTS: Record<string, number> = {
  BPM: 50,
  CAMELOT: 0,
  ENERGY: 100,
}

let setWeight: ReturnType<typeof vi.fn<(factor: string, value: number) => void>>

beforeEach(() => {
  setWeight = vi.fn<(factor: string, value: number) => void>()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})

afterEach(() => {
  vi.useRealTimers()
})

interface RenderOpts {
  weights?: Record<string, number>
  saving?: boolean
  saveSuccess?: boolean
  saveError?: string | null
  warningMessage?: string | null
}

function renderGauges(opts: RenderOpts = {}) {
  const {
    weights = INITIAL_WEIGHTS,
    saving,
    saveSuccess,
    saveError,
    warningMessage,
  } = opts
  return render(
    <WeightControls
      weights={weights}
      setWeight={setWeight}
      saving={saving}
      saveSuccess={saveSuccess}
      saveError={saveError}
      warningMessage={warningMessage}
    />,
  )
}

function getMinusButtons() {
  return screen.getAllByRole('button').filter((b) => b.textContent === '−')
}

function getPlusButtons() {
  return screen.getAllByRole('button').filter((b) => b.textContent === '+')
}

describe('WeightControls +/- widgets', () => {
  it('renders - and + buttons for each gauge', () => {
    renderGauges()
    const factors = Object.keys(INITIAL_WEIGHTS)
    const minusBtns = getMinusButtons()
    const plusBtns = getPlusButtons()
    expect(minusBtns.length).toBe(factors.length)
    expect(plusBtns.length).toBe(factors.length)
  })

  it('clicking + increments by exactly 1', () => {
    renderGauges()
    const plusBtns = getPlusButtons()
    fireEvent.pointerDown(plusBtns[0])
    fireEvent.pointerUp(document)
    expect(setWeight).toHaveBeenCalledWith('BPM', 51)
  })

  it('clicking - decrements by exactly 1', () => {
    renderGauges()
    const minusBtns = getMinusButtons()
    fireEvent.pointerDown(minusBtns[0])
    fireEvent.pointerUp(document)
    expect(setWeight).toHaveBeenCalledWith('BPM', 49)
  })

  it('- click at 0 clamps to 0', () => {
    renderGauges()
    const minusBtns = getMinusButtons()
    // CAMELOT gauge is at 0 — second in the BPM group
    fireEvent.pointerDown(minusBtns[1])
    fireEvent.pointerUp(document)
    expect(setWeight).toHaveBeenCalledWith('CAMELOT', 0)
  })

  it('+ click at 100 clamps to 100', () => {
    renderGauges()
    const plusBtns = getPlusButtons()
    // ENERGY gauge is at 100 — third button (first energy group)
    fireEvent.pointerDown(plusBtns[2])
    fireEvent.pointerUp(document)
    expect(setWeight).toHaveBeenCalledWith('ENERGY', 100)
  })

  it('hold triggers continuous adjustment after delay', () => {
    renderGauges()
    const plusBtns = getPlusButtons()

    fireEvent.pointerDown(plusBtns[0])

    expect(setWeight).toHaveBeenCalledTimes(1)
    expect(setWeight).toHaveBeenLastCalledWith('BPM', 51)

    act(() => {
      vi.advanceTimersByTime(300)
    })

    const callsAfterDelay = setWeight.mock.calls.length

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    fireEvent.pointerUp(document)

    const totalCalls = setWeight.mock.calls.length
    expect(totalCalls).toBeGreaterThan(callsAfterDelay)

    for (const [, val] of setWeight.mock.calls) {
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThanOrEqual(100)
    }
  })
})

describe('Weight save status indicators', () => {
  it('shows "Saving…" while a save is in flight', () => {
    renderGauges({ saving: true })
    expect(screen.getByText('Saving…')).toBeInTheDocument()
  })

  it('shows "Saved" after a successful save', () => {
    renderGauges({ saveSuccess: true })
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('shows error message when save fails', () => {
    renderGauges({ saveError: 'Network error' })
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('shows warning message when weights sum is invalid', () => {
    renderGauges({ warningMessage: 'Weights sum to 110; target is 100' })
    expect(
      screen.getByText('Weights sum to 110; target is 100'),
    ).toBeInTheDocument()
  })

  it('does not render status bar when all statuses are idle', () => {
    renderGauges()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('prioritizes error over warning and saving states', () => {
    renderGauges({
      saving: true,
      saveError: 'Failed to save weights',
      warningMessage: 'Weights sum to 90; target is 100',
    })
    expect(screen.getByText('Failed to save weights')).toBeInTheDocument()
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Weights sum to 90; target is 100'),
    ).not.toBeInTheDocument()
  })

  it('shows "Saving…" alongside warning during invalid-sum save', () => {
    renderGauges({
      saving: true,
      warningMessage: 'Weights sum to 90; target is 100',
    })
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(
      screen.getByText('Weights sum to 90; target is 100'),
    ).toBeInTheDocument()
  })

  it('shows "Saved" alongside warning after successful invalid-sum save', () => {
    renderGauges({
      saveSuccess: true,
      warningMessage: 'Weights sum to 80; target is 100',
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(
      screen.getByText('Weights sum to 80; target is 100'),
    ).toBeInTheDocument()
  })

  it('hides "Saved" while saving is active', () => {
    renderGauges({ saving: true, saveSuccess: true })
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('save lifecycle text renders on a separate line from warning', () => {
    const { container } = renderGauges({
      saving: true,
      warningMessage: 'Weights sum to 90; target is 100',
    })
    const status = container.querySelector('.weight-save-status')
    expect(status).not.toBeNull()
    const saving = status!.querySelector('.weight-save-status__saving')
    const warning = status!.querySelector('.weight-save-status__warning')
    expect(saving).not.toBeNull()
    expect(warning).not.toBeNull()
    expect(saving!.parentElement).toBe(status)
    expect(warning!.parentElement).toBe(status)
    expect(saving!.compareDocumentPosition(warning!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})

describe('WeightControls layout measurement contract', () => {
  it('.gauge-group elements are direct children of .weight-controls-row', () => {
    const { container } = renderGauges()
    const row = container.querySelector('.weight-controls-row')
    expect(row).not.toBeNull()
    const groups = row!.querySelectorAll(':scope > .gauge-group')
    expect(groups.length).toBeGreaterThanOrEqual(1)
  })
})
