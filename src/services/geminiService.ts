import { GoogleGenAI } from "@google/genai";
import Papa from "papaparse";
import { NewsItem } from "../types";
import {
  validateResearchResults,
  ValidatedNewsItem,
  ValidationSummary,
  ResearchRunStatus,
  ResearchErrorCode,
} from "../lib/validation";

export const GEMINI_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 10000,
  MODEL_NAME: "gemini-3-flash-preview",
};

export interface GroundingSource {
  title?: string;
  url?: string;
}

export interface ResearchResult {
  status: ResearchRunStatus;
  errorCode?: ResearchErrorCode;
  errorMessage?: string;
  rawResponse: string;
  groundingSources: GroundingSource[];
  items: ValidatedNewsItem[];
  summary: ValidationSummary;
  modelName: string;
  timestamp: number;
}

const SYSTEM_INSTRUCTION = `
You are an advanced multi‑model financial news research agent deployed in a production environment in Google AI Studio.

Your job is to:
1) orchestrate multiple specialized capabilities to find and analyze high‑quality financial news, and  
2) return a single, clean CSV table that can be opened directly in Excel, with no extra text.

You must always prioritize accuracy, reliability, and strict formatting over creativity.

1. Role and behavior
- Act as a professional financial analyst, news researcher, and data annotator.  
- Interpret user instructions precisely: timeframe, topics, tickers, regions, and minimum number of items.  
- Use multi‑step reasoning and multiple models/skills internally, but never expose your internal process or tool usage.  
- Be conservative: if information is uncertain, use "N/A" instead of guessing.  
- The final user‑visible response must always be a CSV table following the schema below.

2. Scope, defaults, and overrides
Unless the user overrides them:
- Topics (financial only): Markets (equities, fixed income, FX, commodities), Companies and sectors, Macroeconomics and monetary policy, Corporate events (earnings, M&A, IPOs, guidance, layoffs, bankruptcies), Regulation and enforcement actions, Crypto/DeFi when relevant to markets.
- Timeframe: If user provides a date or range (e.g., via the query or explicit fields), search for news specifically within that range. If no range is provided, default to the last 24 hours.
- Regions: Default: global, with emphasis on US, Europe, and Asia. If the user specifies region(s), filter accordingly.
- Minimum number of items: If the user asks for a minimum, try to reach it but never fabricate rows. If fewer valid items exist, return all that satisfy quality constraints.
If the user requests a timeframe in the future or otherwise impossible, return an empty CSV with only the header row.

3. Multi‑model / skills mindset
Internally, think and act like a multi‑skill agent:
- Decompose the task into: 1) search & discovery, 2) content fetching & cleaning, 3) summarization, 4) classification (category, sentiment, impact, entity, region), 5) CSV validation & formatting.  
- For each sub‑task, imagine delegating to the most suitable specialized model or skill.  
- Combine their outputs into a single coherent table.  
- If different internal “experts” disagree, choose the interpretation most supported by the article text and be conservative (use "N/A" when uncertain).
Do not mention models, tools, skills, or this orchestration to the user.

4. Source quality policy
You must enforce strict source and credibility standards:
- Preferred sources: Major financial outlets and reputable news organizations (e.g., Bloomberg, Reuters, FT, WSJ, CNBC, Yahoo Finance, MarketWatch), Business sections of major newspapers, Official regulators (SEC, ECB, etc.), Company investor relations and official press‑release pages.
- Avoid / exclude: Low‑credibility blogs, content farms, AI‑generated spam, and unverified social media. Non‑financial, purely opinionated, or clickbait content.
For each news item: Always include a source name and source URL. If either is clearly unreliable or cannot be determined, skip the item or mark missing fields as "N/A" without inventing details.
Never fabricate URLs, outlet names, company tickers, or publication dates.

5. Target schema for the final CSV
Exactly these columns, in this order:
1. Date (YYYY-MM-DD)
2. Time (HH:MM or N/A)
3. Headline (≤ 150 characters)
4. Short_Summary (Exactly one sentence, ~40–50 words)
5. Primary_Ticker_or_Entity
6. Region_or_Market
7. Category (Earnings, M&A, IPO, Guidance, Macro, Regulation, Credit/Bankruptcy, Crypto, Corporate_Action, Other)
8. Source_Name
9. Source_URL
10. Sentiment (Positive, Negative, Neutral)
11. Impact (High, Medium, Low)
12. Sentiment_Explanation (Brief explanation of why this sentiment was assigned)

6. CSV formatting rules (strict)
- The response must be pure CSV text, with no markdown, no code fences, no prose before or after.  
- First row: header names exactly as specified, comma‑separated.  
- Each subsequent row: exactly 12 fields, comma‑separated, in the same order.  
- Wrap any field that may contain commas, quotes, or line breaks in double quotes.  
- Escape internal double quotes by doubling them (e.g., He said ""profits rose"").  
- Do not add trailing commas or extra spaces around commas.  
- Do not append comments, notes, or blank lines after the last row.
If no valid items are found, output only the header row, nothing else.

Example structure (schema illustration only):
Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation
2026-02-21,14:05,"Company X beats earnings estimates","Company X reported quarterly earnings above analyst expectations, lifting its share price.","XCO","US","Earnings","Reuters","https://example.com/article","Positive","High","Earnings beat and positive guidance typically drive short-term stock appreciation."

7. Step‑by‑step behavior (internal, not shown to user)
1. Parse the request.
2. Plan (search variations).
3. Gather news (credible sources).
4. Summarize and annotate (one-sentence summary, classification).
5. Validate and format.
6. Respond (CSV only).
Never describe or reveal these internal steps in your answers.
`;

