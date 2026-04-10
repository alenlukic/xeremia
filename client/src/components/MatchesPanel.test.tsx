import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchesPanel } from './MatchesPanel';
import type { TransitionMatch } from '../types';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  localStorage.removeItem('dj-tools-matches-column-config');
});

function makeMatch(overrides: Partial<TransitionMatch> = {}): TransitionMatch {
  return {
    candidate_id: 1,
    title: 'Test Track',
    overall_score: 85,
    bucket: 'same_key',
    camelot_score: 0.9,
    bpm_score: 0.85,
    energy_score: 0.7,
    similarity_score: 0.8,
    freshness_score: 0.6,
    genre_similarity_score: 0.75,
    mood_continuity_score: 0.65,
    vocal_clash_score: 0.5,
    instrument_similarity_score: 0.55,
    ...overrides,
  };
}

const SCORE_HEADERS = [
  'SCORE', 'Spectral', 'Key', 'BPM', 'Genre', 'Recency',
  'Energy (MIK)', 'Mood', 'Instruments', 'Vocals',
];

const ALL_HEADERS = ['', 'Track', ...SCORE_HEADERS, 'DETAILS'];

const selectedTrack = {
  id: 1, title: 'On Deck', artist_names: ['A'],
  bpm: 128, key: 'C', camelot_code: '8B',
};

