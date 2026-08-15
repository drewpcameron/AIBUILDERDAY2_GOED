import * as cheerio from "cheerio";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

export interface EnrichmentResult {
  websiteUrl: string | null;
  productDescription: string | null;
  industryGuess: string | null;
  naicsCodeGuess: string | null;
  employeeCountSignal: string | null;
  fundingHistorySignal: string | null;
}

const NO_SIGNAL: EnrichmentResult = {
  websiteUrl: null,
  productDescription: null,
  industryGuess: null,
  naicsCodeGuess: null,
  employeeCountSignal: null,
  fundingHistorySignal: null,
};

// Rough industry keyword -> NAICS mapping, not authoritative. Surfaced as an
// unverified guess and refined by founder enrichment (step 6) if wrong, per
// plan.md's enrichment source map.
const INDUSTRY_KEYWORDS: Array<{ label: string; naics: string; keywords: string[] }> = [
  { label: "Software / SaaS", naics: "511210", keywords: ["software", "saas", "platform", "cloud-based"] },
  { label: "Healthcare / Health Tech", naics: "621999", keywords: ["healthcare", "health care", "patient", "clinical"] },
  { label: "Biotechnology / Pharmaceuticals", naics: "541714", keywords: ["biotech", "drug discovery", "pharmaceutical", "therapeutics"] },
  { label: "Financial Technology", naics: "522320", keywords: ["fintech", "payments platform", "banking", "lending"] },
  { label: "Cybersecurity", naics: "541512", keywords: ["cybersecurity", "cyber security", "infosec", "threat detection"] },
  { label: "Manufacturing / Hardware", naics: "334000", keywords: ["manufacturing", "hardware", "device", "manufacturer"] },
  { label: "Consumer Products / Retail", naics: "423990", keywords: ["consumer", "retail", "e-commerce", "ecommerce"] },
  { label: "Human Resources / Workforce", naics: "541612", keywords: ["human resources", "hr software", "payroll", "workforce"] },
  { label: "Energy / Climate Tech", naics: "221000", keywords: ["clean energy", "climate tech", "solar", "renewable energy"] },
];

function guessIndustry(text: string): { industryGuess: string | null; naicsCodeGuess: string | null } {
  const lower = text.toLowerCase();
  for (const entry of INDUSTRY_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { industryGuess: entry.label, naicsCodeGuess: entry.naics };
    }
  }
  return { industryGuess: null, naicsCodeGuess: null };
}

const EMPLOYEE_COUNT_PATTERN = /\b([\d,]{2,6}\+?)\s*(employees|team members)\b/i;
const FUNDING_PATTERNS = [
  /raised\s+(?:over\s+|more than\s+)?\$[\d,.]+\s?(?:million|billion|M|B)?/i,
  /Series\s+[A-E]\b[^.]{0,80}/i,
  /\$[\d,.]+\s?(?:million|billion)\s+in\s+funding/i,
  /backed by[^.]{0,120}/i,
  /acquired by[^.]{0,120}/i,
  /publicly traded|\bIPO'?d?\b/i,
];

function extractEmployeeCountSignal(text: string): string | null {
  const match = text.match(EMPLOYEE_COUNT_PATTERN);
  return match ? match[0].trim() : null;
}

function extractFundingHistorySignal(text: string): string | null {
  for (const pattern of FUNDING_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

/**
 * Resolves a business name/address to its official homepage URL using
 * Claude's server-side web_search tool — the enrichment service's only LLM
 * dependency. Everything else (description, industry, employee/funding
 * signals) is extracted directly from the fetched page HTML, not generated.
 */
async function findOfficialWebsite(name: string, address: string | null): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [
        {
          role: "user",
          content: `Find the official homepage URL for this company. Respond with ONLY the URL and nothing else — no explanation, no punctuation around it.\n\nCompany: ${name}\nAddress: ${address ?? "unknown"}`,
        },
      ],
    }),
    cache: "no-store",
  });

  if (!res.ok) return null;

  const body = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const combined = (body.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join(" ");

  const urlMatch = combined.match(/https?:\/\/[^\s"')]+/);
  return urlMatch ? urlMatch[0].replace(/[.,]+$/, "") : null;
}

async function scrapeHomepage(url: string): Promise<{ text: string; description: string | null } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; UtahGrantOutreachBot/1.0)" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer").remove();

    const metaDescription =
      $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? null;

    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 20000);

    return { text, description: metaDescription?.trim() || null };
  } catch {
    return null;
  }
}

/**
 * Enriches one business with best-effort public signals: locates its
 * official website (LLM-assisted search), then scrapes and parses the
 * homepage directly for everything else. Fields stay null when not found —
 * callers should treat null as "still missing," not an error, per plan.md's
 * found/not-found enrichment model (component 3).
 */
export async function enrichBusiness(name: string, address: string | null): Promise<EnrichmentResult> {
  const websiteUrl = await findOfficialWebsite(name, address);
  if (!websiteUrl) return NO_SIGNAL;

  const scraped = await scrapeHomepage(websiteUrl);
  if (!scraped) return { ...NO_SIGNAL, websiteUrl };

  const { industryGuess, naicsCodeGuess } = guessIndustry(`${scraped.description ?? ""} ${scraped.text}`);

  return {
    websiteUrl,
    productDescription: scraped.description || scraped.text.slice(0, 500) || null,
    industryGuess,
    naicsCodeGuess,
    employeeCountSignal: extractEmployeeCountSignal(scraped.text),
    fundingHistorySignal: extractFundingHistorySignal(scraped.text),
  };
}
