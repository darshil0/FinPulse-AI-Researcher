import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import App from '../App';
import * as geminiService from '../services/geminiService';
import * as exportLib from '../lib/export/excel';
import { clearAllResearchRuns, getAllResearchRuns } from '../lib/storage/db';
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

describe('App Orchestration, Provenance & Export Integration', () => {
  const verifiedRow: ValidatedNewsItem = {
    id: 'row-v1',
    raw: { Headline: 'Verified Story' },
    data: {
      Date: '2025-02-21',
      Time: '14:00',
      Headline: 'Verified Story',
      Short_Summary: 'Strong earnings beat estimates.',
      Primary_Ticker_or_Entity: 'NVDA',
      Region_or_Market: 'US',
      Category: 'Earnings',
      Source_Name: 'Reuters',
      Source_URL: 'https://reuters.com/nvda',
      Sentiment: 'Positive',
      Impact: 'High',
      Sentiment_Explanation: 'Strong revenue growth.',
    },
    verificationStatus: 'Verified',
    validationIssues: [],
    isVerified: true,
  };

  const reviewRow: ValidatedNewsItem = {
    id: 'row-r1',
    raw: { Headline: 'Flagged Story' },
    data: {
      Date: '2025-02-21',
      Time: '',
      Headline: 'Flagged Story',
      Short_Summary: 'Missing publication time.',
      Primary_Ticker_or_Entity: 'AMD',
      Region_or_Market: 'US',
      Category: 'Other',
      Source_Name: 'Reuters',
      Source_URL: 'https://reuters.com/amd',
      Sentiment: 'Neutral',
      Impact: 'Low',
      Sentiment_Explanation: 'Limited detail.',
    },
    verificationStatus: 'Needs review',
    validationIssues: [
      { field: 'Time', code: 'MISSING_REQUIRED_FIELD', message: 'Time is required', rawValue: '' },
    ],
    isVerified: false,
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    await clearAllResearchRuns();
  });

  it('shows Invalid Date Range alert without Retry button and skips history on invalid dates', async () => {
    const spy = vi.spyOn(geminiService, 'researchFinancialNews');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Start Date'), {
      target: { value: '2025-02-20' },
    });
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2025-02-10' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    expect(await screen.findByText('Invalid Date Range')).toBeDefined();
    expect(screen.getByText(/Start date cannot be after end date/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Retry Research/i })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(await getAllResearchRuns()).toHaveLength(0);
  });

  it('skips saving failed network_error runs to research history', async () => {
    vi.spyOn(geminiService, 'researchFinancialNews').mockResolvedValue({
      status: 'network_error',
      errorCode: 'NETWORK_FAILURE',
      errorMessage: 'Upstream unavailable',
      rawResponse: '',
      groundingSources: [],
      items: [],
      summary: {
        totalRows: 0,
        verifiedRows: 0,
        needsReviewRows: 0,
        hasParseErrors: false,
        parseErrors: [],
      },
      modelName: 'gemini-3-flash-preview',
      timestamp: Date.now(),
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    expect(await screen.findByText('Research Service Connection Failure')).toBeDefined();
    expect(screen.getByRole('button', { name: /Retry Research/i })).toBeDefined();
    expect(await getAllResearchRuns()).toHaveLength(0);
  });

  it('renders TraceabilityPanel directly from unparseable_model_output state', async () => {
    vi.spyOn(geminiService, 'researchFinancialNews').mockResolvedValue({
      status: 'unparseable_model_output',
      errorCode: 'UNPARSEABLE_OUTPUT',
      errorMessage: 'No CSV header found',
      rawResponse: 'Plain prose response from model',
      groundingSources: [{ title: 'Reuters', url: 'https://reuters.com/news' }],
      items: [],
      summary: {
        totalRows: 0,
        verifiedRows: 0,
        needsReviewRows: 0,
        hasParseErrors: true,
        parseErrors: ['Missing header'],
      },
      modelName: 'gemini-3-flash-preview',
      timestamp: Date.now(),
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    const auditBtn = await screen.findByRole('button', {
      name: /View Raw Output in Traceability Audit/i,
    });
    fireEvent.click(auditBtn);

    expect(await screen.findByText(/Traceability & Audit Chain/i)).toBeDefined();
    expect(screen.getByText('unparseable model output')).toBeDefined();
  });

  it('freezes active run query on exports & traceability even after editing form input, and syncs exports to active status filter', async () => {
    vi.spyOn(geminiService, 'researchFinancialNews').mockResolvedValue({
      status: 'partial_success',
      rawResponse: 'csv',
      groundingSources: [],
      items: [verifiedRow, reviewRow],
      summary: {
        totalRows: 2,
        verifiedRows: 1,
        needsReviewRows: 1,
        hasParseErrors: false,
        parseErrors: [],
      },
      modelName: 'gemini-3-flash-preview',
      timestamp: Date.now(),
    });
    const xlsxSpy = vi.spyOn(exportLib, 'exportToXLSX').mockImplementation(() => {});
    const csvSpy = vi.spyOn(exportLib, 'exportToCSV').mockImplementation(() => {});

    render(<App />);
    const queryInput = screen.getByLabelText('Financial research query');
    const startDateInput = screen.getByLabelText('Start Date');
    const endDateInput = screen.getByLabelText('End Date');

    fireEvent.change(queryInput, { target: { value: 'Frozen NVDA Query' } });
    fireEvent.change(startDateInput, { target: { value: '2025-02-10' } });
    fireEvent.change(endDateInput, { target: { value: '2025-02-21' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    await screen.findByText('Research Results');

    // Mutate live form inputs AFTER completion
    fireEvent.change(queryInput, { target: { value: 'Unrelated Edited Query' } });
    fireEvent.change(startDateInput, { target: { value: '2025-01-01' } });
    fireEvent.change(endDateInput, { target: { value: '2025-01-15' } });

    // Switch table status filter to Verified Only (exports should now only pass verified item)
    fireEvent.click(screen.getByRole('tab', { name: /Verified Only \(1\)/i }));

    fireEvent.click(screen.getByRole('button', { name: /Export XLSX \(1\)/i }));
    expect(xlsxSpy).toHaveBeenCalledWith(
      [verifiedRow],
      expect.objectContaining({
        query: 'Frozen NVDA Query',
        startDate: '2025-02-10',
        endDate: '2025-02-21',
        includeNeedsReview: false,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /Export CSV \(1\)/i }));
    expect(csvSpy).toHaveBeenCalledWith([verifiedRow], false, 'Frozen NVDA Query');

    // Traceability drawer displays frozen query and date range, not edited inputs
    fireEvent.click(screen.getByRole('button', { name: /Traceability Audit/i }));
    await waitFor(() => {
      expect(screen.getByText('Frozen NVDA Query')).toBeDefined();
      expect(screen.getByText('2025-02-10 to 2025-02-21')).toBeDefined();
    });
    expect(screen.queryByText('Unrelated Edited Query')).toBeNull();
    expect(screen.queryByText('2025-01-01 to 2025-01-15')).toBeNull();

    // Persisted StoredResearchRun in IndexedDB preserves immutable run parameters
    const storedRuns = await getAllResearchRuns();
    expect(storedRuns).toHaveLength(1);
    expect(storedRuns[0]).toMatchObject({
      query: 'Frozen NVDA Query',
      startDate: '2025-02-10',
      endDate: '2025-02-21',
    });
  });

  it('uses Schema-Valid instead of Verified across App UI when rows only meet syntactic requirements', async () => {
    const schemaValidRow: ValidatedNewsItem = {
      ...verifiedRow,
      id: 'row-sv1',
      verificationStatus: 'Schema-Valid',
      isVerified: true,
      isGrounded: false,
    };

    vi.spyOn(geminiService, 'researchFinancialNews').mockResolvedValue({
      status: 'success',
      rawResponse: 'csv',
      groundingSources: [],
      items: [schemaValidRow],
      summary: {
        totalRows: 1,
        verifiedRows: 1,
        needsReviewRows: 0,
        hasParseErrors: false,
        parseErrors: [],
      },
      modelName: 'gemini-3-flash-preview',
      timestamp: Date.now(),
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText('Financial research query'), {
      target: { value: 'Syntax Only Check' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Run Agent/i }));

    await screen.findByText('Research Results');

    expect(screen.getByText('1 Schema-Valid')).toBeDefined();
    expect(screen.getByText('Interactive Schema-Valid Data Grid')).toBeDefined();
    expect(screen.getByLabelText('Status: Schema-Valid')).toBeDefined();
    expect(screen.getByRole('tab', { name: /Schema-Valid Only \(1\)/i })).toBeDefined();
    expect(screen.queryByLabelText('Status: Verified')).toBeNull();
  });
});
