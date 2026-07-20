import { vi } from 'vitest'
import { defaultTableConfig } from '../tablePreferences'
import type { NormalizedTableConfig } from '../tablePreferences'

export const testSearchConfig: NormalizedTableConfig =
  defaultTableConfig('search')
export const testMatchesConfig: NormalizedTableConfig =
  defaultTableConfig('matches')
export const testTracklistConfig: NormalizedTableConfig =
  defaultTableConfig('tracklist')
export const testPoolConfig: NormalizedTableConfig = defaultTableConfig('pool')

export const noopTableCallbacks = {
  onToggleColumn: vi.fn(),
  onReorderColumn: vi.fn(),
  onInsertColumnAfter: vi.fn(),
  onColumnWidthChange: vi.fn(),
  onColumnWidthFlush: vi.fn(),
}

export const testSetBuilderTableProps = {
  tracklistConfig: testTracklistConfig,
  poolConfig: testPoolConfig,
  onTracklistToggleColumn: noopTableCallbacks.onToggleColumn,
  onTracklistReorderColumn: noopTableCallbacks.onReorderColumn,
  onTracklistInsertColumnAfter: noopTableCallbacks.onInsertColumnAfter,
  onTracklistColumnWidthChange: noopTableCallbacks.onColumnWidthChange,
  onTracklistColumnWidthFlush: noopTableCallbacks.onColumnWidthFlush,
  onPoolToggleColumn: noopTableCallbacks.onToggleColumn,
  onPoolReorderColumn: noopTableCallbacks.onReorderColumn,
  onPoolInsertColumnAfter: noopTableCallbacks.onInsertColumnAfter,
  onPoolColumnWidthChange: noopTableCallbacks.onColumnWidthChange,
  onPoolColumnWidthFlush: noopTableCallbacks.onColumnWidthFlush,
}

export const testMatchesPanelTableProps = {
  tableConfig: testMatchesConfig,
  onClearMatchSource: vi.fn(),
  onToggleColumnVisibility: noopTableCallbacks.onToggleColumn,
  onReorderColumn: noopTableCallbacks.onReorderColumn,
  onInsertColumnAfter: noopTableCallbacks.onInsertColumnAfter,
  onColumnWidthChange: noopTableCallbacks.onColumnWidthChange,
  onColumnWidthFlush: noopTableCallbacks.onColumnWidthFlush,
}

export const testTracklistTableProps = {
  tableConfig: testTracklistConfig,
  ...noopTableCallbacks,
}

export const testPoolTableProps = {
  tableConfig: testPoolConfig,
  ...noopTableCallbacks,
}

/** Header label text without inline ×/+ column-control chrome. */
export function columnHeaderLabel(header: HTMLElement): string {
  return (
    header.querySelector('.table-col-label')?.textContent?.trim() ??
    header.textContent?.replace(/[×+]/g, '').trim() ??
    ''
  )
}
