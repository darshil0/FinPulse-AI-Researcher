import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToXLSX, exportToCSV, sanitizeCell } from '../lib/export/excel';
import { ValidatedNewsItem } from '../lib/validation';
import * as XLSX from 'xlsx';

vi.mock('xlsx', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe('Export & Formula Injection Protection', () => {
  const sampleItems: ValidatedNewsItem[] = [
    {
      id: 'row-1',
      raw: {} as any,
      data: {
        Date: '2025-02-21',
        Time: '12:00',
        Headline: 'NVIDIA announces new AI GPU',
        Short_Summary: 'NVIDIA launched its latest GPU generation boosting data center speeds.',
        Primary_Ticker_or_Entity: 'NVDA',
        Region_or_Market: 'US',
        Category: 'Earnings',
        Source_Name: 'Bloomberg',
        Source_URL: 'https://bloomberg.com/news/nvda',
        Sentiment: 'Positive',
        Impact: 'High',
        Sentiment_Explanation: 'Major product launch drives revenue growth.',
      },
      verificationStatus: 'Verified',
      validationIssues: [],
      isVerified: true,
    },
    {
      id: 'row-2',
      raw: {} as any,
      data: {
        Date: '2025-02-21',
        Time: '12:30',
        Headline: 'Rumor on startup acquisition',
        Short_Summary: 'Unconfirmed reports suggest acquisition talks.',
        Primary_Ticker_or_Entity: 'START',
        Region_or_Market: 'US',
        Category: 'M&A',
        Source_Name: 'Blog',
        Source_URL: 'N/A',
        Sentiment: 'Neutral',
        Impact: 'Low',
        Sentiment_Explanation: 'Unverified rumor.',
      },
      verificationStatus: 'Needs review',
      validationIssues: [
        {
          field: 'Source_URL',
          code: 'MISSING_SOURCE_URL',
          message: 'Source URL is missing or set to N/A',
          rawValue: 'N/A',
        },
      ],
      isVerified: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('neutralizes formula injection characters (=, +, -, @, tab, CR) with a leading quote', () => {
    expect(sanitizeCell('=HYPERLINK("http://evil.com","x")')).toBe(
      '\'=HYPERLINK("http://evil.com","x")'
    );
    expect(sanitizeCell('+cmd|/C calc!A0')).toBe('\'+cmd|/C calc!A0');
    expect(sanitizeCell('-1+1')).toBe('\'-1+1');
    expect(sanitizeCell('@SUM(1,2)')).toBe('\'@SUM(1,2)');
    expect(sanitizeCell('\t=1+1')).toBe('\'\t=1+1');
    expect(sanitizeCell('\r=1+1')).toBe('\'\r=1+1');
    expect(sanitizeCell('Safe headline')).toBe('Safe headline');
    expect(sanitizeCell('')).toBe('');
  });

  it('generates an XLSX workbook with Research Results and Traceability sheets', () => {
    exportToXLSX(sampleItems, {
      query: 'NVIDIA news',
      includeNeedsReview: true,
    });

    expect(XLSX.writeFile).toHaveBeenCalled();
    const [workbook, filename] = (XLSX.writeFile as any).mock.calls[0];

    expect(workbook.SheetNames).toContain('Research Results');
    expect(workbook.SheetNames).toContain('Traceability');
    expect(filename).toContain('finpulse_nvidia_news_');
  });

  it('sanitizes formula payloads in both Research Results and Traceability sheets of XLSX output', () => {
    const maliciousItems: ValidatedNewsItem[] = [
      {
        ...sampleItems[0],
        data: {
          ...sampleItems[0].data,
          Headline: '=HYPERLINK("http://evil.com","x")',
          Primary_Ticker_or_Entity: '+TICKER',
          Source_Name: '@EVIL',
          Short_Summary: '-danger summary',
        },
      },
    ];

    exportToXLSX(maliciousItems, {
      query: '=cmd|calc',
      includeNeedsReview: true,
    });

    const [workbook] = (XLSX.writeFile as any).mock.calls[0];
    const resultsSheet = workbook.Sheets['Research Results'];
    const resultRows = XLSX.utils.sheet_to_json<Record<string, string>>(resultsSheet);

    expect(resultRows[0]['Headline']).toBe('\'=HYPERLINK("http://evil.com","x")');
    expect(resultRows[0]['Primary Ticker / Entity']).toBe('\'+TICKER');
    expect(resultRows[0]['Source Name']).toBe('\'@EVIL');
    expect(resultRows[0]['Short Summary']).toBe('\'-danger summary');

    const traceSheet = workbook.Sheets['Traceability'];
    const traceRows = XLSX.utils.sheet_to_json<Record<string, string>>(traceSheet);
    const queryRow = traceRows.find((r) => r.Property === 'Search Query');
    expect(queryRow?.Value).toBe('\'=cmd|calc');
  });

  it('sanitizes formula payloads in CSV output and revokes the object URL', async () => {
    const maliciousItems: ValidatedNewsItem[] = [
      {
        ...sampleItems[0],
        data: {
          ...sampleItems[0].data,
          Headline: '=HYPERLINK("http://evil.com","x")',
          Source_Name: '@EvilSource',
        },
      },
    ];

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
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
      exportToCSV(maliciousItems, true, 'test');
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg = (URL.createObjectURL as any).mock.calls[0][0] as Blob;
      const csvText = await blobArg.text();
      // JSDOM Blob.text() strips or decodes leading UTF-8 BOM, so verify raw bytes for EF BB BF
      const rawBytes = new Uint8Array(await blobArg.arrayBuffer());
      expect(Array.from(rawBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      expect(csvText).toContain("'=HYPERLINK(\"\"http://evil.com\"\",\"\"x\"\")");
      expect(csvText).toContain("'@EvilSource");
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    }
  });
});