describe('MatchesPanel', () => {
  describe('column headers', () => {
    it('renders all column headers regardless of onAddToSet', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      expect(headers.map(h => h.textContent)).toEqual(ALL_HEADERS);
    });

    it('renders same column headers when onAddToSet is provided', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      expect(headers.map(h => h.textContent)).toEqual(ALL_HEADERS);
    });

    it('includes Track, SCORE, and score sub-columns', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const labels = screen.getAllByRole('columnheader').map(h => h.textContent);
      expect(labels).toContain('Track');
      expect(labels).toContain('SCORE');
      expect(labels).toContain('DETAILS');
    });
  });

  describe('default column sizing', () => {
    it('score columns render at expected defaults (70px SCORE, 60px for most, 73px for energy/instruments)', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      const widths = headers.map(h => (h as HTMLElement).style.width);
      expect(widths[0]).toBe('74px');   // add_to_set
      expect(widths[2]).toBe('70px');   // SCORE
      expect(widths[3]).toBe('60px');   // Spectral
      expect(widths[4]).toBe('60px');   // Key
      expect(widths[5]).toBe('60px');   // BPM
      expect(widths[6]).toBe('60px');   // Genre
      expect(widths[7]).toBe('60px');   // Recency
      expect(widths[8]).toBe('73px');   // Energy (MIK)
      expect(widths[9]).toBe('60px');   // Mood
      expect(widths[10]).toBe('73px');  // Instruments
      expect(widths[11]).toBe('60px');  // Vocals
    });

    it('track column renders at 484px', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      expect((headers[1] as HTMLElement).style.width).toBe('484px');
    });

    it('add_to_set column is 50px and details column is 70px', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      expect((headers[0] as HTMLElement).style.width).toBe('74px');   // add_to_set
      expect((headers[1] as HTMLElement).style.width).toBe('484px');  // Track
      expect((headers[8] as HTMLElement).style.width).toBe('73px');   // Energy (MIK)
      expect((headers[10] as HTMLElement).style.width).toBe('73px');  // Instruments
      expect((headers[12] as HTMLElement).style.width).toBe('70px');  // DETAILS
    });
  });

  describe('resize and reorder chrome', () => {
    it('renders a resize handle on Track and score headers', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
        />
      );
      const resizers = document.querySelectorAll('.col-resizer');
      expect(resizers.length).toBe(SCORE_HEADERS.length + 3); // add_to_set + Track + score columns + details

      const headers = document.querySelectorAll('.matches-table thead th');
      const trackTh = headers[1];
      expect(trackTh.querySelector('.col-resizer')).toBeTruthy();
    });

    it('renders draggable header content on all headers', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const draggables = document.querySelectorAll('.th-content[draggable="true"]');
      expect(draggables.length).toBe(ALL_HEADERS.length);
    });
  });

  describe('score formatting', () => {
    it('displays factor scores on 0-100 integer scale', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ overall_score: 85, similarity_score: 0.8 })]}
          loading={false}
        />
      );
      const cells = document.querySelectorAll('.matches-table tbody td .mono');
      const values = Array.from(cells).map(c => c.textContent);
      expect(values[0]).toBe('85');  // overall_score (already 0-100)
      expect(values[1]).toBe('80');  // similarity_score (0.8 * 100)
    });
  });

  describe('bucket tabs', () => {
    it('shows correct bucket counts', () => {
      const matches = [
        makeMatch({ candidate_id: 1, bucket: 'same_key' }),
        makeMatch({ candidate_id: 2, bucket: 'same_key' }),
        makeMatch({ candidate_id: 3, bucket: 'higher_key' }),
      ];
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={matches}
          loading={false}
        />
      );
      const counts = document.querySelectorAll('.bucket-count');
      expect(counts[0].textContent).toBe('2');
      expect(counts[1].textContent).toBe('1');
      expect(counts[2].textContent).toBe('0');
    });

    it('filters matches by active bucket', async () => {
      const matches = [
        makeMatch({ candidate_id: 1, bucket: 'same_key' }),
        makeMatch({ candidate_id: 2, bucket: 'higher_key' }),
        makeMatch({ candidate_id: 3, bucket: 'higher_key' }),
      ];
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={matches}
          loading={false}
        />
      );
      expect(document.querySelectorAll('.matches-table tbody tr').length).toBe(1);

      await userEvent.click(screen.getByRole('button', { name: /Higher/ }));
      expect(document.querySelectorAll('.matches-table tbody tr').length).toBe(2);
    });
  });

  describe('loading and empty states', () => {
    it('shows loading message when loading with no data', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[]}
          loading={true}
        />
      );
      expect(screen.getByText('Loading matches…')).toBeInTheDocument();
    });

    it('shows empty message when no matches in bucket', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[]}
          loading={false}
        />
      );
      expect(screen.getByText('No matches in this bucket')).toBeInTheDocument();
    });

    it('shows placeholder when no track selected', () => {
      render(
        <MatchesPanel
          selectedTrack={null}
          matches={[]}
          loading={false}
        />
      );
      expect(screen.getByText('Select a track to see matches')).toBeInTheDocument();
    });

    it('dims rows during background reload', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={true}
        />
      );
      const row = document.querySelector('.matches-table tbody tr') as HTMLElement;
      expect(row.style.opacity).toBe('0.6');
    });
  });

  describe('match detail affordance', () => {
    it('renders a visible clickable track title for each match row', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ title: 'Deep Blue' }), makeMatch({ candidate_id: 2, title: 'Red Sky' })]}
          loading={false}
        />
      );
      const links = document.querySelectorAll('.match-track-link');
      expect(links.length).toBe(2);
      expect(links[0].textContent).toBe('Deep Blue');
      expect(links[1].textContent).toBe('Red Sky');
    });

    it('calls onViewDetail when detail icon button is clicked', async () => {
      const onViewDetail = vi.fn();
      const match = makeMatch({ title: 'Deep Blue' });
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[match]}
          loading={false}
          onViewDetail={onViewDetail}
        />
      );
      const detailBtns = document.querySelectorAll('.match-detail-btn');
      expect(detailBtns.length).toBe(1);
      await userEvent.click(detailBtns[0]);
      expect(onViewDetail).toHaveBeenCalledWith(match);
    });

    it('has hover title and focus-accessible aria-label on each track link', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ title: 'Deep Blue' })]}
          loading={false}
        />
      );
      const btns = document.querySelectorAll('.match-detail-btn');
      expect(btns.length).toBe(1);
      expect(btns[0].getAttribute('aria-label')).toBe('View match detail for Deep Blue');
    });

    it('track title click calls onUseAsSource, not onViewDetail', async () => {
      const onViewDetail = vi.fn();
      const onUseAsSource = vi.fn();
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ candidate_id: 7, title: 'Deep Blue' })]}
          loading={false}
          onViewDetail={onViewDetail}
          onUseAsSource={onUseAsSource}
        />
      );
      await userEvent.click(screen.getByText('Deep Blue'));
      expect(onUseAsSource).toHaveBeenCalledWith(7);
      expect(onViewDetail).not.toHaveBeenCalled();
    });
  });

  describe('use as source action', () => {
    it('track title acts as use-as-source trigger for each row', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch(), makeMatch({ candidate_id: 2 })]}
          loading={false}
        />
      );
      const links = screen.getAllByTitle('Use as source track');
      expect(links.length).toBe(2);
    });

    it('calls onUseAsSource with candidate_id when track title clicked', async () => {
      const onUseAsSource = vi.fn();
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ candidate_id: 42 })]}
          loading={false}
          onUseAsSource={onUseAsSource}
        />
      );
      await userEvent.click(screen.getByTitle('Use as source track'));
      expect(onUseAsSource).toHaveBeenCalledWith(42);
    });

    it('does not render a Use as source button in the actions column', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
        />
      );
      const actionsCells = document.querySelectorAll('.match-actions-cell');
      expect(actionsCells.length).toBe(1);
      expect(actionsCells[0].textContent).not.toContain('Use as source');
    });
  });

  describe('add to set action', () => {
    it('renders Add to Set button when onAddToSet is provided', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
        />
      );
      expect(screen.getByTitle('Add to set')).toBeInTheDocument();
    });

    it('does not render Add to set button when onAddToSet is not provided', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      expect(screen.queryByTitle('Add to set')).not.toBeInTheDocument();
      expect(document.querySelectorAll('.match-action-btn').length).toBe(0);
    });

    it('calls onAddToSet with candidate_id when clicked', async () => {
      const onAddToSet = vi.fn();
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ candidate_id: 99 })]}
          loading={false}
          onAddToSet={onAddToSet}
        />
      );
      await userEvent.click(screen.getByTitle('Add to set'));
      expect(onAddToSet).toHaveBeenCalledWith(99);
    });
  });

  describe('dual add-to-pool/tracklist actions', () => {
    it('renders dual buttons when onAddToPool and onAddToTracklist are provided', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToPool={vi.fn()}
          onAddToTracklist={vi.fn()}
        />
      );
      expect(screen.getByTitle('Add to Pool')).toBeInTheDocument();
      expect(screen.getByTitle('Add to Tracklist')).toBeInTheDocument();
    });

    it('calls onAddToPool with candidate_id when clicked', async () => {
      const onAddToPool = vi.fn();
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ candidate_id: 42 })]}
          loading={false}
          onAddToPool={onAddToPool}
          onAddToTracklist={vi.fn()}
        />
      );
      await userEvent.click(screen.getByTitle('Add to Pool'));
      expect(onAddToPool).toHaveBeenCalledWith(42);
    });

    it('calls onAddToTracklist with candidate_id when clicked', async () => {
      const onAddToTracklist = vi.fn();
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ candidate_id: 42 })]}
          loading={false}
          onAddToPool={vi.fn()}
          onAddToTracklist={onAddToTracklist}
        />
      );
      await userEvent.click(screen.getByTitle('Add to Tracklist'));
      expect(onAddToTracklist).toHaveBeenCalledWith(42);
    });
  });

  const COLUMN_CONFIG_KEY = 'dj-tools-matches-column-config';

  const CONFIGURABLE_LABELS = [
    'Score', 'Spectral', 'Key', 'BPM', 'Genre', 'Recency',
    'Energy (MIK)', 'Mood', 'Instruments', 'Vocals',
  ];

  describe('column config persistence', () => {
    beforeEach(() => {
      localStorage.removeItem(COLUMN_CONFIG_KEY);
    });

    it('uses default config when localStorage is empty', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
      expect(headers).toEqual(ALL_HEADERS);
    });

    it('restores column visibility from localStorage on mount', () => {
      localStorage.setItem(COLUMN_CONFIG_KEY, JSON.stringify({
        columnSizing: {},
        columnOrder: ['add_to_set', 'track_title', ...SCORE_HEADERS.map(() => '').filter(() => false),
          'overall_score', 'similarity_score', 'camelot_score', 'bpm_score',
          'genre_similarity_score', 'freshness_score', 'energy_score',
          'mood_continuity_score', 'instrument_similarity_score', 'vocal_clash_score', 'details'],
        columnVisibility: { similarity_score: false },
      }));
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
      expect(headers).not.toContain('Spectral');
    });

    it('saves column sizing to localStorage when changed', async () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const stored = JSON.parse(localStorage.getItem(COLUMN_CONFIG_KEY)!);
      expect(stored).toHaveProperty('columnSizing');
      expect(stored).toHaveProperty('columnOrder');
      expect(stored).toHaveProperty('columnVisibility');
    });

    it('saves column visibility to localStorage when toggled', async () => {
      const user = userEvent.setup();
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      await user.click(screen.getByRole('button', { name: /Columns/ }));
      await user.click(screen.getByLabelText('Spectral'));

      const stored = JSON.parse(localStorage.getItem(COLUMN_CONFIG_KEY)!);
      expect(stored.columnVisibility.similarity_score).toBe(false);
    });

    it('restores column order from localStorage on mount', () => {
      const swappedOrder = [
        'add_to_set', 'track_title',
        'overall_score', 'bpm_score', 'camelot_score', 'similarity_score',
        'genre_similarity_score', 'freshness_score', 'energy_score',
        'mood_continuity_score', 'instrument_similarity_score', 'vocal_clash_score',
        'details',
      ];
      localStorage.setItem(COLUMN_CONFIG_KEY, JSON.stringify({
        columnSizing: {},
        columnOrder: swappedOrder,
        columnVisibility: {},
      }));
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
      expect(headers).toEqual(['', 'Track', 'SCORE', 'BPM', 'Key', 'Spectral',
        'Genre', 'Recency', 'Energy (MIK)', 'Mood', 'Instruments', 'Vocals', 'DETAILS']);
    });

    it('restores column sizing from localStorage on mount', () => {
      localStorage.setItem(COLUMN_CONFIG_KEY, JSON.stringify({
        columnSizing: { track_title: 300 },
        columnOrder: [],
        columnVisibility: {},
      }));
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      const trackHeader = headers.find(h => h.textContent === 'Track') as HTMLElement;
      expect(trackHeader.style.width).toBe('300px');
    });

    it('falls back to defaults when localStorage contains invalid JSON', () => {
      localStorage.setItem(COLUMN_CONFIG_KEY, '{not valid json!!!');
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
      expect(headers).toEqual(ALL_HEADERS);
    });
  });

  describe('column configurator', () => {
    it('opens popover with score column checkboxes', async () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /Columns/ }));
      for (const label of CONFIGURABLE_LABELS) {
        expect(screen.getByLabelText(label)).toBeInTheDocument();
      }
    });

    it('does not list Track or non-score columns as configurable', async () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /Columns/ }));
      expect(screen.queryByLabelText('Track')).not.toBeInTheDocument();
      const checkboxes = document.querySelectorAll('.column-config-popover input[type="checkbox"]');
      expect(checkboxes.length).toBe(SCORE_HEADERS.length);
    });

    it('hides a score column when its checkbox is unchecked', async () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headersBefore = screen.getAllByRole('columnheader').map(h => h.textContent);
      expect(headersBefore).toContain('Spectral');

      await userEvent.click(screen.getByRole('button', { name: /Columns/ }));
      await userEvent.click(screen.getByLabelText('Spectral'));

      const headersAfter = screen.getAllByRole('columnheader').map(h => h.textContent);
      expect(headersAfter).not.toContain('Spectral');
    });

    it('re-shows a hidden column when its checkbox is re-checked', async () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /Columns/ }));
      await userEvent.click(screen.getByLabelText('Spectral'));
      expect(screen.getAllByRole('columnheader').map(h => h.textContent)).not.toContain('Spectral');

      await userEvent.click(screen.getByLabelText('Spectral'));
      expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toContain('Spectral');
    });
  });
});
