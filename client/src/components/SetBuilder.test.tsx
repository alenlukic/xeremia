import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetBuilder } from './SetBuilder'
import type { PoolSubgroup, SetSummary, HydratedSet, Track } from '../types'

vi.mock('../api/http', () => ({
  fetchTransitionScores: vi.fn().mockResolvedValue({ scores: [] }),
  exportSetM3u8: vi
    .fn()
    .mockResolvedValue({ content: '#EXTM3U\n', filename: 'test.m3u8' }),
  searchTracks: vi.fn().mockResolvedValue([]),
  explorerEdgeScores: vi.fn().mockResolvedValue({ scores: [] }),
}))

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

function makeHydratedSet(overrides: Partial<HydratedSet> = {}): HydratedSet {
  return {
    set: makeSetSummary(),
    pool: [],
    tracklist: [],
    explorer_nodes: [],
    explorer_edges: [],
    ...overrides,
  }
}

const noop = () => {}
const asyncNoop = async () => null

function defaultProps() {
  return {
    allTracks: [] as Track[],
    activeSet: null as HydratedSet | null,
    loading: false,
    error: null as string | null,
    removeFromPool: noop,
    movePoolToTracklist: noop,
    reorderPool: noop,
    addToPool: noop,
    createSubgroup: asyncNoop as (name: string) => Promise<PoolSubgroup | null>,
    renameSubgroup: async () => true,
    deleteSubgroup: async () => true,
    reorderSubgroups: async () => true,
    addSubgroupMember: async () => true,
    removeSubgroupMember: async () => true,
    removeFromTracklist: noop,
    moveTracklistToPool: noop,
    reorderTracklist: noop,
    updateTracklistNote: noop,
    addToTracklist: noop,
    addExplorerNode: asyncNoop as (
      trackId: number,
      parentNodeId?: string,
      level?: number,
    ) => Promise<unknown>,
    deleteExplorerNode: noop as (
      nodeId: string,
      rewireEdges?: { parent_node_id: string; child_node_id: string }[],
    ) => void,
    addExplorerEdge: asyncNoop as unknown as (
      parentNodeId: string,
      childNodeId: string,
    ) => Promise<void>,
    deleteExplorerEdge: asyncNoop as unknown as (
      edgeId: number,
    ) => Promise<void>,
    swapExplorerNodes: noop,
    explorerNodeAddToTracklist: noop,
    addSiblingNode: asyncNoop as (
      trackId: number,
      inheritParentIds: string[],
      level: number,
    ) => Promise<unknown>,
    fetchEdgeScores: async () => ({ scores: [] as (number | null)[] }),
    clearError: noop,
  }
}

