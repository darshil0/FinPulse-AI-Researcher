import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  researchFinancialNews,
  enforceClientRateLimit,
  resetThrottleState,
  THROTTLE_CONFIG,
} from '../services/geminiService';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

describe('Gemini Research Service (proxy)', () => {
  const originalEnvUrl = import.meta.env.VITE_SUPABASE_URL;
  const originalEnvKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  beforeEach(() => {
    mockFetch.mockReset();
    resetThrottleState();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.stubEnv('VITE_SUPABASE_URL', originalEnvUrl);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', originalEnvKey);
  });

  it('maps unparseable model output to status unparseable_model_output', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: 'This is invalid plain text output without CSV headers',
        groundingSources: [],
        modelName: 'gemini-3-flash-preview',
      })
    );

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('unparseable_model_output');
    expect(result.errorCode).toBe('UNPARSEABLE_OUTPUT');
    expect(result.items).toHaveLength(0);
  });

  it('maps empty valid CSV header output to status no_results', async () => {
    const headerOnly =
      'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation';
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: headerOnly,
        groundingSources: [],
        modelName: 'gemini-3-flash-preview',
      })
    );

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('no_results');
    expect(result.items).toHaveLength(0);
  });

  it('returns network_error with RATE_LIMITED code when the proxy reports 429', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'The AI research provider is rate limited.' }),
    });

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('network_error');
    expect(result.errorCode).toBe('RATE_LIMITED');
  });

  it('returns network_error without calling the proxy repeatedly on client errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const result = await researchFinancialNews('test query');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('network_error');
  });

  it('parses valid CSV output into validated items', async () => {
    const csv =
      'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation\n' +
      '2025-02-21,14:05,"Company X beats earnings","Company X reported quarterly earnings above expectations.","XCO","US","Earnings","Reuters","https://www.reuters.com/article/a","Positive","High","Earnings beat drives stock higher."';
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: csv,
        groundingSources: [{ title: 'Reuters', url: 'https://www.reuters.com/article/a' }],
        modelName: 'gemini-3-flash-preview',
      })
    );

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('success');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isVerified).toBe(true);
    expect(result.groundingSources).toHaveLength(1);
  });

  it('classifies all-invalid rows as partial_success, not unparseable', async () => {
    const csv =
      'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation\n' +
      'not-a-date,,,,,,,,"N/A",Bogus,Bogus,N/A explanation';
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: csv,
        groundingSources: [],
        modelName: 'gemini-3-flash-preview',
      })
    );

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('partial_success');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isVerified).toBe(false);
  });

  it('spaces rapid-fire requests by at least MIN_INTERVAL_MS (2 seconds)', async () => {
    expect(THROTTLE_CONFIG.MIN_INTERVAL_MS).toBe(2000);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const headerOnly =
      'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation';
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: headerOnly,
        groundingSources: [],
        modelName: 'gemini-3-flash-preview',
      })
    );

    const p1 = researchFinancialNews('query 1');
    await vi.runAllTimersAsync();
    await p1;
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const p2 = researchFinancialNews('query 2');
    // Immediately after dispatch and after 1.5s, the second call is still rate-limited
    await vi.advanceTimersByTimeAsync(1500);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Once the full 2-second interval elapses, the second call proceeds
    await vi.advanceTimersByTimeAsync(500);
    await p2;
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('enforceClientRateLimit delays consecutive calls directly by 2 seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    expect(await enforceClientRateLimit()).toBe('ok');

    let secondResolved = false;
    const secondPromise = enforceClientRateLimit().then((res) => {
      secondResolved = true;
      return res;
    });

    await vi.advanceTimersByTimeAsync(1999);
    expect(secondResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await secondPromise).toBe('ok');
    expect(secondResolved).toBe(true);
  });

  it('aborts a queued throttled request without calling fetch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const headerOnly =
      'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation';
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: headerOnly,
        groundingSources: [],
        modelName: 'gemini-3-flash-preview',
      })
    );

    const first = researchFinancialNews('query 1');
    await vi.runAllTimersAsync();
    await first;
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    const second = researchFinancialNews('query 2', '', '', controller.signal);
    await Promise.resolve();
    controller.abort();

    const result = await second;
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('network_error');
    expect(result.errorMessage).toContain('cancelled');
  });

  it('rejects burst requests exceeding MAX_REQUESTS_PER_WINDOW with RATE_LIMITED', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const headerOnly =
      'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation';
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: headerOnly,
        groundingSources: [],
        modelName: 'gemini-3-flash-preview',
      })
    );

    for (let i = 0; i < THROTTLE_CONFIG.MAX_REQUESTS_PER_WINDOW; i++) {
      const p = researchFinancialNews(`query ${i}`);
      await vi.advanceTimersByTimeAsync(THROTTLE_CONFIG.MIN_INTERVAL_MS);
      await p;
    }

    expect(mockFetch).toHaveBeenCalledTimes(THROTTLE_CONFIG.MAX_REQUESTS_PER_WINDOW);

    const burstResult = await researchFinancialNews('overflow query');
    expect(mockFetch).toHaveBeenCalledTimes(THROTTLE_CONFIG.MAX_REQUESTS_PER_WINDOW);
    expect(burstResult.status).toBe('network_error');
    expect(burstResult.errorCode).toBe('RATE_LIMITED');

    // Once the sliding window expires, requests succeed again
    await vi.advanceTimersByTimeAsync(THROTTLE_CONFIG.WINDOW_MS);
    const recovered = await researchFinancialNews('recovered query');
    expect(mockFetch).toHaveBeenCalledTimes(THROTTLE_CONFIG.MAX_REQUESTS_PER_WINDOW + 1);
    expect(recovered.status).toBe('no_results');
  });

  it('rejects prose containing the word Headline as unparseable_model_output', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: 'I could not find any Headline matching your query today.',
        groundingSources: [],
        modelName: 'gemini-3-flash-preview',
      })
    );

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('unparseable_model_output');
    expect(result.errorCode).toBe('UNPARSEABLE_OUTPUT');
  });

  it('strips trailing Note commentary lines instead of turning them into data rows', async () => {
    const csvWithNote =
      'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation\n' +
      '2025-02-21,14:05,"Company X beats earnings","Company X reported quarterly earnings above expectations.","XCO","US","Earnings","Reuters","https://www.reuters.com/article/a","Positive","High","Earnings beat drives stock higher."\n' +
      'Note: Only verified articles are listed above.';
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: csvWithNote,
        groundingSources: [{ title: 'Reuters', url: 'https://www.reuters.com/article/a' }],
        modelName: 'gemini-3-flash-preview',
      })
    );

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('success');
    expect(result.items).toHaveLength(1);
    expect(result.summary.hasParseErrors).toBe(true);
  });

  it('returns REQUEST_TIMEOUT when fetch exceeds REQUEST_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const promise = researchFinancialNews('slow query');
    await vi.advanceTimersByTimeAsync(46_000);
    const result = await promise;
    expect(result.status).toBe('network_error');
    expect(result.errorCode).toBe('REQUEST_TIMEOUT');
  });
});
