# FinPulse AI Researcher

FinPulse AI Researcher is a financial news research and audit application built with React, TypeScript, Vite, and a Supabase Edge Function proxy. It retrieves grounded market news via Gemini, validates every extracted row at runtime with Zod, preserves pipeline traceability and local history in IndexedDB, and exports results to CSV and native XLSX workbooks.

## Key Features

- **Server-Side Gemini Proxy (Supabase Edge Function)**: Client requests invoke `supabase/functions/gemini-research` (`gemini-3-flash-preview` with Google Search grounding), keeping `GEMINI_API_KEY` strictly on the server as a Supabase secret and applying automatic exponential backoff retries on `429` and `5xx` responses.
- **Historical Date-Range & Cancelable Queries**: Supports optional `startDate` and `endDate` filtering with historical mode indicators, `INVALID_DATE_RANGE` client-side validation, and in-flight request cancellation via `AbortController` (**Cancel Research**).
- **Strict Runtime Zod Validation**: Validates all 12 CSV fields against `RawNewsItemSchema`, `DateSchema`, `UrlSchema`, `SENTIMENT_ENUM`, and `IMPACT_ENUM`, normalizing enum casing, flagging unexpected columns, and distinguishing missing URLs (`MISSING_SOURCE_URL`) from invalid URL schemes (`INVALID_URL_SCHEME`).
- **Deterministic Verification States**:
  - **`Verified`**: Rows passing every schema, date, `http:`/`https:` URL, and enum check.
  - **`Needs review`**: Rows with missing or invalid fields, preserved with detailed field-level `ValidationIssue` diagnostics rather than discarded.
- **Interactive Data Grid & Analytics**:
  - Multi-column sorting, keyword/ticker search, status filtering (`All Rows`, `Verified Only`, `Needs Review`), and expandable rows showing `Sentiment_Explanation` and validation issues.
  - Recharts `AnalyticsDashboard` with name-mapped sentiment (`Positive`, `Negative`, `Neutral`) and market impact (`High`, `Medium`, `Low`) pie charts plus a Top Categories bar chart.
- **Traceability & Audit Panel**: Displays query parameters, model metadata, grounding search sources, schema validation counts, run status (`success`, `partial_success`, `no_results`, `network_error`, `unparseable_model_output`), per-row raw payloads, and raw LLM output with one-click copy.
- **IndexedDB Persistence with Fallback**: Stores up to `200` recent research runs (`MAX_STORED_RUNS`) in IndexedDB (`finpulse_db`) via `idb` with automatic `localStorage` fallback, one-time legacy `localStorage` migration, single-run deletion, and history clearing.
- **CSV & Native XLSX Export**: Exports filtered (`Verified` + `Needs review` or `Verified` only) datasets to native Excel (`.xlsx`) with auto-filters, frozen headers, and a `Traceability` audit worksheet, or to CSV with formula-injection neutralization (`sanitizeCell`) and `URL.revokeObjectURL` cleanup.

## Architecture

```text
┌───────────────────────────┐   POST /functions/v1/gemini-research   ┌─────────────────────────────────┐
│     Browser Client        │ ─────────────────────────────────────► │   Supabase Edge Function (Deno) │
│  (React + AbortSignal)    │ ◄───────────────────────────────────── │   (Server-only GEMINI_API_KEY)  │
└─────────────┬─────────────┘     rawText + groundingSources         └────────────────┬────────────────┘
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
│ (Grid & Recharts) │      │ (XLSX + Traceability) │   │ + localStorage Fallback  │
└───────────────────┘      └───────────────────────┘   └──────────────────────────┘
```

### Server-Side Gemini API Boundary

The browser bundle **never** stores, bundles, or transmits a Gemini API key (`vite.config.ts` does not expose `GEMINI_API_KEY` to `import.meta.env` or `define`). Instead, all AI requests flow through a dedicated backend proxy:

1. **Client Request (`src/services/geminiService.ts`)**: Sends `POST ${VITE_SUPABASE_URL}/functions/v1/gemini-research` with `{ query, startDate, endDate }`, an `Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}` header, and an optional `AbortSignal` for user cancellation.
2. **Backend Proxy (`supabase/functions/gemini-research/index.ts`)**: Runs on Deno (`Deno.serve`), validates inputs (`query` up to 2,000 characters and `YYYY-MM-DD` date strings), and reads `GEMINI_API_KEY` exclusively from server-side secrets (`Deno.env.get("GEMINI_API_KEY")`).
3. **Upstream Gemini Call & Retries**: Invokes `gemini-3-flash-preview` via the Gemini REST API with `x-goog-api-key` and Google Search grounding (`googleSearch`), applying up to `3` exponential backoff retries (`1s`–`10s`) on `429` and `5xx` responses before returning `{ rawText, groundingSources, modelName }` JSON to the client.

## Data Integrity

Every CSV row parsed from the Gemini response passes through a strict runtime validation boundary (`src/lib/validation/index.ts`) powered by Zod v4 before entering the UI, persistence store, or export pipeline.

### Zod Validation Schemas

`validateNewsItem` normalizes enum casing (e.g., `positive` → `Positive`, `high` → `High`) and validates all 12 expected columns against `RawNewsItemSchema`:

