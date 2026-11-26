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
      "=cmd|' /C calc'!A0",
      "=IMPORTXML(\"http://evil.com\",\"//a\")",
      "+cmd|' /C calc'!A0",
      '+1+1',
      "-2+3+cmd|' /C calc'!A0",
      '-100',
      "@SUM(1+1)*cmd|' /C calc'!A0",
      '\t=HYPERLINK("http://evil.com","x")',
      '\r=1+1',
    ];

    for (const payload of payloads) {
      expect(sanitizeCell(payload)).toBe(`'${payload}`);
    }
  });

  it('leaves safe values and non-leading special characters untouched', () => {
    const safeValues = [
      '',
      '2025-02-21',
      'NVIDIA reports record revenue',
      'E=mc^2 in physics news',
      'https://example.com/news?a=1&b=2&tag=@markets',
      'Revenue rose +15% year-over-year',
    ];

    for (const value of safeValues) {
      expect(sanitizeCell(value)).toBe(value);
    }
  });

  it('sanitizes malicious payloads across XLSX Research Results and Traceability sheets', () => {
    const injectedItem: ValidatedNewsItem = {
      ...baseItem,
      data: {
        ...baseItem.data,
        Headline: '=HYPERLINK("http://evil.com","x")',
        Short_Summary: '+SUM(1,2)',
        Primary_Ticker_or_Entity: '-TICKER',
        Region_or_Market: '\t=1+1',
        Category: '\r=1+1',
        Source_Name: '@EVIL',
        Source_URL: '=WEBSERVICE("http://evil.com")',
        Sentiment_Explanation: '=cmd|calc',
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
      startDate: '+2025-01-01',
      endDate: '-2025-02-01',
      status: '@partial',
      modelName: '\t=model',
      groundingSources: [
        {
          title: '=EVIL_TITLE',
          url: '=HYPERLINK("http://evil.com","src")',
        },
      ],
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
    expect(resultsRows[0]['Region / Market']).toBe("'\t=1+1");
    expect(resultsRows[0]['Category']).toBe("'\r=1+1");
    expect(resultsRows[0]['Source Name']).toBe('\'@EVIL');
    expect(resultsRows[0]['Source URL']).toBe('\'=WEBSERVICE("http://evil.com")');
    expect(resultsRows[0]['Sentiment Explanation']).toBe('\'=cmd|calc');

    const traceRows = XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets['Traceability']
    );
    expect(traceRows.find((r) => r.Property === 'Search Query')?.Value).toBe(
      '\'=HYPERLINK("http://evil.com","x")'
    );
    expect(traceRows.find((r) => r.Property === 'Date Range Start')?.Value).toBe("'+2025-01-01");
    expect(traceRows.find((r) => r.Property === 'Date Range End')?.Value).toBe("'-2025-02-01");
    expect(traceRows.find((r) => r.Property === 'Run Status')?.Value).toBe("'@partial");
    expect(traceRows.find((r) => r.Property === 'AI Model')?.Value).toBe("'\t=model");
    expect(traceRows.find((r) => r.Property === 'Source 1: =EVIL_TITLE')?.Value).toBe(
      '\'=HYPERLINK("http://evil.com","src")'
    );
  });

  it('excludes Needs review rows from XLSX when includeNeedsReview is false', () => {
    const unverifiedItem: ValidatedNewsItem = {
      ...baseItem,
      id: 'row-2',
      data: { ...baseItem.data, Headline: '=HYPERLINK("http://evil.com","x")' },
      validationIssues: [
        {
          field: 'Headline',
          code: 'FORMULA',
          message: 'Blocked',
          rawValue: '=HYPERLINK("http://evil.com","x")',
        },
      ],
      verificationStatus: 'Needs review',
      isVerified: false,
    };

    exportToXLSX([baseItem, unverifiedItem], {
      query: 'safe query',
      includeNeedsReview: false,
    });

    const [workbook] = (XLSX.writeFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const resultsRows = XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets['Research Results']
    );
    expect(resultsRows).toHaveLength(1);
    expect(resultsRows[0]['Headline']).toBe('Market Update');

    const traceRows = XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets['Traceability']
    );
    const issueSummary = traceRows.find((r) => r.Property === 'Validation Issues');
    expect(issueSummary?.Value).toBe('All exported rows passed schema validation.');
  });

  it('sanitizes malicious payloads in CSV export output and revokes object URLs', async () => {
    const injectedItem: ValidatedNewsItem = {
      ...baseItem,
      data: {
        ...baseItem.data,
        Headline: '=HYPERLINK("http://evil.com","x")',
        Primary_Ticker_or_Entity: '@ADMIN',
        Short_Summary: '+cmd|calc',
        Source_Name: '-EvilSource',
      },
      validationIssues: [
        {
          field: 'Source_Name',
          code: 'SUSPECT',
          message: '=SUM(A1:A2)',
          rawValue: '-EvilSource',
        },
      ],
      verificationStatus: 'Needs review',
      isVerified: false,
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
      expect(csv).toContain("'+cmd|calc");
      expect(csv).toContain("'-EvilSource");
      expect(csv).toContain("'=SUM(A1:A2)");
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-csv');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    }
  });
});
