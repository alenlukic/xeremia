export interface DragPayload {
  trackId: number;
  title: string;
  source: 'browse' | 'matches';
}

export const MAX_COLS = 5;
