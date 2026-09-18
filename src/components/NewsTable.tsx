import React, { useState, useRef, useEffect } from 'react';
import {
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Info,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { NewsItem, SortConfig } from '../types';
import { ValidatedNewsItem } from '../lib/validation';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface NewsTableProps {
  items: ValidatedNewsItem[];
  sortConfig: SortConfig;
  onSort: (key: keyof NewsItem) => void;
  statusFilter: 'all' | 'verified' | 'review';
  setStatusFilter: (filter: 'all' | 'verified' | 'review') => void;
}

const VerificationBadge = ({
  isVerified,
  issuesCount,
}: {
  isVerified: boolean;
  issuesCount: number;
}) => {
  if (isVerified) {
    return (
      <span
        aria-label="Status: Verified"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
      >
        <ShieldCheck size={12} className="text-emerald-600 dark:text-emerald-400" />
        Verified
      </span>
    );
  }

  return (
    <span
      aria-label="Status: Needs Review"
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
    >
      <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
      Needs review ({issuesCount})
    </span>
  );
};

const SentimentBadge = ({
  sentiment,
  explanation,
  onToggleExpand,
  isExpanded,
}: {
  sentiment: string;
  explanation?: string;
  onToggleExpand: () => void;
  isExpanded: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isHovered && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left + rect.width / 2,
      });
    }
  }, [isHovered]);

  const s = sentiment.toLowerCase();

  const getBadge = () => {
    if (s === 'positive')
      return (
        <span className="flex items-center gap-1 text-emerald-600 font-medium">
          <TrendingUp size={14} /> Positive
        </span>
      );
    if (s === 'negative')
      return (
        <span className="flex items-center gap-1 text-rose-600 font-medium">
          <TrendingDown size={14} /> Negative
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-slate-500 font-medium">
        <Minus size={14} /> Neutral
      </span>
    );
  };

  return (
    <div
      ref={badgeRef}
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onToggleExpand();
      }}
    >
      <div
        className={`cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-200 ${
          isHovered || isExpanded ? 'bg-indigo-50 ring-1 ring-indigo-100' : ''
        }`}
      >
        {getBadge()}
        <Info
          size={12}
          className={`${
            isHovered || isExpanded ? 'text-indigo-500' : 'text-slate-300'
          } transition-colors`}
        />
      </div>

      <AnimatePresence>
        {isHovered && !isExpanded && explanation && (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              top: coords.top - 12,
              left: coords.left,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="w-72 p-4 bg-slate-900 text-white text-xs rounded-xl shadow-2xl border border-slate-700 relative"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1 bg-indigo-500/20 rounded text-indigo-400">
                  <Info size={12} />
                </div>
                <span className="font-bold text-indigo-300 uppercase tracking-widest text-[9px]">
                  Sentiment Logic
                </span>
              </div>
              <p className="leading-relaxed text-slate-200 font-normal">{explanation}</p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ImpactBadge = ({ impact }: { impact: string }) => {
  const i = impact.toLowerCase();
  const colors = {
    high: 'bg-rose-100 text-rose-700 border-rose-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  const style = colors[i as keyof typeof colors] || colors.low;

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${style}`}
    >
      {impact}
    </span>
  );
};

const NewsRow: React.FC<{ item: ValidatedNewsItem; idx: number }> = ({ item, idx }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const data = item.data;

  return (
    <>
      <motion.tr
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.03 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'hover:bg-slate-50/80 transition-colors group cursor-pointer',
          isExpanded ? 'bg-slate-50/80' : '',
          !item.isVerified ? 'bg-amber-50/30 hover:bg-amber-50/60' : ''
        )}
      >
        <td className="px-4 py-4 whitespace-nowrap">
          <VerificationBadge
            isVerified={item.isVerified}
            issuesCount={item.validationIssues.length}
          />
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="text-sm font-mono text-slate-900">{data.Date}</div>
          <div className="text-xs text-slate-500 font-mono">{data.Time}</div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-700 border border-slate-200">
            {data.Primary_Ticker_or_Entity}
          </span>
          <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">
            {data.Region_or_Market}
          </div>
        </td>
        <td className="px-4 py-4 min-w-[280px]">
          <div className="text-sm font-semibold text-slate-900 leading-tight mb-1">
            {data.Headline}
          </div>
          <div className="text-xs text-slate-500 leading-relaxed line-clamp-2 italic">
            {data.Short_Summary}
          </div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <span className="text-xs font-medium text-slate-600">{data.Category}</span>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <SentimentBadge
              sentiment={data.Sentiment}
              explanation={data.Sentiment_Explanation}
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded(!isExpanded)}
            />
            <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <ImpactBadge impact={data.Impact} />
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          {data.Source_URL && data.Source_URL.startsWith('http') ? (
            <a
              href={data.Source_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium group-hover:underline"
            >
              {data.Source_Name || 'Source'}
              <ExternalLink size={12} />
            </a>
          ) : (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              {data.Source_Name || 'N/A'} (No URL)
            </span>
          )}
        </td>
      </motion.tr>

      <AnimatePresence>
        {isExpanded && (
          <tr>
            <td colSpan={8} className="px-4 py-0 border-none bg-indigo-50/20">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="py-5 px-4 border-l-4 border-indigo-500 ml-2 my-3 bg-white rounded-r-lg shadow-sm space-y-4">
                  {/* Validation Issues Warning Box if any */}
                  {item.validationIssues.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-800 uppercase tracking-wider text-[10px]">
                        <AlertTriangle size={14} /> Validation & Verification Issues Found:
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 pl-1">
                        {item.validationIssues.map((issue, idx) => (
                          <li key={idx}>
                            <span className="font-semibold">{issue.field}</span>: {issue.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                      <Info size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-[0.2em]">
                          Sentiment Analysis Reasoning
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Row ID: {item.id}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed font-medium">
                        {data.Sentiment_Explanation ||
                          'No detailed analysis available for this item.'}
                      </p>
                      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">
                            Market Impact
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {data.Impact}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">
                            Region
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {data.Region_or_Market}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">
                            Source
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {data.Source_Name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
};

export const NewsTable: React.FC<NewsTableProps> = ({
  items,
  sortConfig,
  onSort,
  statusFilter,
  setStatusFilter,
}) => {
  const verifiedCount = items.filter((i) => i.isVerified).length;
  const reviewCount = items.length - verifiedCount;

  const filteredByStatus = items.filter((item) => {
    if (statusFilter === 'verified') return item.isVerified;
    if (statusFilter === 'review') return !item.isVerified;
    return true;
  });

  const HeaderCell = ({
    label,
    sortKey,
  }: {
    label: string;
    sortKey: keyof NewsItem;
  }) => (
    <th
      className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span
          className={cn(
            'transition-opacity',
            sortConfig.key === sortKey ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'
          )}
        >
          {sortConfig.key === sortKey && sortConfig.direction === 'desc' ? (
            <ArrowDown size={10} />
          ) : (
            <ArrowUp size={10} />
          )}
        </span>
      </div>
    </th>
  );

  return (
    <div className="w-full space-y-3">
      {/* Status Filter Tab Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Filter size={12} />
            All Rows ({items.length})
          </button>
          <button
            onClick={() => setStatusFilter('verified')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
              statusFilter === 'verified'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <ShieldCheck size={12} className="text-emerald-600" />
            Verified Only ({verifiedCount})
          </button>
          <button
            onClick={() => setStatusFilter('review')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
              statusFilter === 'review'
                ? 'bg-white text-amber-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <AlertTriangle size={12} className="text-amber-600" />
            Needs Review ({reviewCount})
          </button>
        </div>

        <div className="text-[11px] font-medium text-slate-500 px-2">
          {statusFilter === 'verified' && 'Showing strictly verified results only'}
          {statusFilter === 'review' && 'Showing rows flagged for review'}
          {statusFilter === 'all' && 'Showing all extracted rows'}
        </div>
      </div>

      {filteredByStatus.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50/50">
          <p className="text-slate-500 font-medium">
            No rows match the current status filter ({statusFilter}).
          </p>
        </div>
      ) : (
        <div className="w-full overflow-hidden border border-slate-200 rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <HeaderCell label="Date/Time" sortKey="Date" />
                  <HeaderCell label="Entity" sortKey="Primary_Ticker_or_Entity" />
                  <HeaderCell label="Headline" sortKey="Headline" />
                  <HeaderCell label="Category" sortKey="Category" />
                  <HeaderCell label="Sentiment" sortKey="Sentiment" />
                  <HeaderCell label="Impact" sortKey="Impact" />
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredByStatus.map((item, idx) => (
                  <NewsRow key={item.id || idx} item={item} idx={idx} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
