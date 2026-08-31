import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCrates } from './useCrates'

vi.mock('../api/http', () => ({
  fetchCrates: vi.fn(),
  crateCreate: vi.fn(),
  crateRename: vi.fn(),
  crateDelete: vi.fn(),
  crateAddTrack: vi.fn(),
  crateRemoveTrack: vi.fn(),
}))

const crate = { id: 1, name: 'Warmup', display_order: 0 }
const membership = { id: 5, crate_id: 1, track_id: 42 }

describe('useCrates', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const http = await import('../api/http')
    vi.mocked(http.fetchCrates).mockResolvedValue({
      crates: [crate],
      memberships: [membership],
    })
    vi.mocked(http.crateCreate).mockResolvedValue(crate)
    vi.mocked(http.crateRename).mockResolvedValue(crate)
    vi.mocked(http.crateDelete).mockResolvedValue(undefined)
    vi.mocked(http.crateAddTrack).mockResolvedValue(undefined)
    vi.mocked(http.crateRemoveTrack).mockResolvedValue(undefined)
  })

  it('loads crates and memberships on mount', async () => {
    const { result } = renderHook(() => useCrates())

    await waitFor(() => expect(result.current.crates).toEqual([crate]))
    expect(result.current.memberships).toEqual([membership])
    expect(result.current.error).toBeNull()
  })

  it('surfaces a friendly error when the initial load fails', async () => {
    const http = await import('../api/http')
    vi.mocked(http.fetchCrates).mockRejectedValue(new Error('500'))

    const { result } = renderHook(() => useCrates())

    await waitFor(() =>
      expect(result.current.error).toBe('Could not load crates.'),
    )
    expect(result.current.crates).toEqual([])
  })

  it('creates a crate, refreshes, and returns it', async () => {
    const http = await import('../api/http')
    const { result } = renderHook(() => useCrates())
    await waitFor(() => expect(result.current.crates).toEqual([crate]))
    vi.mocked(http.fetchCrates).mockClear()

    let created: unknown
    await act(async () => {
      created = await result.current.createCrate('Warmup')
    })

    expect(http.crateCreate).toHaveBeenCalledWith('Warmup')
    expect(http.fetchCrates).toHaveBeenCalledTimes(1)
    expect(created).toEqual(crate)
  })

  it('returns null and reports the failure when create fails', async () => {
    const http = await import('../api/http')
    vi.mocked(http.crateCreate).mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useCrates())
    await waitFor(() => expect(result.current.crates).toEqual([crate]))

    let created: unknown = crate
    await act(async () => {
      created = await result.current.createCrate('Warmup')
    })

    expect(created).toBeNull()
    expect(result.current.error).toBe('Could not create crate.')
  })

  it('renames, deletes, adds, and removes through the shared mutation path', async () => {
    const http = await import('../api/http')
    const { result } = renderHook(() => useCrates())
    await waitFor(() => expect(result.current.crates).toEqual([crate]))

    await act(async () => {
      await result.current.renameCrate(1, 'After Hours')
      await result.current.deleteCrate(1)
      await result.current.addTrackToCrate(1, 42)
      await result.current.removeTrackFromCrate(1, 42)
    })

    expect(http.crateRename).toHaveBeenCalledWith(1, 'After Hours')
    expect(http.crateDelete).toHaveBeenCalledWith(1)
    expect(http.crateAddTrack).toHaveBeenCalledWith(1, 42)
    expect(http.crateRemoveTrack).toHaveBeenCalledWith(1, 42)
  })

  it('surfaces a friendly error when a crate write fails', async () => {
    const http = await import('../api/http')
    vi.mocked(http.crateAddTrack).mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useCrates())
    await waitFor(() => expect(result.current.crates).toEqual([crate]))

    await act(async () => {
      await result.current.addTrackToCrate(1, 42)
    })

    expect(result.current.error).toBe('Could not add track to crate.')
  })
})