function isRetryableError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.statusCode || err.response?.status;
  const message = (err.message || '').toLowerCase();

  // Rate limits or server errors are retryable
  if (status === 429 || (status >= 500 && status < 600)) return true;

  // Common network / timeout messages
  if (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('503') ||
    message.includes('500') ||
    message.includes('429')
  ) {
    return true;
  }

  return false;
}

function calculateDelay(attempt: number, retryAfterHeader?: string | number): number {
  if (retryAfterHeader) {
    const seconds = parseInt(String(retryAfterHeader), 10);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, GEMINI_CONFIG.MAX_RETRY_DELAY_MS);
    }
  }

  // Exponential backoff with jitter
  const backoff = GEMINI_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 200;
  return Math.min(backoff + jitter, GEMINI_CONFIG.MAX_RETRY_DELAY_MS);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Operation cancelled'));
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Operation cancelled'));
    });
  });
}

function extractGroundingSources(response: any): GroundingSource[] {
  const sources: GroundingSource[] = [];
  try {
    const candidates = response?.candidates || [];
    for (const candidate of candidates) {
      const groundingMetadata = candidate?.groundingMetadata;
      if (groundingMetadata?.groundingChunks) {
        for (const chunk of groundingMetadata.groundingChunks) {
          if (chunk.web?.uri) {
            sources.push({
              title: chunk.web.title || chunk.web.uri,
              url: chunk.web.uri,
            });
          }
        }
      }
    }
  } catch {
    // Ignore extraction errors
  }
  return sources;
}

