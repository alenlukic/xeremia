import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionTabs } from './VersionTabs';
import type { SetTracklistVersion } from '../types';

function makeVersion(id: number, name: string, order: number): SetTracklistVersion {
  return { id, set_id: 1, name, display_order: order, explorer_tree_id: null, slots: [], derived_explorer_nodes: [] };
}

const baseVersions = [
  makeVersion(1, 'Main', 0),
  makeVersion(2, 'Alt', 1),
  makeVersion(3, 'Experiment', 2),
];

const defaultProps = {
  versions: baseVersions,
  activeVersionId: 1,
  onSwitch: vi.fn(),
  onCreate: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VersionTabs rendering', () => {
  it('renders a tab for each version', () => {
    render(<VersionTabs {...defaultProps} />);
    expect(screen.getByTestId('version-tab-1')).toBeInTheDocument();
    expect(screen.getByTestId('version-tab-2')).toBeInTheDocument();
    expect(screen.getByTestId('version-tab-3')).toBeInTheDocument();
  });

  it('marks the active version tab', () => {
    render(<VersionTabs {...defaultProps} />);
    const btn = screen.getByTestId('version-tab-btn-1');
    expect(btn.classList.contains('version-tab--active')).toBe(true);
  });

  it('renders the + add button', () => {
    render(<VersionTabs {...defaultProps} />);
    expect(screen.getByTestId('version-tab-add')).toBeInTheDocument();
  });
});

describe('VersionTabs switch', () => {
  it('clicking a tab calls onSwitch with version id', () => {
    render(<VersionTabs {...defaultProps} />);
    fireEvent.click(screen.getByTestId('version-tab-btn-2'));
    expect(defaultProps.onSwitch).toHaveBeenCalledWith(2);
  });
});

describe('VersionTabs create', () => {
  it('clicking + shows create input, then Enter calls onCreate', () => {
    render(<VersionTabs {...defaultProps} />);
    fireEvent.click(screen.getByTestId('version-tab-add'));
    const input = screen.getByPlaceholderText('Version name…');
    fireEvent.change(input, { target: { value: 'New Version' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onCreate).toHaveBeenCalledWith('New Version');
  });

  it('Escape cancels create', () => {
    render(<VersionTabs {...defaultProps} />);
    fireEvent.click(screen.getByTestId('version-tab-add'));
    const input = screen.getByPlaceholderText('Version name…');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Version name…')).not.toBeInTheDocument();
    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });
});

describe('VersionTabs rename', () => {
  it('double-clicking a tab enters rename mode', () => {
    render(<VersionTabs {...defaultProps} />);
    fireEvent.doubleClick(screen.getByTestId('version-tab-btn-1'));
    const input = document.querySelector('.version-tab-rename-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Main');
  });

  it('rename edit button starts rename', () => {
    render(<VersionTabs {...defaultProps} />);
    fireEvent.click(screen.getByTestId('version-rename-1'));
    const input = document.querySelector('.version-tab-rename-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('Enter commits rename', () => {
    render(<VersionTabs {...defaultProps} />);
    fireEvent.click(screen.getByTestId('version-rename-1'));
    const input = document.querySelector('.version-tab-rename-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onRename).toHaveBeenCalledWith(1, 'Renamed');
  });
});

describe('VersionTabs delete', () => {
  it('delete button calls onDelete', () => {
    render(<VersionTabs {...defaultProps} />);
    fireEvent.click(screen.getByTestId('version-delete-2'));
    expect(defaultProps.onDelete).toHaveBeenCalledWith(2);
  });

  it('last-tab guard: delete button is disabled when only one version', () => {
    render(<VersionTabs {...defaultProps} versions={[makeVersion(1, 'Only', 0)]} />);
    const btn = screen.getByTestId('version-delete-1');
    expect(btn).toBeDisabled();
  });
});
