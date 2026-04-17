import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar, FilterToggleButton } from './FilterBar';
import type { FilterGroup } from '../hooks/useTrackFilters';

function makeGroup(overrides: Partial<FilterGroup> = {}): FilterGroup {
  return {
    id: 'g1',
    camelotCodes: [],
    bpmMin: undefined,
    bpmMax: undefined,
    artist: '',
    label: '',
    genre: '',
    dateAddedMin: '',
    dateAddedMax: '',
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof FilterBar>[0]> = {}) {
  return {
    expanded: true,
    onToggleExpanded: vi.fn(),
    activeFilterCount: 0,
    filterGroups: [makeGroup()],
    addFilterGroup: vi.fn(),
    removeFilterGroup: vi.fn(),
    updateFilterGroup: vi.fn(),
    onClearFilters: vi.fn(),
    ...overrides,
  };
}

describe('FilterToggleButton', () => {
  it('renders with aria-expanded=false when collapsed', () => {
    render(<FilterToggleButton expanded={false} onToggle={vi.fn()} activeCount={0} />);
    const btn = screen.getByRole('button', { name: /toggle filters/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveTextContent('Filters');
  });

  it('renders with aria-expanded=true when expanded', () => {
    render(<FilterToggleButton expanded={true} onToggle={vi.fn()} activeCount={0} />);
    expect(screen.getByRole('button', { name: /toggle filters/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows active filter count badge when filters are active', () => {
    render(<FilterToggleButton expanded={false} onToggle={vi.fn()} activeCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does not show badge when no filters are active', () => {
    render(<FilterToggleButton expanded={false} onToggle={vi.fn()} activeCount={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<FilterToggleButton expanded={false} onToggle={onToggle} activeCount={0} />);
    await user.click(screen.getByRole('button', { name: /toggle filters/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('FilterBar expansion/collapse', () => {
  it('renders filter tray when expanded=true', () => {
    render(<FilterBar {...makeProps({ expanded: true })} />);
    expect(screen.getByTestId('filter-tray')).toBeInTheDocument();
  });

  it('does not render filter tray when expanded=false', () => {
    render(<FilterBar {...makeProps({ expanded: false })} />);
    expect(screen.queryByTestId('filter-tray')).not.toBeInTheDocument();
  });
});

describe('FilterBar persistent active filters while collapsed', () => {
  it('preserves camelot filter values across collapse cycles', () => {
    const props = makeProps({
      filterGroups: [makeGroup({ camelotCodes: ['01A', '05B'] })],
      expanded: true,
    });
    const { rerender } = render(<FilterBar {...props} />);
    expect(screen.getByText('01A, 05B')).toBeInTheDocument();

    rerender(<FilterBar {...{ ...props, expanded: false }} />);
    expect(screen.queryByTestId('filter-tray')).not.toBeInTheDocument();
    expect(props.updateFilterGroup).not.toHaveBeenCalled();

    rerender(<FilterBar {...{ ...props, expanded: true }} />);
    expect(screen.getByText('01A, 05B')).toBeInTheDocument();
  });

  it('preserves group-owned artist filter values across collapse cycles', () => {
    const props = makeProps({
      filterGroups: [makeGroup({ artist: 'Bonobo' })],
      expanded: true,
    });
    const { rerender } = render(<FilterBar {...props} />);
    const artistInput = screen.getByPlaceholderText('Artist…');
    expect(artistInput).toHaveValue('Bonobo');

    rerender(<FilterBar {...{ ...props, expanded: false }} />);
    expect(screen.queryByTestId('filter-tray')).not.toBeInTheDocument();

    rerender(<FilterBar {...{ ...props, expanded: true }} />);
    expect(screen.getByPlaceholderText('Artist…')).toHaveValue('Bonobo');
  });
});

describe('FilterBar clear-all behavior', () => {
  it('calls onClearFilters when Clear Filters is clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const props = makeProps({
      filterGroups: [makeGroup({ camelotCodes: ['01A'] })],
      onClearFilters: onClear,
    });
    render(<FilterBar {...props} />);
    await user.click(screen.getByText('Clear Filters'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('disables Clear Filters when no filters are active', () => {
    render(<FilterBar {...makeProps()} />);
    expect(screen.getByText('Clear Filters')).toBeDisabled();
  });

  it('enables Clear Filters when a group has active criteria', () => {
    render(<FilterBar {...makeProps({
      filterGroups: [makeGroup({ bpmMin: 120 })],
    })} />);
    expect(screen.getByText('Clear Filters')).not.toBeDisabled();
  });

  it('enables Clear Filters when group artist filter is active', () => {
    render(<FilterBar {...makeProps({
      filterGroups: [makeGroup({ artist: 'Daft Punk' })],
    })} />);
    expect(screen.getByText('Clear Filters')).not.toBeDisabled();
  });

  it('enables Clear Filters when group date range filter is active', () => {
    render(<FilterBar {...makeProps({
      filterGroups: [makeGroup({ dateAddedMin: '2024-01-01' })],
    })} />);
    expect(screen.getByText('Clear Filters')).not.toBeDisabled();
  });

  it('enables Clear Filters when multiple groups exist (even if empty)', () => {
    render(<FilterBar {...makeProps({
      filterGroups: [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })],
    })} />);
    expect(screen.getByText('Clear Filters')).not.toBeDisabled();
  });
});

describe('FilterBar artist filter (group-owned)', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('calls updateFilterGroup with artist after debounce on input change', async () => {
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);

    fireEvent.change(screen.getByPlaceholderText('Artist…'), { target: { value: 'Disclosure' } });
    expect(updateFilterGroup).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { artist: 'Disclosure' });

    vi.useRealTimers();
  });

  it('calls updateFilterGroup with artist immediately on blur', () => {
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);

    const input = screen.getByPlaceholderText('Artist…');
    fireEvent.change(input, { target: { value: 'Caribou' } });
    fireEvent.blur(input);
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { artist: 'Caribou' });

    vi.useRealTimers();
  });
});

describe('FilterBar label filter (group-owned)', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('calls updateFilterGroup with label after debounce', () => {
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);
    fireEvent.change(screen.getByPlaceholderText('Label…'), { target: { value: 'Anjunadeep' } });
    vi.advanceTimersByTime(300);
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { label: 'Anjunadeep' });
    vi.useRealTimers();
  });
});

describe('FilterBar genre filter (group-owned)', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('calls updateFilterGroup with genre after debounce', () => {
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);
    fireEvent.change(screen.getByPlaceholderText('Genre…'), { target: { value: 'Techno' } });
    vi.advanceTimersByTime(300);
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { genre: 'Techno' });
    vi.useRealTimers();
  });
});

describe('FilterBar date-added range filter (group-owned)', () => {
  it('calls updateFilterGroup with dateAddedMin on date input change', () => {
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);
    fireEvent.change(screen.getByLabelText('Date added from'), { target: { value: '2024-06-01' } });
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { dateAddedMin: '2024-06-01' });
  });

  it('calls updateFilterGroup with dateAddedMax on date input change', () => {
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);
    fireEvent.change(screen.getByLabelText('Date added to'), { target: { value: '2024-12-31' } });
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { dateAddedMax: '2024-12-31' });
  });

  it('uses date-picker inputs (type=date)', () => {
    render(<FilterBar {...makeProps()} />);
    const dateFrom = screen.getByLabelText('Date added from');
    const dateTo = screen.getByLabelText('Date added to');
    expect(dateFrom).toHaveAttribute('type', 'date');
    expect(dateTo).toHaveAttribute('type', 'date');
  });
});

