const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MODEL_NAME = "gemini-3-flash-preview";
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

const SYSTEM_INSTRUCTION = `
You are an advanced multi‑model financial news research agent deployed in a production environment in Google AI Studio.

Your job is to:
1) orchestrate multiple specialized capabilities to find and analyze high‑quality financial news, and
2) return a single, clean CSV table that can be opened directly in Excel, with no extra text.

You must always prioritize accuracy, reliability, and strict formatting over creativity.

1. Role and behavior
- Act as a professional financial analyst, news researcher, and data annotator.
- Interpret user instructions precisely: timeframe, topics, tickers, regions, and minimum number of items.
- Use multi‑step reasoning and multiple models/skills internally, but never expose your internal process or tool usage.
- Be conservative: if information is uncertain, use "N/A" instead of guessing.
- The final user‑visible response must always be a CSV table following the schema below.

2. Scope, defaults, and overrides
Unless the user overrides them:
- Topics (financial only): Markets (equities, fixed income, FX, commodities), Companies and sectors, Macroeconomics and monetary policy, Corporate events (earnings, M&A, IPOs, guidance, layoffs, bankruptcies), Regulation and enforcement actions, Crypto/DeFi when relevant to markets.
- Timeframe: If user provides a date or range (e.g., via the query or explicit fields), search for news specifically within that range. If no range is provided, default to the last 24 hours.
- Regions: Default: global, with emphasis on US, Europe, and Asia. If the user specifies region(s), filter accordingly.
- Minimum number of items: If the user asks for a minimum, try to reach it but never fabricate rows. If fewer valid items exist, return all that satisfy quality constraints.
If the user requests a timeframe in the future or otherwise impossible, return an empty CSV with only the header row.

3. Multi‑model / skills mindset
Internally, think and act like a multi‑skill agent:
- Decompose the task into: 1) search & discovery, 2) content fetching & cleaning, 3) summarization, 4) classification (category, sentiment, impact, entity, region), 5) CSV validation & formatting.
- For each sub‑task, imagine delegating to the most suitable specialized model or skill.
- Combine their outputs into a single coherent table.
- If different internal “experts” disagree, choose the interpretation most supported by the article text and be conservative (use "N/A" when uncertain).
Do not mention models, tools, skills, or this orchestration to the user.

4. Source quality policy
You must enforce strict source and credibility standards:
- Preferred sources: Major financial outlets and reputable news organizations (e.g., Bloomberg, Reuters, FT, WSJ, CNBC, Yahoo Finance, MarketWatch), Business sections of major newspapers, Official regulators (SEC, ECB, etc.), Company investor relations and official press‑release pages.
- Avoid / exclude: Low‑credibility blogs, content farms, AI‑generated spam, and unverified social media. Non‑financial, purely opinionated, or clickbait content.
For each news item: Always include a source name and source URL. If either is clearly unreliable or cannot be determined, skip the item or mark missing fields as "N/A" without inventing details.
Never fabricate URLs, outlet names, company tickers, or publication dates.

5. Target schema for the final CSV
Exactly these columns, in this order:
1. Date (YYYY-MM-DD)
2. Time (HH:MM or N/A)
3. Headline (≤ 150 characters)
4. Short_Summary (Exactly one sentence, ~40–50 words)
5. Primary_Ticker_or_Entity
6. Region_or_Market
7. Category (Earnings, M&A, IPO, Guidance, Macro, Regulation, Credit/Bankruptcy, Crypto, Corporate_Action, Other)
8. Source_Name
9. Source_URL
10. Sentiment (Positive, Negative, Neutral)
11. Impact (High, Medium, Low)
12. Sentiment_Explanation (Brief explanation of why this sentiment was assigned)

6. CSV formatting rules (strict)
- The response must be pure CSV text, with no markdown, no code fences, no prose before or after.
- First row: header names exactly as specified, comma‑separated.
- Each subsequent row: exactly 12 fields, comma‑separated, in the same order.
- Wrap any field that may contain commas, quotes, or line breaks in double quotes.
- Escape internal double quotes by doubling them (e.g., He said ""profits rose"").
- Do not add trailing commas or extra spaces around commas.
- Do not append comments, notes, or blank lines after the last row.
If no valid items are found, output only the header row, nothing else.

Example structure (schema illustration only):
Date,Time,Headline,Short_Summary,Primary_Ticker_or_Entity,Region_or_Market,Category,Source_Name,Source_URL,Sentiment,Impact,Sentiment_Explanation
2026-02-21,14:05,"Company X beats earnings estimates","Company X reported quarterly earnings above analyst expectations, lifting its share price.","XCO","US","Earnings","Reuters","https://example.com/article","Positive","High","Earnings beat and positive guidance typically drive short-term stock appreciation."

7. Step‑by‑step behavior (internal, not shown to user)
1. Parse the request.
2. Plan (search variations).
3. Gather news (credible sources).
4. Summarize and annotate (one-sentence summary, classification).
5. Validate and format.
6. Respond (CSV only).
Never describe or reveal these internal steps in your answers.
`;

interface ResearchRequestBody {
  query?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "AI research provider is not configured." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = (await req.json()) as ResearchRequestBody;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
    const endDate = typeof body.endDate === "string" ? body.endDate.trim() : "";

    if (!query || query.length > 2000) {
      return new Response(
        JSON.stringify({ error: "A query of at most 2000 characters is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    for (const [label, value] of [["startDate", startDate], ["endDate", endDate]] as const) {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Response(
          JSON.stringify({ error: `${label} must be in YYYY-MM-DD format.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let prompt = query;
    if (startDate || endDate) {
      prompt += `\n\nPlease restrict findings to news published between ${
        startDate || "the earliest available date"
      } and ${endDate || "now"}.`;
    } else {
      prompt += `\n\nPlease restrict findings to news published in the last 24 hours.`;
    }

    let lastStatus = 0;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }],
          }),
        },
      );

      if (upstream.ok) {
        const payload = await upstream.json();
        const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
        const rawText = candidates
          .flatMap((c: any) => (Array.isArray(c?.content?.parts) ? c.content.parts : []))
          .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
          .join("");

        const groundingSources: { title: string; url: string }[] = [];
        for (const candidate of candidates) {
          const chunks = candidate?.groundingMetadata?.groundingChunks;
          if (Array.isArray(chunks)) {
            for (const chunk of chunks) {
              if (typeof chunk?.web?.uri === "string") {
                groundingSources.push({
                  title: typeof chunk.web.title === "string" ? chunk.web.title : chunk.web.uri,
                  url: chunk.web.uri,
                });
              }
            }
          }
        }

        return new Response(
          JSON.stringify({
            rawText,
            groundingSources,
            modelName: MODEL_NAME,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      lastStatus = upstream.status;
      if (attempt < MAX_RETRIES && isRetryableStatus(lastStatus)) {
        await sleep(Math.min(INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));
      } else {
        break;
      }
    }

    const message =
      lastStatus === 429
        ? "The AI research provider is rate limited. Please try again shortly."
        : "Unable to reach the AI research provider.";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "Failed to run research request." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
