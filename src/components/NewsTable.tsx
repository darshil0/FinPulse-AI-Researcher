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
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';

interface NewsTableProps {
  items: ValidatedNewsItem[];
  sortConfig: SortConfig;
  onSort: (key: keyof NewsItem) => void;
  statusFilter: 'all' | 'verified' | 'review';
  setStatusFilter: (filter: 'all' | 'verified' | 'review') => void;
}

function isSafeHttpUrl(url?: string): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
}

const VerificationBadge: React.FC<{
  isVerified: boolean;
  verificationStatus?: ValidatedNewsItem['verificationStatus'];
  isGrounded?: boolean;
  issuesCount: number;
}> = ({ isVerified, verificationStatus, isGrounded, issuesCount }) => {
  if (!isVerified || verificationStatus === 'Needs review') {
    return (
      <span
        aria-label="Status: Needs Review"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap tabular-nums"
      >
        <AlertTriangle size={12} className="text-amber-600" />
        Needs review ({issuesCount})
      </span>
    );
  }

  if (verificationStatus === 'Schema-Valid' || isGrounded === false) {
    return (
      <span
        aria-label="Status: Schema-Valid"
        title="Passed schema, calendar, and range checks; source domain was not corroborated against grounding sources"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 whitespace-nowrap"
      >
        <ShieldCheck size={12} className="text-sky-600" />
        Schema-Valid
      </span>
    );
  }

  return (
    <span
      aria-label="Status: Verified"
      title="Passed schema, calendar, range, and grounding source domain verification"
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"
    >
      <ShieldCheck size={12} className="text-emerald-600" />
      Verified
    </span>
  );
};

