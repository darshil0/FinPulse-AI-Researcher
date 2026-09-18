import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { researchFinancialNews } from '../services/geminiService';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

describe('Gemini Research Service Resilience', () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-api-key';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
  });

  it('maps unparseable model output to status unparseable_model_output', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'This is invalid plain text output without CSV headers',
    });

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('unparseable_model_output');
    expect(result.errorCode).toBe('UNPARSEABLE_OUTPUT');
    expect(result.items).toHaveLength(0);
  });

  it('maps empty valid CSV header output to status no_results', async () => {
    const headerOnly =
      'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation';
    mockGenerateContent.mockResolvedValue({
      text: headerOnly,
    });

    const result = await researchFinancialNews('test query');
    expect(result.status).toBe('no_results');
    expect(result.items).toHaveLength(0);
  });

  it('retries on retryable 500 error up to maxRetries cap', async () => {
    const error500 = new Error('500 Internal Server Error');
    (error500 as any).status = 500;

    mockGenerateContent.mockRejectedValue(error500);

    const result = await researchFinancialNews('test query', undefined, undefined, undefined, 2);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('network_error');
  });

  it('does not retry non-retryable 401 client error', async () => {
    const error401 = new Error('401 Unauthorized');
    (error401 as any).status = 401;

    mockGenerateContent.mockRejectedValue(error401);

    const result = await researchFinancialNews('test query', undefined, undefined, undefined, 3);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('network_error');
  });
});
