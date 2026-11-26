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

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Client (Vite) | Base URL of your Supabase project (used to call `/functions/v1/gemini-research`). |
| `VITE_SUPABASE_ANON_KEY` | Client (Vite) | Supabase project anonymous/public key passed in the `Authorization` header. |
| `GEMINI_API_KEY` | Server-only (Supabase secret) | Google Gemini API key read by `supabase/functions/gemini-research/index.ts` via `Deno.env.get`. |

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
