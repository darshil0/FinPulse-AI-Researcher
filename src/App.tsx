import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Loader2,
  BarChart3,
  Globe2,
  Clock,
  Terminal,
  History as HistoryIcon,
  Trash2,
  Filter,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  RotateCcw,
} from 'lucide-react';
import {
  researchFinancialNews,
  ResearchResult,
  GEMINI_CONFIG,
} from './services/geminiService';
import { NewsTable } from './components/NewsTable';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { TraceabilityPanel, PersistenceState } from './components/TraceabilityPanel';
import { SortConfig, NewsItem } from './types';
import { ValidatedNewsItem } from './lib/validation';
import {
  saveResearchRun,
  getAllResearchRuns,
  clearAllResearchRuns,
  deleteResearchRun,
  StoredResearchRun,
} from './lib/storage/db';
import { exportToXLSX, exportToCSV } from './lib/export/excel';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

const IMPACT_ORDER: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function getDateTimestamp(item: ValidatedNewsItem): number {
  const datePart = item.data.Date || '';
  const timePart = item.data.Time && /^\d{2}:\d{2}$/.test(item.data.Time) ? item.data.Time : '00:00';
  const ms = Date.parse(`${datePart}T${timePart}:00Z`);
  return Number.isNaN(ms) ? 0 : ms;
}

function getTodayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function App() {
  const [query, setQuery] = useState('Get all legit financial news about global tech markets');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  // Active Research Result State (immutable provenance stored on result)
  const [currentResult, setCurrentResult] = useState<ResearchResult | null>(null);
  const [runId, setRunId] = useState<string>('');
  const [persistenceState, setPersistenceState] = useState<PersistenceState>('saved');

  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'review'>('all');
  const [includeNeedsReviewInExport, setIncludeNeedsReviewInExport] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'Date', direction: 'desc' });

  // History from IndexedDB
  const [history, setHistory] = useState<StoredResearchRun[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTraceability, setShowTraceability] = useState(false);

  // Load history asynchronously from IndexedDB
  useEffect(() => {
    getAllResearchRuns().then((runs) => {
      setHistory(runs);
    });
  }, []);

  const performResearch = async (searchQuery: string, sDate: string, eDate: string) => {
    if (isLoading || !searchQuery.trim()) return;

    const today = getTodayIsoLocal();
    if (sDate && sDate > today) {
      setShowTraceability(false);
      setPersistenceState('not_saved');
      setCurrentResult({
        status: 'network_error',
        errorCode: 'INVALID_DATE_RANGE',
        errorMessage: 'Start date cannot be in the future.',
        query: searchQuery,
        startDate: sDate,
        endDate: eDate,
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
        modelName: GEMINI_CONFIG.MODEL_NAME,
        timestamp: Date.now(),
      });
      return;
    }

    if (sDate && eDate && new Date(sDate) > new Date(eDate)) {
      setShowTraceability(false);
      setPersistenceState('not_saved');
      setCurrentResult({
        status: 'network_error',
        errorCode: 'INVALID_DATE_RANGE',
        errorMessage: 'Start date cannot be after end date.',
        query: searchQuery,
        startDate: sDate,
        endDate: eDate,
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
        modelName: GEMINI_CONFIG.MODEL_NAME,
        timestamp: Date.now(),
      });
      return;
    }

    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setCurrentResult(null);
    setShowTraceability(false);
    setFilterText('');
    setStatusFilter('all');

    const newRunId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setRunId(newRunId);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await researchFinancialNews(searchQuery, sDate, eDate, controller.signal);
      if (seq !== requestSeqRef.current) return;

      const frozenResult: ResearchResult = {
        ...result,
        query: searchQuery,
        startDate: sDate,
        endDate: eDate,
      };
      setCurrentResult(frozenResult);

      // Skip persisting network / rate-limit errors in research history
      if (result.status !== 'network_error') {
        const runRecord: StoredResearchRun = {
          id: newRunId,
          query: searchQuery,
          timestamp: result.timestamp,
          startDate: sDate,
          endDate: eDate,
          status: result.status,
          rawResponse: result.rawResponse,
          groundingSources: result.groundingSources,
          items: result.items,
          summary: result.summary,
          modelName: result.modelName,
        };

        await saveResearchRun(runRecord);
        if (seq !== requestSeqRef.current) return;
        const updatedHistory = await getAllResearchRuns();
        if (seq !== requestSeqRef.current) return;
        setHistory(updatedHistory);
        setPersistenceState('saved');
      } else {
        setPersistenceState('not_saved');
      }
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Failed to fetch financial news. Please try again.';
      setPersistenceState('not_saved');
      setCurrentResult({
        status: 'network_error',
        errorCode: 'NETWORK_FAILURE',
        errorMessage: message,
        query: searchQuery,
        startDate: sDate,
        endDate: eDate,
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
        modelName: GEMINI_CONFIG.MODEL_NAME,
        timestamp: Date.now(),
      });
    } finally {
      if (seq === requestSeqRef.current) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  };

  const handleCancelResearch = () => {
    abortRef.current?.abort();
  };

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await performResearch(query, startDate, endDate);
  };

  const onSort = useCallback((key: keyof NewsItem) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const filteredItems = useMemo(() => {
    if (!currentResult || !currentResult.items) return [];
    let list = currentResult.items;

    if (filterText.trim()) {
      const search = filterText.toLowerCase();
      list = list.filter(
        (item) =>
          item.data.Headline.toLowerCase().includes(search) ||
          item.data.Primary_Ticker_or_Entity.toLowerCase().includes(search) ||
          item.data.Short_Summary.toLowerCase().includes(search) ||
          item.data.Category.toLowerCase().includes(search)
      );
    }

    return list;
  }, [currentResult, filterText]);

  const sortedItems = useMemo(() => {
    if (!filteredItems || !sortConfig.key) return filteredItems;

    const sortKey = sortConfig.key;
    const multiplier = sortConfig.direction === 'asc' ? 1 : -1;

    return [...filteredItems].sort((a, b) => {
      if (sortKey === 'Impact') {
        const aRank = IMPACT_ORDER[a.data.Impact.toLowerCase()] ?? 0;
        const bRank = IMPACT_ORDER[b.data.Impact.toLowerCase()] ?? 0;
        if (aRank !== bRank) return (aRank - bRank) * multiplier;
      }

      if (sortKey === 'Date') {
        const aTime = getDateTimestamp(a);
        const bTime = getDateTimestamp(b);
        if (aTime !== bTime) return (aTime - bTime) * multiplier;
      }

      const aValue = (a.data[sortKey] || '').toLowerCase();
      const bValue = (b.data[sortKey] || '').toLowerCase();
      return aValue.localeCompare(bValue) * multiplier;
    });
  }, [filteredItems, sortConfig]);

  // Visible table items synchronized with both keyword search & active status tab
  const visibleItemsForExport = useMemo(() => {
    return sortedItems.filter((item) => {
      if (statusFilter === 'verified') return item.isVerified;
      if (statusFilter === 'review') return !item.isVerified;
      return true;
    });
  }, [sortedItems, statusFilter]);

  const effectiveIncludeNeedsReview =
    statusFilter === 'verified' ? false : includeNeedsReviewInExport;

  const exportRowCount = effectiveIncludeNeedsReview
    ? visibleItemsForExport.length
    : visibleItemsForExport.filter((i) => i.isVerified).length;

  const handleClearHistory = async () => {
    await clearAllResearchRuns();
    setHistory([]);
  };

  const handleDeleteHistoryItem = async (id: string) => {
    await deleteResearchRun(id);
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const runHistoryQuery = (item: StoredResearchRun) => {
    if (isLoading) return;
    const sDate = item.startDate || '';
    const eDate = item.endDate || '';
    setQuery(item.query);
    setStartDate(sDate);
    setEndDate(eDate);
    setShowHistory(false);
    setShowTraceability(false);
    setFilterText('');
    setStatusFilter('all');

    if (item.items && item.items.length > 0) {
      setRunId(item.id);
      setPersistenceState('saved');
      setCurrentResult({
        status: item.status,
        query: item.query,
        startDate: sDate,
        endDate: eDate,
        rawResponse: item.rawResponse || '',
        groundingSources: item.groundingSources || [],
        items: item.items,
        summary: item.summary,
        modelName: item.modelName,
        timestamp: item.timestamp,
      });
    } else {
      performResearch(item.query, sDate, eDate);
    }
  };

  const runQuery = currentResult?.query ?? query;
  const runStartDate = currentResult?.startDate ?? '';
  const runEndDate = currentResult?.endDate ?? '';

  const handleExportXLSX = () => {
    if (!currentResult) return;
    exportToXLSX(visibleItemsForExport, {
      includeNeedsReview: effectiveIncludeNeedsReview,
      query: runQuery,
      startDate: runStartDate,
      endDate: runEndDate,
      status: currentResult.status,
      modelName: currentResult.modelName,
      groundingSources: currentResult.groundingSources,
      summary: currentResult.summary,
    });
  };

  const handleExportCSV = () => {
    if (!currentResult) return;
    exportToCSV(visibleItemsForExport, effectiveIncludeNeedsReview, runQuery);
  };

  const canShowTraceability =
    currentResult &&
    (currentResult.status === 'success' ||
      currentResult.status === 'partial_success' ||
      currentResult.status === 'unparseable_model_output' ||
      currentResult.status === 'no_results');

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <BarChart3 size={18} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              FinPulse <span className="text-indigo-600">AI</span>
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Globe2 size={14} /> Global Coverage
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Clock size={14} /> Real-time
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            aria-expanded={showHistory}
            className={cn(
              'px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0',
              showHistory
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'hover:bg-slate-100 text-slate-600 border border-transparent'
            )}
            title="Recent Research History"
            aria-label="Recent Research History"
          >
            <HistoryIcon size={16} />
            <span>History ({history.length})</span>
          </button>
        </div>

        {/* History Panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-slate-50 border-t border-slate-200 overflow-hidden"
            >
              <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <HistoryIcon size={16} /> Recent Research (IndexedDB)
                  </h2>
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    disabled={history.length === 0}
                    className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Clear History
                  </button>
                </div>

                {history.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">
                    No recent searches found in history.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white p-3 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors flex items-start justify-between gap-2"
                      >
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => runHistoryQuery(item)}
                          className="text-left flex-1 min-w-0 group disabled:opacity-50"
                        >
                          <div className="text-xs font-semibold text-slate-800 line-clamp-1 mb-1 group-hover:text-indigo-600">
                            {item.query}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                            <span>{new Date(item.timestamp).toLocaleString()}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-slate-600">
                              {item.summary?.verifiedRows ?? 0}{' '}
                              {!item.items?.some((r) => r.verificationStatus === 'Verified') &&
                              item.items?.some((r) => r.verificationStatus === 'Schema-Valid')
                                ? 'schema-valid'
                                : 'verified'}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistoryItem(item.id)}
                          className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                          title="Delete this entry"
                          aria-label={`Delete history entry: ${item.query}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {/* Hero Section */}
        <div className="mb-10">
          <div className="max-w-3xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-3 text-balance">
              Institutional-grade financial research,{' '}
              <span className="text-indigo-600 italic">verified & traceable.</span>
            </h2>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              Extract financial news, sentiment, and market impact with strict calendar, range, and grounding validation.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-10">
          <form onSubmit={handleResearch} className="relative group">
            <label htmlFor="research-query" className="sr-only">
              Financial research query
            </label>
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              <Search size={20} />
            </div>
            <input
              id="research-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Get all legit financial news about US semiconductor stocks..."
              className="w-full pl-12 pr-36 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="absolute right-2 top-2 bottom-2 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Researching...
                </>
              ) : (
                <>
                  <Terminal size={16} />
                  Run Agent
                </>
              )}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="startDate"
                className="text-xs font-semibold text-slate-600 whitespace-nowrap"
              >
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`px-3 py-1.5 bg-white border ${
                  startDate ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-slate-200'
                } rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-500 transition-colors`}
              />
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="endDate"
                className="text-xs font-semibold text-slate-600 whitespace-nowrap"
              >
                End Date
              </label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`px-3 py-1.5 bg-white border ${
                  endDate ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-slate-200'
                } rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-500 transition-colors`}
              />
            </div>
            {(startDate || endDate) && (
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-indigo-700 font-semibold">
                  <Clock size={12} /> Historical Mode
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="font-medium text-slate-500 hover:text-rose-600 transition-colors"
                >
                  Clear Range
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {['US Tech Earnings', 'Crypto Regulation', 'Macro Outlook', 'M&A Deals'].map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  const q = `Get all legit financial news about ${tag}`;
                  setQuery(q);
                  performResearch(q, startDate, endDate);
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Active Research Result States */}
        <AnimatePresence mode="wait">
          {/* Validation Date Range Error State */}
          {currentResult &&
            currentResult.status === 'network_error' &&
            currentResult.errorCode === 'INVALID_DATE_RANGE' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="alert"
                className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 mb-8 flex items-start gap-3"
              >
                <div className="p-2 bg-amber-100 rounded-lg text-amber-700 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-950">Invalid Date Range</h3>
                  <p className="text-sm text-amber-800 mt-1">
                    {currentResult.errorMessage || 'Please adjust your date filters and try again.'}
                  </p>
                </div>
              </motion.div>
            )}

          {/* Network or API Error State */}
          {currentResult &&
            currentResult.status === 'network_error' &&
            currentResult.errorCode !== 'INVALID_DATE_RANGE' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="alert"
                className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 mb-8 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-rose-100 rounded-lg text-rose-600 shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-rose-900">
                      Research Service Connection Failure
                    </h3>
                    <p className="text-sm text-rose-700 mt-1">
                      {currentResult.errorMessage ||
                        'Failed to execute research query. Please check your network or API quota.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => performResearch(runQuery, runStartDate, runEndDate)}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={14} /> Retry Research
                  </button>
                </div>
              </motion.div>
            )}

          {/* Model Returned Unparseable Output State */}
          {currentResult && currentResult.status === 'unparseable_model_output' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 mb-6 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-700 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-950">
                    Model Returned Unparseable Output
                  </h3>
                  <p className="text-sm text-amber-800 mt-1">
                    The AI response did not conform to expected structural CSV requirements. The raw response is preserved below for traceability.
                  </p>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowTraceability((prev) => !prev)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl font-semibold text-xs transition-colors"
                >
                  <Terminal size={14} />{' '}
                  {showTraceability
                    ? 'Hide Raw Output Audit'
                    : 'View Raw Output in Traceability Audit'}
                </button>
              </div>
            </motion.div>
          )}

          {/* No Results Found State */}
          {currentResult && currentResult.status === 'no_results' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-8 bg-white border border-slate-200 rounded-2xl text-center mb-6 space-y-3"
            >
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 mx-auto">
                <Search size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Research Findings Returned</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                The research completed cleanly, but yielded no news items matching your criteria. Try broadening your query terms or date range.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Traceability Panel Drawer (available across success, partial_success, unparseable, no_results) */}
        <AnimatePresence>
          {canShowTraceability && showTraceability && currentResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <TraceabilityPanel
                runId={runId}
                query={runQuery}
                startDate={runStartDate}
                endDate={runEndDate}
                timestamp={currentResult.timestamp}
                status={currentResult.status}
                persistenceState={persistenceState}
                modelName={currentResult.modelName}
                rawResponse={currentResult.rawResponse}
                groundingSources={currentResult.groundingSources}
                items={currentResult.items}
                summary={currentResult.summary}
                onClose={() => setShowTraceability(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success / Partial Success Result View */}
        {currentResult &&
          (currentResult.status === 'success' ||
            currentResult.status === 'partial_success') && (
            <div className="space-y-6">
              {/* Result Header & Synchronized Export Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-bold text-slate-900">Research Results</h3>
                    {(() => {
                      const schemaValidOnly =
                        !currentResult.items.some((i) => i.verificationStatus === 'Verified') &&
                        currentResult.items.some((i) => i.verificationStatus === 'Schema-Valid');
                      return (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
                            schemaValidOnly ? 'text-sky-700' : 'text-emerald-700'
                          )}
                        >
                          <ShieldCheck size={14} />
                          {currentResult.summary.verifiedRows}{' '}
                          {schemaValidOnly ? 'Schema-Valid' : 'Verified'}
                        </span>
                      );
                    })()}
                    {currentResult.summary.needsReviewRows > 0 && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 tabular-nums">
                          <AlertTriangle size={14} />
                          {currentResult.summary.needsReviewRows} Needs Review
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {currentResult.summary.totalRows} items parsed · Sorted by {sortConfig.key} ({sortConfig.direction})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={effectiveIncludeNeedsReview}
                      disabled={statusFilter === 'verified'}
                      onChange={(e) => setIncludeNeedsReviewInExport(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="whitespace-nowrap">Include Needs Review</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowTraceability(!showTraceability)}
                    className={cn(
                      'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors border whitespace-nowrap',
                      showTraceability
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900'
                    )}
                  >
                    <Terminal size={14} />
                    {showTraceability ? 'Hide Traceability' : 'Traceability Audit'}
                  </button>

                  <button
                    type="button"
                    disabled={exportRowCount === 0}
                    onClick={handleExportXLSX}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-40 tabular-nums"
                    title={`Export ${exportRowCount} filtered row(s) to Excel workbook`}
                  >
                    <FileSpreadsheet size={14} />
                    Export XLSX ({exportRowCount})
                  </button>

                  <button
                    type="button"
                    disabled={exportRowCount === 0}
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-40 tabular-nums"
                    title={`Export ${exportRowCount} filtered row(s) to UTF-8 CSV`}
                  >
                    <FileText size={14} />
                    Export CSV ({exportRowCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentResult(null);
                      setShowTraceability(false);
                      setFilterText('');
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    title="Clear results"
                    aria-label="Clear results"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <AnalyticsDashboard items={currentResult.items} />

              <div className="pt-2 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Filter size={16} className="text-slate-400" />
                    <h4 className="text-sm font-bold text-slate-700">
                      {!currentResult.items.some((i) => i.verificationStatus === 'Verified') &&
                      currentResult.items.some((i) => i.verificationStatus === 'Schema-Valid')
                        ? 'Interactive Schema-Valid Data Grid'
                        : 'Interactive Verified Data Grid'}
                    </h4>
                  </div>
                  <div className="relative max-w-xs w-full">
                    <label htmlFor="table-filter" className="sr-only">
                      Filter results by keyword or ticker
                    </label>
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                      <Search size={14} />
                    </div>
                    <input
                      id="table-filter"
                      type="text"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      placeholder="Filter by keyword or ticker..."
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <NewsTable
                  items={sortedItems}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                />
              </div>
            </div>
          )}

        {/* Loading State */}
        {isLoading && !currentResult && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="relative mb-6">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
                <BarChart3 size={24} />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {startDate || endDate
                ? `Researching news from ${startDate || 'earliest'} to ${endDate || 'now'}...`
                : 'Agent is searching & validating findings...'}
            </h3>
            <p className="text-slate-500 max-w-sm">
              Scanning financial sources, checking calendar & range rules, and verifying grounding alignment.
            </p>
            <button
              type="button"
              onClick={handleCancelResearch}
              className="mt-6 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:text-rose-600 hover:border-rose-200 transition-colors"
            >
              Cancel Research
            </button>
          </div>
        )}

        {/* Default Ready State */}
        {!isLoading && !currentResult && (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white/50">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-6">
              <Terminal size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Ready for Verification & Research
            </h3>
            <p className="text-slate-500 max-w-sm">
              Enter a financial query above to start the agent. All model outputs are strictly validated and traceable.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 py-8 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-500">
            <BarChart3 size={16} />
            <span className="text-xs font-medium">FinPulse AI Researcher v1.5.0</span>
          </div>
          <div className="text-xs text-slate-500">
            Powered by Gemini 3 Flash & Google Search Grounding with Strict Runtime Verification
          </div>
        </div>
      </footer>
    </div>
  );
}
