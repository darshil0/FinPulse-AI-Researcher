import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { NewsItem } from '../types';
import { BarChart3, PieChart as PieChartIcon, Activity } from 'lucide-react';

interface AnalyticsDashboardProps {
  items: NewsItem[];
}

const COLORS = ['#10b981', '#f43f5e', '#64748b']; // Emerald, Rose, Slate for Pos, Neg, Neut
const IMPACT_COLORS = ['#e11d48', '#f59e0b', '#64748b']; // Rose-600, Amber-500, Slate-500 for High, Medium, Low
const CATEGORY_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f97316', '#eab308', '#8b5cf6', '#06b6d4'];

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ items }) => {
  // Process Sentiment Data
  const sentimentData = [
    { name: 'Positive', value: items.filter(i => i.Sentiment.toLowerCase() === 'positive').length },
    { name: 'Negative', value: items.filter(i => i.Sentiment.toLowerCase() === 'negative').length },
    { name: 'Neutral', value: items.filter(i => i.Sentiment.toLowerCase() === 'neutral').length },
  ].filter(d => d.value > 0);

  // Process Impact Data
  const impactData = [
    { name: 'High', value: items.filter(i => i.Impact.toLowerCase() === 'high').length },
    { name: 'Medium', value: items.filter(i => i.Impact.toLowerCase() === 'medium').length },
    { name: 'Low', value: items.filter(i => i.Impact.toLowerCase() === 'low').length },
  ].filter(d => d.value > 0);

  // Process Category Data
  const categories = Array.from(new Set(items.map(i => i.Category)));
  const categoryData = categories.map(cat => ({
    name: cat,
    count: items.filter(i => i.Category === cat).length
  })).sort((a, b) => b.count - a.count);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      {/* Sentiment Distribution */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <PieChartIcon size={18} />
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Sentiment Breakdown</h3>
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
                {sentimentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Impact Distribution */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Activity size={18} />
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Market Impact</h3>
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
                {impactData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={IMPACT_COLORS[index % IMPACT_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Distribution */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <BarChart3 size={18} />
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Top Categories</h3>
        </div>

        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={80} 
                fontSize={10} 
                fontWeight={600} 
                stroke="#64748b" 
              />
              <ReTooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
