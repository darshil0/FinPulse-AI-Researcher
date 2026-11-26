import { describe, it, expect } from 'vitest';
import {
  RawNewsItemSchema,
  validateNewsItem,
  validateResearchResults,
} from './index';

describe('validateNewsItem & RawNewsItemSchema edge cases', () => {
  const validRow = {
    Date: '2025-02-21',
    Time: '14:30',
    Headline: 'Semiconductor demand lifts tech indices',
    Short_Summary: 'Major chipmakers beat quarterly revenue estimates on data center demand.',
    Primary_Ticker_or_Entity: 'NVDA',
    Region_or_Market: 'US',
    Category: 'Earnings',
    Source_Name: 'Reuters',
    Source_URL: 'https://www.reuters.com/technology/sample-article',
    Sentiment: 'Positive',
    Impact: 'High',
    Sentiment_Explanation: 'Stronger-than-expected revenue and guidance drove positive sentiment.',
  };

  it('marks a valid row as Verified and complies with RawNewsItemSchema', () => {
    const result = validateNewsItem(validRow, 0);

    expect(result.isVerified).toBe(true);
    expect(result.verificationStatus).toBe('Verified');
    expect(result.validationIssues).toHaveLength(0);
    expect(RawNewsItemSchema.safeParse(result.data).success).toBe(true);
  });

  it('normalizes Sentiment and Impact casing while maintaining RawNewsItemSchema compliance', () => {
    const result = validateNewsItem(
      {
        ...validRow,
        Sentiment: '  negative ',
        Impact: ' medium ',
      },
      1
    );

    expect(result.isVerified).toBe(true);
    expect(result.verificationStatus).toBe('Verified');
    expect(result.data.Sentiment).toBe('Negative');
    expect(result.data.Impact).toBe('Medium');
    expect(RawNewsItemSchema.safeParse(result.data).success).toBe(true);
  });

  it('marks rows missing or blank Time as Needs review and fails RawNewsItemSchema', () => {
    for (const badTime of ['', '   ', undefined]) {
      const candidate = { ...validRow, Time: badTime };
      const result = validateNewsItem(candidate, 0);

      expect(result.isVerified).toBe(false);
      expect(result.verificationStatus).toBe('Needs review');
      expect(
        result.validationIssues.some(
          (issue) => issue.field === 'Time' && issue.code === 'MISSING_REQUIRED_FIELD'
        )
      ).toBe(true);
      expect(RawNewsItemSchema.safeParse(result.data).success).toBe(false);
    }
  });

  it('marks rows missing or blank Sentiment_Explanation as Needs review and fails RawNewsItemSchema', () => {
    for (const badExplanation of ['', '   \t  ', undefined]) {
      const candidate = { ...validRow, Sentiment_Explanation: badExplanation };
      const result = validateNewsItem(candidate, 0);

      expect(result.isVerified).toBe(false);
      expect(result.verificationStatus).toBe('Needs review');
      expect(
        result.validationIssues.some(
          (issue) =>
            issue.field === 'Sentiment_Explanation' &&
            issue.code === 'MISSING_REQUIRED_FIELD'
        )
      ).toBe(true);
      expect(RawNewsItemSchema.safeParse(result.data).success).toBe(false);
    }
  });

  it('flags any missing required text field as Needs review', () => {
    const requiredTextFields = [
      'Headline',
      'Short_Summary',
      'Primary_Ticker_or_Entity',
      'Region_or_Market',
      'Category',
      'Source_Name',
    ] as const;

    for (const field of requiredTextFields) {
      const result = validateNewsItem({ ...validRow, [field]: '   ' }, 0);
      expect(result.isVerified).toBe(false);
      expect(result.verificationStatus).toBe('Needs review');
      expect(
        result.validationIssues.some(
          (issue) => issue.field === field && issue.code === 'MISSING_REQUIRED_FIELD'
        )
      ).toBe(true);
      expect(RawNewsItemSchema.safeParse(result.data).success).toBe(false);
    }
  });

  it('rejects invalid dates and N/A dates with INVALID_DATE', () => {
    for (const badDate of ['', 'N/A', 'not-a-date', '2025-13-45']) {
      const result = validateNewsItem({ ...validRow, Date: badDate }, 0);
      expect(result.isVerified).toBe(false);
      expect(result.verificationStatus).toBe('Needs review');
      expect(
        result.validationIssues.some(
          (issue) => issue.field === 'Date' && issue.code === 'INVALID_DATE'
        )
      ).toBe(true);
      expect(RawNewsItemSchema.safeParse(result.data).success).toBe(false);
    }
  });

  it('distinguishes missing Source_URL from non-HTTP(S) URL schemes', () => {
    for (const missingUrl of ['', '   ', 'N/A', 'n/a']) {
      const result = validateNewsItem({ ...validRow, Source_URL: missingUrl }, 0);
      expect(result.isVerified).toBe(false);
      expect(result.verificationStatus).toBe('Needs review');
      expect(
        result.validationIssues.some(
          (issue) => issue.field === 'Source_URL' && issue.code === 'MISSING_SOURCE_URL'
        )
      ).toBe(true);
      expect(RawNewsItemSchema.safeParse(result.data).success).toBe(false);
    }

    for (const badScheme of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'ftp://example.com/news.csv',
      'mailto:desk@example.com',
      'not-a-valid-url',
    ]) {
      const result = validateNewsItem({ ...validRow, Source_URL: badScheme }, 0);
      expect(result.isVerified).toBe(false);
      expect(result.verificationStatus).toBe('Needs review');
      expect(
        result.validationIssues.some(
          (issue) => issue.field === 'Source_URL' && issue.code === 'INVALID_URL_SCHEME'
        )
      ).toBe(true);
      expect(RawNewsItemSchema.safeParse(result.data).success).toBe(false);
    }

    const httpResult = validateNewsItem(
      { ...validRow, Source_URL: 'http://example.com/news' },
      0
    );
    expect(httpResult.isVerified).toBe(true);
    expect(RawNewsItemSchema.safeParse(httpResult.data).success).toBe(true);
  });

  it('rejects invalid Sentiment and Impact values', () => {
    const result = validateNewsItem(
      { ...validRow, Sentiment: 'Bullish', Impact: 'Critical' },
      0
    );

    expect(result.isVerified).toBe(false);
    expect(result.verificationStatus).toBe('Needs review');
    expect(result.validationIssues.some((i) => i.code === 'INVALID_SENTIMENT')).toBe(true);
    expect(result.validationIssues.some((i) => i.code === 'INVALID_IMPACT')).toBe(true);
    expect(RawNewsItemSchema.safeParse(result.data).success).toBe(false);
  });

  it('flags unexpected extra columns from model output as Needs review', () => {
    const result = validateNewsItem(
      { ...validRow, Unexpected_Extra_Column: 'extra' },
      0
    );

    expect(result.isVerified).toBe(false);
    expect(result.verificationStatus).toBe('Needs review');
    expect(
      result.validationIssues.some(
        (issue) => issue.field === 'Row' && issue.code === 'UNEXPECTED_COLUMNS'
      )
    ).toBe(true);
  });

  it('preserves both Verified and Needs review rows in validateResearchResults summary', () => {
    const { items, summary } = validateResearchResults(
      [
        validRow,
        { ...validRow, Time: '' },
        { ...validRow, Sentiment_Explanation: '' },
      ],
      ['Minor parse warning']
    );

    expect(items).toHaveLength(3);
    expect(items[0].isVerified).toBe(true);
    expect(items[1].verificationStatus).toBe('Needs review');
    expect(items[2].verificationStatus).toBe('Needs review');
    expect(summary).toEqual({
      totalRows: 3,
      verifiedRows: 1,
      needsReviewRows: 2,
      hasParseErrors: true,
      parseErrors: ['Minor parse warning'],
    });
  });
});
