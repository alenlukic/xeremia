import { describe, expect, it } from 'vitest'
import { fromSettings } from './useSequencerSettings'

describe('sequencer tile stars', () => {
  it('rehydrates committed and lane-scoped stars', () => {
    expect(
      fromSettings({
        starred_tiles: {
          'committed:7': true,
          '12:7': true,
        },
      }).starredTiles,
    ).toEqual({
      'committed:7': true,
      '12:7': true,
    })
  })

  it('rehydrates lane-scoped location pins', () => {
    expect(
      fromSettings({
        pinned_tiles: {
          '12:7': true,
        },
      }).pinnedTiles,
    ).toEqual({
      '12:7': true,
    })
  })
})
