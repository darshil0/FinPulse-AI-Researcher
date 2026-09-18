import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Download,
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
import { researchFinancialNews, ResearchResult } from './services/geminiService';
import { NewsTable } from './components/NewsTable';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { TraceabilityPanel } from './components/TraceabilityPanel';
import { SortConfig, NewsItem } from './types';
import { ValidatedNewsItem } from './lib/validation';
import {
  saveResearchRun,
  getAllResearchRuns,
  clearAllResearchRuns,
  StoredResearchRun,
} from './lib/storage/db';
import { exportToXLSX, exportToCSV } from './lib/export/excel';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

export default function App() {
  const [query, setQuery] = useState('Get all legit financial news about global tech markets');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Active Research Result State
  const [currentResult, setCurrentResult] = useState<ResearchResult | null>(null);
  const [runId, setRunId] = useState<string>('');

  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'review'>('all');
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
    if (!searchQuery.trim()) return;

    if (sDate && eDate && new Date(sDate) > new Date(eDate)) {
      setCurrentResult({
        status: 'network_error',
        errorCode: 'INVALID_RESPONSE_STRUCTURE',
        errorMessage: 'Start date cannot be after end date.',
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
      return;
    }

    setIsLoading(true);
    setCurrentResult(null);

    const newRunId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setRunId(newRunId);

    try {
      const result = await researchFinancialNews(searchQuery, sDate, eDate);
      setCurrentResult(result);

      // Save to IndexedDB
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
      const updatedHistory = await getAllResearchRuns();
      setHistory(updatedHistory);
    } catch (err: any) {
      console.error(err);
      setCurrentResult({
        status: 'network_error',
        errorCode: 'NETWORK_FAILURE',
        errorMessage:
          err.message ||
          'Failed to fetch financial news. Please check your network or API key and try again.',
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
    } finally {
      setIsLoading(false);
    }
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

    return [...filteredItems].sort((a, b) => {
      const aValue = a.data[sortConfig.key!] || '';
      const bValue = b.data[sortConfig.key!] || '';

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortConfig]);

  const handleClearHistory = async () => {
    await clearAllResearchRuns();
    setHistory([]);
  };

  const runHistoryQuery = (item: StoredResearchRun) => {
    const sDate = item.startDate || '';
    const eDate = item.endDate || '';
    setQuery(item.query);
    setStartDate(sDate);
    setEndDate(eDate);
    setShowHistory(false);

    // If historical run has saved items, restore result directly or re-run
    if (item.items && item.items.length > 0) {
      setRunId(item.id);
      setCurrentResult({
        status: item.status,
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

  const handleExportXLSX = (includeNeedsReview = true) => {
    if (!currentResult || !currentResult.items) return;
    exportToXLSX(currentResult.items, {
      includeNeedsReview,
      query,
      startDate,
      endDate,
      status: currentResult.status,
      modelName: currentResult.modelName,
      groundingSources: currentResult.groundingSources,
      summary: currentResult.summary,
    });
  };

  const handleExportCSV = (includeNeedsReview = true) => {
    if (!currentResult || !currentResult.items) return;
    exportToCSV(currentResult.items, includeNeedsReview, query);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <BarChart3 size={18} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              FinPulse <span className="text-indigo-600">AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-500 uppercase tracking-widest">
              <div className="flex items-center gap-1.5">
                <Globe2 size={14} /> Global Coverage
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={14} /> Real-time
              </div>
            </div>

            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                'p-2 rounded-lg transition-colors relative',
                showHistory ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
              )}
              title="Recent Research History"
              aria-label="Recent Research History"
            >
              <HistoryIcon size={20} />
              {history.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full border-2 border-white"></span>
              )}
            </button>
          </div>
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
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <HistoryIcon size={16} /> Recent Research (IndexedDB)
                  </h3>
                  <button
                    onClick={handleClearHistory}
                    className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1"
                  >
                    <Trash2 size={12} /> Clear History
                  </button>
                </div>

                {history.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No recent searches found in history.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => runHistoryQuery(item)}
                        className="bg-white p-3 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer group shadow-sm"
                      >
                        <div className="text-xs font-semibold text-slate-700 line-clamp-1 mb-1 group-hover:text-indigo-600">
                          {item.query}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>{new Date(item.timestamp).toLocaleString()}</span>
                          <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 font-mono">
                            {item.summary?.verifiedRows ?? item.items?.length ?? 0} verified
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              Institutional-grade financial research,{' '}
              <span className="text-indigo-600 italic">verified & traceable.</span>
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Extract financial news, sentiment, and market impact with strict schema validation, source verification, and end-to-end auditability.
            </p>
          </motion.div>
        </div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-12"
        >
          <form onSubmit={handleResearch} className="relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              <Search size={20} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Get all legit financial news about US semiconductor stocks..."
              className="w-full pl-12 pr-32 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="absolute right-2 top-2 bottom-2 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
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
                className="text-xs font-bold text-slate-500 uppercase tracking-wider"
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
                className="text-xs font-bold text-slate-500 uppercase tracking-wider"
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
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                  <Clock size={10} /> Historical Mode
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-xs font-medium text-slate-400 hover:text-rose-500 transition-colors flex items-center gap-1"
                >
                  Clear Range
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['US Tech Earnings', 'Crypto Regulation', 'Macro Outlook', 'M&A Deals'].map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  const q = `Get all legit financial news about ${tag}`;
                  setQuery(q);
                  performResearch(q, startDate, endDate);
                }}
                className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors whitespace-nowrap"
              >
                {tag}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Active Research Result States */}
        <AnimatePresence mode="wait">
          {/* Network or API Error State */}
          {currentResult && currentResult.status === 'network_error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 mb-8 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-rose-900">
                    Research Service Connection Failure
                  </h4>
                  <p className="text-sm text-rose-700 mt-1">
                    {currentResult.errorMessage ||
                      'Failed to execute research query. Please check your network or API quota.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => performResearch(query, startDate, endDate)}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs transition-colors active:scale-95 shadow-sm"
                >
                  <RotateCcw size={14} /> Retry Research
                </button>
              </div>
            </motion.div>
          )}

          {/* Model Returned Unparseable Output State */}
          {currentResult && currentResult.status === 'unparseable_model_output' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 mb-8 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-amber-950">
                    Model Returned Unparseable Output
                  </h4>
                  <p className="text-sm text-amber-800 mt-1">
                    The AI response did not conform to expected structural CSV requirements. The raw response is preserved below for traceability.
                  </p>
                </div>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => setShowTraceability(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl font-semibold text-xs transition-colors"
                >
                  <Terminal size={14} /> View Raw Output in Traceability Audit
                </button>
              </div>
            </motion.div>
          )}

          {/* No Results Found State */}
          {currentResult && currentResult.status === 'no_results' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-8 bg-white border border-slate-200 rounded-2xl text-center mb-8 space-y-3"
            >
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 mx-auto">
                <Search size={24} />
              </div>
              <h4 className="text-lg font-bold text-slate-900">No Research Findings Returned</h4>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                The research completed successfully, but yielded no usable news items matching your criteria. Try broadening your query terms or date range.
              </p>
            </motion.div>
          )}

          {/* Success / Partial Success Result View */}
          {currentResult &&
            (currentResult.status === 'success' ||
              currentResult.status === 'partial_success') && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                {/* Result Header & Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900">Research Results</h3>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck size={12} />
                        {currentResult.summary.verifiedRows} Verified
                      </span>
                      {currentResult.summary.needsReviewRows > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertTriangle size={12} />
                          {currentResult.summary.needsReviewRows} Needs Review
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {currentResult.summary.totalRows} items parsed • Sorted by {sortConfig.key}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setShowTraceability(!showTraceability)}
                      className={cn(
                        'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border',
                        showTraceability
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900'
                      )}
                    >
                      <Terminal size={14} />
                      {showTraceability ? 'Hide Traceability' : 'Traceability Audit'}
                    </button>

                    <button
                      onClick={() => handleExportXLSX(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm active:scale-95"
                      title="Export native Excel workbook with auto-filters & traceability sheet"
                    >
                      <FileSpreadsheet size={14} />
                      Export XLSX
                    </button>

                    <button
                      onClick={() => handleExportCSV(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm active:scale-95"
                    >
                      <FileText size={14} />
                      Export CSV
                    </button>

                    <button
                      onClick={() => {
                        setCurrentResult(null);
                        setFilterText('');
                      }}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                      title="Clear results"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Traceability Audit Panel Drawer */}
                <AnimatePresence>
                  {showTraceability && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <TraceabilityPanel
                        runId={runId}
                        query={query}
                        startDate={startDate}
                        endDate={endDate}
                        timestamp={currentResult.timestamp}
                        status={currentResult.status}
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

                <AnalyticsDashboard items={currentResult.items} />

                <div className="pt-2 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Filter size={16} className="text-slate-400" />
                      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                        Interactive Verified Data Grid
                      </h4>
                    </div>
                    <div className="relative max-w-xs w-full">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                        <Search size={14} />
                      </div>
                      <input
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
              </motion.div>
            )}

          {/* Loading State */}
          {isLoading && !currentResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
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
                Scanning credible financial sources, running Zod schema validation, and verifying source integrity.
              </p>
            </motion.div>
          )}

          {/* Default Ready State */}
          {!isLoading && !currentResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white/50"
            >
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-6">
                <Terminal size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Ready for Verification & Research</h3>
              <p className="text-slate-500 max-w-sm">
                Enter a financial query above to start the agent. All model outputs are strictly validated and traceable.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 py-8 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <BarChart3 size={16} />
            <span className="text-xs font-medium uppercase tracking-widest">
              FinPulse AI Researcher v1.3.0
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Powered by Gemini 3 Flash & Google Search Grounding with Strict Runtime Verification
          </div>
        </div>
      </footer>
    </div>
  );
}
