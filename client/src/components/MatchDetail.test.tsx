import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MatchDetail } from './MatchDetail';
import type { TransitionMatch, MatchDetail as MatchDetailData } from '../types';

vi.mock('../api/http', () => ({
  fetchMatchDetail: vi.fn(),
}));

import { fetchMatchDetail } from '../api/http';
const mockFetch = vi.mocked(fetchMatchDetail);

const sourceTrack = {
  id: 1,
  title: 'On Deck Track',
  artist_names: ['Artist A'],
  bpm: 128,
  key: 'C',
  camelot_code: '8B',
};

function makeMatch(overrides: Partial<TransitionMatch> = {}): TransitionMatch {
  return {
    candidate_id: 2,
    title: 'Candidate Track',
    overall_score: 82,
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

function makeDetail(overrides: Partial<MatchDetailData> = {}): MatchDetailData {
  return {
    overall_score: 82,
    factors: [
      { name: 'Cosine Similarity', score: 0.8, weight: 0.15 },
      { name: 'Camelot', score: 0.9, weight: 0.2 },
      { name: 'BPM', score: 0.85, weight: 0.1 },
      { name: 'Genre Similarity', score: 0.75, weight: 0.1 },
      { name: 'Freshness', score: 0.6, weight: 0.05 },
      { name: 'Energy', score: 0.7, weight: 0.1 },
      { name: 'Mood Continuity', score: 0.65, weight: 0.1 },
      { name: 'Instrument Similarity', score: 0.55, weight: 0.1 },
      { name: 'Vocal Clash', score: 0.5, weight: 0.1 },
    ],
    on_deck: {
      id: 1,
      title: 'On Deck Track',
      bpm: 128,
      key: 'C',
      camelot_code: '8B',
      energy: 7,
      genre: 'house',
      label: 'Label A',
      traits: {
        voice_instrumental: 'instrumental',
        onset_density: 0.45,
        spectral_flatness: 0.32,
        mood_theme: 'uplifting',
      },
    },
    candidate: {
      id: 2,
      title: 'Candidate Track',
      bpm: 126,
      key: 'G',
      camelot_code: '9B',
      energy: 6,
      genre: 'tech_house',
      label: 'Label B',
      traits: {
        voice_instrumental: 'vocal',
        onset_density: 0.51,
        spectral_flatness: 0.28,
        mood_theme: 'dark',
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MatchDetail', () => {
  describe('Factor Breakdown labels', () => {
    it('displays factor names matching weight gauge terminology', async () => {
      const detail = makeDetail();
      mockFetch.mockResolvedValue(detail);

      render(
        <MatchDetail
          sourceTrack={sourceTrack}
          match={makeMatch()}
          onBack={vi.fn()}
          traitMap={new Map()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Factor Breakdown')).toBeInTheDocument();
      });

      const expectedLabels = [
        'Spectral', 'Key', 'BPM', 'Genre', 'Recency',
        'Energy (MIK)', 'Mood', 'Instruments', 'Vocals',
      ];
      const factorCells = document.querySelectorAll('.factor-table tbody td:first-child');
      const rendered = Array.from(factorCells).map((td) => td.textContent);
      expect(rendered).toEqual(expectedLabels);
    });
  });

  describe('Track Inputs labels', () => {
    it('renders shortened trait labels: Vocals, Onsets, Flatness, Mood', async () => {
      mockFetch.mockResolvedValue(makeDetail());

      render(
        <MatchDetail
          sourceTrack={sourceTrack}
          match={makeMatch()}
          onBack={vi.fn()}
          traitMap={new Map()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Track Inputs')).toBeInTheDocument();
      });

      const labels = document.querySelectorAll('.detail-field-label');
      const labelTexts = Array.from(labels).map((el) => el.textContent);

      for (const short of ['Vocals', 'Onsets', 'Flatness', 'Mood']) {
        expect(labelTexts.filter((t) => t === short).length).toBeGreaterThanOrEqual(2);
      }

      for (const old of ['Voice / Instrumental', 'Onset Density', 'Spectral Flatness', 'Mood / Theme']) {
        expect(labelTexts).not.toContain(old);
      }
    });

    it('places Vocals, Onsets, Flatness, and Mood in a 4-column fixed row', async () => {
      mockFetch.mockResolvedValue(makeDetail());

      render(
        <MatchDetail
          sourceTrack={sourceTrack}
          match={makeMatch()}
          onBack={vi.fn()}
          traitMap={new Map()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Track Inputs')).toBeInTheDocument();
      });

      const cards = document.querySelectorAll('.detail-track-card');
      expect(cards.length).toBe(2);

      const firstCardRows = cards[0].querySelectorAll('.detail-row--4');
      expect(firstCardRows.length).toBe(2);

      const traitRow = firstCardRows[1];
      const labelsInRow = Array.from(
        traitRow.querySelectorAll('.detail-field-label'),
      ).map((el) => el.textContent);
      expect(labelsInRow).toEqual(['Vocals', 'Onsets', 'Flatness', 'Mood']);
    });
  });
});
