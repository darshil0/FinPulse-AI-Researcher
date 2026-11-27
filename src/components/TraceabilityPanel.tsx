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

export type PersistenceState = 'saved' | 'not_saved';

interface TraceabilityPanelProps {
  runId: string;
  query: string;
  startDate?: string;
  endDate?: string;
  timestamp: number;
  status: ResearchRunStatus;
  persistenceState?: PersistenceState;
  modelName: string;
  rawResponse: string;
  groundingSources: GroundingSource[];
  items: ValidatedNewsItem[];
  summary: ValidationSummary;
  onClose?: () => void;
}

function isSafeHttpUrl(url?: string): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatRunId(runId: string): string {
  if (!runId) return 'N/A';
  if (runId.length <= 16) return runId;
  return `${runId.slice(0, 6)}…${runId.slice(-6)}`;
}

export const TraceabilityPanel: React.FC<TraceabilityPanelProps> = ({
  runId,
  query,
  startDate,
  endDate,
  timestamp,
  status,
  persistenceState = 'saved',
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

  const statusLabel = status.replace(/_/g, ' ');
  const persistenceLabel =
    persistenceState === 'saved' ? 'Saved locally (IndexedDB)' : 'Not saved (session only)';

  const formattedSummaryText = JSON.stringify(
    {
      runId,
      query,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date(timestamp).toISOString(),
      status,
      persistenceState,
      modelName,
      summary,
      groundingSources,
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
      rawResponse,
    },
    null,
    2
  );

  return (
    <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 border border-slate-800 shadow-xl space-y-6 my-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Terminal size={22} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-wide">
                Traceability & Audit Chain
              </h3>
              <span
                title={runId}
                className="text-xs font-mono tabular-nums text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700"
              >
                ID: {formatRunId(runId)}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Complete provenance pipeline from raw LLM output to UI presentation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => copyToClipboard(formattedSummaryText, setCopiedSummary)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-lg transition-colors border border-slate-700 whitespace-nowrap"
          >
            {copiedSummary ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copiedSummary ? 'Copied Audit JSON' : 'Copy Audit Summary'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors whitespace-nowrap"
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
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
            <Search size={14} /> 1. Query Context
          </div>
          <div className="text-sm font-semibold text-white line-clamp-2">{query}</div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums space-y-0.5">
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
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
            <FileText size={14} /> 2. Model Extraction
          </div>
          <div className="text-sm font-semibold text-white">{modelName}</div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums space-y-0.5">
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
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
            <ShieldCheck size={14} /> 3. Schema Validation
          </div>
          <div className="flex items-center gap-2 tabular-nums">
            <span
              className={cn(
                'text-sm font-semibold',
                !items.some(
                  (i) =>
                    i.isVerified &&
                    i.verificationStatus !== 'Schema-Valid' &&
                    i.isGrounded !== false
                ) &&
                  items.some(
                    (i) =>
                      i.isVerified &&
                      (i.verificationStatus === 'Schema-Valid' || i.isGrounded === false)
                  )
                  ? 'text-sky-400'
                  : 'text-emerald-400'
              )}
            >
              {summary.verifiedRows}{' '}
              {!items.some(
                (i) =>
                  i.isVerified &&
                  i.verificationStatus !== 'Schema-Valid' &&
                  i.isGrounded !== false
              ) &&
              items.some(
                (i) =>
                  i.isVerified &&
                  (i.verificationStatus === 'Schema-Valid' || i.isGrounded === false)
              )
                ? 'Schema-Valid'
                : 'Verified'}
            </span>
            {summary.needsReviewRows > 0 && (
              <span className="text-sm font-semibold text-amber-400">
                {summary.needsReviewRows} Review
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums space-y-0.5">
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
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
            <Database size={14} /> 4. Persisted State
          </div>
          <div className="text-sm font-semibold text-white capitalize">{statusLabel}</div>
          <div className="text-[11px] text-slate-400 font-mono space-y-0.5">
            <div>Export Ready: CSV & XLSX</div>
            <div>
              Storage: <span className="text-slate-200">{persistenceLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grounding Search Sources */}
      {groundingSources.length > 0 && (
        <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
          <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
            <ExternalLink size={14} className="text-indigo-400" />
            Grounding Search Sources ({groundingSources.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {groundingSources.map((src, idx) =>
              isSafeHttpUrl(src.url) ? (
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
              ) : (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/60 text-xs font-medium text-slate-400 rounded-md border border-slate-700"
                >
                  {src.title || 'Source URL unavailable'}
                </span>
              )
            )}
          </div>
        </div>
      )}

      {/* Per-Row Validation Breakdown */}
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
        <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
          <span>Row Verification Breakdown ({items.length} total)</span>
          <span className="text-[11px] text-slate-400 font-mono">
            Select row to inspect raw payload & issues
          </span>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No extracted rows available for validation.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1 font-mono text-xs">
            {items.map((item, idx) => {
              const isOpen = selectedRowId === item.id;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-lg border transition-colors',
                    item.isVerified
                      ? 'bg-slate-900/80 border-slate-800'
                      : 'bg-amber-950/20 border-amber-900/50'
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setSelectedRowId(isOpen ? null : item.id)}
                    className="w-full p-2.5 flex items-center justify-between text-left hover:bg-slate-800/40 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {!item.isVerified || item.verificationStatus === 'Needs review' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-950 text-amber-400 rounded text-[10px] font-semibold border border-amber-800 shrink-0">
                          <AlertTriangle size={12} /> Needs review
                        </span>
                      ) : item.verificationStatus === 'Schema-Valid' || item.isGrounded === false ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-950 text-sky-400 rounded text-[10px] font-semibold border border-sky-800 shrink-0">
                          <ShieldCheck size={12} /> Schema-Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-950 text-emerald-400 rounded text-[10px] font-semibold border border-emerald-800 shrink-0">
                          <ShieldCheck size={12} /> Verified
                        </span>
                      )}
                      <span className="font-semibold text-slate-200 shrink-0">
                        Row #{idx + 1}: {item.data.Primary_Ticker_or_Entity || 'Unknown'}
                      </span>
                      <span className="text-slate-400 truncate max-w-xs">{item.data.Headline}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0 tabular-nums">
                      {item.validationIssues.length > 0 ? (
                        <span className="text-amber-400">{item.validationIssues.length} issue(s)</span>
                      ) : (
                        <span className="text-emerald-400">0 issues</span>
                      )}
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-2.5 pb-2.5 pt-2 border-t border-slate-800 space-y-2 text-slate-300">
                      {item.validationIssues.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-amber-400 mb-1">
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
                        <div className="text-[11px] font-semibold text-slate-400 mb-1">
                          Raw Field Object:
                        </div>
                        <pre className="p-2 bg-slate-950 text-[10px] text-indigo-300 rounded overflow-x-auto">
                          {JSON.stringify(item.raw, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Raw Response Text Collapsible */}
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <button
            type="button"
            aria-expanded={showRawDetails}
            onClick={() => setShowRawDetails(!showRawDetails)}
            className="flex items-center gap-2 hover:text-indigo-400 transition-colors"
          >
            <Terminal size={14} className="text-indigo-400" />
            Raw Gemini LLM Response Text ({rawResponse.length} chars)
            {showRawDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(rawResponse, setCopiedRaw)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium text-slate-300 rounded border border-slate-700 flex items-center gap-1 whitespace-nowrap"
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
