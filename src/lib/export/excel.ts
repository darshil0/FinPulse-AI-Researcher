import * as XLSX from 'xlsx';
import { ValidatedNewsItem, ValidationSummary } from '../validation';
import { GroundingSource } from '../../services/geminiService';
import Papa from 'papaparse';

export interface ExportOptions {
  includeNeedsReview?: boolean;
  query?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  modelName?: string;
  groundingSources?: GroundingSource[];
  summary?: ValidationSummary;
}

// Neutralize CSV/Excel formula injection: values that begin with =, +, -, @, tab, or CR
// would otherwise be interpreted as formulas by spreadsheet applications.
export function sanitizeCell(value: string): string {
  if (!value) return value;
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function sanitizeItemData(data: ValidatedNewsItem['data']): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = sanitizeCell(value);
  }
  return sanitized;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 30);
}

export function exportToXLSX(
  items: ValidatedNewsItem[],
  options: ExportOptions = {}
): void {
  const includeNeedsReview = options.includeNeedsReview ?? true;
  const filteredItems = includeNeedsReview
    ? items
    : items.filter((item) => item.isVerified);

  const workbook = XLSX.utils.book_new();

  // 1. Sheet 1: Research Results
  const resultsData = filteredItems.map((item) => {
    const safeData = sanitizeItemData(item.data);
    const issuesText =
      item.validationIssues.map((i) => `${i.field}: ${i.message}`).join('; ') || 'None';
    return {
      'Verification Status': sanitizeCell(item.verificationStatus),
      'Validation Issues': sanitizeCell(issuesText),
      'Date': safeData.Date,
      'Time': safeData.Time,
      'Primary Ticker / Entity': safeData.Primary_Ticker_or_Entity,
      'Headline': safeData.Headline,
      'Short Summary': safeData.Short_Summary,
      'Category': safeData.Category,
      'Region / Market': safeData.Region_or_Market,
      'Sentiment': safeData.Sentiment,
      'Impact': safeData.Impact,
      'Sentiment Explanation': safeData.Sentiment_Explanation,
      'Source Name': safeData.Source_Name,
      'Source URL': safeData.Source_URL,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(resultsData);

  worksheet['!cols'] = [
    { wch: 18 }, // Verification Status
    { wch: 30 }, // Validation Issues
    { wch: 12 }, // Date
    { wch: 10 }, // Time
    { wch: 22 }, // Primary Ticker / Entity
    { wch: 40 }, // Headline
    { wch: 50 }, // Short Summary
    { wch: 18 }, // Category
    { wch: 16 }, // Region / Market
    { wch: 12 }, // Sentiment
    { wch: 10 }, // Impact
    { wch: 45 }, // Sentiment Explanation
    { wch: 20 }, // Source Name
    { wch: 45 }, // Source URL
  ];

  if (resultsData.length > 0) {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:N1');
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  }

  worksheet['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Research Results');

  // 2. Sheet 2: Traceability & Audit Metadata
  const metadataRows: Array<{ Property: string; Value: string | number }> = [
    { Property: 'Search Query', Value: sanitizeCell(options.query || 'N/A') },
    { Property: 'Date Range Start', Value: sanitizeCell(options.startDate || 'N/A') },
    { Property: 'Date Range End', Value: sanitizeCell(options.endDate || 'N/A') },
    { Property: 'Run Status', Value: sanitizeCell(options.status || 'N/A') },
    { Property: 'AI Model', Value: sanitizeCell(options.modelName || 'N/A') },
    { Property: 'Export Date', Value: new Date().toISOString() },
    { Property: 'Total Rows Parsed', Value: options.summary?.totalRows ?? items.length },
    { Property: 'Verified Rows Count', Value: options.summary?.verifiedRows ?? items.filter((i) => i.isVerified).length },
    { Property: 'Needs Review Rows Count', Value: options.summary?.needsReviewRows ?? items.filter((i) => !i.isVerified).length },
    { Property: 'Rows Included in This Export', Value: filteredItems.length },
    { Property: '', Value: '' },
    { Property: '=== Grounding Sources ===', Value: '' },
  ];

  if (options.groundingSources && options.groundingSources.length > 0) {
    options.groundingSources.forEach((src, idx) => {
      metadataRows.push({
        Property: sanitizeCell(`Source ${idx + 1}: ${src.title || 'Web Search'}`),
        Value: sanitizeCell(src.url || 'N/A'),
      });
    });
  } else {
    metadataRows.push({ Property: 'Grounding Sources', Value: 'None reported' });
  }

  metadataRows.push({ Property: '', Value: '' });
  metadataRows.push({ Property: '=== Detailed Validation Issues (included rows) ===', Value: '' });

  let issueCount = 0;
  filteredItems.forEach((item, idx) => {
    if (item.validationIssues.length > 0) {
      item.validationIssues.forEach((issue) => {
        issueCount++;
        metadataRows.push({
          Property: sanitizeCell(
            `Row ${idx + 1} (${item.data.Primary_Ticker_or_Entity || 'Entity'}) [${issue.field}]`
          ),
          Value: sanitizeCell(
            `[${issue.code}] ${issue.message} (Raw: "${issue.rawValue ?? ''}")`
          ),
        });
      });
    }
  });

  if (issueCount === 0) {
    metadataRows.push({ Property: 'Validation Issues', Value: 'All exported rows passed schema validation.' });
  }

  const metaWorksheet = XLSX.utils.json_to_sheet(metadataRows);
  metaWorksheet['!cols'] = [{ wch: 40 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(workbook, metaWorksheet, 'Traceability');

  const sanitizedQuery = sanitizeFilenamePart(options.query || 'research');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `finpulse_${sanitizedQuery || 'research'}_${dateStr}.xlsx`;

  XLSX.writeFile(workbook, filename);
}

export function exportToCSV(
  items: ValidatedNewsItem[],
  includeNeedsReview = true,
  query = 'research'
): void {
  const filteredItems = includeNeedsReview
    ? items
    : items.filter((item) => item.isVerified);

  const csvRows = filteredItems.map((item) => {
    const issuesText = item.validationIssues.map((i) => i.message).join('; ') || 'None';
    return {
      'Verification Status': sanitizeCell(item.verificationStatus),
      'Validation Issues': sanitizeCell(issuesText),
      ...sanitizeItemData(item.data),
    };
  });

  const csv = Papa.unparse(csvRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const sanitizedQuery = sanitizeFilenamePart(query);
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `finpulse_${sanitizedQuery || 'research'}_${dateStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
