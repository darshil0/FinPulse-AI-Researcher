import { z } from 'zod';
import { NewsItem } from '../../types';

export const SENTIMENT_ENUM = ['Positive', 'Negative', 'Neutral'] as const;
export type SentimentType = (typeof SENTIMENT_ENUM)[number];

export const IMPACT_ENUM = ['High', 'Medium', 'Low'] as const;
export type ImpactType = (typeof IMPACT_ENUM)[number];

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  rawValue?: string;
}

export interface ValidatedNewsItem {
  id: string;
  raw: NewsItem;
  data: NewsItem;
  verificationStatus: 'Verified' | 'Needs review';
  validationIssues: ValidationIssue[];
  isVerified: boolean;
}

export interface ValidationSummary {
  totalRows: number;
  verifiedRows: number;
  needsReviewRows: number;
  hasParseErrors: boolean;
  parseErrors: string[];
}

export type ResearchRunStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'partial_success'
  | 'no_results'
  | 'network_error'
  | 'unparseable_model_output';

export type ResearchErrorCode =
  | 'RATE_LIMITED'
  | 'NETWORK_FAILURE'
  | 'REQUEST_TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'UNPARSEABLE_OUTPUT'
  | 'CSV_PARSE_ERROR'
  | 'INVALID_RESPONSE_STRUCTURE'
  | 'INVALID_DATE_RANGE';

