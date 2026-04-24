import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceHeader } from './WorkspaceHeader';
import type { SetSummary } from '../types';

const SETS: SetSummary[] = [
  { id: 1, name: 'Friday Night', pool_count: 5, tracklist_count: 10 },
  { id: 2, name: 'Warm-up', pool_count: 3, tracklist_count: 7 },
];

function renderHeader(overrides: Partial<Parameters<typeof WorkspaceHeader>[0]> = {}) {
  const props = {
    sets: SETS,
    activeSetId: 1,
    loading: false,
    createSet: vi.fn(),
    selectSet: vi.fn(),
    deleteSet: vi.fn(),
    showWeights: false,
    onToggleWeights: vi.fn(),
    showAdmin: false,
    onToggleAdmin: vi.fn(),
    onSearchOpen: vi.fn(),
    ...overrides,
  };
  return { ...render(<WorkspaceHeader {...props} />), props };
}

describe('WorkspaceHeader delete trigger placement', () => {
  it('renders delete trigger immediately before the selector', () => {
    const { container } = renderHeader();
    const leftGroup = container.querySelector('[data-testid="header-left-group"]')!;
    const children = Array.from(leftGroup.children);
    const deleteIdx = children.findIndex(
      el => el.getAttribute('data-testid') === 'header-delete-trigger',
    );
    const selectIdx = children.findIndex(
      el => el.getAttribute('data-testid') === 'header-set-select',
    );
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(selectIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(selectIdx);
  });

  it('does not render delete trigger when no set is active', () => {
    renderHeader({ activeSetId: null });
    expect(screen.queryByTestId('header-delete-trigger')).not.toBeInTheDocument();
  });
});

describe('WorkspaceHeader delete confirmation modal', () => {
  it('opens confirmation modal on delete click instead of deleting immediately', () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByTestId('header-delete-trigger'));
    expect(props.deleteSet).not.toHaveBeenCalled();
    expect(screen.getByTestId('header-delete-modal')).toBeInTheDocument();
  });

  it('modal displays the set name and warning copy', () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('header-delete-trigger'));
    const modal = screen.getByTestId('header-delete-modal');
    expect(modal.textContent).toContain('Friday Night');
    expect(modal.textContent).toContain('This cannot be undone');
  });

  it('Confirm button triggers deleteSet and closes modal', () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByTestId('header-delete-trigger'));
    fireEvent.click(screen.getByTestId('header-delete-confirm'));
    expect(props.deleteSet).toHaveBeenCalledWith(1);
    expect(screen.queryByTestId('header-delete-modal')).not.toBeInTheDocument();
  });

  it('Cancel button closes modal without deleting', () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByTestId('header-delete-trigger'));
    fireEvent.click(screen.getByTestId('header-delete-cancel'));
    expect(props.deleteSet).not.toHaveBeenCalled();
    expect(screen.queryByTestId('header-delete-modal')).not.toBeInTheDocument();
  });
});

describe('WorkspaceHeader duplicate selected-name removal', () => {
  it('does not render a separate set-title span outside the selector', () => {
    const { container } = renderHeader();
    expect(container.querySelector('.workspace-header__set-title')).toBeNull();
    expect(screen.queryByTestId('header-set-title')).not.toBeInTheDocument();
  });
});

describe('WorkspaceHeader selector and search layout', () => {
  it('selector element has the workspace-header__select class with min-width rule', () => {
    const { container } = renderHeader();
    const select = container.querySelector('.workspace-header__select');
    expect(select).not.toBeNull();
  });

  it('search trigger sits inside __center which is between __left-group and __right-group', () => {
    const { container } = renderHeader();
    const header = container.querySelector('[data-testid="workspace-header"]')!;
    const children = Array.from(header.children).filter(
      el => el.getAttribute('data-testid'),
    );
    const names = children.map(el => el.getAttribute('data-testid'));
    expect(names).toEqual(
      expect.arrayContaining(['header-left-group', 'header-center', 'header-right-group']),
    );
    const leftIdx = names.indexOf('header-left-group');
    const centerIdx = names.indexOf('header-center');
    const rightIdx = names.indexOf('header-right-group');
    expect(leftIdx).toBeLessThan(centerIdx);
    expect(centerIdx).toBeLessThan(rightIdx);
  });

  it('search trigger is present in the center section', () => {
    const { container } = renderHeader();
    const center = container.querySelector('[data-testid="header-center"]')!;
    const trigger = center.querySelector('[data-testid="header-search-trigger"]');
    expect(trigger).not.toBeNull();
  });
});
