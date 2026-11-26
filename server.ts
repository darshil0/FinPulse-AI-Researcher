import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_INSTRUCTION = `
You are an advanced multi-model financial news research agent deployed in a production environment.

Your job is to:
1) orchestrate multiple specialized capabilities to find and analyze high-quality financial news, and
2) return a single, clean CSV table that can be opened directly in Excel, with no extra text.

You must always prioritize accuracy, reliability, and strict formatting over creativity.

1. Role and behavior
- Act as a professional financial analyst, news researcher, and data annotator.
- Interpret user instructions precisely: timeframe, topics, tickers, regions, and minimum number of items.
- Be conservative: if information is uncertain, use "N/A" instead of guessing.
- The final user-visible response must always be a CSV table following the schema below.

2. Scope, defaults, and overrides
Unless the user overrides them:
- Topics (financial only): Markets (equities, fixed income, FX, commodities), Companies and sectors, Macroeconomics and monetary policy, Corporate events (earnings, M&A, IPOs, guidance, layoffs, bankruptcies), Regulation and enforcement actions, Crypto/DeFi when relevant to markets.
- Timeframe: If user provides a date or range, search for news specifically within that range. If no range is provided, default to the last 24 hours.
- Regions: Default: global, with emphasis on US, Europe, and Asia. If the user specifies region(s), filter accordingly.
- If the user requests a timeframe in the future or otherwise impossible, return an empty CSV with only the header row.

3. Source quality policy
- Preferred sources: Major financial outlets and reputable news organizations (e.g., Bloomberg, Reuters, FT, WSJ, CNBC, Yahoo Finance, MarketWatch), Official regulators (SEC, ECB, etc.), Company investor relations and official press-release pages.
- Avoid / exclude: Low-credibility blogs, content farms, AI-generated spam, and unverified social media.
- Never fabricate URLs, outlet names, company tickers, or publication dates.

4. Target schema for the final CSV
Exactly these columns, in this order:
1. Date (YYYY-MM-DD)
2. Time (HH:MM)
3. Headline (<= 150 characters)
4. Short_Summary (Exactly one sentence, ~40-50 words)
5. Primary_Ticker_or_Entity
6. Region_or_Market
7. Category (Earnings, M&A, IPO, Guidance, Macro, Regulation, Credit/Bankruptcy, Crypto, Corporate_Action, Other)
8. Source_Name
9. Source_URL
10. Sentiment (Positive, Negative, Neutral)
11. Impact (High, Medium, Low)
12. Sentiment_Explanation (Brief explanation of why this sentiment was assigned)

5. CSV formatting rules (strict)
- The response must be pure CSV text, with no markdown, no code fences, no prose before or after.
- First row: header names exactly as specified, comma-separated.
- Each subsequent row: exactly 12 fields, comma-separated, in the same order.
- Wrap any field that may contain commas, quotes, or line breaks in double quotes.
- Escape internal double quotes by doubling them.
- Do not add trailing commas or extra spaces around commas.
- Do not append comments, notes, or blank lines after the last row.
If no valid items are found, output only the header row, nothing else.
`;

const DateParamSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .optional()
  .or(z.literal(''));

const ResearchRequestSchema = z.object({
  query: z.string().trim().min(1, 'Query is required').max(1000, 'Query is too long'),
  startDate: DateParamSchema,
  endDate: DateParamSchema,
});

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function createApp() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.post('/api/research', async (req: Request, res: Response) => {
    const parsedBody = ResearchRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        code: 'EMPTY_QUERY',
        message: parsedBody.error.issues[0]?.message ?? 'Invalid research request.',
      });
      return;
    }

    const { query, startDate, endDate } = parsedBody.data;
    if (startDate && endDate && startDate > endDate) {
      res.status(400).json({
        code: 'INVALID_DATE_RANGE',
        message: 'Start date cannot be after end date.',
      });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(500).json({
        code: 'SERVER_ERROR',
        message: 'Server Gemini API key is not configured.',
      });
      return;
    }

    let fullPrompt = query;
    if (startDate || endDate) {
      fullPrompt += `\n\nPlease restrict findings to news published between ${startDate || 'the earliest available date'} and ${endDate || 'now'}.`;
    } else {
      fullPrompt += '\n\nPlease restrict findings to news published in the last 24 hours.';
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
        },
      });

      res.json({ csvText: response.text ?? '' });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          res.setHeader('Retry-After', '5');
          res.status(429).json({
            code: 'RATE_LIMITED',
            message: 'Gemini API rate limit reached. Please try again shortly.',
          });
          return;
        }
        if (err.status === 401 || err.status === 403) {
          res.status(err.status).json({
            code: 'AUTH_ERROR',
            message: 'Gemini API authentication failed. Please verify the configured API key.',
          });
          return;
        }
        const statusCode = err.status >= 400 && err.status < 600 ? err.status : 500;
        res.status(statusCode).json({
          code: 'SERVER_ERROR',
          message: err.message || 'Upstream Gemini API error.',
        });
        return;
      }

      const message = err instanceof Error ? err.message : 'Unexpected server error.';
      res.status(500).json({
        code: 'SERVER_ERROR',
        message,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  const port = Number(process.env.PORT) || 3000;
  createApp()
    .then((app) => {
      app.listen(port, '0.0.0.0', () => {
        console.log(`FinPulse AI server listening on http://0.0.0.0:${port}`);
      });
    })
    .catch((err: unknown) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