const UrlSchema = z
  .string()
  .trim()
  .refine((url) => {
    if (!url || url === 'N/A') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, { message: 'Source_URL must be a valid http or https URL' });

const DateSchema = z.string().trim().refine((dateStr) => {
  if (!dateStr || dateStr === 'N/A') return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}, { message: 'Date must be a valid date (e.g. YYYY-MM-DD)' });

export const RawNewsItemSchema = z.object({
  Date: DateSchema,
  Time: z.string().trim().min(1, 'Time is required'),
  Headline: z.string().trim().min(1, 'Headline is required'),
  Short_Summary: z.string().trim().min(1, 'Short Summary is required'),
  Primary_Ticker_or_Entity: z.string().trim().min(1, 'Primary Ticker or Entity is required'),
  Region_or_Market: z.string().trim().min(1, 'Region or Market is required'),
  Category: z.string().trim().min(1, 'Category is required'),
  Source_Name: z.string().trim().min(1, 'Source Name is required'),
  Source_URL: UrlSchema,
  Sentiment: z.enum(SENTIMENT_ENUM, {
    message: `Sentiment must be one of: ${SENTIMENT_ENUM.join(', ')}`,
  }),
  Impact: z.enum(IMPACT_ENUM, {
    message: `Impact must be one of: ${IMPACT_ENUM.join(', ')}`,
  }),
  Sentiment_Explanation: z.string().trim().min(1, 'Sentiment Explanation is required'),
});

const FIELD_TO_CODE: Partial<Record<keyof NewsItem, string>> = {
  Date: 'MISSING_DATE',
  Source_URL: 'MISSING_SOURCE_URL',
};

function issueFromZodError(field: string, message: string, rawValue?: string): ValidationIssue {
  if (field === 'Source_URL') {
    return {
      field,
      code: 'INVALID_URL_SCHEME',
      message: `Source URL '${rawValue ?? ''}' is not a valid HTTP/HTTPS URL`,
      rawValue,
    };
  }
  if (field === 'Date') {
    return {
      field,
      code: 'INVALID_DATE',
      message: `Date '${rawValue ?? ''}' is not a valid date`,
      rawValue,
    };
  }
  if (field === 'Sentiment') {
    return {
      field,
      code: 'INVALID_SENTIMENT',
      message: `Sentiment '${rawValue ?? ''}' is invalid. Allowed: ${SENTIMENT_ENUM.join(', ')}`,
      rawValue,
    };
  }
  if (field === 'Impact') {
    return {
      field,
      code: 'INVALID_IMPACT',
      message: `Impact '${rawValue ?? ''}' is invalid. Allowed: ${IMPACT_ENUM.join(', ')}`,
      rawValue,
    };
  }
  return {
    field,
    code: FIELD_TO_CODE[field as keyof NewsItem] ?? 'MISSING_REQUIRED_FIELD',
    message,
    rawValue,
  };
}

/**
 * Validates a single raw news item against the Zod schema and produces a
 * ValidatedNewsItem. Invalid rows are retained for traceability, not discarded.
 */
export function validateNewsItem(raw: Record<string, any>, rowIndex: number): ValidatedNewsItem {
  const item: NewsItem = {
    Date: String(raw.Date ?? ''),
    Time: String(raw.Time ?? ''),
    Headline: String(raw.Headline ?? ''),
    Short_Summary: String(raw.Short_Summary ?? ''),
    Primary_Ticker_or_Entity: String(raw.Primary_Ticker_or_Entity ?? ''),
    Region_or_Market: String(raw.Region_or_Market ?? ''),
    Category: String(raw.Category ?? ''),
    Source_Name: String(raw.Source_Name ?? ''),
    Source_URL: String(raw.Source_URL ?? ''),
    Sentiment: String(raw.Sentiment ?? '').trim(),
    Impact: String(raw.Impact ?? '').trim(),
    Sentiment_Explanation: String(raw.Sentiment_Explanation ?? ''),
  };

  const issues: ValidationIssue[] = [];

  // Case-insensitive enum normalization: map "positive" -> "Positive"
  const normalizedSentiment = SENTIMENT_ENUM.find(
    (s) => s.toLowerCase() === item.Sentiment.toLowerCase()
  );
  const normalizedImpact = IMPACT_ENUM.find(
    (i) => i.toLowerCase() === item.Impact.toLowerCase()
  );

  const candidate = {
    ...item,
    Sentiment: normalizedSentiment ?? item.Sentiment,
    Impact: normalizedImpact ?? item.Impact,
  };

  const result = RawNewsItemSchema.safeParse(candidate);

  if (!result.success) {
    const seen = new Set<string>();
    for (const zodIssue of result.error.issues) {
      const field = String(zodIssue.path[0] ?? 'Row');
      if (seen.has(field)) continue;
      seen.add(field);
      issues.push(
        issueFromZodError(field, zodIssue.message, item[field as keyof NewsItem])
      );
    }
  }

  // Unexpected extra columns from the model output
  const expectedKeys = new Set(Object.keys(item));
  const unexpectedKeys = Object.keys(raw).filter((k) => !expectedKeys.has(k));
  if (unexpectedKeys.length > 0) {
    issues.push({
      field: 'Row',
      code: 'UNEXPECTED_COLUMNS',
      message: `Row contains unexpected extra columns: ${unexpectedKeys.join(', ')}`,
      rawValue: unexpectedKeys.join(', '),
    });
  }

  const isVerified = issues.length === 0;

  const normalizedItem: NewsItem = {
    ...item,
    Sentiment: normalizedSentiment || item.Sentiment,
    Impact: normalizedImpact || item.Impact,
  };

  const id = `row-${rowIndex}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  return {
    id,
    raw: { ...item },
    data: normalizedItem,
    verificationStatus: isVerified ? 'Verified' : 'Needs review',
    validationIssues: issues,
    isVerified,
  };
}

/**
 * Validates an array of parsed rows and returns validated items along with a
 * validation summary.
 */
export function validateResearchResults(
  rows: Record<string, any>[],
  csvParseErrors: string[] = []
): { items: ValidatedNewsItem[]; summary: ValidationSummary } {
  const items = rows.map((row, idx) => validateNewsItem(row, idx));
  const verifiedCount = items.filter((i) => i.isVerified).length;

  const summary: ValidationSummary = {
    totalRows: items.length,
    verifiedRows: verifiedCount,
    needsReviewRows: items.length - verifiedCount,
    hasParseErrors: csvParseErrors.length > 0,
    parseErrors: csvParseErrors,
  };

  return { items, summary };
}
