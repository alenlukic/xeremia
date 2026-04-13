export interface DragPayload {
  trackId: number;
  title: string;
  source: 'browse' | 'matches' | 'tracklist' | 'pool';
}

export const MAX_COLS = 5;
