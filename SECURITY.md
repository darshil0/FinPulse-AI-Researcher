# Security Policy

## Architecture & Secret Boundaries

FinPulse AI Researcher isolates all Gemini API credentials behind a server-side Supabase Edge Function proxy (`supabase/functions/gemini-research/index.ts`).

- **Server-Only Secrets**: `GEMINI_API_KEY` is read exclusively from Supabase Edge Function runtime secrets (`Deno.env.get("GEMINI_API_KEY")`). It is never exposed via Vite `define` or `VITE_*` client environment variables, ensuring the key is absent from browser bundles (`dist/`).
- **Client Environment Variables**: Only public Supabase connection values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are passed to the Vite client build.
- **Request Validation & Throttling**:
  - The Edge Function enforces query length limits (`<= 2,000` characters) and `YYYY-MM-DD` date syntax (`startDate <= endDate`).
  - `src/services/geminiService.ts` enforces client-side rate limiting (`2,000 ms` minimum spacing, `10` requests per `60s` sliding window) and a `45s` `AbortController` request timeout.

## Input Validation & Content Safety

- **Strict Runtime Verification (`src/lib/validation/index.ts`)**: All extracted model rows pass through Zod (`RawNewsItemSchema`) and domain verification rules checking calendar date validity (rejecting impossible dates like `2026-02-30`), non-future dates, date-range bounds, placeholder/local domains (`localhost`, `example.com`, `.local`, single-label hosts), and grounding source domain/title corroboration.
- **URL Scheme Filtering**: Clickable external links in `NewsTable` and `TraceabilityPanel` strictly require `http://` or `https://` URLs (`rel="noopener noreferrer"`), blocking `javascript:`, `data:`, and `file:` schemes.
- **Spreadsheet Formula Injection Protection (`src/lib/export/excel.ts`)**: Both CSV and XLSX exports pass dynamic strings through `sanitizeCell`, prefixing leading `=`, `+`, `-`, `@`, `\t`, or `\r` characters with a leading apostrophe (`'`). CSV files include a UTF-8 BOM (`\uFEFF`) to prevent encoding mangling.

## Dependency & Supply-Chain Posture

- **Critical Vulnerability & Type-Safety Gates**: GitHub Actions `.github/workflows/ci.yml` runs `npm audit --audit-level=critical` on pushes and pull requests to `main`/`master`, and `.github/workflows/audit.yml` runs `npm audit --audit-level=critical` and `npx tsc --strict --noEmit` on every push.
- **`xlsx@0.18.5` (SheetJS) Advisory Note**: `xlsx` carries known high-severity prototype pollution and ReDoS advisories in its parser paths, with no newer patched release published on the public npm registry. In FinPulse AI Researcher, `xlsx` is invoked strictly in **write-only** mode (`XLSX.utils.book_new`, `XLSX.utils.json_to_sheet`, `XLSX.writeFile`) to export sanitized client-side research tables and never parses untrusted external `.xlsx` files.

## Recommended Deployment Hardening

When hosting the static frontend, configure HTTP security headers at your CDN or reverse proxy:

- `Content-Security-Policy`: Restrict `connect-src` to `'self'` and your Supabase project domain (`https://<project-ref>.supabase.co`), disallow inline scripts (`script-src 'self'`), and set `frame-ancestors 'none'` or `'self'`.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Reporting a Vulnerability

If you discover a security issue, please avoid disclosing exploit details in public issues. Open a private GitHub Security Advisory on the repository or contact the maintainers directly with steps to reproduce, affected files, and impact assessment.
