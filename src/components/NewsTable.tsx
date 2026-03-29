import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { NewsItem } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';

interface NewsTableProps {
  items: NewsItem[];
}

const SentimentBadge = ({ 
  sentiment, 
  explanation, 
  onToggleExpand, 
  isExpanded 
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
        left: rect.left + rect.width / 2
      });
    }
  }, [isHovered]);

  const s = sentiment.toLowerCase();
  
  const getBadge = () => {
    if (s === 'positive') return <span className="flex items-center gap-1 text-emerald-600 font-medium"><TrendingUp size={14} /> Positive</span>;
    if (s === 'negative') return <span className="flex items-center gap-1 text-rose-600 font-medium"><TrendingDown size={14} /> Negative</span>;
    return <span className="flex items-center gap-1 text-slate-500 font-medium"><Minus size={14} /> Neutral</span>;
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
      <div className={`cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-200 ${isHovered || isExpanded ? 'bg-indigo-50 ring-1 ring-indigo-100' : ''}`}>
        {getBadge()}
        <Info size={12} className={`${isHovered || isExpanded ? 'text-indigo-500' : 'text-slate-300'} transition-colors`} />
      </div>

      <AnimatePresence>
        {isHovered && !isExpanded && explanation && (
          <div 
            className="fixed z-[9999] pointer-events-none" 
            style={{ 
              top: coords.top - 12, 
              left: coords.left, 
              transform: 'translate(-50%, -100%)' 
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
                <span className="font-bold text-indigo-300 uppercase tracking-widest text-[9px]">Sentiment Logic</span>
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
    low: 'bg-slate-100 text-slate-700 border-slate-200'
  };
  const style = colors[i as keyof typeof colors] || colors.low;
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${style}`}>
      {impact}
    </span>
  );
};

const NewsRow: React.FC<{ item: NewsItem; idx: number }> = ({ item, idx }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <motion.tr 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.05 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${isExpanded ? 'bg-slate-50/80' : ''}`}
      >
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="text-sm font-mono text-slate-900">{item.Date}</div>
          <div className="text-xs text-slate-500 font-mono">{item.Time}</div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-700 border border-slate-200">
            {item.Primary_Ticker_or_Entity}
          </span>
          <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">{item.Region_or_Market}</div>
        </td>
        <td className="px-4 py-4 min-w-[300px]">
          <div className="text-sm font-semibold text-slate-900 leading-tight mb-1">{item.Headline}</div>
          <div className="text-xs text-slate-500 leading-relaxed line-clamp-2 italic">{item.Short_Summary}</div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <span className="text-xs font-medium text-slate-600">{item.Category}</span>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <SentimentBadge 
              sentiment={item.Sentiment} 
              explanation={item.Sentiment_Explanation}
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded(!isExpanded)}
            />
            <div className="text-slate-300 group-hover:text-indigo-400 transition-colors">
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <ImpactBadge impact={item.Impact} />
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <a 
            href={item.Source_URL} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium group-hover:underline"
          >
            {item.Source_Name}
            <ExternalLink size={12} />
          </a>
        </td>
      </motion.tr>
      <AnimatePresence>
        {isExpanded && (
          <tr>
            <td colSpan={7} className="px-4 py-0 border-none bg-indigo-50/30">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="py-6 px-4 border-l-4 border-indigo-500 ml-2 my-3 bg-white rounded-r-lg shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                      <Info size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-[0.2em]">Sentiment Analysis Reasoning</h4>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {idx + 1}</span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed font-medium">
                        {item.Sentiment_Explanation || "No detailed analysis available for this item."}
                      </p>
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Market Impact</span>
                          <span className="text-xs font-semibold text-slate-700">{item.Impact}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Region</span>
                          <span className="text-xs font-semibold text-slate-700">{item.Region_or_Market}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Source</span>
                          <span className="text-xs font-semibold text-slate-700">{item.Source_Name}</span>
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

export const NewsTable: React.FC<NewsTableProps> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50/50">
        <p className="text-slate-500 font-medium">No news items found for this query.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden border border-slate-200 rounded-xl bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-bottom border-slate-200">
              <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date/Time</th>
              <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Entity</th>
              <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Headline & Summary</th>
              <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sentiment</th>
              <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Impact</th>
              <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <NewsRow key={idx} item={item} idx={idx} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
