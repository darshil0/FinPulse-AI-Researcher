# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] - 2026-11-27

### Security
- **Server-Side Supabase Edge Function Proxy**: Moved Gemini API calls and `GEMINI_API_KEY` into `supabase/functions/gemini-research/index.ts` (Deno) with request validation (`query` length, `YYYY-MM-DD` syntax, `startDate <= endDate`) and UTC reference timestamps, calling `/functions/v1/gemini-research` from `src/services/geminiService.ts`.
- **Removed Unused Client SDK & Added Missing Type Definitions**: Removed unused `@google/genai` (eliminating its transitive critical `protobufjs` advisory) and `autoprefixer`, installed `@types/react`, `@types/react-dom`, and `@types/papaparse`, enabled `"strict": true` in `tsconfig.json`, added `SECURITY.md`, and added `npm audit --audit-level=critical` to `.github/workflows/ci.yml`.
- **CSV & XLSX Formula Injection Neutralization & Encoding**: Exported and applied a shared `sanitizeCell` helper in `src/lib/export/excel.ts` across unified CSV and XLSX (`Research Results` and `Traceability`) column layouts, prepended a UTF-8 BOM (`\uFEFF`) to CSV downloads, and restricted clickable external links in `NewsTable` and `TraceabilityPanel` to `http:`/`https:` URLs.

### Added
- **Client-Side Request Rate Limiting & Request Timeout**: Added `enforceClientRateLimit`, `THROTTLE_CONFIG` (`2,000 ms` minimum spacing, `10` requests per `60s` sliding window), and a `45,000 ms` `AbortController` `REQUEST_TIMEOUT` guard in `src/services/geminiService.ts`.
- **In-Flight Request Cancellation & Concurrency Guard**: Wired an `AbortController` (**Cancel Research** button), `isLoading` locks on presets/history/retry, and a sequence counter (`requestSeqRef`) in `src/App.tsx` to prevent stale out-of-order updates.
- **Analytics Scope Toggle & Category Cap**: Added an **All Rows / Verified Only** toggle (`aria-pressed`) with empty-state fallback and a `MAX_CATEGORIES = 7` + `'Other'` rollup in `src/components/AnalyticsDashboard.tsx`.
- **Individual History Entry Deletion & Export Scope Toggle**: Added `deleteResearchRun` controls in the History panel (`src/App.tsx`) and an **Include Needs Review** export checkbox synchronized with active keyword/status filters.
- **Typed Error Codes & Strict Domain Validation**: Added `ResearchErrorCode` (`INVALID_DATE_RANGE`, `RATE_LIMITED`, `NETWORK_FAILURE`, `REQUEST_TIMEOUT`, `PROVIDER_ERROR`, `UNPARSEABLE_OUTPUT`, `INVALID_RESPONSE_STRUCTURE`), `ValidationContext` (`FUTURE_DATE`, `DATE_OUT_OF_RANGE`, `PLACEHOLDER_URL`, `UNGROUNDED_SOURCE`), and `src/vite-env.d.ts`.

### Changed
- **Zod & Domain Verification Boundary**: Updated `validateNewsItem` in `src/lib/validation/index.ts` to preserve unmodified `raw` row objects (including extra columns), enforce real `YYYY-MM-DD` calendar dates (`isValidCalendarDate`), block placeholder/local domains (`isPlaceholderHost`), verify `Source_URL` against `groundingSources` (`isUrlGrounded`), normalize `Sentiment`/`Impact` case-insensitively, require `Time` and `Sentiment_Explanation`, and quarantine invalid rows as `Needs review`.
- **Storage Reliability & Honest Legacy Migration**: Aligned IndexedDB pruning and `localStorage` fallback under `MAX_STORED_RUNS = 200`, reset rejected `dbPromise` handles, added `blocking`/`terminated` lifecycle handlers, ensured `clearAllResearchRuns()` always clears `localStorage`, stopped fabricating `success`/`verifiedRows` on legacy migrations, and logged corrupt legacy JSON once.
- **Accessibility & UI Provenance**: Froze `query`/`startDate`/`endDate` provenance on completed `ResearchResult` objects, added `<button>` sort controls with `aria-sort` in `NewsTable` and keyboard row toggles (`aria-expanded`), rendered `TraceabilityPanel` in `unparseable_model_output` and `no_results` states with accurate `persistenceState`, shortened run IDs cleanly, and replaced all underscores in status labels.
- **Expanded Test Coverage (55 Tests Across 8 Suites)**:
  - `src/lib/validation/validation.test.ts` (14 tests): Calendar rollover rejection, future/out-of-range dates, placeholder/local URLs, grounding domain/title alignment, raw extra-column retention, and required fields.
  - `src/test/geminiService.test.ts` (13 tests): Supabase proxy calls, HTTP 429/401 handling, strict CSV header detection, trailing commentary stripping, `REQUEST_TIMEOUT`, interval/burst throttling, and `AbortSignal` cancellation.
  - `src/test/validation.test.ts` (8 tests): Core schema normalization, `MISSING_SOURCE_URL`, `INVALID_URL_SCHEME`, and unexpected column checks.
  - `src/tests/export.test.ts` (5 tests) & `src/test/export.test.ts` (4 tests): Formula-injection sanitization across unified CSV/XLSX columns, UTF-8 BOM (`EF BB BF`) verification, `includeNeedsReview` filtering, and `URL.revokeObjectURL` cleanup.
  - `src/test/components.test.tsx` (4 tests): Verification badges, `aria-sort` buttons, `TraceabilityPanel` underscore formatting & unsafe URL filtering, and `AnalyticsDashboard` `Verified Only` toggle.
  - `src/test/app.test.tsx` (4 tests): Invalid date-range alert without retry/history, skipped `network_error` history writes, unparseable-output Traceability rendering, frozen query provenance, and filter-synchronized exports.
  - `src/test/db.test.ts` (3 tests): IndexedDB persistence, deletion/fallback clearing, and legacy migration integrity.
- **Documentation & Metadata Alignment**: Updated `README.md`, `CHANGELOG.md`, `SECURITY.md`, `.env.example`, `.bolt/memory.md`, and `index.html`.
- **TypeScript Configuration**: Enabled `"strict": true` and excluded `supabase`, `dist`, and `node_modules` in `tsconfig.json`.

### Fixed
- **Parser & Classification Edge Cases**: Required a true `Date,Time,Headline` CSV header before parsing (classifying prose containing `"Headline"` as `unparseable_model_output`), stripped trailing commentary rows (`Note:`, `Disclaimer:`, `Sources:`) into `parseErrors`, and classified all-invalid parsed tables as `partial_success`.
- **Semantic & Chronological Sorting**: Sorted `Impact` by severity (`High > Medium > Low`) and `Date` chronologically alongside `Time` in `src/App.tsx`.
- **Invalid Date & Error History Handling**: Separated `INVALID_DATE_RANGE` into a non-retryable validation alert and skipped saving `network_error` runs into IndexedDB history.
- **Name-Mapped Chart Colors**: Mapped `AnalyticsDashboard` sentiment (`Positive`, `Negative`, `Neutral`) and market impact (`High`, `Medium`, `Low`) pie slice colors by category name rather than array index.
- **CI/CD Pipeline Reliability**: Synchronized `package-lock.json` with `package.json`, set `"engines": { "node": ">=22.0.0" }`, upgraded `.github/workflows/ci.yml` to Node 22 with `actions/checkout@v6` and `actions/setup-node@v6`, added `npm audit --audit-level=critical`, and configured concurrency cancellation and job timeouts.

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
