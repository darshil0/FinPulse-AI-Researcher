import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NewsTable } from '../components/NewsTable';
import { TraceabilityPanel } from '../components/TraceabilityPanel';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import { ValidatedNewsItem } from '../lib/validation';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 250 }}>{children}</div>
    ),
  };
});

describe('UI Verification, Analytics & Traceability Components', () => {
  const sampleItems: ValidatedNewsItem[] = [
    {
      id: 'row-1',
      raw: {} as Record<string, unknown>,
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
      raw: {} as Record<string, unknown>,
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

  it('renders Verified and Needs review badges and exposes aria-sort on sortable headers', () => {
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

    const dateHeader = screen.getByRole('columnheader', { name: /Date\/Time/i });
    expect(dateHeader.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(screen.getByRole('button', { name: /Impact/i }));
    expect(handleSort).toHaveBeenCalledWith('Impact');
  });

  it('allows expanding row to inspect validation reasons via keyboard button', () => {
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

  it('renders TraceabilityPanel with full underscore formatting, safe grounding links, and persistence state', () => {
    render(
      <TraceabilityPanel
        runId="run-1764000000000-abcde"
        query="Tech Market Trends"
        startDate="2025-02-01"
        endDate="2025-02-21"
        timestamp={Date.now()}
        status="unparseable_model_output"
        persistenceState="not_saved"
        modelName="gemini-3-flash-preview"
        rawResponse="Raw response content"
        groundingSources={[
          { title: 'Safe Source', url: 'https://reuters.com/tech' },
          { title: 'Unsafe Source', url: 'javascript:alert(1)' },
        ]}
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
    expect(screen.getByText('unparseable model output')).toBeDefined();
    expect(screen.getByText(/Not saved \(session only\)/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /Safe Source/i })).toBeDefined();
    expect(screen.queryByRole('link', { name: /Unsafe Source/i })).toBeNull();
    expect(screen.getByText(/ID: run-17…-abcde/)).toBeDefined();
  });

  it('toggles AnalyticsDashboard between All Rows and Verified Only and shows empty state when none verified', () => {
    render(<AnalyticsDashboard items={sampleItems} />);

    expect(screen.getByRole('button', { name: /All Rows \(2\)/i })).toBeDefined();
    const verifiedBtn = screen.getByRole('button', { name: /Verified Only \(1\)/i });
    fireEvent.click(verifiedBtn);
    expect(verifiedBtn.getAttribute('aria-pressed')).toBe('true');

    // Render with zero verified items
    render(<AnalyticsDashboard items={[sampleItems[1]]} />);
    fireEvent.click(screen.getByRole('button', { name: /Verified Only \(0\)/i }));
    expect(
      screen.getByText(/No Verified rows available for analytics in this run/i)
    ).toBeDefined();
  });
});