const SentimentBadge: React.FC<{
  sentiment: string;
  explanation?: string;
  onToggleExpand: () => void;
  isExpanded: boolean;
}> = ({ sentiment, explanation, onToggleExpand, isExpanded }) => {
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

  const renderSentimentText = () => {
    if (s === 'positive') {
      return (
        <span className="flex items-center gap-1 text-emerald-600 font-medium">
          <TrendingUp size={14} /> Positive
        </span>
      );
    }
    if (s === 'negative') {
      return (
        <span className="flex items-center gap-1 text-rose-600 font-medium">
          <TrendingDown size={14} /> Negative
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-slate-600 font-medium">
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
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={`Sentiment ${sentiment || 'Neutral'} — toggle explanation`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        className={`cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
          isHovered || isExpanded ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-100'
        }`}
      >
        {renderSentimentText()}
        <Info
          size={12}
          className={`${
            isHovered || isExpanded ? 'text-indigo-500' : 'text-slate-400'
          } transition-colors`}
        />
      </button>

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
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              className="w-72 p-4 bg-slate-900 text-white text-xs rounded-xl shadow-2xl border border-slate-700 relative"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1 bg-indigo-500/20 rounded text-indigo-400">
                  <Info size={12} />
                </div>
                <span className="font-semibold text-indigo-300 text-[11px]">
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

const ImpactBadge: React.FC<{ impact: string }> = ({ impact }) => {
  const i = impact.toLowerCase();
  const colors = {
    high: 'bg-rose-50 text-rose-700 border-rose-200',
    medium: 'bg-amber-50 text-amber-800 border-amber-200',
    low: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  const style = colors[i as keyof typeof colors] || colors.low;

  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${style}`}>
      {impact || 'N/A'}
    </span>
  );
};

interface HeaderCellProps {
  label: string;
  sortKey: keyof NewsItem;
  sortConfig: SortConfig;
  onSort: (key: keyof NewsItem) => void;
}

const HeaderCell: React.FC<HeaderCellProps> = ({ label, sortKey, sortConfig, onSort }) => {
  const isActive = sortConfig.key === sortKey;
  const ariaSort = isActive
    ? sortConfig.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  return (
    <th
      aria-sort={ariaSort}
      className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded px-1 -ml-1"
      >
        {label}
        <span
          className={cn(
            'transition-opacity',
            isActive ? 'opacity-100 text-indigo-600' : 'opacity-0 group-hover:opacity-50'
          )}
        >
          {isActive && sortConfig.direction === 'desc' ? (
            <ArrowDown size={12} />
          ) : (
            <ArrowUp size={12} />
          )}
        </span>
      </button>
    </th>
  );
};

const NewsRow: React.FC<{ item: ValidatedNewsItem; idx: number }> = ({ item, idx }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const data = item.data;

  const toggleExpanded = () => setIsExpanded((prev) => !prev);
  const cappedDelay = prefersReducedMotion ? 0 : Math.min(idx * 0.015, 0.25);

  return (
    <>
      <motion.tr
        initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, delay: cappedDelay }}
        onClick={toggleExpanded}
        className={cn(
          'hover:bg-slate-50/80 transition-colors group cursor-pointer',
          isExpanded ? 'bg-slate-50/80' : '',
          !item.isVerified ? 'bg-amber-50/30 hover:bg-amber-50/60' : ''
        )}
      >
        <td className="px-4 py-3.5 whitespace-nowrap">
          <VerificationBadge
            isVerified={item.isVerified}
            verificationStatus={item.verificationStatus}
            isGrounded={item.isGrounded}
            issuesCount={item.validationIssues.length}
          />
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <div className="text-sm font-mono tabular-nums text-slate-900">{data.Date}</div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">{data.Time}</div>
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <div className="text-xs font-bold text-slate-800">{data.Primary_Ticker_or_Entity}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{data.Region_or_Market}</div>
        </td>
        <td className="px-4 py-3.5 min-w-[280px]">
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded();
            }}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded block w-full"
          >
            <div className="text-sm font-semibold text-slate-900 leading-snug mb-1 group-hover:text-indigo-700 transition-colors">
              {data.Headline}
            </div>
            <div className="text-xs text-slate-500 leading-relaxed line-clamp-2">
              {data.Short_Summary}
            </div>
          </button>
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <span className="text-xs font-medium text-slate-600">{data.Category}</span>
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <SentimentBadge
              sentiment={data.Sentiment}
              explanation={data.Sentiment_Explanation}
              isExpanded={isExpanded}
              onToggleExpand={toggleExpanded}
            />
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse row details' : 'Expand row details'}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded();
              }}
              className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <ImpactBadge impact={data.Impact} />
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          {isSafeHttpUrl(data.Source_URL) ? (
            <a
              href={data.Source_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
            >
              {data.Source_Name || 'Source'}
              <ExternalLink size={12} />
            </a>
          ) : (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              {data.Source_Name || 'N/A'} (No URL)
            </span>
          )}
        </td>
      </motion.tr>

      <AnimatePresence>
        {isExpanded && (
          <tr>
            <td colSpan={8} className="px-4 py-0 border-none bg-slate-50/70">
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="p-4 my-3 bg-white border border-slate-200 rounded-xl space-y-4">
                  {item.validationIssues.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5 text-amber-800 text-xs">
                        <AlertTriangle size={14} /> Validation & Verification Issues Found
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 pl-1">
                        {item.validationIssues.map((issue, idx) => (
                          <li key={idx}>
                            <span className="font-semibold">{issue.field}</span> [{issue.code}]:{' '}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                      <Info size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <h4 className="text-xs font-semibold text-indigo-700">
                          Sentiment Analysis Reasoning
                        </h4>
                        <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                          Row ID: {item.id}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {data.Sentiment_Explanation ||
                          'No detailed analysis available for this item.'}
                      </p>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400">Impact:</span>{' '}
                          <span className="font-semibold text-slate-800">{data.Impact}</span>
                        </div>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <div>
                          <span className="text-slate-400">Region:</span>{' '}
                          <span className="font-semibold text-slate-800">
                            {data.Region_or_Market}
                          </span>
                        </div>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <div>
                          <span className="text-slate-400">Source:</span>{' '}
                          <span className="font-semibold text-slate-800">{data.Source_Name}</span>
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
  const hasGroundedItems = items.some(
    (i) => i.isVerified && i.verificationStatus !== 'Schema-Valid' && i.isGrounded !== false
  );
  const hasSchemaValidOnly =
    !hasGroundedItems &&
    items.some((i) => i.isVerified && (i.verificationStatus === 'Schema-Valid' || i.isGrounded === false));

  const filteredByStatus = items.filter((item) => {
    if (statusFilter === 'verified') return item.isVerified;
    if (statusFilter === 'review') return !item.isVerified;
    return true;
  });

  return (
    <div className="w-full space-y-3">
      {/* Status Filter Tab Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200">
        <div role="tablist" aria-label="Verification status filter" className="flex items-center gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap tabular-nums',
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Filter size={12} />
            All Rows ({items.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'verified'}
            onClick={() => setStatusFilter('verified')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap tabular-nums',
              statusFilter === 'verified'
                ? hasSchemaValidOnly
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <ShieldCheck
              size={12}
              className={hasSchemaValidOnly ? 'text-sky-600' : 'text-emerald-600'}
            />
            {hasSchemaValidOnly ? `Schema-Valid Only (${verifiedCount})` : `Verified Only (${verifiedCount})`}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'review'}
            onClick={() => setStatusFilter('review')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap tabular-nums',
              statusFilter === 'review'
                ? 'bg-white text-amber-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <AlertTriangle size={12} className="text-amber-600" />
            Needs Review ({reviewCount})
          </button>
        </div>

        <div className="text-xs font-medium text-slate-500 px-2 tabular-nums">
          {statusFilter === 'verified' &&
            (hasSchemaValidOnly
              ? 'Showing schema-valid results only'
              : 'Showing strictly verified results only')}
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
        <div className="w-full overflow-hidden border border-slate-200 rounded-xl bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">
                    Status
                  </th>
                  <HeaderCell label="Date/Time" sortKey="Date" sortConfig={sortConfig} onSort={onSort} />
                  <HeaderCell
                    label="Entity"
                    sortKey="Primary_Ticker_or_Entity"
                    sortConfig={sortConfig}
                    onSort={onSort}
                  />
                  <HeaderCell label="Headline" sortKey="Headline" sortConfig={sortConfig} onSort={onSort} />
                  <HeaderCell label="Category" sortKey="Category" sortConfig={sortConfig} onSort={onSort} />
                  <HeaderCell label="Sentiment" sortKey="Sentiment" sortConfig={sortConfig} onSort={onSort} />
                  <HeaderCell label="Impact" sortKey="Impact" sortConfig={sortConfig} onSort={onSort} />
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">
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
