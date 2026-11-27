import { z } from 'zod';
import { NewsItem } from '../../types';

export const SENTIMENT_ENUM = ['Positive', 'Negative', 'Neutral'] as const;
export type SentimentType = (typeof SENTIMENT_ENUM)[number];

export const IMPACT_ENUM = ['High', 'Medium', 'Low'] as const;
export type ImpactType = (typeof IMPACT_ENUM)[number];

export interface GroundingSourceRef {
  title?: string;
  url?: string;
}

export interface ValidationContext {
  startDate?: string;
  endDate?: string;
  groundingSources?: GroundingSourceRef[];
  referenceDate?: string;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  rawValue?: string;
}

export type VerificationStatus = 'Verified' | 'Schema-Valid' | 'Needs review';

export interface ValidatedNewsItem {
  id: string;
  raw: Record<string, unknown>;
  data: NewsItem;
  verificationStatus: VerificationStatus;
  validationIssues: ValidationIssue[];
  isVerified: boolean;
  isGrounded?: boolean;
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

const PLACEHOLDER_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'example.com',
  'example.org',
  'example.net',
  'test.com',
]);

const RESERVED_TLD_SUFFIXES = ['.local', '.internal', '.invalid', '.localhost', '.example'];

export function isPlaceholderHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (PLACEHOLDER_HOSTS.has(host)) return true;
  if (
    host.endsWith('.example.com') ||
    host.endsWith('.example.org') ||
    host.endsWith('.example.net') ||
    host.endsWith('.test.com')
  ) {
    return true;
  }
  return RESERVED_TLD_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function isValidHttpPublicUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || !host.includes('.')) return false;
    if (isPlaceholderHost(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isValidCalendarDate(dateStr: string): boolean {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function getDefaultMaxAllowedDate(): string {
  const now = new Date();
  const utcDate = now.toISOString().split('T')[0];
  const localYear = now.getFullYear();
  const localMonth = String(now.getMonth() + 1).padStart(2, '0');
  const localDay = String(now.getDate()).padStart(2, '0');
  const localDate = `${localYear}-${localMonth}-${localDay}`;
  return utcDate > localDate ? utcDate : localDate;
}

export interface DateValidationOptions {
  startDate?: string;
  endDate?: string;
  referenceDate?: string;
}

export interface DateValidationResult {
  valid: boolean;
  normalizedDate?: string;
  parsedDate?: Date;
  issues: ValidationIssue[];
}

/**
 * Parses a candidate `Date` value, verifies strict YYYY-MM-DD calendar validity
 * (rejecting rollovers such as `2026-02-30`), checks against future dates, and
 * ensures it falls within the requested `startDate` and `endDate` range.
 */
export function validateDate(
  dateStr: string,
  options?: DateValidationOptions
): DateValidationResult {
  const trimmed = String(dateStr ?? '').trim();
  const issues: ValidationIssue[] = [];

  if (!isValidCalendarDate(trimmed)) {
    issues.push({
      field: 'Date',
      code: 'INVALID_DATE',
      message: `Date '${trimmed}' is not a valid YYYY-MM-DD calendar date`,
      rawValue: trimmed,
    });
    return { valid: false, issues };
  }

  const [year, month, day] = trimmed.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  const maxAllowedDate =
    options?.referenceDate && isValidCalendarDate(options.referenceDate)
      ? options.referenceDate.trim()
      : getDefaultMaxAllowedDate();

  if (trimmed > maxAllowedDate) {
    issues.push({
      field: 'Date',
      code: 'FUTURE_DATE',
      message: `Date '${trimmed}' is in the future (after ${maxAllowedDate})`,
      rawValue: trimmed,
    });
  }

  const startBound =
    options?.startDate && isValidCalendarDate(options.startDate)
      ? options.startDate.trim()
      : undefined;
  const endBound =
    options?.endDate && isValidCalendarDate(options.endDate)
      ? options.endDate.trim()
      : undefined;

  if ((startBound && trimmed < startBound) || (endBound && trimmed > endBound)) {
    issues.push({
      field: 'Date',
      code: 'DATE_OUT_OF_RANGE',
      message: `Date '${trimmed}' falls outside the requested range (${startBound || 'earliest'} to ${endBound || 'now'})`,
      rawValue: trimmed,
    });
  }

  return {
    valid: issues.length === 0,
    normalizedDate: trimmed,
    parsedDate,
    issues,
  };
}

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'ne.jp',
  'or.jp',
  'com.cn',
  'com.hk',
  'com.sg',
  'co.in',
  'com.br',
  'co.za',
  'co.kr',
  'com.mx',
  'co.nz',
  'com.tw',
]);

function getRegistrableDomain(hostname: string): string {
  const clean = hostname.toLowerCase().replace(/^www\./, '');
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const GROUNDING_REDIRECT_HOSTS = new Set([
  'vertexaisearch.cloud.google.com',
]);

/**
 * Extracts a normalized public HTTP/HTTPS hostname (without leading `www.`)
 * from a candidate `Source_URL`, or returns `null` if invalid or placeholder.
 */
export function extractSourceHostname(rawUrl: string): string | null {
  if (!isValidHttpPublicUrl(rawUrl)) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Extracts the deduplicated list of publisher domains present in `groundingSources`
 * (reading both `url` hostnames and domain-formatted source `title` strings, while
 * excluding search redirect proxies).
 */
export function extractGroundedDomains(
  groundingSources: Array<GroundingSourceRef | string>
): string[] {
  const domains = new Set<string>();
  const domainInTitleRegex = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi;

  const addHostFromCandidate = (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(withScheme);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        if (
          host.includes('.') &&
          !isPlaceholderHost(host) &&
          !GROUNDING_REDIRECT_HOSTS.has(host)
        ) {
          domains.add(host);
        }
      }
    } catch {
      // Ignore malformed grounding URL/domain
    }
  };

  for (const src of groundingSources) {
    if (typeof src === 'string') {
      addHostFromCandidate(src);
      continue;
    }

    if (src.url) {
      try {
        const parsed = new URL(src.url.trim());
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
          if (
            host.includes('.') &&
            !isPlaceholderHost(host) &&
            !GROUNDING_REDIRECT_HOSTS.has(host)
          ) {
            domains.add(host);
          }
        }
      } catch {
        // Ignore malformed grounding URL
      }
    }

    if (src.title) {
      const matches = src.title.match(domainInTitleRegex);
      if (matches) {
        for (const match of matches) {
          const host = match.toLowerCase().replace(/^www\./, '');
          if (!isPlaceholderHost(host) && !GROUNDING_REDIRECT_HOSTS.has(host)) {
            domains.add(host);
          }
        }
      }
    }
  }

  return Array.from(domains);
}

