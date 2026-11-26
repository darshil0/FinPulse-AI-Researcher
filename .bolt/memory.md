# Project memory

## Product intent & audience

- Financial news research application powered by Gemini AI with Google Search grounding; retrieves market news via a server-side Supabase Edge Function proxy, validates every row at runtime with Zod, tracks full pipeline traceability, and exports formula-safe CSV and XLSX workbooks.
- Users search by keyword and optional date range (`YYYY-MM-DD`), filter and sort validated results, inspect sentiment/impact/category analytics, and review audit trails.
- Built for financial analysts and researchers who require auditable, schema-verified news datasets.

## Brand personality & voice

- Professional, technical, audit-oriented tone ("strict runtime verification", "traceability", "validation issues", "Needs review").

## Visual design & UX direction

- Table-based results view (`NewsTable`) with verification status tabs (`All Rows`, `Verified Only`, `Needs Review`), column sorting, keyword/ticker filtering, expandable sentiment reasoning and validation diagnostics, and `http`-only external source links.
- Analytics dashboard (`AnalyticsDashboard`) renders Recharts pie charts for Sentiment Breakdown and Market Impact with category-name-mapped colors (`Positive` emerald, `Negative` rose, `Neutral` slate; `High` rose, `Medium` amber, `Low` slate) alongside a Top Categories bar chart.
- Traceability drawer (`TraceabilityPanel`) displays 4 pipeline steps (`1. Query Context`, `2. Model Extraction`, `3. Schema Validation`, `4. Persisted State`) with dynamic run status, grounding sources, row-level raw payloads, and raw LLM output.
- Exporters (`src/lib/export/excel.ts`) generate formula-neutralized CSV files (`sanitizeCell` + immediate `URL.revokeObjectURL`) and two-sheet XLSX workbooks (`Research Results` and `Traceability`).

## Architecture, decisions & resolved constraints

- **Stack:** Vite 6 + React 19 + TypeScript 5.8 + Tailwind CSS 4; Zod v4 for runtime schema validation; Supabase Edge Function (`Deno.serve`) calling `gemini-3-flash-preview` with `googleSearch` grounding; IndexedDB (`idb`) primary storage with `localStorage` fallback.
- **Server-Side AI Boundary:** `GEMINI_API_KEY` is stored strictly on the server as a Supabase Edge Function secret (`supabase/functions/gemini-research/index.ts`); `src/services/geminiService.ts` sends requests to `/functions/v1/gemini-research` guarded by `enforceClientRateLimit` (`2,000 ms` minimum interval, `10` requests per `60s` sliding window).
- **Runtime Zod Validation:** `validateNewsItem` in `src/lib/validation/index.ts` parses rows against `RawNewsItemSchema` (`DateSchema`, `UrlSchema`, `SENTIMENT_ENUM`, `IMPACT_ENUM`, and required non-empty strings including `Time` and `Sentiment_Explanation`), flags extra columns (`UNEXPECTED_COLUMNS`), and quarantines non-compliant rows as `Needs review` rather than dropping them.
- **Unified Storage Caps & Deletion:** IndexedDB pruning and `localStorage` fallback both enforce `MAX_STORED_RUNS = 200`, support single-entry deletion (`deleteResearchRun`) and full clearing, and run a one-time legacy `localStorage` migration (`finpulse_history`).
- **Cancellation Support:** `App.tsx` wires an `AbortController` to a **Cancel Research** button and propagates `AbortSignal` through `enforceClientRateLimit` and `fetch`.
- **Testing & CI:** 45 Vitest unit tests across 7 files, `tsc --noEmit` lint checks (`supabase/`, `dist/`, `node_modules/` excluded in `tsconfig.json`), and Vite production builds pass under `.github/workflows/ci.yml` on Node 22.

## Operational assumptions

- Local persistence assumes single-user browser storage (`finpulse_db` IndexedDB with `localStorage` fallback).
- Live research queries require deploying `supabase/functions/gemini-research` with `GEMINI_API_KEY` configured via `supabase secrets set` and setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vite environment.