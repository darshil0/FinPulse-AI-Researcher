import { describe, it, expect } from 'vitest';
import {
  RawNewsItemSchema,
  extractGroundedDomains,
  extractSourceHostname,
  isGrounded,
  isSourceUrlGrounded,
  validateDate,
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

  it('marks a valid row without grounding sources as Schema-Valid and complies with RawNewsItemSchema', () => {
    const result = validateNewsItem(validRow, 0);

    expect(result.isVerified).toBe(true);
    expect(result.isGrounded).toBe(false);
    expect(result.verificationStatus).toBe('Schema-Valid');
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
    expect(result.verificationStatus).toBe('Schema-Valid');
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
      { ...validRow, Source_URL: 'http://reuters.com/news' },
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

  it('flags unexpected extra columns from model output as Needs review and preserves them in raw', () => {
    const result = validateNewsItem(
      { ...validRow, Unexpected_Extra_Column: 'extra' },
      0
    );

    expect(result.isVerified).toBe(false);
    expect(result.verificationStatus).toBe('Needs review');
    expect(result.raw.Unexpected_Extra_Column).toBe('extra');
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

  it('handles an empty object and null values without throwing, flagging all missing fields', () => {
    const emptyResult = validateNewsItem({}, 4);
    expect(emptyResult.id.startsWith('row-4-')).toBe(true);
    expect(emptyResult.isVerified).toBe(false);
    expect(emptyResult.verificationStatus).toBe('Needs review');
    expect(emptyResult.validationIssues.length).toBe(12);
    expect(emptyResult.validationIssues.some((i) => i.field === 'Time')).toBe(true);
    expect(
      emptyResult.validationIssues.some((i) => i.field === 'Sentiment_Explanation')
    ).toBe(true);

    const nullResult = validateNewsItem(
      { ...validRow, Time: null, Sentiment_Explanation: null },
      5
    );
    expect(nullResult.isVerified).toBe(false);
    expect(nullResult.verificationStatus).toBe('Needs review');
    expect(nullResult.validationIssues.map((i) => i.field)).toEqual(
      expect.arrayContaining(['Time', 'Sentiment_Explanation'])
    );
  });

  it('preserves unmodified raw values (including whitespace) while storing normalized values in data', () => {
    const result = validateNewsItem(
      { ...validRow, Sentiment: '  positive ', Impact: 'LOW' },
      2
    );

    expect(result.isVerified).toBe(true);
    expect(result.raw.Sentiment).toBe('  positive ');
    expect(result.raw.Impact).toBe('LOW');
    expect(result.data.Sentiment).toBe('Positive');
    expect(result.data.Impact).toBe('Low');
  });

  it('rejects calendar rollovers, non-ISO dates, future dates, and out-of-range dates', () => {
    for (const invalidCal of ['2026-02-30', '2026-04-31', '5']) {
      const res = validateNewsItem({ ...validRow, Date: invalidCal }, 0);
      expect(res.isVerified).toBe(false);
      expect(res.validationIssues.some((i) => i.code === 'INVALID_DATE')).toBe(true);
    }

    const futureRes = validateNewsItem(
      { ...validRow, Date: '2099-01-01' },
      0,
      { referenceDate: '2026-11-27' }
    );
    expect(futureRes.isVerified).toBe(false);
    expect(futureRes.validationIssues.some((i) => i.code === 'FUTURE_DATE')).toBe(true);

    const rangeRes = validateNewsItem(
      { ...validRow, Date: '2025-02-10' },
      0,
      { startDate: '2025-02-15', endDate: '2025-02-22', referenceDate: '2026-11-27' }
    );
    expect(rangeRes.isVerified).toBe(false);
    expect(rangeRes.validationIssues.some((i) => i.code === 'DATE_OUT_OF_RANGE')).toBe(true);
  });

  it('rejects placeholder/local URLs and flags ungrounded sources when groundingSources are provided', () => {
    for (const placeholder of [
      'https://example.com/fake-article',
      'http://localhost/x',
      'http://127.0.0.1/news',
    ]) {
      const res = validateNewsItem({ ...validRow, Source_URL: placeholder }, 0);
      expect(res.isVerified).toBe(false);
      expect(res.validationIssues.some((i) => i.code === 'PLACEHOLDER_URL')).toBe(true);
    }

    const singleLabel = validateNewsItem({ ...validRow, Source_URL: 'https://a' }, 0);
    expect(singleLabel.isVerified).toBe(false);
    expect(singleLabel.validationIssues.some((i) => i.code === 'INVALID_URL_SCHEME')).toBe(true);

    const ungrounded = validateNewsItem(validRow, 0, {
      groundingSources: [{ title: 'bloomberg.com', url: 'https://bloomberg.com/markets' }],
    });
    expect(ungrounded.isVerified).toBe(false);
    expect(ungrounded.validationIssues.some((i) => i.code === 'UNGROUNDED_SOURCE')).toBe(true);

    const groundedViaTitle = validateNewsItem(validRow, 0, {
      groundingSources: [
        {
          title: 'reuters.com',
          url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123',
        },
      ],
    });
    expect(groundedViaTitle.isVerified).toBe(true);
    expect(groundedViaTitle.isGrounded).toBe(true);
    expect(groundedViaTitle.verificationStatus).toBe('Verified');

    // Multi-part ccTLD domain isolation: fakeblog.co.uk must not match bbc.co.uk
    const unrelatedCcTld = validateNewsItem(
      { ...validRow, Source_URL: 'https://fakeblog.co.uk/news' },
      0,
      {
        groundingSources: [{ title: 'BBC News', url: 'https://www.bbc.co.uk/news/business' }],
      }
    );
    expect(unrelatedCcTld.isVerified).toBe(false);
    expect(unrelatedCcTld.isGrounded).toBe(false);
    expect(unrelatedCcTld.validationIssues.some((i) => i.code === 'UNGROUNDED_SOURCE')).toBe(true);

    const matchingSubdomainCcTld = validateNewsItem(
      { ...validRow, Source_URL: 'https://feeds.bbc.co.uk/business/story' },
      0,
      {
        groundingSources: [{ title: 'BBC News', url: 'https://www.bbc.co.uk/news/business' }],
      }
    );
    expect(matchingSubdomainCcTld.isVerified).toBe(true);
    expect(matchingSubdomainCcTld.isGrounded).toBe(true);
    expect(matchingSubdomainCcTld.verificationStatus).toBe('Verified');
  });

  it('extracts hostnames and compares Source_URL against grounded domain list cleanly', () => {
    expect(extractSourceHostname('https://www.reuters.com/markets/us')).toBe('reuters.com');
    expect(extractSourceHostname('https://example.com/fake')).toBeNull();
    expect(extractSourceHostname('javascript:alert(1)')).toBeNull();

    const domains = extractGroundedDomains([
      { title: 'Bloomberg Markets', url: 'https://www.bloomberg.com/news/1' },
      {
        title: 'reuters.com',
        url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz',
      },
      { title: 'Invalid local', url: 'http://localhost:3000/test' },
    ]);
    expect(domains).toEqual(['bloomberg.com', 'reuters.com']);

    expect(
      isSourceUrlGrounded('https://markets.bloomberg.com/article', [
        { title: 'Bloomberg', url: 'https://www.bloomberg.com/markets' },
      ])
    ).toBe(true);

    // Reject spoofed prefix domains and empty grounding lists
    expect(
      isSourceUrlGrounded('https://reuters.com.attacker.com/article', [
        { title: 'reuters.com', url: 'https://www.reuters.com/world' },
      ])
    ).toBe(false);
    expect(
      isSourceUrlGrounded('https://evil-reuters.com/article', [
        { title: 'reuters.com', url: 'https://www.reuters.com/world' },
      ])
    ).toBe(false);
    expect(isSourceUrlGrounded('https://www.reuters.com/world', [])).toBe(false);
  });

  it('parses Date fields with validateDate, enforces real calendar dates, and checks startDate/endDate bounds', () => {
    // Valid leap-year date within inclusive range
    const leapOk = validateDate(' 2024-02-29 ', {
      startDate: '2024-02-29',
      endDate: '2024-03-01',
      referenceDate: '2026-11-27',
    });
    expect(leapOk.valid).toBe(true);
    expect(leapOk.normalizedDate).toBe('2024-02-29');
    expect(leapOk.parsedDate?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(leapOk.issues).toHaveLength(0);

    // Non-leap-year Feb 29 must fail calendar validation
    const nonLeapBad = validateDate('2025-02-29');
    expect(nonLeapBad.valid).toBe(false);
    expect(nonLeapBad.parsedDate).toBeUndefined();
    expect(nonLeapBad.issues[0].code).toBe('INVALID_DATE');

    // Outside upper and lower requested bounds
    const beforeStart = validateDate('2025-02-09', {
      startDate: '2025-02-10',
      endDate: '2025-02-20',
      referenceDate: '2026-11-27',
    });
    expect(beforeStart.valid).toBe(false);
    expect(beforeStart.issues.some((i) => i.code === 'DATE_OUT_OF_RANGE')).toBe(true);

    const afterEnd = validateDate('2025-02-21', {
      startDate: '2025-02-10',
      endDate: '2025-02-20',
      referenceDate: '2026-11-27',
    });
    expect(afterEnd.valid).toBe(false);
    expect(afterEnd.issues.some((i) => i.code === 'DATE_OUT_OF_RANGE')).toBe(true);
  });

  it('verifies Source_URL hostname existence via isGrounded against GroundingSourceRef and domain strings', () => {
    expect(
      isGrounded('https://markets.ft.com/content/123', ['ft.com', 'https://www.wsj.com/news'])
    ).toBe(true);
    expect(
      isGrounded('https://reuters.com/world', [{ title: 'Reuters', url: 'https://www.reuters.com/markets' }])
    ).toBe(true);
    expect(
      isGrounded('https://untrusted-blog.com/post', ['ft.com', { title: 'WSJ', url: 'https://wsj.com' }])
    ).toBe(false);
    expect(isGrounded('https://www.ft.com/news', [])).toBe(false);
  });
});

