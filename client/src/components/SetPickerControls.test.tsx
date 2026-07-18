import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetPickerControls } from './SetPickerControls'
import type { SetSummary } from '../types'

function makeSetSummary(overrides: Partial<SetSummary> = {}): SetSummary {
  return {
    id: 1,
    name: 'My Set',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    pool_count: 0,
    tracklist_count: 0,
    ...overrides,
  }
}

const noop = () => {}
const asyncNoop = async () => null

function defaultProps() {
  return {
    sets: [] as SetSummary[],
    activeSetId: null as number | null,
    pendingAdd: null,
    createSet: asyncNoop as (name: string) => Promise<SetSummary | null>,
    selectSet: noop,
    deleteSet: noop,
    resolvePendingAdd: noop,
    clearPendingAdd: noop,
  }
}

describe('SetPickerControls', () => {
  describe('no sets yet', () => {
    it('does not render a dropdown when there are no sets', () => {
      render(<SetPickerControls {...defaultProps()} />)
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.getByText('+ New')).toBeInTheDocument()
    })

    it('shows create input when "+ New" is clicked', async () => {
      render(<SetPickerControls {...defaultProps()} />)
      await userEvent.click(screen.getByText('+ New'))
      expect(screen.getByPlaceholderText('Set name…')).toBeInTheDocument()
    })

    it('calls createSet with name on confirm', async () => {
      const createSet = vi.fn().mockResolvedValue(makeSetSummary())
      render(<SetPickerControls {...defaultProps()} createSet={createSet} />)
      await userEvent.click(screen.getByText('+ New'))
      await userEvent.type(
        screen.getByPlaceholderText('Set name…'),
        'Friday Night',
      )
      await userEvent.click(screen.getByText('Create'))
      expect(createSet).toHaveBeenCalledWith('Friday Night')
    })
  })

  describe('pending add prompt', () => {
    it('shows create form when pendingAdd is set with no active set', () => {
      render(
        <SetPickerControls
          {...defaultProps()}
          pendingAdd={{ type: 'pool', trackId: 1, title: 'Test Track' }}
        />,
      )
      expect(screen.getByPlaceholderText('Set name…')).toBeInTheDocument()
      expect(screen.getByText(/Create a set to add/)).toBeInTheDocument()
    })
  })

  describe('set selector', () => {
    it('renders the dropdown with the active set selected', () => {
      const sets = [
        makeSetSummary({ id: 1, name: 'Set A' }),
        makeSetSummary({ id: 2, name: 'Set B' }),
      ]
      render(
        <SetPickerControls {...defaultProps()} sets={sets} activeSetId={1} />,
      )
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('1')
    })

    it('shows the placeholder when no set is active', () => {
      const sets = [makeSetSummary({ id: 1, name: 'Set A' })]
      render(<SetPickerControls {...defaultProps()} sets={sets} />)
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('')
    })

    it('calls selectSet when dropdown changes', async () => {
      const selectSet = vi.fn()
      const sets = [
        makeSetSummary({ id: 1, name: 'Set A' }),
        makeSetSummary({ id: 2, name: 'Set B' }),
      ]
      render(
        <SetPickerControls
          {...defaultProps()}
          sets={sets}
          activeSetId={1}
          selectSet={selectSet}
        />,
      )
      await userEvent.selectOptions(screen.getByRole('combobox'), '2')
      expect(selectSet).toHaveBeenCalledWith(2)
    })
  })

  describe('delete set', () => {
    it('does not render a delete button when no set is active', () => {
      const sets = [makeSetSummary({ id: 1, name: 'Set A' })]
      render(<SetPickerControls {...defaultProps()} sets={sets} />)
      expect(screen.queryByTitle('Delete set')).not.toBeInTheDocument()
    })

    it('calls deleteSet with the active set id when delete button is clicked', async () => {
      const deleteSet = vi.fn()
      const sets = [makeSetSummary({ id: 1, name: 'Set A' })]
      render(
        <SetPickerControls
          {...defaultProps()}
          sets={sets}
          activeSetId={1}
          deleteSet={deleteSet}
        />,
      )
      await userEvent.click(screen.getByTitle('Delete set'))
      expect(deleteSet).toHaveBeenCalledWith(1)
    })
  })
})
