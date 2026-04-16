import { createContext } from 'react';

export interface DragPayload {
  trackId: number;
  title: string;
  source: 'browse' | 'matches' | 'tracklist' | 'pool';
  selectedTrackIds?: number[];
}

export const MAX_COLS = 5;

export interface DragFillNotification {
  emptyId: string;
  nonce: number;
}

export const DragFillContext = createContext<DragFillNotification | null>(null);

