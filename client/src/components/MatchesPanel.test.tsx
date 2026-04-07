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
  'Spectral', 'Key', 'BPM', 'Genre', 'Recency',
  'Energy (MIK)', 'Mood', 'Instruments', 'Vocals',
];

const ALL_HEADERS_WITH_ACTIONS = ['Track', ...SCORE_HEADERS, ''];
const ALL_HEADERS_NO_ACTIONS = ['Track', ...SCORE_HEADERS];

const selectedTrack = {
  id: 1, title: 'On Deck', artist_names: ['A'],
  bpm: 128, key: 'C', camelot_code: '8B',
};

describe('MatchesPanel', () => {
  describe('column headers', () => {
    it('renders headers without actions column when onAddToSet is absent', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      expect(headers.map(h => h.textContent)).toEqual(ALL_HEADERS_NO_ACTIONS);
    });

    it('renders headers with actions column when onAddToSet is provided', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      expect(headers.map(h => h.textContent)).toEqual(ALL_HEADERS_WITH_ACTIONS);
    });

    it('includes Track column and score columns but not Score', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const labels = screen.getAllByRole('columnheader').map(h => h.textContent);
      expect(labels).toContain('Track');
      expect(labels).not.toContain('Score');
    });
  });

  describe('default column sizing', () => {
    it('score columns render at ~2/3 of original defaults (60px for most, 73px for energy/instruments)', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      const widths = headers.map(h => (h as HTMLElement).style.width);
      expect(widths[1]).toBe('60px');
      expect(widths[2]).toBe('60px');
      expect(widths[3]).toBe('60px');
      expect(widths[4]).toBe('60px');
      expect(widths[5]).toBe('60px');
      expect(widths[6]).toBe('73px');
      expect(widths[7]).toBe('60px');
      expect(widths[8]).toBe('73px');
      expect(widths[9]).toBe('60px');
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
      expect((headers[0] as HTMLElement).style.width).toBe('484px');
    });

    it('when onAddToSet is provided, the actions column is 80px and score widths are unchanged', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
        />
      );
      const headers = screen.getAllByRole('columnheader');
      expect((headers[0] as HTMLElement).style.width).toBe('484px');
      expect((headers[1] as HTMLElement).style.width).toBe('60px');
      expect((headers[6] as HTMLElement).style.width).toBe('73px');
      expect((headers[8] as HTMLElement).style.width).toBe('73px');
      expect((headers[10] as HTMLElement).style.width).toBe('80px');
    });
  });

  describe('resize and reorder chrome', () => {
    it('renders a resize handle on Track and score headers but not actions', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
          onAddToSet={vi.fn()}
        />
      );
      const resizers = document.querySelectorAll('.col-resizer');
      expect(resizers.length).toBe(SCORE_HEADERS.length);

      const headers = document.querySelectorAll('.matches-table thead th');
      const trackTh = headers[0];
      expect(trackTh.querySelector('.col-resizer')).toBeNull();

      const actionsTh = headers[headers.length - 1];
      expect(actionsTh.querySelector('.col-resizer')).toBeNull();
    });

    it('renders draggable header content only on score headers', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      const draggables = document.querySelectorAll('.th-content[draggable="true"]');
      expect(draggables.length).toBe(SCORE_HEADERS.length);
    });
  });

  describe('score formatting', () => {
    it('displays factor scores on 0-100 integer scale', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch({ similarity_score: 0.8 })]}
          loading={false}
        />
      );
      const cells = document.querySelectorAll('.matches-table tbody td .mono');
      const values = Array.from(cells).map(c => c.textContent);
      expect(values[0]).toBe('80');
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

    it('omits the actions column entirely when onAddToSet is not provided', () => {
      render(
        <MatchesPanel
          selectedTrack={selectedTrack}
          matches={[makeMatch()]}
          loading={false}
        />
      );
      expect(screen.queryByTitle('Add to set')).not.toBeInTheDocument();
      expect(document.querySelectorAll('.match-actions-cell').length).toBe(0);
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
      for (const label of SCORE_HEADERS) {
        expect(screen.getByLabelText(label)).toBeInTheDocument();
      }
    });

    it('does not list Track or actions as configurable columns', async () => {
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
