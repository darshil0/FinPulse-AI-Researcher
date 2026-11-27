# Project memory

## Product intent & audience

- Financial news research application powered by Gemini AI with Google Search grounding; retrieves market news via a server-side Supabase Edge Function proxy, validates every row at runtime with Zod, tracks full pipeline traceability, and exports formula-safe CSV and XLSX workbooks.
- Users search by keyword and optional date range (`YYYY-MM-DD`), filter and sort validated results, inspect sentiment/impact/category analytics, and review audit trails.
- Built for financial analysts and researchers who require auditable, schema-verified news datasets.

## Brand personality & voice

- Professional, technical, audit-oriented tone ("strict runtime verification", "traceability", "validation issues", "Needs review").

## Visual design & UX direction

- Table-based results view (`NewsTable`) with verification status tabs (`All Rows`, `Verified Only`, `Needs Review`), semantic/chronological sorting (`aria-sort`), keyword/ticker filtering, keyboard-accessible expandable sentiment reasoning and validation diagnostics (`aria-expanded`), and `http`/`https`-only external source links.
- Analytics dashboard (`AnalyticsDashboard`) renders an **All Rows / Verified Only** toggle, Recharts pie charts for Sentiment Breakdown and Market Impact with category-name-mapped colors (`Positive` emerald, `Negative` rose, `Neutral` slate; `High` rose, `Medium` amber, `Low` slate), and a Top Categories bar chart capped at `7` categories plus `Other`.
- Traceability drawer (`TraceabilityPanel`) renders across `success`, `partial_success`, `no_results`, and `unparseable_model_output` states with 4 pipeline steps (`1. Query Context`, `2. Model Extraction`, `3. Schema Validation`, `4. Persisted State`), frozen run parameters, accurate persistence state (`saved` vs `not_saved`), `http`/`https`-filtered grounding sources, unmodified row payloads, and full Audit JSON copy.
- Exporters (`src/lib/export/excel.ts`) generate filter-synchronized, formula-neutralized CSV files (`sanitizeCell`, UTF-8 BOM `\uFEFF`, `URL.revokeObjectURL`) and two-sheet XLSX workbooks (`Research Results` and `Traceability`) with unified columns and an **Include Needs Review** toggle.

## Architecture, decisions & resolved constraints

- **Stack:** Vite 6 + React 19 + TypeScript 5.8 (`strict: true`) + Tailwind CSS 4; Zod v4 for runtime schema validation; Supabase Edge Function (`Deno.serve`) calling `gemini-3-flash-preview` with `googleSearch` grounding; IndexedDB (`idb`) primary storage with `localStorage` fallback.
- **Server-Side AI Boundary:** `GEMINI_API_KEY` is stored strictly on the server as a Supabase Edge Function secret (`supabase/functions/gemini-research/index.ts`, with `startDate <= endDate` checks and UTC prompt grounding); `src/services/geminiService.ts` sends requests to `/functions/v1/gemini-research` guarded by `enforceClientRateLimit` (`2,000 ms` minimum interval, `10` requests per `60s` sliding window) and a `45s` `REQUEST_TIMEOUT`, requiring a true `Date,Time,Headline` CSV header.
- **Runtime Zod & Domain Validation:** `validateNewsItem` in `src/lib/validation/index.ts` preserves unmodified `raw` row objects, parses against `RawNewsItemSchema` (`validateDate`, `isValidCalendarDate`, `isValidHttpPublicUrl`, `SENTIMENT_ENUM`, `IMPACT_ENUM`, required `Time` & `Sentiment_Explanation`), checks `FUTURE_DATE`, `DATE_OUT_OF_RANGE`, `PLACEHOLDER_URL`, `UNGROUNDED_SOURCE` (`extractSourceHostname`, `extractGroundedDomains`, `isSourceUrlGrounded`), and `UNEXPECTED_COLUMNS`, assigns `'Verified'` when grounded against `groundingSources` vs `'Schema-Valid'` when syntax-only validated, and quarantines non-compliant rows as `'Needs review'`.
- **Unified Storage Caps & Error Isolation:** IndexedDB pruning and `localStorage` fallback both enforce `MAX_STORED_RUNS = 200`, skip saving `network_error` and `INVALID_DATE_RANGE` runs, support single-entry deletion (`deleteResearchRun`) and resilient clearing, handle corrupt legacy JSON cleanly, and do not fabricate `success` status on migrated legacy items.
- **Cancellation & Concurrency Support:** `App.tsx` wires an `AbortController` to **Cancel Research**, locks controls while loading, and uses `requestSeqRef` to prevent out-of-order completion overwrites.
- **Security, Testing & CI:** Documented in `SECURITY.md`; 58 Vitest unit tests across 8 files, strict `tsc --noEmit` lint checks (`supabase/`, `dist/`, `node_modules/` excluded in `tsconfig.json`), `npm audit --audit-level=critical`, and Vite production builds pass under `.github/workflows/ci.yml` on Node 22 (`actions/checkout@v6`, `actions/setup-node@v6`).

## Operational assumptions

- Local persistence assumes single-user browser storage (`finpulse_db` IndexedDB with `localStorage` fallback).
- Live research queries require deploying `supabase/functions/gemini-research` with `GEMINI_API_KEY` configured via `supabase secrets set` and setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vite environment.