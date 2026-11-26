import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeSpreadsheetCell,
  buildSanitizedCsv,
  exportToCSV,
  buildResearchWorkbook,
} from '../lib/export/excel';
import { ValidatedNewsItem } from '../types';

const baseVerifiedItem: ValidatedNewsItem = {
  Date: '2026-05-10',
  Time: '10:00',
  Headline: 'Market rallies on tech earnings',
  Short_Summary: 'Technology equities led gains following strong quarterly earnings reports.',
  Primary_Ticker_or_Entity: 'AAPL',
  Region_or_Market: 'US',
  Category: 'Earnings',
  Source_Name: 'Bloomberg',
  Source_URL: 'https://www.bloomberg.com/news/1',
  Sentiment: 'Positive',
  Impact: 'High',
  Sentiment_Explanation: 'Earnings exceeded consensus.',
  validationStatus: 'Verified',
  validationIssues: [],
};

describe('Spreadsheet Export & Formula Injection Sanitization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('neutralizes formula injection payloads starting with =, +, -, @, tab, or CR', () => {
    expect(sanitizeSpreadsheetCell('=HYPERLINK("http://evil.com","x")')).toBe(
      '\'=HYPERLINK("http://evil.com","x")'
    );
    expect(sanitizeSpreadsheetCell("+cmd|'/C calc'!A0")).toBe("'+cmd|'/C calc'!A0");
    expect(sanitizeSpreadsheetCell('-1+1')).toBe("'-1+1");
    expect(sanitizeSpreadsheetCell('@SUM(1+1)')).toBe("'@SUM(1+1)");
    expect(sanitizeSpreadsheetCell('\t=1+1')).toBe("'\t=1+1");
    expect(sanitizeSpreadsheetCell('\r=1+1')).toBe("'\r=1+1");
    expect(sanitizeSpreadsheetCell('Normal headline')).toBe('Normal headline');
  });

  it('sanitizes formula payloads in CSV output', () => {
    const maliciousItem: ValidatedNewsItem = {
      ...baseVerifiedItem,
      Headline: '=HYPERLINK("http://evil.com","x")',
      Sentiment_Explanation: '+1+2',
    };
    const csv = buildSanitizedCsv([maliciousItem]);
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("'+1+2");
  });

  it('calls URL.revokeObjectURL after triggering CSV download', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    exportToCSV([baseVerifiedItem], 'test.csv');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('builds XLSX Detailed Validation Issues sheet from the filtered items only and sanitizes cells', () => {
    const failedItem: ValidatedNewsItem = {
      ...baseVerifiedItem,
      Headline: '=HYPERLINK("http://evil.com","x")',
      Time: '',
      validationStatus: 'Failed',
      validationIssues: ['Time: Time is required'],
    };

    // Pass ONLY the verified filtered subset (excluding failedItem)
    const filteredOnlyWorkbook = buildResearchWorkbook([baseVerifiedItem]);
    const issuesSheetFiltered = filteredOnlyWorkbook.getWorksheet(
      'Detailed Validation Issues'
    );
    expect(issuesSheetFiltered).toBeDefined();
    expect(issuesSheetFiltered!.rowCount).toBe(2); // Header + "No validation issues" row

    // Pass filtered subset containing the failed item with formula payload
    const workbookWithFailed = buildResearchWorkbook([failedItem]);
    const dataSheet = workbookWithFailed.getWorksheet('News Data');
    const issuesSheet = workbookWithFailed.getWorksheet('Detailed Validation Issues');

    expect(dataSheet!.getRow(2).getCell(3).value).toBe(
      '\'=HYPERLINK("http://evil.com","x")'
    );
    expect(issuesSheet!.getRow(2).getCell(4).value).toBe(
      '\'=HYPERLINK("http://evil.com","x")'
    );
    expect(issuesSheet!.getRow(2).getCell(6).value).toBe('Time: Time is required');
  });
});
