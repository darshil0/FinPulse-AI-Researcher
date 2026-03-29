# FinPulse AI Researcher

FinPulse AI Researcher is an institutional-grade financial news research and extraction agent. It leverages advanced AI models to scan the web, identify credible financial news, and extract structured data into a clean CSV format suitable for direct import into Excel.

## Features

- **AI-Powered Extraction**: Uses Gemini 3 Flash with Google Search grounding to scan the web for real-time financial data.
- **Strict Data Schema**: Extracts 12 specific data points including Sentiment, Impact, and Source URLs.
- **Sentiment Reasoning**: Provides concise explanations for assigned sentiments based on market impact.
- **Professional Data Grid**: Displays findings in a scannable, high-density dashboard inspired by institutional financial tools.
- **Expandable Insights**: Click on any news item to see the logic behind its sentiment score.
- **Excel Integration**: One-click "Export to Excel" functionality that generates a clean CSV file.
- **Deterministic Research**: Prioritizes accuracy and traceability over speculation.

## Tech Stack

- **Frontend**: React 19, Tailwind CSS 4, Framer Motion, Lucide React.
- **AI**: Google Gemini API (@google/genai) with Search Grounding.
- **Data Handling**: PapaParse for robust CSV generation and parsing.

## Getting Started

### Prerequisites

- Node.js installed.
- A Gemini API Key (automatically handled in the AI Studio environment).

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

1. Enter a financial research query in the search bar (e.g., "Get all legit financial news for today about US semiconductor stocks").
2. Click "Run Agent" to start the research process.
3. Review the findings in the interactive table.
4. Click on a row to see the sentiment analysis explanation.
5. Click "Export to Excel (CSV)" to download the structured data.

## License

This project is licensed under the Apache-2.0 License.
