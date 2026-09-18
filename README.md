# FinPulse AI Researcher

FinPulse AI Researcher is an institutional-grade financial news research and extraction agent. It leverages advanced AI models to scan the web, identify credible financial news, validate output schemas at runtime, provide complete audit traceability, and export data in CSV and native XLSX formats.

## Key Features

- **AI-Powered Extraction**: Uses Gemini 3 Flash (`gemini-3-flash-preview`) with Google Search Grounding for real-time financial news discovery.
- **Strict Schema Validation & Untrusted Output Boundaries**: All LLM outputs pass through a runtime Zod validation boundary checking 12 required fields, valid HTTP/HTTPS URLs, supported sentiment enums (`Positive`, `Negative`, `Neutral`), and impact levels (`High`, `Medium`, `Low`).
- **Deterministic Verification States**:
  - **`Verified`**: Rows that satisfy all schema, field presence, valid HTTP/HTTPS source URL, and allowed enum constraints.
  - **`Needs review`**: Rows flagged for missing citations, invalid URLs, malformed strings, or out-of-bounds values. Invalid rows remain fully accessible for auditability rather than being silently discarded.
- **Traceability & Audit Chain**: Expandable audit drawer displaying query context, model extraction metadata, raw LLM output text, grounding sources, and per-row validation breakdowns with copy-to-clipboard support.
- **Resilient AI Pipeline**: Exponential backoff retries with jitter for rate-limiting (HTTP 429) and transient errors, respecting `Retry-After` headers and classifying failures into distinct user states.
- **IndexedDB Research Storage & Legacy Migration**: Asynchronous persistence using `idb` (`finpulse_db`), with automated one-time migration from legacy `localStorage` records and graceful fallbacks.
- **Native XLSX & CSV Export**: Native `.xlsx` export with formatted headers, auto-filters, frozen top rows, and a dedicated `Traceability` metadata worksheet alongside standard `.csv` export.
- **Visual Analytics & Data Grid**: Interactive Recharts sentiment and category charts, sortable grid, status filtering (`All`, `Verified Only`, `Needs Review`), and expandable reasoning.

## Tech Stack

- **Frontend**: React 19, Tailwind CSS 4, Framer Motion, Lucide React, Recharts.
- **AI & Grounding**: `@google/genai` (Gemini 3 Flash with Google Search grounding).
- **Validation & Storage**: Zod, `idb` (IndexedDB).
- **Data Export & Parsing**: SheetJS (`xlsx`), PapaParse.
- **Testing & Quality**: Vitest, `@testing-library/react`, TypeScript.

## Getting Started

### Prerequisites

- Node.js (v20+ recommended).
- A valid Gemini API Key set in `GEMINI_API_KEY`.

### Environment Variables

| Variable | Description |
| :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key required for AI research calls. |

### Local Development Commands

- **Install dependencies**:
  ```bash
  npm install
  ```

- **Start development server**:
  ```bash
  npm run dev
  ```

- **Typecheck & Lint**:
  ```bash
  npm run lint
  ```

- **Run Test Suite**:
  ```bash
  npm test
  ```

- **Production Build**:
  ```bash
  npm run build
  ```

## Continuous Integration

GitHub Actions workflow is configured under `.github/workflows/ci.yml` running on pull requests and pushes to `main`/`master` branches. It executes deterministic dependency installation (`npm ci`), type checking (`npm run lint`), unit tests (`npm test`), and production builds (`npm run build`).

## License

This project is licensed under the Apache-2.0 License.
