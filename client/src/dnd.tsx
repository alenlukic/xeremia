export interface DragPayload {
  trackId: number;
  title: string;
  source: 'browse' | 'matches' | 'tracklist' | 'pool';
  selectedTrackIds?: number[];
}

export const MAX_COLS = 5;
