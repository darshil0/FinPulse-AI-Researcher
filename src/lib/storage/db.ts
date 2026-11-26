import { openDB, IDBPDatabase } from 'idb';
import {
  ValidatedNewsItem,
  ValidationSummary,
  ResearchRunStatus,
} from '../validation';
import { GroundingSource } from '../../services/geminiService';

export interface StoredResearchRun {
  id: string;
  query: string;
  timestamp: number;
  startDate?: string;
  endDate?: string;
  status: ResearchRunStatus;
  rawResponse: string;
  groundingSources: GroundingSource[];
  items: ValidatedNewsItem[];
  summary: ValidationSummary;
  modelName: string;
}

const DB_NAME = 'finpulse_db';
const DB_VERSION = 1;
const STORE_NAME = 'research_runs';
const MIGRATION_KEY = 'finpulse_migrated_v1';
const LEGACY_STORAGE_KEY = 'finpulse_history';
const FALLBACK_STORAGE_KEY = 'finpulse_runs_fallback';
// Matches the localStorage fallback cap so behavior is consistent either way.
const MAX_STORED_RUNS = 200;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('query', 'query');
          store.createIndex('status', 'status');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Safe IndexedDB wrapper with fallback in case IndexedDB is blocked or throws
 */
export async function saveResearchRun(run: StoredResearchRun): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, run);
    await pruneOldRuns(db);
  } catch (err) {
    console.warn('Failed to save research run to IndexedDB:', err);
    // Fallback to localStorage if IndexedDB fails
    try {
      const existing = localStorage.getItem(FALLBACK_STORAGE_KEY);
      const runs: StoredResearchRun[] = existing ? JSON.parse(existing) : [];
      const updated = [run, ...runs.filter((r) => r.id !== run.id)].slice(0, MAX_STORED_RUNS);
      localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore fallback error
    }
  }
}

async function pruneOldRuns(db: IDBPDatabase): Promise<void> {
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.store.index('timestamp');
  let cursor = await index.openCursor(null, 'prev');
  let seen = 0;
  while (cursor) {
    seen++;
    if (seen > MAX_STORED_RUNS) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function getAllResearchRuns(): Promise<StoredResearchRun[]> {
  try {
    await migrateLegacyLocalStorage();
    const db = await getDB();
    const runs = await db.getAllFromIndex(STORE_NAME, 'timestamp');
    return runs.reverse(); // Newest first
  } catch (err) {
    console.warn('Failed to read research runs from IndexedDB:', err);
    try {
      const fallback = localStorage.getItem(FALLBACK_STORAGE_KEY);
      return fallback ? JSON.parse(fallback) : [];
    } catch {
      return [];
    }
  }
}

export async function deleteResearchRun(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
    try {
      const fallback = localStorage.getItem(FALLBACK_STORAGE_KEY);
      if (fallback) {
        const runs: StoredResearchRun[] = JSON.parse(fallback);
        localStorage.setItem(
          FALLBACK_STORAGE_KEY,
          JSON.stringify(runs.filter((r) => r.id !== id))
        );
      }
    } catch {
      // Ignore fallback cleanup errors
    }
  } catch (err) {
    console.warn('Failed to delete research run from IndexedDB:', err);
  }
}

export async function clearAllResearchRuns(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(FALLBACK_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear research runs from IndexedDB:', err);
  }
}

/**
 * One-time migration from localStorage `finpulse_history` to IndexedDB
 */
export async function migrateLegacyLocalStorage(): Promise<void> {
  if (typeof localStorage === 'undefined') return;

  const isMigrated = localStorage.getItem(MIGRATION_KEY);
  if (isMigrated === 'true') return;

  const legacyDataStr = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyDataStr) {
    localStorage.setItem(MIGRATION_KEY, 'true');
    return;
  }

  try {
    const legacyItems = JSON.parse(legacyDataStr);
    if (Array.isArray(legacyItems) && legacyItems.length > 0) {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const item of legacyItems) {
        if (!item || typeof item !== 'object') continue;

        const id = item.id || `legacy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const run: StoredResearchRun = {
          id,
          query: item.query || 'Legacy Search',
          timestamp: item.timestamp || Date.now(),
          startDate: item.startDate || '',
          endDate: item.endDate || '',
          status: 'success',
          rawResponse: '',
          groundingSources: [],
          items: [],
          summary: {
            totalRows: item.itemCount || 0,
            verifiedRows: item.itemCount || 0,
            needsReviewRows: 0,
            hasParseErrors: false,
            parseErrors: [],
          },
          modelName: 'legacy-import',
        };

        await store.put(run);
      }
      await tx.done;
    }

    localStorage.setItem(MIGRATION_KEY, 'true');
  } catch (err) {
    console.warn('Migration from localStorage failed:', err);
    // Do not mark as migrated if critical error occurred so it can retry or preserve
  }
}
