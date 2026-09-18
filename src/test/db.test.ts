import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  migrateLegacyLocalStorage,
  getAllResearchRuns,
  saveResearchRun,
  StoredResearchRun,
} from '../lib/storage/db';

describe('IndexedDB Storage and Migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy localStorage items once without duplicating records', async () => {
    const legacyHistory = [
      {
        id: 'legacy-1',
        query: 'Legacy tech search',
        timestamp: 1700000000000,
        itemCount: 5,
      },
    ];

    localStorage.setItem('finpulse_history', JSON.stringify(legacyHistory));

    // First migration
    await migrateLegacyLocalStorage();
    expect(localStorage.getItem('finpulse_migrated_v1')).toBe('true');

    // Fetch runs from DB
    const runs = await getAllResearchRuns();
    expect(runs.some((r) => r.id === 'legacy-1')).toBe(true);

    // Second migration call should not duplicate
    await migrateLegacyLocalStorage();
    const runsAfter = await getAllResearchRuns();
    expect(runsAfter.filter((r) => r.id === 'legacy-1')).toHaveLength(1);
  });

  it('handles malformed legacy localStorage gracefully without crashing', async () => {
    localStorage.setItem('finpulse_history', 'INVALID_JSON{{{');

    await expect(migrateLegacyLocalStorage()).resolves.not.toThrow();
  });

  it('saves and reads research runs properly in IndexedDB', async () => {
    const run: StoredResearchRun = {
      id: 'run-test-123',
      query: 'Semiconductor market analysis',
      timestamp: Date.now(),
      status: 'success',
      rawResponse: 'Date,Headline...',
      groundingSources: [],
      items: [],
      summary: {
        totalRows: 0,
        verifiedRows: 0,
        needsReviewRows: 0,
        hasParseErrors: false,
        parseErrors: [],
      },
      modelName: 'gemini-3-flash-preview',
    };

    await saveResearchRun(run);
    const runs = await getAllResearchRuns();
    expect(runs.some((r) => r.id === 'run-test-123')).toBe(true);
  });
});
