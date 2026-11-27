import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { ValidatedNewsItem } from '../lib/validation';
import { BarChart3, PieChart as PieChartIcon, Activity, ShieldCheck, Layers } from 'lucide-react';
import { cn } from '../lib/utils';

interface AnalyticsDashboardProps {
  items: ValidatedNewsItem[];
}

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: '#10b981',
  Negative: '#f43f5e',
  Neutral: '#64748b',
};

const IMPACT_COLORS: Record<string, string> = {
  High: '#e11d48',
  Medium: '#f59e0b',
  Low: '#64748b',
};

const CATEGORY_COLORS = [
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f97316',
  '#eab308',
  '#8b5cf6',
  '#06b6d4',
  '#94a3b8',
];

const MAX_CATEGORIES = 7;

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ items }) => {
  const [chartScope, setChartScope] = useState<'all' | 'verified'>('all');

  const verifiedItems = useMemo(() => items.filter((i) => i.isVerified), [items]);
  const hasGroundedItems = useMemo(
    () => items.some((i) => i.verificationStatus === 'Verified'),
    [items]
  );
  const hasSchemaValidOnly =
    !hasGroundedItems && items.some((i) => i.verificationStatus === 'Schema-Valid');
  const activeItems = chartScope === 'verified' ? verifiedItems : items;
  const newsData = useMemo(() => activeItems.map((i) => i.data), [activeItems]);

  const sentimentData = useMemo(
    () =>
      [
        {
          name: 'Positive',
          value: newsData.filter((i) => i.Sentiment.toLowerCase() === 'positive').length,
        },
        {
          name: 'Negative',
          value: newsData.filter((i) => i.Sentiment.toLowerCase() === 'negative').length,
        },
        {
          name: 'Neutral',
          value: newsData.filter((i) => i.Sentiment.toLowerCase() === 'neutral').length,
        },
      ].filter((d) => d.value > 0),
    [newsData]
  );

  const impactData = useMemo(
    () =>
      [
        {
          name: 'High',
          value: newsData.filter((i) => i.Impact.toLowerCase() === 'high').length,
        },
        {
          name: 'Medium',
          value: newsData.filter((i) => i.Impact.toLowerCase() === 'medium').length,
        },
        {
          name: 'Low',
          value: newsData.filter((i) => i.Impact.toLowerCase() === 'low').length,
        },
      ].filter((d) => d.value > 0),
    [newsData]
  );

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of newsData) {
      if (!row.Category) continue;
      counts.set(row.Category, (counts.get(row.Category) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    if (sorted.length <= MAX_CATEGORIES) return sorted;

    const top = sorted.slice(0, MAX_CATEGORIES);
    const otherCount = sorted.slice(MAX_CATEGORIES).reduce((acc, item) => acc + item.count, 0);
    return [...top, { name: 'Other', count: otherCount }];
  }, [newsData]);

  return (
    <section aria-label="Research Analytics" className="space-y-4 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium text-slate-500 tabular-nums">
          Visualizing <span className="font-semibold text-slate-800">{activeItems.length}</span> of{' '}
          <span className="font-semibold text-slate-800">{items.length}</span> rows
        </div>

        <div
          role="group"
          aria-label="Chart Verification Filter"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
        >
          <button
            type="button"
            onClick={() => setChartScope('all')}
            aria-pressed={chartScope === 'all'}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 tabular-nums',
              chartScope === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Layers size={12} />
            All Rows ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setChartScope('verified')}
            aria-pressed={chartScope === 'verified'}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 tabular-nums',
              chartScope === 'verified'
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
            {hasSchemaValidOnly
              ? `Schema-Valid Only (${verifiedItems.length})`
              : `Verified Only (${verifiedItems.length})`}
          </button>
        </div>
      </div>

      {activeItems.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center">
          <p className="text-sm font-medium text-slate-600">
            No Verified rows available for analytics in this run.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Switch to All Rows to inspect flagged items or review validation issues below.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sentiment Distribution */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <PieChartIcon size={18} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 tracking-wide">
                Sentiment Breakdown
              </h3>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sentimentData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={SENTIMENT_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)',
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Impact Distribution */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Activity size={18} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 tracking-wide">
                Market Impact
              </h3>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={impactData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {impactData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={IMPACT_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)',
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Distribution */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <BarChart3 size={18} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 tracking-wide">
                Top Categories
              </h3>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    fontSize={11}
                    fontWeight={600}
                    stroke="#64748b"
                  />
                  <ReTooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)',
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {categoryData.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
