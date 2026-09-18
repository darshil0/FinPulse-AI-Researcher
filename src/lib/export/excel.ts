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
  const resultsData = filteredItems.map((item) => ({
    'Verification Status': item.verificationStatus,
    'Validation Issues': item.validationIssues.map((i) => `${i.field}: ${i.message}`).join('; ') || 'None',
    'Date': item.data.Date,
    'Time': item.data.Time,
    'Primary Ticker / Entity': item.data.Primary_Ticker_or_Entity,
    'Headline': item.data.Headline,
    'Short Summary': item.data.Short_Summary,
    'Category': item.data.Category,
    'Region / Market': item.data.Region_or_Market,
    'Sentiment': item.data.Sentiment,
    'Impact': item.data.Impact,
    'Sentiment Explanation': item.data.Sentiment_Explanation,
    'Source Name': item.data.Source_Name,
    'Source URL': item.data.Source_URL,
  }));

  const worksheet = XLSX.utils.json_to_sheet(resultsData);

  // Set column widths
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

  // Enable auto-filter on table headers if there are rows
  if (resultsData.length > 0) {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:N1');
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  }

  // Freeze top row
  worksheet['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Research Results');

  // 2. Sheet 2: Traceability & Audit Metadata
  const metadataRows: any[] = [
    { Property: 'Search Query', Value: options.query || 'N/A' },
    { Property: 'Date Range Start', Value: options.startDate || 'N/A' },
    { Property: 'Date Range End', Value: options.endDate || 'N/A' },
    { Property: 'Run Status', Value: options.status || 'N/A' },
    { Property: 'AI Model', Value: options.modelName || 'N/A' },
    { Property: 'Export Date', Value: new Date().toISOString() },
    { Property: 'Total Rows Parsed', Value: options.summary?.totalRows ?? items.length },
    { Property: 'Verified Rows Count', Value: options.summary?.verifiedRows ?? items.filter((i) => i.isVerified).length },
    { Property: 'Needs Review Rows Count', Value: options.summary?.needsReviewRows ?? items.filter((i) => !i.isVerified).length },
    { Property: '', Value: '' },
    { Property: '=== Grounding Sources ===', Value: '' },
  ];

  if (options.groundingSources && options.groundingSources.length > 0) {
    options.groundingSources.forEach((src, idx) => {
      metadataRows.push({
        Property: `Source ${idx + 1}: ${src.title || 'Web Search'}`,
        Value: src.url || 'N/A',
      });
    });
  } else {
    metadataRows.push({ Property: 'Grounding Sources', Value: 'None reported' });
  }

  metadataRows.push({ Property: '', Value: '' });
  metadataRows.push({ Property: '=== Detailed Validation Issues ===', Value: '' });

  let issueCount = 0;
  items.forEach((item, idx) => {
    if (item.validationIssues.length > 0) {
      item.validationIssues.forEach((issue) => {
        issueCount++;
        metadataRows.push({
          Property: `Row ${idx + 1} (${item.data.Primary_Ticker_or_Entity || 'Entity'}) [${issue.field}]`,
          Value: `[${issue.code}] ${issue.message} (Raw: "${issue.rawValue ?? ''}")`,
        });
      });
    }
  });

  if (issueCount === 0) {
    metadataRows.push({ Property: 'Validation Issues', Value: 'All rows passed schema validation smoothly.' });
  }

  const metaWorksheet = XLSX.utils.json_to_sheet(metadataRows);
  metaWorksheet['!cols'] = [{ wch: 40 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(workbook, metaWorksheet, 'Traceability');

  // Sanitize filename
  const sanitizedQuery = (options.query || 'research')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .substring(0, 30);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `finpulse_${sanitizedQuery}_${dateStr}.xlsx`;

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

  const csvRows = filteredItems.map((item) => ({
    'Verification Status': item.verificationStatus,
    'Validation Issues': item.validationIssues.map((i) => i.message).join('; ') || 'None',
    ...item.data,
  }));

  const csv = Papa.unparse(csvRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const sanitizedQuery = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30);
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `finpulse_${sanitizedQuery}_${dateStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