- **`DateSchema`**: Rejects empty values and `"N/A"`, requiring a trimmed string that parses into a valid JavaScript `Date` (e.g., `YYYY-MM-DD`; emits `INVALID_DATE` on failure).
- **`UrlSchema`**: Rejects empty values and `"N/A"` (`MISSING_SOURCE_URL`) and parses `Source_URL` via the standard `URL` constructor, allowing only `http:` and `https:` protocols (`INVALID_URL_SCHEME`).
- **Required Non-Empty Text Fields**: `Time`, `Headline`, `Short_Summary`, `Primary_Ticker_or_Entity`, `Region_or_Market`, `Category`, `Source_Name`, and `Sentiment_Explanation` must all be non-empty trimmed strings (`MISSING_REQUIRED_FIELD`).
- **Strict Enums**:
  - `Sentiment` (`SENTIMENT_ENUM`): Must match `Positive`, `Negative`, or `Neutral` (`INVALID_SENTIMENT`).
  - `Impact` (`IMPACT_ENUM`): Must match `High`, `Medium`, or `Low` (`INVALID_IMPACT`).
- **Unexpected Columns Check**: Any extra keys beyond the 12 schema fields flag an `UNEXPECTED_COLUMNS` issue on the row.

### `Verified` vs. `Needs review` Statuses

Invalid rows are **never silently discarded**—instead, `validateResearchResults` retains every parsed row as a `ValidatedNewsItem` and assigns a deterministic verification status:

| Status | Criteria | Behavior in UI, Traceability & Exports |
| :--- | :--- | :--- |
| **`Verified`** (`isVerified: true`) | Passes all `RawNewsItemSchema` checks with zero `ValidationIssue` entries and no unexpected columns. | Badged green in `NewsTable` and `TraceabilityPanel`. Included under **All Rows** and **Verified Only** filters, and contributes to `summary.verifiedRows`. When all parsed rows are verified, the run status is `success`. |
| **`Needs review`** (`isVerified: false`, displayed in filter controls as **Needs Review**) | Fails one or more Zod schema constraints or contains unexpected columns. | Highlighted in amber with an issue count badge, expandable per-field error diagnostics (`field`, `code`, `message`, `rawValue`), and raw row payload inspection. Included in **All Rows** and **Needs Review** views (or excluded when exporting verified-only datasets) and logged on the XLSX `Traceability` sheet. When one or more parsed rows need review, the run status becomes `partial_success`. |

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion (`motion/react`), Lucide React, Recharts.
- **Backend Proxy & AI**: Supabase Edge Functions (`Deno.serve`), Gemini API (`gemini-3-flash-preview` with `googleSearch` grounding).
- **Parsing & Validation**: PapaParse, Zod v4.
- **Persistence & Export**: `idb` (IndexedDB + `localStorage` fallback), SheetJS (`xlsx`).
- **Testing & CI**: Vitest, React Testing Library, `fake-indexeddb`, jsdom, GitHub Actions (`.github/workflows/ci.yml`).

## Getting Started

### Prerequisites

- Node.js 20+ and npm.
- A Supabase project with the `gemini-research` Edge Function deployed (`supabase/functions/gemini-research/index.ts`).
- A Google Gemini API key set as the `GEMINI_API_KEY` secret on the Supabase Edge Function.

### Environment Variables

The application strictly separates client-safe Supabase connection values from the server-only Gemini secret:

| Variable | Scope | Where to Set | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Server-only** (never exposed to browser) | Supabase Edge Function secret | **Required.** Google Gemini API key read exclusively by `supabase/functions/gemini-research/index.ts` via `Deno.env.get("GEMINI_API_KEY")`. |
| `VITE_SUPABASE_URL` | Client (Vite `.env`) | Local `.env` / hosting build env | **Required.** Base URL of your Supabase project (e.g., `https://<project-ref>.supabase.co`), used to reach `/functions/v1/gemini-research`. |
| `VITE_SUPABASE_ANON_KEY` | Client (Vite `.env`) | Local `.env` / hosting build env | **Required.** Public Supabase anonymous key sent in the `Authorization` header when calling the Edge Function. |

### Backend Endpoint Deployment (Required)

Because the frontend does not call the Gemini API directly, **you must deploy the `gemini-research` Supabase Edge Function and configure `GEMINI_API_KEY` before running research queries** (otherwise the app will report a configuration or connection error):

1. **Configure the server-side Gemini secret** in your Supabase project:
   ```bash
   supabase secrets set GEMINI_API_KEY="your-gemini-api-key"
   ```
2. **Deploy the backend endpoint** (`supabase/config.toml` sets `verify_jwt = false` for public anon-key invocations):
   ```bash
   supabase functions deploy gemini-research
   ```
3. **Provide the client `.env` variables** (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) so the frontend can reach your deployed endpoint.

### Local Development Commands

- **Install dependencies**:
  ```bash
  npm install
  ```

- **Start development server** (Vite on port `3000`):
  ```bash
  npm run dev
  ```

- **Typecheck**:
  ```bash
  npm run lint
  ```

- **Run unit tests** (21 tests across 5 suites in `src/test/`):
  ```bash
  npm test
  ```

- **Build for production**:
  ```bash
  npm run build
  ```

## License

This project is licensed under the Apache-2.0 License.
