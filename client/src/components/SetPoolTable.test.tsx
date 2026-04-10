import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetPoolTable } from './SetPoolTable';
import type { PoolEntry } from '../types';

vi.mock('../api/http', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}));

function makePoolEntry(overrides: Partial<PoolEntry> & { id: number; track_id: number }): PoolEntry {
  return {
    set_id: 1,
    insertion_order: 0,
    track: {
      id: overrides.track_id,
      title: `Pool Track ${overrides.track_id}`,
      artist_names: [],
      bpm: 130,
      key: 'Cminor',
      camelot_code: '5A',
      genre: null,
      label: null,
      energy: null,
    },
    ...overrides,
  };
}

const noop = () => {};

function renderPool(entries: PoolEntry[]) {
  return render(
    <SetPoolTable
      pool={entries}
      onRemove={noop}
      onMoveToTracklist={noop}
      onAddTrack={noop}
    />,
  );
}

describe('SetPoolTable', () => {
  it('renders a semantic HTML table', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    expect(container.querySelector('table.set-pool-table')).toBeTruthy();
    expect(container.querySelector('thead')).toBeTruthy();
    expect(container.querySelector('tbody')).toBeTruthy();
  });

  it('uses shared set-ws-th class on headers', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    const thElements = container.querySelectorAll('th.set-ws-th');
    expect(thElements.length).toBeGreaterThanOrEqual(5);
  });

  it('renders key and BPM in dedicated cells', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    const row = container.querySelector('tbody tr')!;
    expect(row.querySelector('.set-ws-cell-key')?.textContent).toBe('5A');
    expect(row.querySelector('.set-ws-cell-bpm')?.textContent).toBe('130');
  });

  it('uses colgroup for column widths', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    expect(container.querySelector('col.set-ws-col-num')).toBeTruthy();
    expect(container.querySelector('col.set-ws-col-title')).toBeTruthy();
    expect(container.querySelector('col.set-ws-col-key')).toBeTruthy();
    expect(container.querySelector('col.set-ws-col-bpm')).toBeTruthy();
    expect(container.querySelector('col.set-ws-col-actions-pool')).toBeTruthy();
  });

  it('renders actions with shared set-ws-actions-group class', () => {
    const { container } = renderPool([makePoolEntry({ id: 1, track_id: 10 })]);
    expect(container.querySelector('.set-ws-actions-group')).toBeTruthy();
  });

  it('shows empty message when pool is empty', () => {
    renderPool([]);
    expect(screen.getByText(/pool is empty/i)).toBeTruthy();
  });
});
