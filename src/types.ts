export interface NewsItem {
  Date: string;
  Time: string;
  Headline: string;
  Short_Summary: string;
  Primary_Ticker_or_Entity: string;
  Region_or_Market: string;
  Category: string;
  Source_Name: string;
  Source_URL: string;
  Sentiment: string;
  Impact: string;
  Sentiment_Explanation: string;
}

export type SortConfig = {
  key: keyof NewsItem | null;
  direction: 'asc' | 'desc';
};

export interface ResearchHistoryItem {
  id: string;
  query: string;
  timestamp: number;
  startDate?: string;
  endDate?: string;
  itemCount: number;
}
