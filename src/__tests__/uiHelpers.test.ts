import { describe, it, expect } from 'vitest';
import { getSentimentColor } from '../components/AnalyticsDashboard';
import { getStorageOutcomeLabel } from '../components/TraceabilityPanel';
import { validateDateRange } from '../App';

describe('UI & helper behavior', () => {
  it('maps pie chart colors by sentiment name rather than array index', () => {
    expect(getSentimentColor('Positive')).toBe('#10b981');
    expect(getSentimentColor('Negative')).toBe('#f43f5e');
    expect(getSentimentColor('Neutral')).toBe('#64748b');
  });

  it('formats TraceabilityPanel step 4 from the real storage outcome', () => {
    expect(getStorageOutcomeLabel('indexeddb')).toBe('IndexedDB: Saved');
    expect(getStorageOutcomeLabel('localstorage')).toBe('localStorage fallback: Saved');
    expect(getStorageOutcomeLabel('failed')).toBe('Storage failed (not persisted)');
  });

  it('returns dedicated INVALID_DATE_RANGE error code when startDate > endDate', () => {
    const err = validateDateRange('2026-05-15', '2026-05-01');
    expect(err).toEqual({
      code: 'INVALID_DATE_RANGE',
      message: 'Start date cannot be after end date.',
    });
    expect(validateDateRange('2026-05-01', '2026-05-15')).toBeNull();
  });
});
