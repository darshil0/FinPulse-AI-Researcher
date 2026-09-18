import { describe, it, expect } from 'vitest';
import { validateNewsItem, validateResearchResults } from '../lib/validation';

describe('Schema Validation Module', () => {
  const validRawRow = {
    Date: '2025-02-21',
    Time: '14:00',
    Headline: 'Tech stock rallies on positive earnings',
    Short_Summary: 'Tech stock reported quarterly earnings beating analyst expectations.',
    Primary_Ticker_or_Entity: 'AAPL',
    Region_or_Market: 'US',
    Category: 'Earnings',
    Source_Name: 'Reuters',
    Source_URL: 'https://reuters.com/article/123',
    Sentiment: 'Positive',
    Impact: 'High',
    Sentiment_Explanation: 'Earnings beat drives stock higher.',
  };

  it('marks a completely valid row as Verified', () => {
    const validated = validateNewsItem(validRawRow, 0);
    expect(validated.isVerified).toBe(true);
    expect(validated.verificationStatus).toBe('Verified');
    expect(validated.validationIssues).toHaveLength(0);
  });

  it('marks row as Needs review when source URL is missing', () => {
    const raw = { ...validRawRow, Source_URL: 'N/A' };
    const validated = validateNewsItem(raw, 0);
    expect(validated.isVerified).toBe(false);
    expect(validated.verificationStatus).toBe('Needs review');
    expect(validated.validationIssues.some((i) => i.code === 'MISSING_SOURCE_URL')).toBe(true);
  });

  it('marks row as Needs review when source URL has invalid scheme like javascript:', () => {
    const raw = { ...validRawRow, Source_URL: 'javascript:alert(1)' };
    const validated = validateNewsItem(raw, 0);
    expect(validated.isVerified).toBe(false);
    expect(validated.verificationStatus).toBe('Needs review');
    expect(validated.validationIssues.some((i) => i.code === 'INVALID_URL_SCHEME')).toBe(true);
  });

  it('marks row as Needs review when sentiment enum is invalid', () => {
    const raw = { ...validRawRow, Sentiment: 'Super Positive' };
    const validated = validateNewsItem(raw, 0);
    expect(validated.isVerified).toBe(false);
    expect(validated.verificationStatus).toBe('Needs review');
    expect(validated.validationIssues.some((i) => i.code === 'INVALID_SENTIMENT')).toBe(true);
  });

  it('marks row as Needs review when numeric sentiment out of bounds is supplied', () => {
    const raw = { ...validRawRow, Sentiment: '999' };
    const validated = validateNewsItem(raw, 0);
    expect(validated.isVerified).toBe(false);
    expect(validated.validationIssues.some((i) => i.code === 'INVALID_SENTIMENT')).toBe(true);
  });

  it('marks row as Needs review when impact is invalid', () => {
    const raw = { ...validRawRow, Impact: 'Extreme' };
    const validated = validateNewsItem(raw, 0);
    expect(validated.isVerified).toBe(false);
    expect(validated.validationIssues.some((i) => i.code === 'INVALID_IMPACT')).toBe(true);
  });

  it('aggregates multiple validation errors correctly', () => {
    const raw = {
      ...validRawRow,
      Source_URL: '',
      Sentiment: 'InvalidSent',
      Impact: 'InvalidImp',
    };
    const validated = validateNewsItem(raw, 0);
    expect(validated.isVerified).toBe(false);
    expect(validated.validationIssues.length).toBeGreaterThanOrEqual(3);
  });

  it('retains invalid rows for traceability instead of discarding them', () => {
    const rows = [validRawRow, { ...validRawRow, Source_URL: '' }];
    const { items, summary } = validateResearchResults(rows);
    expect(items).toHaveLength(2);
    expect(summary.totalRows).toBe(2);
    expect(summary.verifiedRows).toBe(1);
    expect(summary.needsReviewRows).toBe(1);
    expect(items[1].isVerified).toBe(false);
  });
});
