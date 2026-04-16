import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar, FilterToggleButton } from './FilterBar';

function makeProps(overrides: Partial<Parameters<typeof FilterBar>[0]> = {}) {
  return {
    expanded: true,
    onToggleExpanded: vi.fn(),
    activeFilterCount: 0,
    camelotCodes: [] as string[],
    bpmMin: undefined as number | undefined,
    bpmMax: undefined as number | undefined,
    artist: '',
    label: '',
    genre: '',
    dateAddedMin: '',
    dateAddedMax: '',
    setCamelotCodes: vi.fn(),
    setBpmMin: vi.fn(),
    setBpmMax: vi.fn(),
    setArtist: vi.fn(),
    setLabel: vi.fn(),
    setGenre: vi.fn(),
    setDateAddedMin: vi.fn(),
    setDateAddedMax: vi.fn(),
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
    const props = makeProps({ camelotCodes: ['01A', '05B'], expanded: true });
    const { rerender } = render(<FilterBar {...props} />);
    expect(screen.getByText('01A, 05B')).toBeInTheDocument();

    rerender(<FilterBar {...{ ...props, expanded: false }} />);
    expect(screen.queryByTestId('filter-tray')).not.toBeInTheDocument();
    expect(props.setCamelotCodes).not.toHaveBeenCalled();

    rerender(<FilterBar {...{ ...props, expanded: true }} />);
    expect(screen.getByText('01A, 05B')).toBeInTheDocument();
  });

  it('preserves text filter values across collapse cycles', () => {
    const props = makeProps({ artist: 'Bonobo', expanded: true });
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
      camelotCodes: ['01A'],
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

  it('enables Clear Filters when any filter is active', () => {
    render(<FilterBar {...makeProps({ bpmMin: 120 })} />);
    expect(screen.getByText('Clear Filters')).not.toBeDisabled();
  });

  it('enables Clear Filters when artist filter is active', () => {
    render(<FilterBar {...makeProps({ artist: 'Daft Punk' })} />);
    expect(screen.getByText('Clear Filters')).not.toBeDisabled();
  });

  it('enables Clear Filters when date range filter is active', () => {
    render(<FilterBar {...makeProps({ dateAddedMin: '2024-01-01' })} />);
    expect(screen.getByText('Clear Filters')).not.toBeDisabled();
  });
});

describe('FilterBar artist filter', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('calls setArtist after debounce on input change', async () => {
    const setArtist = vi.fn();
    render(<FilterBar {...makeProps({ setArtist })} />);

    fireEvent.change(screen.getByPlaceholderText('Artist…'), { target: { value: 'Disclosure' } });
    expect(setArtist).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(setArtist).toHaveBeenCalledWith('Disclosure');

    vi.useRealTimers();
  });

  it('calls setArtist immediately on blur', () => {
    const setArtist = vi.fn();
    render(<FilterBar {...makeProps({ setArtist })} />);

    const input = screen.getByPlaceholderText('Artist…');
    fireEvent.change(input, { target: { value: 'Caribou' } });
    fireEvent.blur(input);
    expect(setArtist).toHaveBeenCalledWith('Caribou');

    vi.useRealTimers();
  });
});

describe('FilterBar label filter', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('calls setLabel after debounce', () => {
    const setLabel = vi.fn();
    render(<FilterBar {...makeProps({ setLabel })} />);
    fireEvent.change(screen.getByPlaceholderText('Label…'), { target: { value: 'Anjunadeep' } });
    vi.advanceTimersByTime(300);
    expect(setLabel).toHaveBeenCalledWith('Anjunadeep');
    vi.useRealTimers();
  });
});

describe('FilterBar genre filter', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('calls setGenre after debounce', () => {
    const setGenre = vi.fn();
    render(<FilterBar {...makeProps({ setGenre })} />);
    fireEvent.change(screen.getByPlaceholderText('Genre…'), { target: { value: 'Techno' } });
    vi.advanceTimersByTime(300);
    expect(setGenre).toHaveBeenCalledWith('Techno');
    vi.useRealTimers();
  });
});

describe('FilterBar date-added range filter', () => {
  it('calls setDateAddedMin on date input change', () => {
    const setDateAddedMin = vi.fn();
    render(<FilterBar {...makeProps({ setDateAddedMin })} />);
    fireEvent.change(screen.getByLabelText('Date added from'), { target: { value: '2024-06-01' } });
    expect(setDateAddedMin).toHaveBeenCalledWith('2024-06-01');
  });

  it('calls setDateAddedMax on date input change', () => {
    const setDateAddedMax = vi.fn();
    render(<FilterBar {...makeProps({ setDateAddedMax })} />);
    fireEvent.change(screen.getByLabelText('Date added to'), { target: { value: '2024-12-31' } });
    expect(setDateAddedMax).toHaveBeenCalledWith('2024-12-31');
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

  it('calls setBpmMin after debounce', () => {
    const setBpmMin = vi.fn();
    render(<FilterBar {...makeProps({ setBpmMin })} />);
    fireEvent.change(screen.getByPlaceholderText('Min'), { target: { value: '120' } });
    vi.advanceTimersByTime(350);
    expect(setBpmMin).toHaveBeenCalledWith(120);
    vi.useRealTimers();
  });

  it('calls setBpmMax after debounce', () => {
    const setBpmMax = vi.fn();
    render(<FilterBar {...makeProps({ setBpmMax })} />);
    fireEvent.change(screen.getByPlaceholderText('Max'), { target: { value: '140' } });
    vi.advanceTimersByTime(350);
    expect(setBpmMax).toHaveBeenCalledWith(140);
    vi.useRealTimers();
  });
});

describe('FilterBar camelot key filter', () => {
  it('renders all-keys text when no codes selected', () => {
    render(<FilterBar {...makeProps()} />);
    expect(screen.getByText('All keys')).toBeInTheDocument();
  });

  it('renders selected codes', () => {
    render(<FilterBar {...makeProps({ camelotCodes: ['08A', '10B'] })} />);
    expect(screen.getByText('08A, 10B')).toBeInTheDocument();
  });

  it('calls setCamelotCodes when toggling a code', async () => {
    const user = userEvent.setup();
    const setCamelotCodes = vi.fn();
    render(<FilterBar {...makeProps({ setCamelotCodes })} />);

    await user.click(screen.getByText('All keys'));
    const grid = screen.getByText('01A').closest('.camelot-grid')!;
    await user.click(within(grid).getByText('01A'));
    expect(setCamelotCodes).toHaveBeenCalledWith(['01A']);
  });
});
