# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] - 2026-11-26

### Security
- **Server-Side Supabase Edge Function Proxy**: Moved Gemini API calls and `GEMINI_API_KEY` into `supabase/functions/gemini-research/index.ts` (Deno) with request validation (`query` length and `YYYY-MM-DD` date checks), calling `/functions/v1/gemini-research` from `src/services/geminiService.ts`.
- **CSV & XLSX Formula Injection Neutralization**: Exported and applied a shared `sanitizeCell` helper in `src/lib/export/excel.ts` to prefix cell values starting with `=`, `+`, `-`, `@`, `\t` (tab), or `\r` (carriage return) with `'` across both CSV exports and XLSX worksheets (`Research Results` and `Traceability`), and restricted clickable source links in `NewsTable` to `http`-prefixed URLs.

### Added
- **In-Flight Request Cancellation**: Wired an `AbortController` and **Cancel Research** button in `src/App.tsx` passing `AbortSignal` through `researchFinancialNews`.
- **Individual History Entry Deletion**: Added `deleteResearchRun` support in `src/lib/storage/db.ts` and per-entry delete actions in the History panel (`src/App.tsx`).
- **Typed Error Codes & Date Validation**: Added `ResearchErrorCode` (`INVALID_DATE_RANGE`, `RATE_LIMITED`, `NETWORK_FAILURE`, `PROVIDER_ERROR`, `UNPARSEABLE_OUTPUT`, `INVALID_RESPONSE_STRUCTURE`, etc.) and Vite environment typings (`src/vite-env.d.ts`).

### Changed
- **Zod Schema Consolidation**: Updated `validateNewsItem` in `src/lib/validation/index.ts` to validate against `RawNewsItemSchema`, `DateSchema`, and `UrlSchema` with case-insensitive `Sentiment`/`Impact` normalization, required `Time` and `Sentiment_Explanation` fields, and `MISSING_SOURCE_URL` vs. `INVALID_URL_SCHEME` error codes.
- **Unified Storage Cap**: Aligned IndexedDB pruning and `localStorage` fallback eviction under a shared `MAX_STORED_RUNS = 200` constant in `src/lib/storage/db.ts`.
- **Export Object URL Cleanup**: Added `URL.revokeObjectURL(url)` cleanup in `exportToCSV` (`src/lib/export/excel.ts`).
- **Proxy & Export Test Coverage**: Updated `src/test/geminiService.test.ts` and `src/test/export.test.ts` (24 tests total across 5 Vitest suites) to cover the Supabase proxy boundary, HTTP 429/401 handling, unparseable output, `partial_success` classification, formula-injection neutralization in CSV/XLSX outputs, and `URL.revokeObjectURL` cleanup.
- **Documentation Rewrite**: Rewrote `README.md` with dedicated sections for the server-side Gemini API proxy architecture, required `GEMINI_API_KEY` / Supabase Edge Function deployment, Data Integrity Zod schemas, and `Verified` vs. `Needs review` status behavior.
- **TypeScript Configuration**: Excluded `supabase`, `dist`, and `node_modules` from the browser `tsconfig.json` check so `npm run lint` (`tsc --noEmit`) validates client and test code cleanly.

### Fixed
- **All-Invalid Row Status Classification**: Returned `partial_success` instead of `no_results` in `researchFinancialNews` when a CSV table parses with rows that all fail validation, and resolved `import.meta.env` dynamically per call.
- **Name-Mapped Chart Colors**: Mapped `AnalyticsDashboard` sentiment (`Positive`, `Negative`, `Neutral`) and market impact (`High`, `Medium`, `Low`) pie slice colors by category name rather than array index.
- **Status Filter Reset**: Reset `statusFilter` to `'all'` whenever a new research query starts in `src/App.tsx`.

## [1.4.0] - 2026-09-18

### Added
- **Runtime Schema Validation & Verification States**: Implemented strict Zod schema validation across all 12 CSV fields, categorizing findings into `Verified` vs. `Needs review` states without silently discarding invalid LLM outputs.
- **Traceability & Audit Panel**: Added an interactive Traceability Audit drawer providing full audit chain details, including query context, model metadata, execution time, raw model response, grounding source URLs/titles, and row-level validation errors.
- **Resilient AI Pipeline**: Enhanced Gemini research pipeline with exponential backoff, jitter, retry logic for 429 rate limits, and structured error handling for unparseable output or network failures.
- **IndexedDB Research Storage & Legacy Migration**: Upgraded persistence to IndexedDB (`finpulse_db`) via `idb`, with automatic one-time background migration from legacy `localStorage`.
- **Native XLSX Export**: Added formatted Excel workbook export using SheetJS (`xlsx`), featuring custom headers, auto-filters, frozen headers, and a dedicated `Traceability` metadata worksheet alongside standard CSV export.
- **Continuous Integration Hardening**: Added GitHub Actions CI workflow running typechecks (`tsc --noEmit`), Vitest suite, and Vite build verification on pushes and PRs.
- **Comprehensive Test Suite**: Added Vitest and React Testing Library tests covering validation, IndexedDB storage/migration, Excel export generation, Gemini service retries, and UI component rendering.

## [1.3.0] - 2026-05-10

### Added
- **Analytics Dashboard**: Integrated Recharts for visual sentiment and category distribution.
- **Research History**: Local storage persistence for recent research queries.
- **Interactive Sorting**: Multi-column sorting capabilities for the findings table.
- **UI Architecture**: Centralized types and modern utility-based component structure.

## [1.2.0] - 2026-05-10

### Added
- **Date Range Research**: Users can now select start and end dates to retrieve historical financial news data.
- **Historical Mode Indicator**: Visual feedback when a date range is active.
- **Robust CSV Parsing**: Enhanced the data extraction logic to handle AI-formatted markdown code blocks more reliably.

### Changed
- **Async Loader Update**: The loading state now contextually reflects the selected date range.
- **Dependency Optimization**: Removed unused server-side and utility packages (`express`, `better-sqlite3`, `dotenv`) to streamline the client-side build.

### Fixed
- **Validation logic**: Added checks to prevent research attempts with invalid date ranges (start date after end date).

## [1.1.0] - 2026-03-29

### Added
- **Sentiment Reasoning Column**: Added a 12th column to the CSV output (`Sentiment_Explanation`) providing concise reasoning for assigned sentiments.
- **Expandable Row Details**: Implemented expandable rows in the `NewsTable` component to display sentiment explanations directly in the UI.
- **Advanced Orchestration**: Updated system instructions to guide the AI agent through multi-step reasoning for higher quality data extraction.

### Changed
- **CSV Schema**: Updated the internal data schema from 11 to 12 fields to accommodate sentiment reasoning.
- **UI Refinement**: Improved table row interactions with hover states and interactive chevrons.

## [1.0.0] - 2026-02-21

### Added
- **Initial Release**: Core functionality for financial news research and extraction.
- **Gemini Integration**: Implemented `researchFinancialNews` service using `@google/genai`.
- **Interactive Dashboard**: Professional data grid for viewing extracted news items.
- **CSV Export**: Basic functionality to export findings to a CSV file.
- **Institutional Styling**: Tailwind CSS 4 based UI with a focus on data density and readability.