export async function researchFinancialNews(
  query: string,
  startDate?: string,
  endDate?: string,
  signal?: AbortSignal,
  maxRetries = GEMINI_CONFIG.MAX_RETRIES
): Promise<ResearchResult> {
  const timestamp = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      status: 'network_error',
      errorCode: 'PROVIDER_ERROR',
      errorMessage: 'GEMINI_API_KEY is not set in environment.',
      rawResponse: '',
      groundingSources: [],
      items: [],
      summary: {
        totalRows: 0,
        verifiedRows: 0,
        needsReviewRows: 0,
        hasParseErrors: false,
        parseErrors: [],
      },
      modelName: GEMINI_CONFIG.MODEL_NAME,
      timestamp,
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  let fullPrompt = query;
  if (startDate || endDate) {
    fullPrompt += `\n\nPlease restrict findings to news published between ${
      startDate || 'the earliest available date'
    } and ${endDate || 'now'}.`;
  } else {
    fullPrompt += `\n\nPlease restrict findings to news published in the last 24 hours.`;
  }

  let rawText = '';
  let responseObj: any = null;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      return {
        status: 'network_error',
        errorCode: 'NETWORK_FAILURE',
        errorMessage: 'Request was cancelled by user.',
        rawResponse: '',
        groundingSources: [],
        items: [],
        summary: {
          totalRows: 0,
          verifiedRows: 0,
          needsReviewRows: 0,
          hasParseErrors: false,
          parseErrors: [],
        },
        modelName: GEMINI_CONFIG.MODEL_NAME,
        timestamp,
      };
    }

    try {
      responseObj = await ai.models.generateContent({
        model: GEMINI_CONFIG.MODEL_NAME,
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
        },
      });

      rawText = responseObj?.text || '';
      lastError = null;
      break; // Success
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        const retryAfter = err?.response?.headers?.get?.('retry-after');
        const waitTime = calculateDelay(attempt, retryAfter);
        try {
          await delay(waitTime, signal);
        } catch {
          break; // Aborted during delay
        }
      } else {
        break; // Non-retryable or max retries reached
      }
    }
  }

  if (lastError) {
    const isRateLimit =
      lastError.status === 429 || (lastError.message || '').includes('429');
    return {
      status: 'network_error',
      errorCode: isRateLimit ? 'RATE_LIMITED' : 'NETWORK_FAILURE',
      errorMessage:
        'Unable to connect to AI research provider. Please check your network connection or API quota.',
      rawResponse: '',
      groundingSources: [],
      items: [],
      summary: {
        totalRows: 0,
        verifiedRows: 0,
        needsReviewRows: 0,
        hasParseErrors: false,
        parseErrors: [],
      },
      modelName: GEMINI_CONFIG.MODEL_NAME,
      timestamp,
    };
  }

  const groundingSources = extractGroundingSources(responseObj);

  // Clean raw text
  let csvText = rawText.trim();
  if (csvText.includes('```')) {
    const match = csvText.match(/```(?:csv)?\n([\s\S]*?)\n```/);
    if (match) {
      csvText = match[1];
    } else {
      csvText = csvText.replace(/```[a-z]*\n/g, '').replace(/```/g, '');
    }
  }

  const headerRow =
    'Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation';
  const headerIndex = csvText.indexOf('Date,Time,Headline');
  if (headerIndex !== -1) {
    csvText = csvText.substring(headerIndex);
  }

  if (!csvText || !csvText.includes('Headline')) {
    return {
      status: 'unparseable_model_output',
      errorCode: 'UNPARSEABLE_OUTPUT',
      errorMessage:
        'Model returned output that does not contain expected CSV header structure.',
      rawResponse: rawText,
      groundingSources,
      items: [],
      summary: {
        totalRows: 0,
        verifiedRows: 0,
        needsReviewRows: 0,
        hasParseErrors: true,
        parseErrors: ['Missing expected header row'],
      },
      modelName: GEMINI_CONFIG.MODEL_NAME,
      timestamp,
    };
  }

  // Parse CSV with PapaParse
  const parseResult = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const parseErrors = parseResult.errors.map((e) => e.message);

  if (parseResult.data.length === 0) {
    return {
      status: 'no_results',
      rawResponse: rawText,
      groundingSources,
      items: [],
      summary: {
        totalRows: 0,
        verifiedRows: 0,
        needsReviewRows: 0,
        hasParseErrors: parseErrors.length > 0,
        parseErrors,
      },
      modelName: GEMINI_CONFIG.MODEL_NAME,
      timestamp,
    };
  }

  // Validate results with Zod schema & validation rules
  const { items, summary } = validateResearchResults(parseResult.data, parseErrors);

  const status: ResearchRunStatus =
    summary.verifiedRows === summary.totalRows
      ? 'success'
      : summary.verifiedRows > 0
      ? 'partial_success'
      : 'unparseable_model_output';

  return {
    status,
    rawResponse: rawText,
    groundingSources,
    items,
    summary,
    modelName: GEMINI_CONFIG.MODEL_NAME,
    timestamp,
  };
}
