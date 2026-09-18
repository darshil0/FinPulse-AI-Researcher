import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Search,
  Database,
  Terminal,
  ExternalLink,
} from 'lucide-react';
import { ValidatedNewsItem, ValidationSummary, ResearchRunStatus } from '../lib/validation';
import { GroundingSource } from '../services/geminiService';
import { cn } from '../lib/utils';

interface TraceabilityPanelProps {
  runId: string;
  query: string;
  startDate?: string;
  endDate?: string;
  timestamp: number;
  status: ResearchRunStatus;
  modelName: string;
  rawResponse: string;
  groundingSources: GroundingSource[];
  items: ValidatedNewsItem[];
  summary: ValidationSummary;
  onClose?: () => void;
}

export const TraceabilityPanel: React.FC<TraceabilityPanelProps> = ({
  runId,
  query,
  startDate,
  endDate,
  timestamp,
  status,
  modelName,
  rawResponse,
  groundingSources,
  items,
  summary,
  onClose,
}) => {
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showRawDetails, setShowRawDetails] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const formattedSummaryText = JSON.stringify(
    {
      runId,
      query,
      timestamp: new Date(timestamp).toISOString(),
      status,
      modelName,
      summary,
      validationIssues: items.flatMap((i) =>
        i.validationIssues.map((issue) => ({
          rowId: i.id,
          entity: i.data.Primary_Ticker_or_Entity,
          field: issue.field,
          code: issue.code,
          message: issue.message,
          rawValue: issue.rawValue,
        }))
      ),
    },
    null,
    2
  );

  return (
    <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 border border-slate-800 shadow-2xl space-y-6 my-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Terminal size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-wide">
                Traceability & Audit Chain
              </h3>
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                ID: {runId.substring(0, 8)}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Complete provenance pipeline from raw LLM output to UI presentation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => copyToClipboard(formattedSummaryText, setCopiedSummary)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-lg transition-colors border border-slate-700"
          >
            {copiedSummary ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copiedSummary ? 'Copied Audit JSON' : 'Copy Audit Summary'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Pipeline Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Step 1: Input */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <Search size={14} /> 1. Query Context
          </div>
          <div className="text-sm font-semibold text-white line-clamp-2">{query}</div>
          <div className="text-[11px] text-slate-400 font-mono space-y-0.5">
            <div>
              Date Range:{' '}
              <span className="text-slate-200">
                {startDate || 'Earliest'} to {endDate || 'Now'}
              </span>
            </div>
            <div>
              Run Time: <span className="text-slate-200">{new Date(timestamp).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Step 2: Extraction */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <FileText size={14} /> 2. Model Extraction
          </div>
          <div className="text-sm font-semibold text-white">{modelName}</div>
          <div className="text-[11px] text-slate-400 font-mono space-y-0.5">
            <div>
              Grounding Sources: <span className="text-slate-200">{groundingSources.length} found</span>
            </div>
            <div>
              Raw Size: <span className="text-slate-200">{rawResponse.length} chars</span>
            </div>
          </div>
        </div>

        {/* Step 3: Validation */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck size={14} /> 3. Schema Validation
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-emerald-400">{summary.verifiedRows} Verified</span>
            {summary.needsReviewRows > 0 && (
              <span className="text-sm font-semibold text-amber-400">
                {summary.needsReviewRows} Review
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-mono space-y-0.5">
            <div>
              Total Parsed: <span className="text-slate-200">{summary.totalRows}</span>
            </div>
            <div>
              Parse Errors: <span className="text-slate-200">{summary.parseErrors.length}</span>
            </div>
          </div>
        </div>

        {/* Step 4: Storage & Output */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <Database size={14} /> 4. Persisted State
          </div>
          <div className="text-sm font-semibold text-white capitalize">{status.replace('_', ' ')}</div>
          <div className="text-[11px] text-slate-400 font-mono space-y-0.5">
            <div>IndexedDB: Saved</div>
            <div>Export Ready: CSV & XLSX</div>
          </div>
        </div>
      </div>

      {/* Grounding Search Sources */}
      {groundingSources.length > 0 && (
        <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
            <ExternalLink size={14} className="text-indigo-400" />
            Grounding Search Sources ({groundingSources.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {groundingSources.map((src, idx) => (
              <a
                key={idx}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-indigo-300 rounded-md border border-slate-700 transition-colors"
              >
                {src.title || src.url}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Per-Row Validation Breakdown */}
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
          <span>Row Verification Breakdown ({items.length} total)</span>
          <span className="text-[10px] text-slate-500 font-mono normal-case">
            Click row to view raw payload & issues
          </span>
        </h4>

        {items.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No extracted rows available for validation.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1 font-mono text-xs">
            {items.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setSelectedRowId(selectedRowId === item.id ? null : item.id)}
                className={cn(
                  'p-2.5 rounded-lg border cursor-pointer transition-colors',
                  item.isVerified
                    ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    : 'bg-amber-950/20 border-amber-900/50 hover:border-amber-700/60'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-950 text-emerald-400 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-800">
                        <ShieldCheck size={12} /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-950 text-amber-400 rounded text-[10px] font-bold uppercase tracking-wider border border-amber-800">
                        <AlertTriangle size={12} /> Needs review
                      </span>
                    )}
                    <span className="font-semibold text-slate-200">
                      Row #{idx + 1}: {item.data.Primary_Ticker_or_Entity || 'Unknown'}
                    </span>
                    <span className="text-slate-400 truncate max-w-xs">{item.data.Headline}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    {item.validationIssues.length > 0 ? (
                      <span className="text-amber-400">{item.validationIssues.length} issue(s)</span>
                    ) : (
                      <span className="text-emerald-400">0 issues</span>
                    )}
                    {selectedRowId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>

                {selectedRowId === item.id && (
                  <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-slate-300">
                    {item.validationIssues.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase text-amber-400 mb-1">
                          Validation Issues:
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-amber-200 text-[11px]">
                          {item.validationIssues.map((issue, i) => (
                            <li key={i}>
                              <span className="font-semibold">{issue.field}</span> [{issue.code}]:{' '}
                              {issue.message}{' '}
                              {issue.rawValue !== undefined && (
                                <span className="text-slate-400">(Raw: "{issue.rawValue}")</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Raw Field Object:
                      </div>
                      <pre className="p-2 bg-slate-950 text-[10px] text-indigo-300 rounded overflow-x-auto">
                        {JSON.stringify(item.raw, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw Response Text Collapsible */}
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
          <button
            onClick={() => setShowRawDetails(!showRawDetails)}
            className="flex items-center gap-2 hover:text-indigo-400 transition-colors"
          >
            <Terminal size={14} className="text-indigo-400" />
            Raw Gemini LLM Response Text ({rawResponse.length} chars)
            {showRawDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={() => copyToClipboard(rawResponse, setCopiedRaw)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-sans font-medium text-slate-300 rounded border border-slate-700 flex items-center gap-1"
          >
            {copiedRaw ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
            {copiedRaw ? 'Copied' : 'Copy Raw Text'}
          </button>
        </div>

        {showRawDetails && (
          <pre className="mt-3 p-3 bg-slate-950 text-[11px] font-mono text-slate-300 rounded-lg overflow-x-auto max-h-60 border border-slate-800">
            {rawResponse || '(Empty response body)'}
          </pre>
        )}
      </div>
    </div>
  );
};
