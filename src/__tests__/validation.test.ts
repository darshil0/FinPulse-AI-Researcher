import { describe, it, expect } from 'vitest';
import {
  DateSchema,
  UrlSchema,
  RawNewsItemSchema,
  validateNewsItem,
} from '../lib/validation';

const validRow = {
  Date: '2026-05-10',
  Time: '14:30',
  Headline: 'Semiconductor demand surges in Q2',
  Short_Summary:
    'Major chipmakers reported stronger-than-expected quarterly orders driven by data center expansion.',
  Primary_Ticker_or_Entity: 'NVDA',
  Region_or_Market: 'US',
  Category: 'Earnings',
  Source_Name: 'Reuters',
  Source_URL: 'https://www.reuters.com/markets/chips-q2',
  Sentiment: 'Positive',
  Impact: 'High',
  Sentiment_Explanation: 'Strong order backlog signals sustained revenue growth.',
};

describe('Validation Schemas & validateNewsItem', () => {
  it('validates real YYYY-MM-DD dates and rejects impossible calendar dates', () => {
    expect(DateSchema.safeParse('2026-05-10').success).toBe(true);
    expect(DateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(DateSchema.safeParse('05/10/2026').success).toBe(false);
  });

  it('validates http/https URLs and rejects javascript: or non-URLs', () => {
    expect(UrlSchema.safeParse('https://example.com/news').success).toBe(true);
    expect(UrlSchema.safeParse('http://example.com/news').success).toBe(true);
    expect(UrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(UrlSchema.safeParse('N/A').success).toBe(false);
  });

  it('marks a complete valid row as Verified via RawNewsItemSchema', () => {
    expect(RawNewsItemSchema.safeParse(validRow).success).toBe(true);
    const result = validateNewsItem(validRow);
    expect(result.validationStatus).toBe('Verified');
    expect(result.validationIssues).toEqual([]);
  });

  it('does not mark rows missing Time as Verified', () => {
    const missingTime = { ...validRow, Time: '' };
    const result = validateNewsItem(missingTime);
    expect(result.validationStatus).toBe('Failed');
    expect(result.validationIssues.some((msg) => msg.includes('Time'))).toBe(true);
  });

  it('does not mark rows missing Sentiment_Explanation as Verified', () => {
    const missingExplanation = { ...validRow, Sentiment_Explanation: '   ' };
    const result = validateNewsItem(missingExplanation);
    expect(result.validationStatus).toBe('Failed');
    expect(
      result.validationIssues.some((msg) => msg.includes('Sentiment_Explanation'))
    ).toBe(true);
  });

  it('marks rows with invalid URL or invalid Date as Failed', () => {
    const badRow = {
      ...validRow,
      Date: '2026-02-31',
      Source_URL: 'javascript:alert(1)',
    };
    const result = validateNewsItem(badRow);
    expect(result.validationStatus).toBe('Failed');
    expect(result.validationIssues.length).toBeGreaterThanOrEqual(2);
  });

  it('marks rows with Headline > 150 chars as Warning', () => {
    const longHeadlineRow = {
      ...validRow,
      Headline: 'A'.repeat(151),
    };
    const result = validateNewsItem(longHeadlineRow);
    expect(result.validationStatus).toBe('Warning');
    expect(result.validationIssues).toHaveLength(1);
  });
});
