import { ResearchRun, StorageOutcome } from '../types';

export const MAX_HISTORY_RUNS = 10;

const DB_NAME = 'finpulse_db';
const DB_VERSION = 1;
const STORE_NAME = 'research_runs';
const LOCAL_STORAGE_KEY = 'finpulse_history';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function saveToIndexedDB(run: ResearchRun): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      store.put(run);

      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const allRuns = (getAllReq.result as ResearchRun[]).sort(
          (a, b) => b.timestamp - a.timestamp
        );
        const overflow = allRuns.slice(MAX_HISTORY_RUNS);
        for (const stale of overflow) {
          store.delete(stale.id);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    });
  } finally {
    db.close();
  }
}

async function readFromIndexedDB(): Promise<ResearchRun[]> {
  const db = await openDatabase();
  try {
    return await new Promise<ResearchRun[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const runs = (req.result as ResearchRun[])
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_HISTORY_RUNS);
        resolve(runs);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to read from IndexedDB'));
    });
  } finally {
    db.close();
  }
}

function readFromLocalStorage(): ResearchRun[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as ResearchRun[])
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_HISTORY_RUNS);
  } catch {
    return [];
  }
}

function saveToLocalStorage(run: ResearchRun): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const existing = readFromLocalStorage().filter((item) => item.id !== run.id);
    const updated = [run, ...existing]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_HISTORY_RUNS);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

export async function saveResearchRun(run: ResearchRun): Promise<StorageOutcome> {
  const runForStorage: ResearchRun = { ...run, storageOutcome: 'indexeddb' };
  try {
    await saveToIndexedDB(runForStorage);
    return 'indexeddb';
  } catch (err: unknown) {
    console.warn('IndexedDB unavailable, falling back to localStorage:', err);
  }

  const fallbackRun: ResearchRun = { ...run, storageOutcome: 'localstorage' };
  if (saveToLocalStorage(fallbackRun)) {
    return 'localstorage';
  }

  return 'failed';
}

export async function getResearchHistory(): Promise<ResearchRun[]> {
  try {
    const runs = await readFromIndexedDB();
    if (runs.length > 0) {
      return runs;
    }
  } catch (err: unknown) {
    console.warn('Failed to read IndexedDB history, falling back to localStorage:', err);
  }

  return readFromLocalStorage();
}

export async function clearResearchHistory(): Promise<void> {
  try {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to clear IndexedDB'));
      });
    } finally {
      db.close();
    }
  } catch {
    // Ignore IndexedDB errors during cleanup
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage errors during cleanup
  }
}