describe('FilterBar BPM range', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('calls updateFilterGroup with bpmMin after debounce', () => {
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);
    fireEvent.change(screen.getByPlaceholderText('Min'), { target: { value: '120' } });
    vi.advanceTimersByTime(350);
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { bpmMin: 120 });
    vi.useRealTimers();
  });

  it('calls updateFilterGroup with bpmMax after debounce', () => {
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);
    fireEvent.change(screen.getByPlaceholderText('Max'), { target: { value: '140' } });
    vi.advanceTimersByTime(350);
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { bpmMax: 140 });
    vi.useRealTimers();
  });
});

describe('FilterBar camelot key filter', () => {
  it('renders all-keys text when no codes selected', () => {
    render(<FilterBar {...makeProps()} />);
    expect(screen.getByText('All keys')).toBeInTheDocument();
  });

  it('renders selected codes', () => {
    render(<FilterBar {...makeProps({
      filterGroups: [makeGroup({ camelotCodes: ['08A', '10B'] })],
    })} />);
    expect(screen.getByText('08A, 10B')).toBeInTheDocument();
  });

  it('calls updateFilterGroup when toggling a code', async () => {
    const user = userEvent.setup();
    const updateFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ updateFilterGroup })} />);

    await user.click(screen.getByText('All keys'));
    const grid = screen.getByText('01A').closest('.camelot-grid')!;
    await user.click(within(grid).getByText('01A'));
    expect(updateFilterGroup).toHaveBeenCalledWith('g1', { camelotCodes: ['01A'] });
  });
});

