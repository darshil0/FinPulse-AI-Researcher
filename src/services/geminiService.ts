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
  MODEL_NAME: "gemini-3-flash-preview",
};

export const THROTTLE_CONFIG = {
  MIN_INTERVAL_MS: 2000,
  WINDOW_MS: 60_000,
  MAX_REQUESTS_PER_WINDOW: 10,
};

let lastRequestTime = 0;
let requestTimestamps: number[] = [];
let throttleQueue: Promise<void> = Promise.resolve();

export function resetThrottleState(): void {
  lastRequestTime = 0;
  requestTimestamps = [];
  throttleQueue = Promise.resolve();
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(false);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Client-side rate limiter enforcing at least THROTTLE_CONFIG.MIN_INTERVAL_MS
 * (2 seconds) between consecutive backend requests and capping bursts per minute.
 */
export async function enforceClientRateLimit(
  signal?: AbortSignal
): Promise<'ok' | 'aborted' | 'rate_limited'> {
  if (signal?.aborted) return 'aborted';

  let outcome: 'ok' | 'aborted' | 'rate_limited' = 'ok';

  const next = throttleQueue.then(async () => {
    if (signal?.aborted) {
      outcome = 'aborted';
      return;
    }

    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(
      (ts) => now - ts < THROTTLE_CONFIG.WINDOW_MS
    );

    if (requestTimestamps.length >= THROTTLE_CONFIG.MAX_REQUESTS_PER_WINDOW) {
      outcome = 'rate_limited';
      return;
    }

    const elapsed = lastRequestTime > 0 ? now - lastRequestTime : THROTTLE_CONFIG.MIN_INTERVAL_MS;
    const waitMs = Math.max(0, THROTTLE_CONFIG.MIN_INTERVAL_MS - elapsed);

    if (waitMs > 0) {
      const completed = await sleepWithAbort(waitMs, signal);
      if (!completed || signal?.aborted) {
        outcome = 'aborted';
        return;
      }
    }

    const acquiredAt = Date.now();
    requestTimestamps = requestTimestamps.filter(
      (ts) => acquiredAt - ts < THROTTLE_CONFIG.WINDOW_MS
    );
    if (requestTimestamps.length >= THROTTLE_CONFIG.MAX_REQUESTS_PER_WINDOW) {
      outcome = 'rate_limited';
      return;
    }

    lastRequestTime = acquiredAt;
    requestTimestamps.push(acquiredAt);
    outcome = 'ok';
  });

  throttleQueue = next.catch(() => {});
  await next;
  return outcome;
}

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

function emptySummary(hasParseErrors = false, parseErrors: string[] = []): ValidationSummary {
  return {
    totalRows: 0,
    verifiedRows: 0,
    needsReviewRows: 0,
    hasParseErrors,
    parseErrors,
  };
}

function errorResult(
  errorCode: ResearchErrorCode,
  errorMessage: string,
  timestamp: number
): ResearchResult {
  return {
    status: 'network_error',
    errorCode,
    errorMessage,
    rawResponse: '',
    groundingSources: [],
    items: [],
    summary: emptySummary(),
    modelName: GEMINI_CONFIG.MODEL_NAME,
    timestamp,
  };
}

export async function researchFinancialNews(
  query: string,
  startDate?: string,
  endDate?: string,
  signal?: AbortSignal
): Promise<ResearchResult> {
  const timestamp = Date.now();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResult(
      'PROVIDER_ERROR',
      'Research service is not configured. Please try again later.',
      timestamp
    );
  }

  const slot = await enforceClientRateLimit(signal);
  if (slot === 'aborted') {
    return errorResult('NETWORK_FAILURE', 'Request was cancelled by user.', timestamp);
  }
  if (slot === 'rate_limited') {
    return errorResult(
      'RATE_LIMITED',
      'Too many research requests in a short period. Please wait a moment before trying again.',
      timestamp
    );
  }

  const endpoint = `${supabaseUrl}/functions/v1/gemini-research`;
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, startDate: startDate || '', endDate: endDate || '' }),
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return errorResult('NETWORK_FAILURE', 'Request was cancelled by user.', timestamp);
    }
    return errorResult(
      'NETWORK_FAILURE',
      'Failed to reach the research service. Please check your network connection and try again.',
      timestamp
    );
  }

  if (!response.ok) {
    let message =
      'The research service returned an error. Please try again in a moment.';
    try {
      const body = await response.json();
      if (body && typeof body.error === 'string') {
        message = body.error;
      }
    } catch {
      // Non-JSON error body; keep default message
    }
    return errorResult(
      response.status === 429 ? 'RATE_LIMITED' : 'NETWORK_FAILURE',
      message,
      timestamp
    );
  }

  let payload: { rawText?: unknown; groundingSources?: unknown; modelName?: unknown };
  try {
    payload = await response.json();
  } catch {
    return errorResult(
      'INVALID_RESPONSE_STRUCTURE',
      'Research service returned an unexpected response.',
      timestamp
    );
  }

  const rawText = typeof payload.rawText === 'string' ? payload.rawText : '';
  const groundingSources = Array.isArray(payload.groundingSources)
    ? payload.groundingSources.filter(
        (s): s is GroundingSource =>
          !!s && typeof s === 'object' && typeof (s as GroundingSource).url === 'string'
      )
    : [];
  const modelName =
    typeof payload.modelName === 'string' ? payload.modelName : GEMINI_CONFIG.MODEL_NAME;

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
      summary: emptySummary(true, ['Missing expected header row']),
      modelName,
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
      summary: emptySummary(parseErrors.length > 0, parseErrors),
      modelName,
      timestamp,
    };
  }

  // Validate results with the runtime schema & validation rules
  const { items, summary } = validateResearchResults(parseResult.data, parseErrors);

  const status: ResearchRunStatus =
    summary.verifiedRows === summary.totalRows ? 'success' : 'partial_success';

  return {
    status,
    rawResponse: rawText,
    groundingSources,
    items,
    summary,
    modelName,
    timestamp,
  };
}
