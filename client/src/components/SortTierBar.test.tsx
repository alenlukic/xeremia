import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortTierBar } from './SortTierBar';
import type { SortDescriptor, SortColumn } from './SortTierBar';

const COLUMNS: SortColumn[] = [
  { id: 'title', label: 'Title' },
  { id: 'bpm', label: 'BPM' },
  { id: 'key', label: 'Key' },
];

function renderBar(sorting: SortDescriptor[], onChange = vi.fn()) {
  return { ...render(
    <SortTierBar sorting={sorting} columns={COLUMNS} onSortingChange={onChange} />,
  ), onChange };
}

describe('SortTierBar', () => {
  it('renders +Sort button when no tiers are active', () => {
    renderBar([]);
    expect(screen.getByRole('button', { name: /add sort tier/i })).toBeTruthy();
  });

  it('shows dropdown menu on +Sort click with available columns', () => {
    const { container } = renderBar([]);
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    const items = container.querySelectorAll('.sort-tier-menu-item');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('Title');
    expect(items[1].textContent).toBe('BPM');
    expect(items[2].textContent).toBe('Key');
  });

  it('calls onSortingChange with new tier when menu item is clicked', () => {
    const onChange = vi.fn();
    renderBar([], onChange);
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    fireEvent.mouseDown(screen.getByText('BPM'));
    expect(onChange).toHaveBeenCalledWith([{ id: 'bpm', desc: false }]);
  });

  it('renders pills for active sort tiers', () => {
    const { container } = renderBar([
      { id: 'title', desc: false },
      { id: 'bpm', desc: true },
    ]);
    const pills = container.querySelectorAll('.sort-tier-pill');
    expect(pills.length).toBe(2);
    expect(pills[0].querySelector('.sort-tier-label')?.textContent).toBe('Title');
    expect(pills[1].querySelector('.sort-tier-label')?.textContent).toBe('BPM');
  });

  it('excludes already-used columns from the +Sort menu', () => {
    const { container } = renderBar([{ id: 'title', desc: false }]);
    fireEvent.click(screen.getByRole('button', { name: /add sort tier/i }));
    const items = container.querySelectorAll('.sort-tier-menu-item');
    expect(items.length).toBe(2);
    const texts = Array.from(items).map(i => i.textContent);
    expect(texts).not.toContain('Title');
    expect(texts).toContain('BPM');
    expect(texts).toContain('Key');
  });

  it('hides +Sort button when all columns are used', () => {
    renderBar([
      { id: 'title', desc: false },
      { id: 'bpm', desc: false },
      { id: 'key', desc: false },
    ]);
    expect(screen.queryByRole('button', { name: /add sort tier/i })).toBeNull();
  });

  it('toggles direction on dir button click', () => {
    const onChange = vi.fn();
    renderBar([{ id: 'title', desc: false }], onChange);
    fireEvent.click(screen.getByRole('button', { name: /toggle title direction/i }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'title', desc: true }]);
  });

  it('removes a tier on × click', () => {
    const onChange = vi.fn();
    renderBar([
      { id: 'title', desc: false },
      { id: 'bpm', desc: true },
    ], onChange);
    fireEvent.click(screen.getByRole('button', { name: /remove title sort/i }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'bpm', desc: true }]);
  });

  it('reorders tiers via move-up button', () => {
    const onChange = vi.fn();
    renderBar([
      { id: 'title', desc: false },
      { id: 'bpm', desc: true },
    ], onChange);
    fireEvent.click(screen.getByRole('button', { name: /move bpm sort up/i }));
    expect(onChange).toHaveBeenCalledWith([
      { id: 'bpm', desc: true },
      { id: 'title', desc: false },
    ]);
  });

  it('reorders tiers via move-down button', () => {
    const onChange = vi.fn();
    renderBar([
      { id: 'title', desc: false },
      { id: 'bpm', desc: true },
    ], onChange);
    fireEvent.click(screen.getByRole('button', { name: /move title sort down/i }));
    expect(onChange).toHaveBeenCalledWith([
      { id: 'bpm', desc: true },
      { id: 'title', desc: false },
    ]);
  });

  it('does not show move-up on first tier or move-down on last tier', () => {
    renderBar([
      { id: 'title', desc: false },
      { id: 'bpm', desc: true },
    ]);
    expect(screen.queryByRole('button', { name: /move title sort up/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /move bpm sort down/i })).toBeNull();
  });
});
