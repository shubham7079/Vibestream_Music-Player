
export type TrackSource = 'local' | 'youtube';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  coverUrl: string;
  source: TrackSource;
  uri: string; // YouTube ID or Blob URL
  blobId?: string; // Reference for IndexedDB
  genre?: string;
  addedAt: number;
}

export enum RepeatMode {
  OFF = 'OFF',
  ONE = 'ONE',
  ALL = 'ALL'
}

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  queue: Track[];
  history: Track[];
}

export interface StorageStatus {
  used: number; // bytes
  quota: number; // bytes
  trackCount: number;
}
