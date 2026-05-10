import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Download, Loader2, BarChart3, Globe2, Clock, Terminal, History as HistoryIcon, Bookmark, Trash2, Filter } from 'lucide-react';
import { researchFinancialNews } from './services/geminiService';
import { NewsTable } from './components/NewsTable';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { NewsItem, SortConfig, ResearchHistoryItem } from './types';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { cn } from './lib/utils';

export default function App() {
  const [query, setQuery] = useState('Get all legit financial news about global tech markets');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'Date', direction: 'desc' });
  const [history, setHistory] = useState<ResearchHistoryItem[]>(() => {
    const saved = localStorage.getItem('finpulse_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    localStorage.setItem('finpulse_history', JSON.stringify(history));
  }, [history]);

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setError('Start date cannot be after end date.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await researchFinancialNews(query, startDate, endDate);
      setResults(data);
      
      // Save to history
      const newHistoryItem: ResearchHistoryItem = {
        id: crypto.randomUUID(),
        query,
        timestamp: Date.now(),
        startDate,
        endDate,
        itemCount: data.length
      };
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 10)); // Keep last 10
    } catch (err) {
      console.error(err);
      setError('Failed to fetch financial news. Please check your API key and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onSort = useCallback((key: keyof NewsItem) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const sortedResults = useMemo(() => {
    if (!results || !sortConfig.key) return results;

    return [...results].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, sortConfig]);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('finpulse_history');
  };

  const runHistoryQuery = (item: ResearchHistoryItem) => {
    setQuery(item.query);
    setStartDate(item.startDate || '');
    setEndDate(item.endDate || '');
    setShowHistory(false);
    // Trigger search manually by calling handleResearch or similar logic
    // For simplicity, we just set the values and let the user click search
  };

  const downloadCSV = () => {
    if (!results) return;
    const csv = Papa.unparse(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `finpulse_research_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                "p-2 rounded-lg transition-colors relative",
                showHistory ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-100 text-slate-500"
              )}
              title="Recent Research"
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
                    <HistoryIcon size={16} /> Recent Research
                  </h3>
                  <button onClick={clearHistory} className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1">
                    <Trash2 size={12} /> Clear History
                  </button>
                </div>
                
                {history.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No recent searches found.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {history.map(item => (
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
                          <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{item.itemCount} results</span>
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
              Institutional-grade financial research, <span className="text-indigo-600 italic">automated.</span>
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Extract credible news, sentiment, and market impact data from across the web into structured formats ready for analysis.
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
              <label htmlFor="startDate" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
              <input 
                type="date" 
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`px-3 py-1.5 bg-white border ${startDate ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-slate-200'} rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-500 transition-colors`}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="endDate" className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Date</label>
              <input 
                type="date" 
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`px-3 py-1.5 bg-white border ${endDate ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-slate-200'} rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-500 transition-colors`}
              />
            </div>
            {(startDate || endDate) && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                  <Clock size={10} /> Historical Mode
                </span>
                <button 
                  type="button"
                  onClick={() => { setStartDate(''); setEndDate(''); }}
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
                onClick={() => setQuery(`Get all legit financial news about ${tag}`)}
                className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors whitespace-nowrap"
              >
                {tag}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Results Section */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-medium mb-8"
            >
              {error}
            </motion.div>
          )}

          {results && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Research Summary</h3>
                  <p className="text-sm text-slate-500">{results.length} credible items extracted • Sorted by {sortConfig.key}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={downloadCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm active:scale-95"
                  >
                    <Download size={16} />
                    Export to Excel (CSV)
                  </button>
                </div>
              </div>

              <AnalyticsDashboard items={results} />
              
              <div className="pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <Filter size={16} className="text-slate-400" />
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Detailed Data Grid</h4>
                </div>
                <NewsTable 
                  items={sortedResults || []} 
                  sortConfig={sortConfig}
                  onSort={onSort}
                />
              </div>
            </motion.div>
          )}

          {isLoading && !results && (
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
                {isLoading && (startDate || endDate) 
                  ? `Researching from ${startDate || 'earliest'} to ${endDate || 'now'}...`
                  : 'Agent is researching...'}
              </h3>
              <p className="text-slate-500 max-w-sm">
                Scanning credible financial sources, deduplicating stories, and performing sentiment analysis.
              </p>
            </motion.div>
          )}

          {!isLoading && !results && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white/50"
            >
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-6">
                <Terminal size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Ready for Research</h3>
              <p className="text-slate-500 max-w-sm">
                Enter a query above to start the AI agent. It will search the web for the latest financial news and provide a structured analysis.
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
            <span className="text-xs font-medium uppercase tracking-widest">FinPulse AI Researcher v1.0</span>
          </div>
          <div className="text-xs text-slate-400">
            Powered by Gemini 3 Flash & Google Search Grounding
          </div>
        </div>
      </footer>
    </div>
  );
}