describe('FilterBar OR group UI', () => {
  it('renders + OR Group button', () => {
    render(<FilterBar {...makeProps()} />);
    expect(screen.getByRole('button', { name: /add filter group/i })).toBeInTheDocument();
  });

  it('calls addFilterGroup when + OR Group is clicked', async () => {
    const user = userEvent.setup();
    const addFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({ addFilterGroup })} />);
    await user.click(screen.getByRole('button', { name: /add filter group/i }));
    expect(addFilterGroup).toHaveBeenCalledTimes(1);
  });

  it('renders OR divider between multiple groups', () => {
    render(<FilterBar {...makeProps({
      filterGroups: [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })],
    })} />);
    expect(screen.getByText('OR')).toBeInTheDocument();
  });

  it('renders remove buttons when multiple groups exist', () => {
    render(<FilterBar {...makeProps({
      filterGroups: [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })],
    })} />);
    expect(screen.getAllByRole('button', { name: /remove filter group/i })).toHaveLength(2);
  });

  it('does not render remove button for single group', () => {
    render(<FilterBar {...makeProps()} />);
    expect(screen.queryByRole('button', { name: /remove filter group/i })).not.toBeInTheDocument();
  });

  it('calls removeFilterGroup when remove is clicked', async () => {
    const user = userEvent.setup();
    const removeFilterGroup = vi.fn();
    render(<FilterBar {...makeProps({
      filterGroups: [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })],
      removeFilterGroup,
    })} />);

    const removeBtns = screen.getAllByRole('button', { name: /remove filter group/i });
    await user.click(removeBtns[1]);
    expect(removeFilterGroup).toHaveBeenCalledWith('g2');
  });

  it('each group has its own key selector, BPM, artist, label, genre, and date controls', () => {
    render(<FilterBar {...makeProps({
      filterGroups: [
        makeGroup({ id: 'g1', camelotCodes: ['01A'], artist: 'Alpha' }),
        makeGroup({ id: 'g2', camelotCodes: ['08B'], label: 'Drumcode' }),
      ],
    })} />);

    expect(screen.getByTestId('filter-group-g1')).toBeInTheDocument();
    expect(screen.getByTestId('filter-group-g2')).toBeInTheDocument();
    expect(screen.getByText('01A')).toBeInTheDocument();
    expect(screen.getByText('08B')).toBeInTheDocument();

    const g1 = screen.getByTestId('filter-group-g1');
    const g2 = screen.getByTestId('filter-group-g2');
    expect(within(g1).getByPlaceholderText('Artist…')).toHaveValue('Alpha');
    expect(within(g2).getByPlaceholderText('Label…')).toHaveValue('Drumcode');
  });
});
