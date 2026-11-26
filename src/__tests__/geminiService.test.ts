import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractCsvText,
  parseRetryAfterHeader,
  researchFinancialNews,
  isAbortError,
} from '../services/geminiService';

const VALID_HEADER =
  'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation';

describe('geminiService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('anchors CSV extraction on a line starting with Date,Time,Headline', () => {
    const proseWithInlineHeader =
      'Notice the columns Date,Time,Headline are shown below:\n' +
      `${VALID_HEADER}\n` +
      '2026-05-10,09:30,"Tech rises","Summary here","AAPL","US","Earnings","Reuters","https://reuters.com/1","Positive","High","Strong earnings"';

    const extracted = extractCsvText(proseWithInlineHeader);
    expect(extracted).not.toBeNull();
    expect(extracted!.startsWith('Date,Time,Headline')).toBe(true);
    expect(extracted!.includes('Notice the columns')).toBe(false);

    // Should return null if Date,Time,Headline only appears mid-line
    const onlyInline = 'The expected schema is Date,Time,Headline,Short_Summary without a table.';
    expect(extractCsvText(onlyInline)).toBeNull();
  });

  it('parses Retry-After header seconds cleanly', () => {
    expect(parseRetryAfterHeader('3')).toBe(3);
    expect(parseRetryAfterHeader(' 10 ')).toBe(10);
    expect(parseRetryAfterHeader(null)).toBeUndefined();
    expect(parseRetryAfterHeader('not-a-number')).toBeUndefined();
  });

  it('returns partial_success when CSV table parsed but every row failed validation', async () => {
    const csvWithInvalidRows =
      `${VALID_HEADER}\n` +
      'bad-date,,"Headline 1","Summary 1","NVDA","US","Earnings","Reuters","not-a-url","Positive","High",""';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ csvText: csvWithInvalidRows }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await researchFinancialNews('tech stocks');
    expect(result.status).toBe('partial_success');
    expect(result.rawRowCount).toBe(1);
    expect(result.validCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.statusMessage).toContain('failed validation');
  });

  it('returns unparseable_model_output only when output cannot be parsed as a CSV table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ csvText: 'Sorry, I could not find anything.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await researchFinancialNews('tech stocks');
    expect(result.status).toBe('unparseable_model_output');
    expect(result.items).toEqual([]);
  });

  it('retries on 429 with Retry-After header and succeeds on retry', async () => {
    const csv =
      `${VALID_HEADER}\n` +
      '2026-05-10,09:30,"Tech rises","Summary here","AAPL","US","Earnings","Reuters","https://reuters.com/1","Positive","High","Strong earnings"';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'RATE_LIMITED', message: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csvText: csv }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await researchFinancialNews('tech stocks');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('success');
    expect(result.validCount).toBe(1);
  });

  it('propagates AbortError immediately when cancelled via AbortSignal', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const promise = researchFinancialNews('tech stocks', '', '', controller.signal);
    controller.abort();

    await expect(promise).rejects.toSatisfy((err: unknown) => isAbortError(err));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
