# Project memory

## Product intent & audience

- Financial news research tool powered by Gemini AI; fetches news from web content via the model and presents it with sentiment analysis, validation status, and traceability/audit metadata.
- Users search by date range and other criteria, review results in a filtered table, view analytics dashboards, and export to CSV/XLSX.
- Audience appears to be analysts/researchers who need auditable, validated news data with export capability.

## Brand personality & voice

- Professional, technical, audit-oriented tone (references to "strict runtime verification," "traceability," "validation issues").

## Visual design & UX direction

- Table-based results view with status filtering (Verified / Needs review / unparseable).
- Analytics dashboard includes pie charts for sentiment breakdown; sentiment colors are assigned by meaning (green = Positive, etc.) but currently buggy (assigned by position after zero-value filtering).
- Traceability panel shows numbered steps (research → validate → save), with hardcoded status labels.
- Export produces multi-sheet XLSX with a detailed validation-issues traceability sheet alongside data.

## Decisions, constraints & rationale

- **Stack:** Vite + React + TypeScript; Zod for schema definitions; Google Gemini SDK for AI calls; IndexedDB primary storage with localStorage fallback.
- **AI architecture (current, problematic):** Gemini API key is embedded in the client bundle and the browser calls Google directly — identified as critical security issue; recommended move to a server proxy (e.g., Supabase Edge Function).
- **Validation:** Zod schemas (`RawNewsItemSchema`, `UrlSchema`, `DateSchema`) are defined but not invoked at runtime; a manual `validateNewsItem` function is used instead and has drifted from the schema (weaker — doesn't require `Time` or `Sentiment_Explanation`).
- **Storage caps inconsistent:** localStorage fallback caps at 20 runs; IndexedDB keeps everything.
- **Abort/cancel:** `researchFinancialNews` accepts an `AbortSignal` but no UI wires it up; no cancel button exists.
- **Testing:** 19 tests pass; type check clean; none of the identified issues are caught by existing automated checks.

## Open questions & assumptions

- Should the Gemini call be moved behind a server function? (Critical security decision pending user confirmation.)
- Should Zod schemas replace the manual validation, aligning the required fields?
- Should a cancel button be added to leverage the existing AbortSignal plumbing?
- Should history caps be unified between IndexedDB and localStorage?
- Assumption: the app is intended for single-user/local use given the client-side storage approach.