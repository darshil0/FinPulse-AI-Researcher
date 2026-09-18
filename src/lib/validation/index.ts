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
  | 'INVALID_RESPONSE_STRUCTURE';

// Zod Schema for strict validation
const UrlSchema = z.string().trim().refine((url) => {
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
  // Match YYYY-MM-DD or standard parseable date string
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

/**
 * Validates a single raw news item and produces a ValidatedNewsItem
 */
export function validateNewsItem(raw: Record<string, any>, rowIndex: number): ValidatedNewsItem {
  const issues: ValidationIssue[] = [];

  // Safe string coercion for raw dictionary
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
    Sentiment: String(raw.Sentiment ?? ''),
    Impact: String(raw.Impact ?? ''),
    Sentiment_Explanation: String(raw.Sentiment_Explanation ?? ''),
  };

  // Check required presence / empty strings
  const requiredFields: Array<keyof NewsItem> = [
    'Date',
    'Headline',
    'Short_Summary',
    'Primary_Ticker_or_Entity',
    'Region_or_Market',
    'Category',
    'Source_Name',
    'Source_URL',
    'Sentiment',
    'Impact',
  ];

  for (const field of requiredFields) {
    const val = item[field];
    if (!val || val.trim() === '' || val.trim() === 'N/A') {
      if (field === 'Source_URL') {
        issues.push({
          field,
          code: 'MISSING_SOURCE_URL',
          message: 'Source URL is missing or set to N/A',
          rawValue: val,
        });
      } else if (field === 'Date') {
        issues.push({
          field,
          code: 'MISSING_DATE',
          message: 'Date is missing or set to N/A',
          rawValue: val,
        });
      } else {
        issues.push({
          field,
          code: 'MISSING_REQUIRED_FIELD',
          message: `Required field '${field}' is empty or missing`,
          rawValue: val,
        });
      }
    }
  }

  // Validate Date format if present
  if (item.Date && item.Date !== 'N/A' && !issues.some((i) => i.field === 'Date')) {
    const dateParsed = new Date(item.Date);
    if (isNaN(dateParsed.getTime())) {
      issues.push({
        field: 'Date',
        code: 'INVALID_DATE',
        message: `Date '${item.Date}' is not a valid date`,
        rawValue: item.Date,
      });
    }
  }

  // Validate Source URL protocol if present
  if (item.Source_URL && item.Source_URL !== 'N/A' && !issues.some((i) => i.field === 'Source_URL')) {
    try {
      const parsedUrl = new URL(item.Source_URL);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        issues.push({
          field: 'Source_URL',
          code: 'INVALID_URL_SCHEME',
          message: `Source URL scheme '${parsedUrl.protocol}' is not supported. Must be http or https.`,
          rawValue: item.Source_URL,
        });
      }
    } catch {
      issues.push({
        field: 'Source_URL',
        code: 'INVALID_URL',
        message: `Source URL '${item.Source_URL}' is not a valid HTTP/HTTPS URL`,
        rawValue: item.Source_URL,
      });
    }
  }

  // Validate Sentiment enum
  const normalizedSentiment = item.Sentiment.trim();
  const validSentiment = SENTIMENT_ENUM.find(
    (s) => s.toLowerCase() === normalizedSentiment.toLowerCase()
  );
  if (!validSentiment) {
    issues.push({
      field: 'Sentiment',
      code: 'INVALID_SENTIMENT',
      message: `Sentiment '${item.Sentiment}' is invalid. Allowed: ${SENTIMENT_ENUM.join(', ')}`,
      rawValue: item.Sentiment,
    });
  }

  // Validate Impact enum
  const normalizedImpact = item.Impact.trim();
  const validImpact = IMPACT_ENUM.find(
    (i) => i.toLowerCase() === normalizedImpact.toLowerCase()
  );
  if (!validImpact) {
    issues.push({
      field: 'Impact',
      code: 'INVALID_IMPACT',
      message: `Impact '${item.Impact}' is invalid. Allowed: ${IMPACT_ENUM.join(', ')}`,
      rawValue: item.Impact,
    });
  }

  // Check for extra or missing unknown schema columns from raw dictionary
  const expectedKeys = new Set(Object.keys(item));
  const rawKeys = Object.keys(raw);
  const unexpectedKeys = rawKeys.filter((k) => !expectedKeys.has(k));
  if (unexpectedKeys.length > 0) {
    issues.push({
      field: 'Row',
      code: 'UNEXPECTED_COLUMNS',
      message: `Row contains unexpected extra columns: ${unexpectedKeys.join(', ')}`,
      rawValue: unexpectedKeys.join(', '),
    });
  }

  const isVerified = issues.length === 0;

  // Safe normalized item
  const normalizedItem: NewsItem = {
    ...item,
    Sentiment: validSentiment || item.Sentiment,
    Impact: validImpact || item.Impact,
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
 * Validates an array of parsed rows and returns validated items along with a validation summary
 */
export function validateResearchResults(
  rows: Record<string, any>[],
  csvParseErrors: string[] = []
): { items: ValidatedNewsItem[]; summary: ValidationSummary } {
  const items = rows.map((row, idx) => validateNewsItem(row, idx));
  const verifiedCount = items.filter((i) => i.isVerified).length;
  const needsReviewCount = items.length - verifiedCount;

  const summary: ValidationSummary = {
    totalRows: items.length,
    verifiedRows: verifiedCount,
    needsReviewRows: needsReviewCount,
    hasParseErrors: csvParseErrors.length > 0,
    parseErrors: csvParseErrors,
  };

  return { items, summary };
}
