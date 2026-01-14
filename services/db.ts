
import { Track } from '../types';

const DB_NAME = 'VibeStreamDB';
const DB_VERSION = 1;
const STORE_TRACKS = 'tracks';
const STORE_BLOBS = 'blobs';

export class MusicDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_TRACKS)) {
          db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_BLOBS)) {
          db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => reject(new Error('Failed to open database'));
    });
  }

  // Fix: Made blob optional to support metadata-only updates
  async saveTrack(track: Track, blob?: Blob): Promise<void> {
    if (!this.db) await this.init();
    const stores = blob ? [STORE_TRACKS, STORE_BLOBS] : [STORE_TRACKS];
    const tx = this.db!.transaction(stores, 'readwrite');
    
    const trackStore = tx.objectStore(STORE_TRACKS);
    trackStore.put(track);

    if (blob) {
      const blobStore = tx.objectStore(STORE_BLOBS);
      blobStore.put({ id: track.id, data: blob });
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Failed to save track'));
    });
  }

  async getAllTracks(): Promise<Track[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_TRACKS, 'readonly');
      const store = tx.objectStore(STORE_TRACKS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to fetch tracks'));
    });
  }

  async getTrackBlob(id: string): Promise<Blob> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_BLOBS, 'readonly');
      const store = tx.objectStore(STORE_BLOBS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result.data);
      request.onerror = () => reject(new Error('Failed to fetch blob'));
    });
  }

  async deleteTrack(id: string): Promise<void> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction([STORE_TRACKS, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_TRACKS).delete(id);
    tx.objectStore(STORE_BLOBS).delete(id);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Failed to delete track'));
    });
  }

  async getStorageEstimate(): Promise<{ used: number; quota: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { used: 0, quota: 0 };
  }
}

export const db = new MusicDB();