/**
 * Verifies if the `Source_URL` hostname matches the domain list extracted
 * from `groundingSources` (and publisher titles for grounding redirect links)
 * to ensure the link is a valid, grounded source.
 */
export function isGrounded(
  sourceUrl: string,
  groundingSources: Array<GroundingSourceRef | string>
): boolean {
  if (!groundingSources || groundingSources.length === 0) return false;

  const sourceHost = extractSourceHostname(sourceUrl);
  if (!sourceHost) return false;

  const regDomain = getRegistrableDomain(sourceHost);
  const groundedDomains = extractGroundedDomains(groundingSources);

  if (
    groundedDomains.some(
      (domain) =>
        domain === sourceHost || getRegistrableDomain(domain) === regDomain
    )
  ) {
    return true;
  }

  const brandToken = regDomain.split('.')[0];
  if (brandToken.length < 3) return false;
  const brandRegex = new RegExp(`\\b${escapeRegExp(brandToken)}\\b`, 'i');

  return groundingSources.some(
    (src) =>
      typeof src !== 'string' &&
      typeof src.title === 'string' &&
      brandRegex.test(src.title)
  );
}

export function isSourceUrlGrounded(
  sourceUrl: string,
  groundingSources: Array<GroundingSourceRef | string>
): boolean {
  return isGrounded(sourceUrl, groundingSources);
}

export function isUrlGrounded(
  url: string,
  groundingSources: Array<GroundingSourceRef | string>
): boolean {
  return isGrounded(url, groundingSources);
}

const UrlSchema = z
  .string()
  .trim()
  .refine((url) => isValidHttpPublicUrl(url), {
    message: 'Source_URL must be a valid public http or https URL',
  });

const DateSchema = z
  .string()
  .trim()
  .refine((dateStr) => isValidCalendarDate(dateStr), {
    message: 'Date must be a valid calendar date in YYYY-MM-DD format',
  });

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

