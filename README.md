# FinPulse AI Researcher

FinPulse AI Researcher is an institutional-grade financial news research, validation, and audit application built with React, TypeScript, Vite, and a Supabase Edge Function proxy. It retrieves grounded market news through Gemini, validates every extracted row at runtime with Zod, tracks full pipeline traceability, persists research history locally in IndexedDB, and exports formula-safe CSV and native XLSX workbooks.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture & Server-Side Boundary](#architecture--server-side-boundary)
- [Data Integrity](#data-integrity)
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

- **Server-Side Gemini Proxy**: Routes all AI queries through the `gemini-research` Supabase Edge Function (`supabase/functions/gemini-research/index.ts`), keeping `GEMINI_API_KEY` strictly on the server with input/date-order validation, UTC reference timestamps, and exponential backoff retries.
- **Live & Historical Date-Range Queries**: Supports real-time queries (defaulting to the last 24 hours UTC) as well as historical `startDate`/`endDate` ranges (`YYYY-MM-DD`), with `INVALID_DATE_RANGE` validation (rejecting future start dates or `startDate > endDate`), a **Cancel Research** button powered by `AbortController`, a `45s` `REQUEST_TIMEOUT`, and frozen per-run query/date provenance.
- **Strict Runtime Zod & Domain Verification**: Validates all 12 CSV fields using `RawNewsItemSchema`, strict `YYYY-MM-DD` calendar validation (rejecting rollovers like `2026-02-30`), non-future and query-range date checks (`FUTURE_DATE`, `DATE_OUT_OF_RANGE`), placeholder/local domain blocking (`PLACEHOLDER_URL`), and `Source_URL` corroboration against returned `groundingSources` (`UNGROUNDED_SOURCE`), retaining unmodified `raw` rows for auditability.
- **Interactive Data Grid & Visual Analytics**:
  - `NewsTable` offers semantic `Impact` (`High > Medium > Low`) and chronological `Date`/`Time` sorting with `aria-sort`, keyword/ticker filtering, verification status tabs (`All Rows`, `Verified Only`, `Needs Review`), accessible expandable row diagnostics (`Sentiment_Explanation` and validation errors), and safe external source links (`http`/`https` URLs).
  - `AnalyticsDashboard` includes an **All Rows / Verified Only** toggle, Recharts Sentiment Breakdown and Market Impact pie charts (colors mapped by label name), and a Top Categories bar chart capped at `7` categories plus an `Other` rollup.
- **End-to-End Traceability Audit Chain**: Accessible across `success`, `partial_success`, `no_results`, and `unparseable_model_output` runs; `TraceabilityPanel` exposes frozen query parameters, model metadata, `http`/`https`-filtered grounding search sources, validation metrics, accurate persistence status (`Saved locally (IndexedDB)` vs `Not saved`), row-level raw JSON payloads, raw LLM text, and full JSON audit export.
- **IndexedDB Persistence with Fallback**: Stores up to `200` valid research runs (`MAX_STORED_RUNS`) in IndexedDB (`finpulse_db`) via `idb` (skipping `network_error` and `INVALID_DATE_RANGE` failures) with automatic `localStorage` fallback, one-time legacy history migration (`finpulse_history`), single-entry deletion, and resilient full history clearing.
- **Filter-Synced, Formula-Safe CSV & Native XLSX Exports**: Respects active table keyword/status filters and an **Include Needs Review** toggle, shares a unified column order across CSV and `.xlsx`, prepends a UTF-8 BOM (`\uFEFF`) for Excel character compatibility, and neutralizes spreadsheet formula injection via `sanitizeCell`.

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

1. **Client (`src/services/geminiService.ts`)**: Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` dynamically (returning `PROVIDER_ERROR` if unset) and applies client-side rate limiting (`enforceClientRateLimit`, enforcing a `2,000 ms` minimum delay between consecutive requests and a `10`-requests-per-`60s` sliding-window cap that yields `RATE_LIMITED` if exceeded) before sending `POST ${VITE_SUPABASE_URL}/functions/v1/gemini-research` with `{ query, startDate, endDate }`, `Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}`, and a `45,000 ms` timeout-wrapped `AbortSignal`.
2. **Backend (`supabase/functions/gemini-research/index.ts`)**: Validates the request (`query` <= 2,000 characters, `startDate`/`endDate` matching `YYYY-MM-DD`, `startDate <= endDate`), injects the current UTC ISO timestamp and `todayUtc` into the prompt, and reads `GEMINI_API_KEY` solely from server secrets (`Deno.env.get("GEMINI_API_KEY")`).
3. **Gemini API & Retries**: Calls `gemini-3-flash-preview` with `x-goog-api-key` and `googleSearch` grounding, making up to `3` total attempts (`MAX_RETRIES = 3`) on `429` and `5xx` responses with exponential backoff (`1s`, `2s`, capped at `10s`) before returning `{ rawText, groundingSources, modelName }`.
4. **Client Parsing & Run Status**: Maps HTTP `429` to `RATE_LIMITED`, timeouts to `REQUEST_TIMEOUT`, other HTTP/network errors to `NETWORK_FAILURE`, and malformed JSON to `INVALID_RESPONSE_STRUCTURE`; requires a true `Date,Time,Headline` CSV header (classifying prose responses without CSV structure as `unparseable_model_output`), strips trailing `Note:`/`Disclaimer:`/`Sources:` lines into `parseErrors`, validates rows against Zod and `ValidationContext`, and classifies the run into `success`, `partial_success`, `no_results`, `unparseable_model_output`, or `network_error`.

---

## Data Integrity

FinPulse enforces a strict runtime validation boundary in `src/lib/validation/index.ts` powered by Zod v4. Every parsed CSV row from the AI model passes through `validateNewsItem` and `validateResearchResults` before entering the UI, IndexedDB store, or export pipeline.

### Zod Validation Schemas

Before schema parsing, `validateNewsItem` preserves the unmodified parsed input row in `raw`, extracts all 12 expected fields as trimmed strings for validation, and applies case-insensitive normalization to `Sentiment` and `Impact` (e.g., `"positive"` → `"Positive"`, `"high"` → `"High"`). The normalized candidate object is evaluated with `RawNewsItemSchema.safeParse(...)` plus domain verification rules using `ValidationContext` (`startDate`, `endDate`, `groundingSources`, `referenceDate`):

- **`DateSchema` & Calendar/Range Checks**: Requires a strict `YYYY-MM-DD` real calendar date (`isValidCalendarDate`, rejecting invalid rollovers like `2026-02-30`) → `INVALID_DATE`. Domain rules further emit `FUTURE_DATE` when `Date` exceeds the current date (`referenceDate`) and `DATE_OUT_OF_RANGE` when outside the requested `startDate`..`endDate` bounds.
- **`UrlSchema` & Domain/Grounding Checks**: `isValidHttpPublicUrl` requires a valid `http:` or `https:` URL with a dot-containing public hostname, emitting `MISSING_SOURCE_URL` for `""`/`"N/A"`, `PLACEHOLDER_URL` for local/reserved hosts (`localhost`, `127.0.0.1`, `example.com`, `.local`, `.invalid`, etc.), and `INVALID_URL_SCHEME` for other invalid URLs or disallowed schemes (`javascript:`, `data:`). When `groundingSources` are provided, `isUrlGrounded` emits `UNGROUNDED_SOURCE` if `Source_URL` does not match any returned grounding domain or title.
- **`RawNewsItemSchema`**: `z.object(...)` requiring:
  - `Date` (`DateSchema`) and `Source_URL` (`UrlSchema`)
  - Non-empty trimmed strings (`z.string().trim().min(1)`) for `Time`, `Headline`, `Short_Summary`, `Primary_Ticker_or_Entity`, `Region_or_Market`, `Category`, `Source_Name`, and `Sentiment_Explanation` (`MISSING_REQUIRED_FIELD`)
  - `Sentiment` matching `SENTIMENT_ENUM` (`Positive`, `Negative`, `Neutral` → `INVALID_SENTIMENT`)
  - `Impact` matching `IMPACT_ENUM` (`High`, `Medium`, `Low` → `INVALID_IMPACT`)
- **Unexpected Column Detection**: Any keys in `raw` outside the 12 schema fields remain preserved in `raw` and append an `UNEXPECTED_COLUMNS` `ValidationIssue`.

| Column | Rule / Schema | Failure Issue Code |
| :--- | :--- | :--- |
| `Date` | `DateSchema`: strict `YYYY-MM-DD` real calendar date + non-future + requested range check | `INVALID_DATE` / `FUTURE_DATE` / `DATE_OUT_OF_RANGE` |
| `Time` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Headline` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Short_Summary` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Primary_Ticker_or_Entity` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Region_or_Market` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Category` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Source_Name` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |
| `Source_URL` | `UrlSchema`: public `http:`/`https:` URL (non-placeholder) + grounding match when sources exist | `MISSING_SOURCE_URL` / `PLACEHOLDER_URL` / `INVALID_URL_SCHEME` / `UNGROUNDED_SOURCE` |
| `Sentiment` | `SENTIMENT_ENUM` (`Positive`, `Negative`, `Neutral`, case-insensitive normalization) | `INVALID_SENTIMENT` |
| `Impact` | `IMPACT_ENUM` (`High`, `Medium`, `Low`, case-insensitive normalization) | `INVALID_IMPACT` |
| `Sentiment_Explanation` | Trimmed non-empty string | `MISSING_REQUIRED_FIELD` |

### Structure of `Verified`, `Schema-Valid`, and `Needs Review` Items

Every parsed row is wrapped in a `ValidatedNewsItem` record alongside a run-level `ValidationSummary`:

```ts
type VerificationStatus = 'Verified' | 'Schema-Valid' | 'Needs review';

interface ValidationIssue {
  field: string;      // Column name or 'Row' for extra columns
  code: string;       // e.g., MISSING_REQUIRED_FIELD, PLACEHOLDER_URL, UNGROUNDED_SOURCE
  message: string;    // Human-readable diagnostic
  rawValue?: string;  // Exact value returned by the model
}

interface ValidatedNewsItem {
  id: string;
  raw: Record<string, unknown>;                   // Unmodified parsed row object (including extra columns)
  data: NewsItem;                                 // Trimmed output row with normalized Sentiment & Impact
  verificationStatus: VerificationStatus;         // 'Verified' (grounded), 'Schema-Valid' (syntax-only), or 'Needs review'
  validationIssues: ValidationIssue[];
  isVerified: boolean;
  isGrounded?: boolean;
}

interface ValidationSummary {
  totalRows: number;
  verifiedRows: number;
  needsReviewRows: number;
  hasParseErrors: boolean;
  parseErrors: string[];
}
```

- **Structure of a `Verified` item** (`issues.length === 0` with `groundingSources` domain match):
  ```json
  {
    "id": "row-0-...",
    "raw": { "Date": "2025-02-21", "Time": "14:05", "Sentiment": "positive", "...": "..." },
    "data": { "Date": "2025-02-21", "Time": "14:05", "Sentiment": "Positive", "...": "..." },
    "verificationStatus": "Verified",
    "validationIssues": [],
    "isVerified": true,
    "isGrounded": true
  }
  ```
  - Badged green (`Verified`) in `NewsTable` and `TraceabilityPanel`, meaning schema, strict calendar date, requested range, and source domain grounding all passed.

- **Structure of a `Schema-Valid` item** (`issues.length === 0` without `groundingSources`):
  ```json
  {
    "id": "row-0-...",
    "raw": { "Date": "2025-02-21", "Time": "14:05", "Sentiment": "positive", "...": "..." },
    "data": { "Date": "2025-02-21", "Time": "14:05", "Sentiment": "Positive", "...": "..." },
    "verificationStatus": "Schema-Valid",
    "validationIssues": [],
    "isVerified": true,
    "isGrounded": false
  }
  ```
  - Badged sky-blue (`Schema-Valid`) when no grounding sources were available to corroborate `Source_URL` against source domains, transparently indicating that only schema/syntax, calendar, and range checks ran.

- **Structure of a `Needs Review` item** (`issues.length > 0`):
  ```json
  {
    "id": "row-1-...",
    "raw": { "Date": "2025-02-21", "Time": "", "Source_URL": "N/A", "...": "..." },
    "data": { "Date": "2025-02-21", "Time": "", "Source_URL": "N/A", "...": "..." },
    "verificationStatus": "Needs review",
    "validationIssues": [
      { "field": "Time", "code": "MISSING_REQUIRED_FIELD", "message": "Time is required", "rawValue": "" },
      { "field": "Source_URL", "code": "MISSING_SOURCE_URL", "message": "Source URL is missing or set to N/A", "rawValue": "N/A" }
    ],
    "isVerified": false
  }
  ```
  - Highlighted in amber with an issue-count badge, expandable field-level diagnostics and raw payload view, selectable via the **Needs Review** filter, programmatically filterable via `includeNeedsReview = false` in export helpers, and logged in the XLSX `Traceability` worksheet. When one or more parsed rows need review (even if all rows fail), the run status becomes `partial_success`.

### Rationale Behind the Validation Logic

- **Non-Destructive Quarantine Over Silent Dropping**: Financial research pipelines cannot silently discard malformed model outputs without distorting coverage or hiding hallucinations. Retaining non-compliant rows as `Needs review` preserves end-to-end provenance while keeping `Verified` datasets strictly clean.
- **Mandatory Temporal & Reasoning Fields (`Time`, `Sentiment_Explanation`)**: Requiring both `Time` and `Sentiment_Explanation` guarantees that every `Verified` finding can be ordered intraday and audited for why its sentiment label was assigned.
- **Strict Protocol & Missing-URL Separation (`UrlSchema`)**: Restricting `Source_URL` to `http:` and `https:` prevents unsafe schemes (`javascript:`, `data:`) from reaching clickable links in the UI, while separating `MISSING_SOURCE_URL` (`""`, `"N/A"`) from `INVALID_URL_SCHEME` gives analysts clear remediation signals.
- **Normalized Enums Before Strict Parsing**: Case-insensitive normalization on `Sentiment` and `Impact` avoids false-negative rejections from minor LLM casing variations while still catching out-of-domain labels (`INVALID_SENTIMENT`, `INVALID_IMPACT`).
- **Extra-Column Detection (`UNEXPECTED_COLUMNS`)**: Flagging unrequested columns detects CSV schema drift or unquoted-comma shifts from the model before data enters downstream charts or exports.

---

## Export & Security Protections

See [SECURITY.md](./SECURITY.md) for the complete security architecture, `xlsx@0.18.5` write-only advisory posture, and recommended HTTP Content Security Policy headers.

- **Formula Injection Neutralization (`src/lib/export/excel.ts`)**: Both `exportToCSV` and `exportToXLSX` format rows via a shared `formatExportRow` column layout and pass dynamic values through `sanitizeCell`, prefixing any value starting with `=`, `+`, `-`, `@`, `\t` (tab), or `\r` (carriage return) with a leading single quote (`'`).
- **Filter-Synchronized & Encoded Exports**: Exports operate on the currently filtered table view (keyword search + status tab) and honor the UI **Include Needs Review** toggle (`includeNeedsReview`). CSV blobs prepend a UTF-8 BOM (`\uFEFF`) so Excel preserves currency symbols and international characters, and temporary blob URLs are revoked immediately via `URL.revokeObjectURL`.
- **Native Multi-Sheet XLSX Workbooks**: Generated via SheetJS (`xlsx`) in write-only mode with two worksheets:
  - `Research Results`: Exported rows with auto-filters and sized columns.
  - `Traceability`: Frozen run query, date range, run status, model name, row counts, grounding sources, and detailed validation issues for included rows (all dynamic strings sanitized via `sanitizeCell`).
- **Safe Source Links**: `NewsTable` and `TraceabilityPanel` only render clickable external links for `http`/`https` URLs (`rel="noopener noreferrer"`).

---

## Tech Stack

- **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, Motion (`motion/react`), Lucide React, Recharts 3
- **Backend Proxy & AI**: Supabase Edge Functions (`Deno.serve`), Gemini API (`gemini-3-flash-preview` with `googleSearch` grounding)
- **Parsing & Validation**: PapaParse, Zod v4
- **Storage & Export**: `idb` (IndexedDB + `localStorage` fallback), SheetJS (`xlsx`)
- **Testing & Quality**: Vitest 5, React Testing Library, `fake-indexeddb`, jsdom

---

## Project Structure

```text
├── .github/workflows/ci.yml              # GitHub Actions CI (audit, lint, test, build on Node 22)
├── supabase/
│   ├── config.toml                       # Edge Function config (verify_jwt = false)
│   └── functions/gemini-research/
│       └── index.ts                      # Server-side Gemini proxy & retry handler
├── src/
│   ├── components/
│   │   ├── AnalyticsDashboard.tsx        # Verified toggle & Sentiment/Impact/Category charts
│   │   ├── NewsTable.tsx                 # Sortable/filterable grid & row diagnostics
│   │   └── TraceabilityPanel.tsx         # 4-step pipeline & audit provenance drawer
│   ├── lib/
│   │   ├── export/excel.ts               # Shared sanitizeCell, UTF-8 BOM CSV & XLSX exporters
│   │   ├── storage/db.ts                 # IndexedDB persistence + localStorage fallback
│   │   ├── utils.ts                      # Tailwind class-merge utility (cn)
│   │   └── validation/                   # Zod/domain schemas & edge-case tests (14)
│   ├── services/geminiService.ts         # Rate-limited, timeout-guarded Edge Function client
│   ├── test/                             # Vitest suites (app, components, db, export, geminiService, validation)
│   ├── tests/export.test.ts              # Formula-injection sanitizer tests (=HYPERLINK, +, -, @)
│   ├── App.tsx                           # Main application UI & state orchestration
│   ├── index.css                         # Tailwind CSS entrypoint & base styling
│   ├── main.tsx                          # React root mount
│   ├── types.ts                          # Shared NewsItem & SortConfig types
│   └── vite-env.d.ts                     # Vite client environment typings
├── .env.example                          # Template for client & server environment variables
├── CHANGELOG.md                          # Release notes and version history
├── index.html                            # HTML entry point & OpenGraph/Twitter metadata
├── LICENSE                               # Apache-2.0 license text
├── metadata.json                         # Applet manifest and server-side Gemini capability
├── package.json                          # Dependencies and npm scripts
├── SECURITY.md                           # Security posture, secret boundary & CSP guidance
├── tsconfig.json                         # Strict TypeScript config (strict: true; excludes supabase/, dist/, node_modules/)
├── vite.config.ts                        # Vite dev/build configuration
└── vitest.config.ts                      # Vitest + jsdom test configuration
```

---

## Getting Started

### Prerequisites

- **Node.js 22+** and **npm** (required by `vitest` and `@supabase/supabase-js`)
- A **Supabase project** with the Supabase CLI (or dashboard) to deploy the Edge Function
- A **Google Gemini API key**

### Environment Variables

The application strictly separates public Vite client settings from the server-only Gemini API secret. Never prefix `GEMINI_API_KEY` with `VITE_`, as doing so would bundle it into browser assets:

| Variable | Scope | Where to Set | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Server-only** (never bundled into client) | Supabase Edge Function secret | **Required.** Google Gemini API key read strictly on the server by `supabase/functions/gemini-research/index.ts` via `Deno.env.get("GEMINI_API_KEY")`. |
| `VITE_SUPABASE_URL` | Client (Vite) | `.env` / hosting build env | **Required.** Base URL of your Supabase project (`https://<project-ref>.supabase.co`), used to call `/functions/v1/gemini-research`. |
| `VITE_SUPABASE_ANON_KEY` | Client (Vite) | `.env` / hosting build env | **Required.** Public Supabase anonymous key sent in the `Authorization: Bearer` header. |

Example local `.env` (client-only values copied from `.env.example` — omit `GEMINI_API_KEY` from client builds):

```env
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

### Backend Endpoint Deployment (Required)

Because the browser never calls Google Gemini directly, **you must deploy the `gemini-research` Edge Function and configure `GEMINI_API_KEY` before running research queries** (otherwise queries fail with `PROVIDER_ERROR` when client `VITE_SUPABASE_*` variables are missing, or `NETWORK_FAILURE` when the Edge Function or server `GEMINI_API_KEY` secret is missing):

1. **Link your Supabase project** (or configure via the Supabase Dashboard):
   ```bash
   supabase link --project-ref your-project-ref
   ```
2. **Set the server-side Gemini secret**:
   ```bash
   supabase secrets set GEMINI_API_KEY="your-gemini-api-key"
   ```
3. **Deploy the backend Edge Function** (`supabase/config.toml` sets `verify_jwt = false` so requests authenticated with the public anon key are accepted, and CORS headers allow browser preflight `OPTIONS` / `POST` requests):
   ```bash
   supabase functions deploy gemini-research
   ```
4. **Configure your client `.env` file** (`cp .env.example .env`) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Local Development Commands

```bash
# Install dependencies
npm install

# Start the Vite development server on port 3000
npm run dev

# Check dependency advisories (critical threshold)
npm audit --audit-level=critical

# Run strict TypeScript type checking (tsc --noEmit)
npm run lint

# Run the Vitest unit test suite (56 tests across 8 files)
npm test

# Build the production bundle into dist/
npm run build

# Preview the production build locally
npm run preview

# Remove generated build artifacts (dist/)
npm run clean
```

---

## Continuous Integration

The workflow in `.github/workflows/ci.yml` runs on `ubuntu-latest` with **Node.js 22** (using `actions/checkout@v6` and `actions/setup-node@v6`, with manual `workflow_dispatch`, job timeouts, and concurrency cancellation) on pushes and pull requests to `main` and `master`, executing:

1. `npm ci`
2. `npm audit --audit-level=critical`
3. `npm run lint` (`tsc --noEmit`)
4. `npm test` (`vitest run`)
5. `npm run build` (`vite build`)

---

## License

This project is licensed under the [Apache-2.0 License](./LICENSE).
