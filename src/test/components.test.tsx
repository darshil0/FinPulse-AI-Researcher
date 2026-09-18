import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NewsTable } from '../components/NewsTable';
import { TraceabilityPanel } from '../components/TraceabilityPanel';
import { ValidatedNewsItem } from '../lib/validation';

describe('UI Verification & Traceability Components', () => {
  const sampleItems: ValidatedNewsItem[] = [
    {
      id: 'row-1',
      raw: {} as any,
      data: {
        Date: '2025-02-21',
        Time: '12:00',
        Headline: 'Verified Financial News Item',
        Short_Summary: 'A solid financial news summary sentence here.',
        Primary_Ticker_or_Entity: 'MSFT',
        Region_or_Market: 'US',
        Category: 'Earnings',
        Source_Name: 'Reuters',
        Source_URL: 'https://reuters.com/msft',
        Sentiment: 'Positive',
        Impact: 'High',
        Sentiment_Explanation: 'Strong growth.',
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
        Headline: 'Unverified Financial News Item',
        Short_Summary: 'Summary of unverified item.',
        Primary_Ticker_or_Entity: 'UNV',
        Region_or_Market: 'US',
        Category: 'Other',
        Source_Name: 'Unknown',
        Source_URL: 'N/A',
        Sentiment: 'Neutral',
        Impact: 'Low',
        Sentiment_Explanation: 'No clear source.',
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

  it('renders Verified and Needs review badges correctly in NewsTable', () => {
    const handleSort = vi.fn();
    const handleFilter = vi.fn();

    render(
      <NewsTable
        items={sampleItems}
        sortConfig={{ key: 'Date', direction: 'desc' }}
        onSort={handleSort}
        statusFilter="all"
        setStatusFilter={handleFilter}
      />
    );

    expect(screen.getAllByText(/Verified/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Needs review/i).length).toBeGreaterThan(0);
  });

  it('allows expanding row to inspect validation reasons', () => {
    const handleSort = vi.fn();
    const handleFilter = vi.fn();

    render(
      <NewsTable
        items={sampleItems}
        sortConfig={{ key: 'Date', direction: 'desc' }}
        onSort={handleSort}
        statusFilter="all"
        setStatusFilter={handleFilter}
      />
    );

    const unverifiedHeadline = screen.getByText('Unverified Financial News Item');
    fireEvent.click(unverifiedHeadline);

    expect(
      screen.getByText(/Source URL is missing or set to N\/A/i)
    ).toBeDefined();
  });

  it('renders TraceabilityPanel with query context and model extraction details', () => {
    render(
      <TraceabilityPanel
        runId="run-123"
        query="Tech Market Trends"
        timestamp={Date.now()}
        status="success"
        modelName="gemini-3-flash-preview"
        rawResponse="Raw response content"
        groundingSources={[{ title: 'Source 1', url: 'https://example.com' }]}
        items={sampleItems}
        summary={{
          totalRows: 2,
          verifiedRows: 1,
          needsReviewRows: 1,
          hasParseErrors: false,
          parseErrors: [],
        }}
      />
    );

    expect(screen.getByText(/Traceability & Audit Chain/i)).toBeDefined();
    expect(screen.getByText('Tech Market Trends')).toBeDefined();
    expect(screen.getByText('gemini-3-flash-preview')).toBeDefined();
    expect(screen.getByText(/1 Verified/i)).toBeDefined();
  });
});
