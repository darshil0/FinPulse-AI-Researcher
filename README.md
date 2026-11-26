# FinPulse AI Researcher

FinPulse AI Researcher is an institutional-grade financial news research, validation, and audit application built with React, TypeScript, Vite, and a Supabase Edge Function proxy. It retrieves grounded market news through Gemini, validates every extracted row at runtime with Zod, tracks full pipeline traceability, persists research history locally in IndexedDB, and exports formula-safe CSV and native XLSX workbooks.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture & Server-Side Boundary](#architecture--server-side-boundary)
- [Data Integrity & Validation](#data-integrity--validation)
- [Export & Security Protections](#export--security-protections)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Backend Endpoint Deployment (Required)](#backend-endpoint-deployment-required)
  - [Local Development Commands](#local-development-commands)
- [Continuous Integration](#continuous-integration)
- [License](#license)

---

## Key Features

- **Server-Side Gemini Proxy**: Routes all AI queries through the `gemini-research` Supabase Edge Function (`supabase/functions/gemini-research/index.ts`), keeping `GEMINI_API_KEY` strictly on the server with input validation and exponential backoff retries.
- **Live & Historical Date-Range Queries**: Supports real-time queries (defaulting to the last 24 hours) as well as historical `startDate`/`endDate` ranges (`YYYY-MM-DD`), with client-side `INVALID_DATE_RANGE` checks and a **Cancel Research** button powered by `AbortController`.
- **Strict Runtime Zod Validation**: Validates all 12 CSV fields using `RawNewsItemSchema`, `DateSchema`, `UrlSchema`, `SENTIMENT_ENUM`, and `IMPACT_ENUM`, preserving invalid rows for auditability rather than silently dropping them.
- **Interactive Data Grid & Visual Analytics**:
  - `NewsTable` offers multi-column sorting, keyword/ticker filtering, verification status tabs (`All Rows`, `Verified Only`, `Needs Review`), expandable row diagnostics (`Sentiment_Explanation` and validation errors), and safe external source links.
  - `AnalyticsDashboard` renders Recharts Sentiment Breakdown and Market Impact pie charts (colors mapped by label name) alongside a Top Categories bar chart.
- **End-to-End Traceability Audit Chain**: `TraceabilityPanel` exposes query parameters, model metadata, grounding search sources, validation metrics, persisted run state, row-level raw JSON payloads, raw LLM text, and clipboard copy tools.
- **IndexedDB Persistence with Fallback**: Stores up to `200` research runs (`MAX_STORED_RUNS`) in IndexedDB (`finpulse_db`) via `idb` with automatic `localStorage` fallback, one-time legacy history migration, single-entry deletion, and full history clearing.
- **Formula-Safe CSV & Native XLSX Exports**: Neutralizes spreadsheet formula injection via a shared `sanitizeCell` helper across both CSV and multi-sheet `.xlsx` exports.

---

## Architecture & Server-Side Boundary

```text
┌───────────────────────────┐   POST /functions/v1/gemini-research   ┌─────────────────────────────────┐
│     Browser Client        │ ─────────────────────────────────────► │   Supabase Edge Function (Deno) │
│  (React + AbortSignal)    │ ◄───────────────────────────────────── │   (Server-only GEMINI_API_KEY)  │
└─────────────┬─────────────┘     { rawText, groundingSources }      └────────────────┬────────────────┘
              │                                                                       │
              ▼                                                                       ▼
┌───────────────────────────┐                                        ┌─────────────────────────────────┐
│ PapaParse + Zod Boundary  │                                        │ Gemini 3 Flash + Google Search  │
│ (Verified / Needs review) │                                        │ (Exponential Backoff Retries)   │
└─────────────┬─────────────┘                                        └─────────────────────────────────┘
              │
      ┌───────┴────────────────────────┬───────────────────────────┐
      ▼                                ▼                           ▼
┌───────────────────┐      ┌───────────────────────┐   ┌──────────────────────────┐
│ Traceability & UI │      │   CSV / XLSX Export   │   │ IndexedDB (200-run cap)  │
│ (Grid & Recharts) │      │ (Formula Neutralized) │   │ + localStorage Fallback  │
└───────────────────┘      └───────────────────────┘   └──────────────────────────┘
```

### How the Server-Side Proxy Works

The client bundle **never** embeds or accesses `GEMINI_API_KEY` (`vite.config.ts` does not inject the key via `define` or `VITE_*` variables). All AI calls cross a strict server-side boundary:

1. **Client (`src/services/geminiService.ts`)**: Sends `POST ${VITE_SUPABASE_URL}/functions/v1/gemini-research` with `{ query, startDate, endDate }`, `Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}`, and an `AbortSignal`.
2. **Backend (`supabase/functions/gemini-research/index.ts`)**: Validates the request (`query` <= 2,000 characters, `startDate`/`endDate` matching `YYYY-MM-DD`) and reads `GEMINI_API_KEY` solely from server secrets (`Deno.env.get("GEMINI_API_KEY")`).
3. **Gemini API & Retries**: Calls `gemini-3-flash-preview` with `x-goog-api-key` and `googleSearch` grounding, retrying `429` and `5xx` responses up to `3` times with exponential backoff (`1s` to `10s`) before returning `{ rawText, groundingSources, modelName }`.
4. **Client Parsing & Run Status**: Strips markdown fences if present, parses the CSV payload with PapaParse, validates rows with Zod, and classifies the run into `success`, `partial_success`, `no_results`, `unparseable_model_output`, or `network_error`.

---

## Data Integrity & Validation

Every parsed row is evaluated at runtime by `validateNewsItem` and `validateResearchResults` (`src/lib/validation/index.ts`).

### Expected 12-Column Schema (`RawNewsItemSchema`)

| Column | Rule / Schema | Failure Issue Code |
| :--- | :--- | :--- |
| `Date` | `DateSchema`: trimmed non-empty string (not `"N/A"`) parsing to a valid `Date` (e.g., `YYYY-MM-DD`) | `INVALID_DATE` |
| `Time` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Headline` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Short_Summary` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Primary_Ticker_or_Entity` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Region_or_Market` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Category` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Source_Name` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Source_URL` | `UrlSchema`: non-empty (not `"N/A"`) valid `http:` or `https:` URL | `MISSING_SOURCE_URL` / `INVALID_URL_SCHEME` |
| `Sentiment` | `SENTIMENT_ENUM` (`Positive`, `Negative`, `Neutral`, case-insensitive normalization) | `INVALID_SENTIMENT` |
| `Impact` | `IMPACT_ENUM` (`High`, `Medium`, `Low`, case-insensitive normalization) | `INVALID_IMPACT` |
| `Sentiment_Explanation` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |

Any extra keys beyond the 12 schema columns generate an `UNEXPECTED_COLUMNS` validation issue.

### `Verified` vs. `Needs review` Statuses

Invalid rows are **preserved for full auditability** rather than silently discarded:

| Verification Status | Criteria | Behavior in UI, Traceability & Exports |
| :--- | :--- | :--- |
| **`Verified`** (`isVerified: true`) | Passes all `RawNewsItemSchema` checks with zero `ValidationIssue` entries and no unexpected columns. | Shown with a green **Verified** badge, included in **All Rows** and **Verified Only** filters, and counted toward `summary.verifiedRows`. If every parsed row is verified, the run status is `success`. |
| **`Needs review`** (`isVerified: false`; filter tab labeled **Needs Review**) | Fails one or more Zod schema constraints or contains unexpected columns. | Highlighted in amber with an issue-count badge, expandable field-level error diagnostics (`field`, `code`, `message`, `rawValue`), and raw row JSON inspection. Included in **All Rows** and **Needs Review** views (or excluded from Verified-only exports) and recorded in the XLSX `Traceability` sheet. If any parsed row needs review, the run status is `partial_success`. |

---

## Export & Security Protections

- **Formula Injection Neutralization (`src/lib/export/excel.ts`)**: Both `exportToCSV` and `exportToXLSX` pass cell strings through the shared `sanitizeCell` helper, which prefixes any value starting with `=`, `+`, `-`, `@`, `\t` (tab), or `\r` (carriage return) with a leading single quote (`'`).
- **Native Multi-Sheet XLSX Workbooks**: Generated via SheetJS (`xlsx`) with two worksheets:
  - `Research Results`: Exported rows with auto-filters, frozen header row, and sized columns.
  - `Traceability`: Run query, date range, run status, model name, row counts, grounding sources, and detailed validation issues for included rows (all dynamic strings sanitized via `sanitizeCell`).
- **CSV Resource Cleanup**: `exportToCSV` revokes temporary blob URLs immediately via `URL.revokeObjectURL` after triggering the download.
- **Safe Source Links**: `NewsTable` only renders clickable external links for `http`/`https` URLs (`rel="noopener noreferrer"`).

---

## Tech Stack

- **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, Motion (`motion/react`), Lucide React, Recharts 3
- **Backend Proxy & AI**: Supabase Edge Functions (`Deno.serve`), Gemini API (`gemini-3-flash-preview` with `googleSearch` grounding)
- **Parsing & Validation**: PapaParse, Zod v4
- **Storage & Export**: `idb` (IndexedDB + `localStorage` fallback), SheetJS (`xlsx`)
- **Testing & Quality**: Vitest, React Testing Library, `fake-indexeddb`, jsdom

---

## Project Structure

```text
├── .github/workflows/ci.yml              # GitHub Actions CI (lint, test, build)
├── supabase/
│   ├── config.toml                       # Edge Function config (verify_jwt = false)
│   └── functions/gemini-research/
│       └── index.ts                      # Server-side Gemini proxy & retry handler
├── src/
│   ├── components/
│   │   ├── AnalyticsDashboard.tsx        # Sentiment, Impact & Category Recharts views
│   │   ├── NewsTable.tsx                 # Sortable/filterable grid & row diagnostics
│   │   └── TraceabilityPanel.tsx         # 4-step pipeline & audit provenance drawer
│   ├── lib/
│   │   ├── export/excel.ts               # Shared sanitizeCell, CSV & XLSX exporters
│   │   ├── storage/db.ts                 # IndexedDB persistence + localStorage fallback
│   │   └── validation/index.ts           # Zod schemas & validateResearchResults
│   ├── services/geminiService.ts         # Edge Function client, AbortSignal & CSV parser
│   ├── test/                             # Vitest suites (24 tests across 5 files)
│   ├── App.tsx                           # Main application UI & state orchestration
│   ├── types.ts                          # Shared NewsItem & SortConfig types
│   └── vite-env.d.ts                     # Vite client environment typings
├── tsconfig.json                         # TypeScript config (excludes supabase/, dist/)
├── vite.config.ts                        # Vite dev/build configuration
└── vitest.config.ts                      # Vitest + jsdom test configuration
```

---

## Getting Started

### Prerequisites

- **Node.js 20+** and **npm**
- A **Supabase project** with the Supabase CLI (or dashboard) to deploy the Edge Function
- A **Google Gemini API key**

### Environment Variables

The application separates public Vite client settings from the server-only Gemini API secret:

| Variable | Scope | Where to Set | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Server-only** (never bundled into client) | Supabase Edge Function secret | **Required.** Google Gemini API key read strictly on the server by `supabase/functions/gemini-research/index.ts`. |
| `VITE_SUPABASE_URL` | Client (Vite) | `.env` / hosting build env | **Required.** Base URL of your Supabase project (`https://<project-ref>.supabase.co`), used to call `/functions/v1/gemini-research`. |
| `VITE_SUPABASE_ANON_KEY` | Client (Vite) | `.env` / hosting build env | **Required.** Public Supabase anonymous key sent in the `Authorization: Bearer` header. |

### Backend Endpoint Deployment (Required)

Because the browser never calls Google Gemini directly, **you must deploy the `gemini-research` Edge Function and set `GEMINI_API_KEY` before running research queries** (otherwise queries will fail with a configuration or network error):

1. **Set the server-side Gemini secret**:
   ```bash
   supabase secrets set GEMINI_API_KEY="your-gemini-api-key"
   ```
2. **Deploy the backend Edge Function** (`supabase/config.toml` configures `verify_jwt = false` for public anon-key requests):
   ```bash
   supabase functions deploy gemini-research
   ```
3. **Configure your client `.env` file** with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Local Development Commands

```bash
# Install dependencies
npm install

# Start the Vite development server on port 3000
npm run dev

# Run TypeScript type checking (tsc --noEmit)
npm run lint

# Run the Vitest unit test suite (24 tests across 5 suites)
npm test

# Build the production bundle into dist/
npm run build

# Preview the production build locally
npm run preview
```

---

## Continuous Integration

The workflow in `.github/workflows/ci.yml` runs on pushes and pull requests to `main` and `master`, executing:

1. `npm ci`
2. `npm run lint` (`tsc --noEmit`)
3. `npm test` (`vitest run`)
4. `npm run build` (`vite build`)

---

## License

This project is licensed under the Apache-2.0 License.
