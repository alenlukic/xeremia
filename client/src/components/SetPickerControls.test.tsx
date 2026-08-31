import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    renameSet: noop,
    deleteSet: noop,
    resolvePendingAdd: noop,
    clearPendingAdd: noop,
  }
}

/** Open the set dropdown and return its trigger. */
async function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Set' })
  await userEvent.click(trigger)
  return trigger
}

describe('SetPickerControls', () => {
  describe('no sets yet', () => {
    it('shows the placeholder and an empty menu', async () => {
      render(<SetPickerControls {...defaultProps()} />)
      expect(screen.getByText('Select a set…')).toBeInTheDocument()
      await openMenu()
      expect(screen.getByText('No sets yet')).toBeInTheDocument()
    })

    it('shows the create input from the menu footer', async () => {
      render(<SetPickerControls {...defaultProps()} />)
      await openMenu()
      await userEvent.click(screen.getByText('New set…'))
      expect(screen.getByPlaceholderText('Set name…')).toBeInTheDocument()
    })

    it('calls createSet with name on confirm', async () => {
      const createSet = vi.fn().mockResolvedValue(makeSetSummary())
      render(<SetPickerControls {...defaultProps()} createSet={createSet} />)
      await openMenu()
      await userEvent.click(screen.getByText('New set…'))
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
    it('shows the active set name on the trigger', () => {
      const sets = [
        makeSetSummary({ id: 1, name: 'Set A' }),
        makeSetSummary({ id: 2, name: 'Set B' }),
      ]
      render(
        <SetPickerControls {...defaultProps()} sets={sets} activeSetId={1} />,
      )
      expect(screen.getByRole('button', { name: 'Set' })).toHaveTextContent(
        'Set A',
      )
    })

    it('shows the placeholder when no set is active', () => {
      const sets = [makeSetSummary({ id: 1, name: 'Set A' })]
      render(<SetPickerControls {...defaultProps()} sets={sets} />)
      expect(screen.getByText('Select a set…')).toBeInTheDocument()
    })

    it('lists sets with their pool and tracklist counts', async () => {
      const sets = [
        makeSetSummary({ id: 1, name: 'Set A', pool_count: 21, tracklist_count: 3 }),
      ]
      render(<SetPickerControls {...defaultProps()} sets={sets} />)
      await openMenu()
      expect(screen.getByText('Set A (P:21 T:3)')).toBeInTheDocument()
    })

    it('calls selectSet when an item is chosen', async () => {
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
      await openMenu()
      await userEvent.click(screen.getByText('Set B (P:0 T:0)'))
      // Renameable rows hold the commit for the double-click window.
      await waitFor(() => expect(selectSet).toHaveBeenCalledWith(2))
    })
  })

  describe('rename and delete', () => {
    it('renames a set from the right-click menu', async () => {
      const renameSet = vi.fn()
      const sets = [makeSetSummary({ id: 1, name: 'Set A' })]
      render(
        <SetPickerControls
          {...defaultProps()}
          sets={sets}
          renameSet={renameSet}
        />,
      )
      await openMenu()
      await userEvent.pointer({
        target: screen.getByText('Set A (P:0 T:0)'),
        keys: '[MouseRight]',
      })
      await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

      // The draft is seeded with the bare name, not the decorated row label.
      const input = screen.getByLabelText('Rename Set A (P:0 T:0)')
      expect(input).toHaveValue('Set A')
      await userEvent.clear(input)
      await userEvent.type(input, 'Set Z')
      await userEvent.click(screen.getByText('Save'))
      expect(renameSet).toHaveBeenCalledWith(1, 'Set Z')
    })

    it('renames a set on double click', async () => {
      const renameSet = vi.fn()
      const sets = [makeSetSummary({ id: 1, name: 'Set A' })]
      render(
        <SetPickerControls
          {...defaultProps()}
          sets={sets}
          renameSet={renameSet}
        />,
      )
      await openMenu()
      await userEvent.dblClick(screen.getByText('Set A (P:0 T:0)'))
      expect(screen.getByLabelText('Rename Set A (P:0 T:0)')).toHaveValue(
        'Set A',
      )
    })

    it('deletes a set only after the confirm step', async () => {
      const deleteSet = vi.fn()
      const sets = [makeSetSummary({ id: 1, name: 'Set A' })]
      render(
        <SetPickerControls
          {...defaultProps()}
          sets={sets}
          deleteSet={deleteSet}
        />,
      )
      await openMenu()
      await userEvent.pointer({
        target: screen.getByText('Set A (P:0 T:0)'),
        keys: '[MouseRight]',
      })
      await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
      expect(deleteSet).not.toHaveBeenCalled()

      await userEvent.click(
        screen.getByRole('menuitem', { name: 'Confirm delete' }),
      )
      expect(deleteSet).toHaveBeenCalledWith(1)
    })

    it('rejects a rename that collides with another set', async () => {
      const renameSet = vi.fn()
      const sets = [
        makeSetSummary({ id: 1, name: 'Set A' }),
        makeSetSummary({ id: 2, name: 'Set B' }),
      ]
      render(
        <SetPickerControls
          {...defaultProps()}
          sets={sets}
          renameSet={renameSet}
        />,
      )
      await openMenu()
      await userEvent.dblClick(screen.getByText('Set A (P:0 T:0)'))
      const input = screen.getByLabelText('Rename Set A (P:0 T:0)')
      await userEvent.clear(input)
      await userEvent.type(input, 'Set B')

      expect(screen.getByText('Name already exists')).toBeInTheDocument()
      expect(screen.getByText('Save')).toBeDisabled()
    })
  })
})
