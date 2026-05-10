# Changelog

All notable changes to this project will be documented in this file.

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
