import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_HISTORY_RUNS,
  saveResearchRun,
  getResearchHistory,
  clearResearchHistory,
} from '../lib/db';
import { ResearchRun } from '../types';

function makeRun(id: string, timestamp: number): ResearchRun {
  return {
    id,
    query: `query-${id}`,
    timestamp,
    items: [],
    status: 'empty',
    statusMessage: 'No results',
  };
}

describe('db persistence and history cap', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    // Ensure IndexedDB is undefined in jsdom unless explicitly mocked, testing fallback cleanly
    vi.stubGlobal('indexedDB', undefined);
    await clearResearchHistory();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to localStorage and enforces MAX_HISTORY_RUNS cap', async () => {
    for (let i = 0; i < MAX_HISTORY_RUNS + 3; i++) {
      const outcome = await saveResearchRun(makeRun(`run-${i}`, 1000 + i));
      expect(outcome).toBe('localstorage');
    }

    const runs = await getResearchHistory();
    expect(runs).toHaveLength(MAX_HISTORY_RUNS);
    expect(runs[0].id).toBe(`run-${MAX_HISTORY_RUNS + 2}`);
  });

  it('returns failed when both IndexedDB and localStorage fail', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const outcome = await saveResearchRun(makeRun('fail-run', 5000));
    expect(outcome).toBe('failed');
  });
});
