import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { researchFinancialNews } from '../services/geminiService';

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
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  });

  afterEach(() => {
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
      '2025-02-21,14:05,"Company X beats earnings","Company X reported quarterly earnings above expectations.","XCO","US","Earnings","Reuters","https://example.com/a","Positive","High","Earnings beat drives stock higher."';
    mockFetch.mockResolvedValue(
      okResponse({
        rawText: csv,
        groundingSources: [{ title: 'Reuters', url: 'https://example.com/a' }],
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
});
