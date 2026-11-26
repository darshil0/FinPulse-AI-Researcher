import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { sanitizeCell, exportToCSV, exportToXLSX } from '../lib/export/excel';
import { ValidatedNewsItem } from '../lib/validation';

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe('Formula Injection Sanitizer (src/lib/export/excel.ts)', () => {
  const baseItem: ValidatedNewsItem = {
    id: 'row-1',
    raw: {
      Date: '2025-02-21',
      Time: '12:00',
      Headline: 'Market Update',
      Short_Summary: 'Equities advanced on earnings strength.',
      Primary_Ticker_or_Entity: 'AAPL',
      Region_or_Market: 'US',
      Category: 'Earnings',
      Source_Name: 'Reuters',
      Source_URL: 'https://reuters.com/article/1',
      Sentiment: 'Positive',
      Impact: 'High',
      Sentiment_Explanation: 'Strong earnings beat.',
    },
    data: {
      Date: '2025-02-21',
      Time: '12:00',
      Headline: 'Market Update',
      Short_Summary: 'Equities advanced on earnings strength.',
      Primary_Ticker_or_Entity: 'AAPL',
      Region_or_Market: 'US',
      Category: 'Earnings',
      Source_Name: 'Reuters',
      Source_URL: 'https://reuters.com/article/1',
      Sentiment: 'Positive',
      Impact: 'High',
      Sentiment_Explanation: 'Strong earnings beat.',
    },
    verificationStatus: 'Verified',
    validationIssues: [],
    isVerified: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('neutralizes formula injection payloads starting with =, +, -, @, tab, and carriage return', () => {
    const payloads = [
      '=HYPERLINK("http://evil.com","x")',
      '=1+1',
      '+cmd|\' /C calc\'!A0',
      '-2+3+cmd|\' /C calc\'!A0',
      '@SUM(1+1)*cmd|\' /C calc\'!A0',
      '\t=HYPERLINK("http://evil.com","x")',
      '\r=1+1',
    ];

    for (const payload of payloads) {
      expect(sanitizeCell(payload)).toBe(`'${payload}`);
    }
  });

  it('leaves safe values untouched', () => {
    expect(sanitizeCell('')).toBe('');
    expect(sanitizeCell('2025-02-21')).toBe('2025-02-21');
    expect(sanitizeCell('NVIDIA reports record revenue')).toBe('NVIDIA reports record revenue');
    expect(sanitizeCell('https://example.com/news?a=1&b=2')).toBe(
      'https://example.com/news?a=1&b=2'
    );
  });

  it('applies sanitizeCell to XLSX Research Results and Traceability sheets', () => {
    const injectedItem: ValidatedNewsItem = {
      ...baseItem,
      data: {
        ...baseItem.data,
        Headline: '=HYPERLINK("http://evil.com","x")',
        Short_Summary: '+SUM(1,2)',
        Primary_Ticker_or_Entity: '-TICKER',
        Source_Name: '@EVIL',
      },
      validationIssues: [
        {
          field: 'Headline',
          code: 'FORMULA_TEST',
          message: '=cmd|calc',
          rawValue: '=HYPERLINK("http://evil.com","x")',
        },
      ],
      isVerified: false,
      verificationStatus: 'Needs review',
    };

    exportToXLSX([injectedItem], {
      query: '=HYPERLINK("http://evil.com","x")',
      includeNeedsReview: true,
    });

    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    const [workbook] = (XLSX.writeFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];

    const resultsRows = XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets['Research Results']
    );
    expect(resultsRows[0]['Headline']).toBe('\'=HYPERLINK("http://evil.com","x")');
    expect(resultsRows[0]['Short Summary']).toBe('\'+SUM(1,2)');
    expect(resultsRows[0]['Primary Ticker / Entity']).toBe('\'-TICKER');
    expect(resultsRows[0]['Source Name']).toBe('\'@EVIL');

    const traceRows = XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets['Traceability']
    );
    const queryRow = traceRows.find((r) => r.Property === 'Search Query');
    expect(queryRow?.Value).toBe('\'=HYPERLINK("http://evil.com","x")');
  });

  it('applies sanitizeCell to CSV export output', async () => {
    const injectedItem: ValidatedNewsItem = {
      ...baseItem,
      data: {
        ...baseItem.data,
        Headline: '=HYPERLINK("http://evil.com","x")',
        Primary_Ticker_or_Entity: '@ADMIN',
      },
    };

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn(() => 'blob:mock-csv');
    URL.revokeObjectURL = vi.fn();

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    try {
      exportToCSV([injectedItem], true, 'formula test');
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      const blob = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Blob;
      const csv = await blob.text();
      expect(csv).toContain("'=HYPERLINK(\"\"http://evil.com\"\",\"\"x\"\")");
      expect(csv).toContain("'@ADMIN");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-csv');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    }
  });
});
