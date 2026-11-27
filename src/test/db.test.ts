import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  migrateLegacyLocalStorage,
  getAllResearchRuns,
  saveResearchRun,
  clearAllResearchRuns,
  StoredResearchRun,
} from '../lib/storage/db';

describe('IndexedDB Storage and Migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy localStorage items once without fabricating Verified status', async () => {
    const legacyHistory = [
      {
        id: 'legacy-1',
        query: 'Legacy tech search',
        timestamp: 1700000000000,
        itemCount: 5,
      },
    ];

    localStorage.setItem('finpulse_history', JSON.stringify(legacyHistory));

    await migrateLegacyLocalStorage();
    expect(localStorage.getItem('finpulse_migrated_v1')).toBe('true');

    const runs = await getAllResearchRuns();
    const migrated = runs.find((r) => r.id === 'legacy-1');
    expect(migrated).toBeDefined();
    expect(migrated?.status).toBe('partial_success');
    expect(migrated?.summary.verifiedRows).toBe(0);
    expect(migrated?.summary.needsReviewRows).toBe(5);

    await migrateLegacyLocalStorage();
    const runsAfter = await getAllResearchRuns();
    expect(runsAfter.filter((r) => r.id === 'legacy-1')).toHaveLength(1);
  });

  it('handles malformed legacy localStorage gracefully and marks corrupt migration handled once', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('finpulse_history', 'INVALID_JSON{{{');

    await expect(migrateLegacyLocalStorage()).resolves.not.toThrow();
    expect(localStorage.getItem('finpulse_migrated_v1')).toBe('corrupt');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Second invocation does not keep re-warning
    await migrateLegacyLocalStorage();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('saves, reads, and clears research runs and localStorage fallback keys', async () => {
    localStorage.setItem('finpulse_runs_fallback', JSON.stringify([{ id: 'fb-1' }]));
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

    await clearAllResearchRuns();
    expect(localStorage.getItem('finpulse_runs_fallback')).toBeNull();
    const runsAfterClear = await getAllResearchRuns();
    expect(runsAfterClear).toHaveLength(0);
  });
});
