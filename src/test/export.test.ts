import { describe, it, expect, vi } from 'vitest';
import { exportToXLSX } from '../lib/export/excel';
import { ValidatedNewsItem } from '../lib/validation';
import * as XLSX from 'xlsx';

vi.mock('xlsx', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe('XLSX Export Functionality', () => {
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
});