function issueFromZodError(field: string, message: string, rawValue?: string): ValidationIssue {
  if (field === 'Source_URL') {
    const trimmed = (rawValue ?? '').trim();
    if (!trimmed || trimmed.toUpperCase() === 'N/A') {
      return {
        field,
        code: 'MISSING_SOURCE_URL',
        message: 'Source URL is missing or set to N/A',
        rawValue,
      };
    }
    try {
      const parsed = new URL(trimmed);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        isPlaceholderHost(parsed.hostname)
      ) {
        return {
          field,
          code: 'PLACEHOLDER_URL',
          message: `Source URL '${rawValue ?? ''}' uses a placeholder or local domain`,
          rawValue,
        };
      }
    } catch {
      // Fall through to INVALID_URL_SCHEME
    }
    return {
      field,
      code: 'INVALID_URL_SCHEME',
      message: `Source URL '${rawValue ?? ''}' is not a valid public HTTP/HTTPS URL`,
      rawValue,
    };
  }
  if (field === 'Date') {
    return {
      field,
      code: 'INVALID_DATE',
      message: `Date '${rawValue ?? ''}' is not a valid YYYY-MM-DD calendar date`,
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
    code: 'MISSING_REQUIRED_FIELD',
    message,
    rawValue,
  };
}

/**
 * Validates a single raw news item against the Zod schema plus domain checks
 * (calendar validity, non-future/date-range adherence, placeholder domains,
 * and grounding source alignment). Invalid rows are retained for traceability.
 */
export function validateNewsItem(
  raw: Record<string, unknown>,
  rowIndex: number,
  context?: ValidationContext
): ValidatedNewsItem {
  const item: NewsItem = {
    Date: String(raw.Date ?? '').trim(),
    Time: String(raw.Time ?? '').trim(),
    Headline: String(raw.Headline ?? '').trim(),
    Short_Summary: String(raw.Short_Summary ?? '').trim(),
    Primary_Ticker_or_Entity: String(raw.Primary_Ticker_or_Entity ?? '').trim(),
    Region_or_Market: String(raw.Region_or_Market ?? '').trim(),
    Category: String(raw.Category ?? '').trim(),
    Source_Name: String(raw.Source_Name ?? '').trim(),
    Source_URL: String(raw.Source_URL ?? '').trim(),
    Sentiment: String(raw.Sentiment ?? '').trim(),
    Impact: String(raw.Impact ?? '').trim(),
    Sentiment_Explanation: String(raw.Sentiment_Explanation ?? '').trim(),
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

  // Calendar, future-date, and requested startDate/endDate range validation
  const dateValidation = validateDate(item.Date, {
    startDate: context?.startDate,
    endDate: context?.endDate,
    referenceDate: context?.referenceDate,
  });
  for (const dateIssue of dateValidation.issues) {
    if (dateIssue.code === 'INVALID_DATE' && issues.some((i) => i.field === 'Date')) {
      continue;
    }
    issues.push(dateIssue);
  }

  // Grounding source corroboration check when Source_URL syntax passed
  const hasGroundingSources = Boolean(
    context?.groundingSources && context.groundingSources.length > 0
  );
  const urlValidSyntax = isValidHttpPublicUrl(item.Source_URL);
  const groundedMatch =
    hasGroundingSources &&
    urlValidSyntax &&
    isGrounded(item.Source_URL, context!.groundingSources!);

  if (hasGroundingSources && urlValidSyntax && !groundedMatch) {
    issues.push({
      field: 'Source_URL',
      code: 'UNGROUNDED_SOURCE',
      message: `Source URL '${item.Source_URL}' does not match any returned grounding search source`,
      rawValue: item.Source_URL,
    });
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
  const verificationStatus: VerificationStatus = !isVerified
    ? 'Needs review'
    : hasGroundingSources
      ? 'Verified'
      : 'Schema-Valid';

  const normalizedItem: NewsItem = {
    ...item,
    Sentiment: normalizedSentiment || item.Sentiment,
    Impact: normalizedImpact || item.Impact,
  };

  const uniquePart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).substring(2, 10);
  const id = `row-${rowIndex}-${Date.now().toString(36)}-${uniquePart}`;

  return {
    id,
    raw: { ...raw },
    data: normalizedItem,
    verificationStatus,
    validationIssues: issues,
    isVerified,
    isGrounded: groundedMatch,
  };
}

/**
 * Validates an array of parsed rows and returns validated items along with a
 * validation summary.
 */
export function validateResearchResults(
  rows: Record<string, unknown>[],
  csvParseErrors: string[] = [],
  context?: ValidationContext
): { items: ValidatedNewsItem[]; summary: ValidationSummary } {
  const items = rows.map((row, idx) => validateNewsItem(row, idx, context));
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