describe('SetBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('empty state', () => {
    it('renders nothing but does not crash when there is no active set', () => {
      render(<SetBuilder {...defaultProps()} />)
      expect(
        screen.queryByRole('button', { name: 'Tracks' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Explorer' }),
      ).not.toBeInTheDocument()
    })
  })

  describe('sub-tab layout', () => {
    it('renders Tracks and Explorer sub-tabs when a set is active', () => {
      render(
        <SetBuilder {...defaultProps()} activeSet={makeHydratedSet()} />,
      )
      expect(screen.getByRole('button', { name: 'Tracks' })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Explorer' }),
      ).toBeInTheDocument()
    })

    it('defaults to Tracks sub-tab showing tracklist section and collapsed pool', () => {
      render(
        <SetBuilder {...defaultProps()} activeSet={makeHydratedSet()} />,
      )
      expect(screen.getByText('Tracklist (0)')).toBeInTheDocument()
      expect(screen.getByLabelText('Expand pool')).toBeInTheDocument()
    })

    it('collapsed expand tab shows a directional chevron', () => {
      render(
        <SetBuilder {...defaultProps()} activeSet={makeHydratedSet()} />,
      )
      const expandBtn = screen.getByLabelText('Expand pool')
      expect(expandBtn).toHaveAttribute('title', 'Expand pool')
      expect(expandBtn.textContent).toContain('›')
    })

    it('expands pool accordion on click', async () => {
      render(
        <SetBuilder {...defaultProps()} activeSet={makeHydratedSet()} />,
      )
      await userEvent.click(screen.getByLabelText('Expand pool'))
      expect(screen.getByText('Pool (0)')).toBeInTheDocument()
      expect(screen.getByLabelText('Collapse pool')).toBeInTheDocument()
    })

    it('collapse handle has title text and visible chevron', async () => {
      render(
        <SetBuilder {...defaultProps()} activeSet={makeHydratedSet()} />,
      )
      await userEvent.click(screen.getByLabelText('Expand pool'))
      const collapseBtn = screen.getByLabelText('Collapse pool')
      expect(collapseBtn).toHaveAttribute('title', 'Collapse pool')
      expect(collapseBtn.textContent).toContain('‹')
    })

    it('switches to Explorer sub-tab', async () => {
      render(
        <SetBuilder {...defaultProps()} activeSet={makeHydratedSet()} />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Explorer' }))
      expect(screen.getByText(/Explorer is empty/)).toBeInTheDocument()
    })
  })

  describe('pool and tracklist move actions', () => {
    it('calls movePoolToTracklist when pool row action is clicked', async () => {
      const movePoolToTracklist = vi.fn()
      const hydrated = makeHydratedSet({
        pool: [
          {
            id: 1,
            set_id: 1,
            track_id: 10,
            insertion_order: 0,
            track: {
              id: 10,
              title: 'Pool Track',
              artist_names: [],
              bpm: 128,
              key: 'C',
              camelot_code: '8B',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
      })
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
          movePoolToTracklist={movePoolToTracklist}
        />,
      )
      await userEvent.click(screen.getByLabelText('Expand pool'))
      await userEvent.click(screen.getByTitle('Move to tracklist'))
      expect(movePoolToTracklist).toHaveBeenCalledWith(10)
    })

    it('calls moveTracklistToPool when tracklist row action is clicked', async () => {
      const moveTracklistToPool = vi.fn()
      const hydrated = makeHydratedSet({
        tracklist: [
          {
            id: 1,
            set_id: 1,
            track_id: 20,
            position: 0,
            track: {
              id: 20,
              title: 'TL Track',
              artist_names: [],
              bpm: 130,
              key: 'D',
              camelot_code: '9B',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
      })
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
          moveTracklistToPool={moveTracklistToPool}
        />,
      )
      await userEvent.click(screen.getByTitle('Move to pool'))
      expect(moveTracklistToPool).toHaveBeenCalledWith(20)
    })
  })


  describe('error display', () => {
    it('shows error as a toast with alert role', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          error="Something went wrong"
        />,
      )
      const toast = screen.getByRole('alert')
      expect(toast).toBeInTheDocument()
      expect(toast).toHaveTextContent('Something went wrong')
    })

    it('calls clearError when toast dismiss is clicked', async () => {
      const clearError = vi.fn()
      render(
        <SetBuilder
          {...defaultProps()}
          error="Oops"
          clearError={clearError}
        />,
      )
      await userEvent.click(screen.getByLabelText('Dismiss'))
      expect(clearError).toHaveBeenCalled()
    })

    it('does not render toast when error is null', () => {
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={makeHydratedSet()}
          error={null}
        />,
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('tracklist column headers', () => {
    it('renders #, Title, Note, Actions headers when tracklist has entries', () => {
      const hydrated = makeHydratedSet({
        tracklist: [
          {
            id: 1,
            set_id: 1,
            track_id: 10,
            position: 0,
            note: '',
            track: {
              id: 10,
              title: 'Test Track',
              artist_names: [],
              bpm: 128,
              key: 'C',
              camelot_code: '8B',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
      })
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
        />,
      )
      expect(screen.getByText('#')).toBeInTheDocument()
      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Note')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })
  })

  describe('tracklist note input', () => {
    it('renders a note input for each tracklist entry', () => {
      const hydrated = makeHydratedSet({
        tracklist: [
          {
            id: 1,
            set_id: 1,
            track_id: 10,
            position: 0,
            note: 'hello',
            track: {
              id: 10,
              title: 'Track A',
              artist_names: [],
              bpm: 128,
              key: 'C',
              camelot_code: '8B',
              genre: null,
              label: null,
              energy: null,
            },
          },
          {
            id: 2,
            set_id: 1,
            track_id: 20,
            position: 1,
            note: '',
            track: {
              id: 20,
              title: 'Track B',
              artist_names: [],
              bpm: 130,
              key: 'D',
              camelot_code: '10A',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
      })
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
        />,
      )
      const noteInputs = screen.getAllByPlaceholderText('Add note…')
      expect(noteInputs).toHaveLength(2)
      expect(noteInputs[0]).toHaveValue('hello')
      expect(noteInputs[1]).toHaveValue('')
    })

    it('updates note input when hydrated data changes for the same track_id', () => {
      const track = {
        id: 10,
        title: 'Track A',
        artist_names: [],
        bpm: 128,
        key: 'C',
        camelot_code: '8B',
        genre: null,
        label: null,
        energy: null,
      }
      const entry = {
        id: 1,
        set_id: 1,
        track_id: 10,
        position: 0,
        note: 'old note',
        track,
      }
      const props = {
        ...defaultProps(),
        sets: [makeSetSummary()],
        activeSetId: 1,
        activeSet: makeHydratedSet({ tracklist: [entry] }),
      }
      const { rerender } = render(<SetBuilder {...props} />)
      expect(screen.getByPlaceholderText('Add note…')).toHaveValue('old note')

      const updatedEntry = { ...entry, note: 'new note' }
      rerender(
        <SetBuilder
          {...props}
          activeSet={makeHydratedSet({ tracklist: [updatedEntry] })}
        />,
      )
      expect(screen.getByPlaceholderText('Add note…')).toHaveValue('new note')
    })

    it('calls updateTracklistNote on note blur with changed value', async () => {
      const updateTracklistNote = vi.fn()
      const hydrated = makeHydratedSet({
        tracklist: [
          {
            id: 1,
            set_id: 1,
            track_id: 10,
            position: 0,
            note: '',
            track: {
              id: 10,
              title: 'Track A',
              artist_names: [],
              bpm: 128,
              key: 'C',
              camelot_code: '8B',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
      })
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
          updateTracklistNote={updateTracklistNote}
        />,
      )
      const noteInput = screen.getByPlaceholderText('Add note…')
      await userEvent.click(noteInput)
      await userEvent.type(noteInput, 'transition here')
      fireEvent.blur(noteInput)
      expect(updateTracklistNote).toHaveBeenCalledWith(10, 'transition here')
      // The typed value must persist after blur. The parent updates `initialNote`
      // only after an async save round-trip, so the input must not revert in the
      // meantime.
      expect(noteInput).toHaveValue('transition here')
    })
  })

  describe('pool row drag to explorer', () => {
    it('pool rows are draggable and set track_id on dragStart', async () => {
      const addExplorerNode = vi.fn().mockResolvedValue(null)
      const hydrated = makeHydratedSet({
        pool: [
          {
            id: 1,
            set_id: 1,
            track_id: 42,
            insertion_order: 0,
            track: {
              id: 42,
              title: 'Drag Me',
              artist_names: [],
              bpm: 128,
              key: 'C',
              camelot_code: '8B',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
        explorer_nodes: [
          {
            id: 1,
            set_id: 1,
            node_id: 'n1',
            track_id: 99,
            level: 0,
            col_index: 0,
            track: {
              id: 99,
              title: 'Root Node',
              artist_names: [],
              bpm: 130,
              key: 'D',
              camelot_code: '10A',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
        explorer_edges: [],
      })
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
          addExplorerNode={addExplorerNode}
        />,
      )

      await userEvent.click(screen.getByLabelText('Expand pool'))

      const row = screen.getByText('Drag Me').closest('tr')!
      expect(row).toHaveAttribute('draggable', 'true')

      const dataTransfer = { setData: vi.fn() }
      fireEvent.dragStart(row, { dataTransfer })
      expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '42')
    })
  })

  describe('tracklist row drag to explorer', () => {
    it('tracklist rows are draggable and set track_id on dragStart', () => {
      const hydrated = makeHydratedSet({
        tracklist: [
          {
            id: 1,
            set_id: 1,
            track_id: 55,
            position: 0,
            track: {
              id: 55,
              title: 'TL Drag',
              artist_names: [],
              bpm: 125,
              key: 'A',
              camelot_code: '11B',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
      })
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
        />,
      )

      const row = screen.getByText('TL Drag').closest('[draggable]')!
      expect(row).toHaveAttribute('draggable', 'true')

      const dataTransfer = { setData: vi.fn() }
      fireEvent.dragStart(row, { dataTransfer })
      expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '55')
    })
  })

  describe('explorer per-level add', () => {
    it('shows per-level +Add Track button on explorer', async () => {
      const hydrated = makeHydratedSet({
        explorer_nodes: [
          {
            id: 1,
            set_id: 1,
            node_id: 'n1',
            track_id: 10,
            level: 0,
            col_index: 0,
            track: {
              id: 10,
              title: 'Root',
              artist_names: [],
              bpm: 128,
              key: 'C',
              camelot_code: '8B',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
        explorer_edges: [],
      })
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Explorer' }))
      const addBtns = screen.getAllByTestId('level-add-btn')
      expect(addBtns.length).toBeGreaterThan(0)
    })
  })

  describe('explorer delete modal per-edge resolution', () => {
    it('shows per-child resolution controls in delete modal', async () => {
      const hydrated = makeHydratedSet({
        explorer_nodes: [
          {
            id: 1,
            set_id: 1,
            node_id: 'parent',
            track_id: 1,
            level: 0,
            col_index: 0,
            track: {
              id: 1,
              title: 'Parent',
              artist_names: [],
              bpm: 128,
              key: 'C',
              camelot_code: '8B',
              genre: null,
              label: null,
              energy: null,
            },
          },
          {
            id: 2,
            set_id: 1,
            node_id: 'mid',
            track_id: 2,
            level: 1,
            col_index: 0,
            track: {
              id: 2,
              title: 'Middle',
              artist_names: [],
              bpm: 130,
              key: 'D',
              camelot_code: '10A',
              genre: null,
              label: null,
              energy: null,
            },
          },
          {
            id: 3,
            set_id: 1,
            node_id: 'child',
            track_id: 3,
            level: 2,
            col_index: 0,
            track: {
              id: 3,
              title: 'Child',
              artist_names: [],
              bpm: 125,
              key: 'A',
              camelot_code: '11B',
              genre: null,
              label: null,
              energy: null,
            },
          },
        ],
        explorer_edges: [
          { id: 1, set_id: 1, parent_node_id: 'parent', child_node_id: 'mid' },
          { id: 2, set_id: 1, parent_node_id: 'mid', child_node_id: 'child' },
        ],
      })
      const deleteExplorerNode = vi.fn()
      render(
        <SetBuilder
          {...defaultProps()}
          activeSet={hydrated}
          deleteExplorerNode={deleteExplorerNode}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Explorer' }))

      const deleteBtns = screen.getAllByLabelText('Delete node')
      await userEvent.click(deleteBtns[1])

      expect(screen.getByText('Delete Node')).toBeInTheDocument()
      const childRows = screen.getAllByTestId('delete-child-row')
      expect(childRows.length).toBeGreaterThan(0)
    })
  })
})
