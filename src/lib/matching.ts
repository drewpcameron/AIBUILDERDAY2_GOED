import type { Business, Opportunity } from "@/generated/prisma/client";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";

// How many candidate opportunities (after the cheap local prefilter) get
// sent to the LLM for real scoring. Keeps the prompt token-bounded without
// an embeddings pipeline, per plan.md's "no live API calls at match time"
// constraint — this only ever reads the locally cached Opportunity table.
const CANDIDATE_POOL_SIZE = 40;

const DESCRIPTION_CHAR_LIMIT = 500;

export interface ScoredMatch {
  opportunityId: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  reasoning: string;
  caveats: string | null;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "will", "are", "was",
  "were", "has", "have", "been", "not", "but", "all", "any", "can", "its",
  "into", "such", "which", "their", "they", "them", "than", "then", "also",
  "may", "must", "shall", "should", "would", "could", "about", "over",
  "under", "each", "other", "some", "more", "most", "including", "based",
  "our", "your", "who", "what", "when", "where", "how",
]);

function keywordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

function businessProfileText(business: Business): string {
  const parts = [
    business.name,
    business.entityType,
    business.industryGuess,
    business.productDescription,
    business.employeeCountSignal,
    business.fundingHistorySignal,
    business.capitalNeed,
    business.priorSbirHistory,
  ].filter((v): v is string => Boolean(v));
  return parts.join(" ");
}

/**
 * Cheap local keyword-overlap ranking, run before the LLM call so the
 * candidate set stays a fixed, bounded size regardless of how many
 * opportunities are cached (~2,000-2,500 per plan.md's storage budget).
 */
export function prefilterOpportunities(
  business: Business,
  opportunities: Opportunity[],
  limit: number = CANDIDATE_POOL_SIZE,
): Opportunity[] {
  const businessKeywords = keywordsOf(businessProfileText(business));
  if (businessKeywords.size === 0) return opportunities.slice(0, limit);

  const scored = opportunities.map((opp) => {
    const oppKeywords = keywordsOf(
      `${opp.title} ${opp.agency ?? ""} ${opp.description} ${opp.eligibilityText ?? ""} ${opp.fundingCategory ?? ""}`,
    );
    let overlap = 0;
    for (const kw of businessKeywords) {
      if (oppKeywords.has(kw)) overlap += 1;
    }
    return { opp, overlap };
  });

  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, limit).map((s) => s.opp);
}

function buildPrompt(business: Business, candidates: Opportunity[]): string {
  const profile = `
Business: ${business.name}
Entity type: ${business.entityType ?? "unknown"}
Industry (guessed): ${business.industryGuess ?? "unknown"}
NAICS (guessed): ${business.naicsCodeGuess ?? "unknown"}
Product/tech description: ${business.productDescription ?? "not available"}
Employee count signal: ${business.employeeCountSignal ?? "not available"}
Funding history signal: ${business.fundingHistorySignal ?? "not available"}
Annual revenue (self-reported): ${business.annualRevenue ?? "not provided"}
Capital need (self-reported): ${business.capitalNeed ?? "not provided"}
US ownership % (self-reported): ${business.usOwnershipPercent ?? "not provided"}
Prior SBIR/STTR history (self-reported): ${business.priorSbirHistory ?? "not provided"}
`.trim();

  const candidateList = candidates
    .map(
      (c) => `
Opportunity ID: ${c.id}
Title: ${c.title}
Agency: ${c.agency ?? "unknown"}
Funding category: ${c.fundingCategory ?? "unknown"}
SBIR/STTR eligible: ${c.isSbirEligible}
Description: ${c.description.slice(0, DESCRIPTION_CHAR_LIMIT)}
Eligibility text: ${(c.eligibilityText ?? "not specified").slice(0, DESCRIPTION_CHAR_LIMIT)}
`.trim(),
    )
    .join("\n\n---\n\n");

  return `You are scoring how well a startup fits a list of real federal funding opportunities.

${profile}

Candidate opportunities (this is the ONLY set you may match against — never invent an opportunity or ID that isn't listed here):

${candidateList}

For each opportunity that is a genuinely plausible fit, call record_matches with one entry per plausible opportunity, using its exact Opportunity ID. Rules:
- Skip opportunities with no real connection to this business — do not force a match just to fill out the list. It is correct and expected to return zero matches if nothing fits.
- confidence: HIGH (strong, clear fit), MEDIUM (plausible but with real caveats), or LOW (a genuine long-shot worth surfacing for transparency, not a filler).
- score: 0.0-1.0, roughly corresponding to confidence.
- reasoning: 1-2 plain-language sentences grounded ONLY in the business profile and opportunity text above — no invented facts about either.
- caveats: eligibility concerns or missing-info caveats a founder should know before applying (e.g. "founder-provided ownership % not yet confirmed"), or omit if none.`;
}

interface RecordMatchesToolInput {
  matches: Array<{
    opportunityId: string;
    confidence: "LOW" | "MEDIUM" | "HIGH";
    score: number;
    reasoning: string;
    caveats?: string;
  }>;
}

/**
 * Scores one business against a bounded candidate pool via a single
 * structured LLM call (forced tool use, so output is well-formed JSON, not
 * parsed free text). Returned opportunityIds are validated against the
 * candidate set by the caller — never trust an LLM-returned ID directly.
 */
export async function scoreMatches(business: Business, candidates: Opportunity[]): Promise<ScoredMatch[]> {
  if (candidates.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      tool_choice: { type: "tool", name: "record_matches" },
      tools: [
        {
          name: "record_matches",
          description: "Record the funding opportunity matches for this business.",
          input_schema: {
            type: "object",
            properties: {
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    opportunityId: { type: "string" },
                    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                    score: { type: "number" },
                    reasoning: { type: "string" },
                    caveats: { type: "string" },
                  },
                  required: ["opportunityId", "confidence", "score", "reasoning"],
                },
              },
            },
            required: ["matches"],
          },
        },
      ],
      messages: [{ role: "user", content: buildPrompt(business, candidates) }],
    }),
    cache: "no-store",
  });

  if (!res.ok) return [];

  const body = (await res.json()) as {
    content?: Array<{ type: string; input?: RecordMatchesToolInput }>;
  };

  const toolUse = (body.content ?? []).find((block) => block.type === "tool_use");
  const matches = toolUse?.input?.matches ?? [];

  const candidateIds = new Set(candidates.map((c) => c.id));

  return matches
    .filter((m) => candidateIds.has(m.opportunityId))
    .map((m) => ({
      opportunityId: m.opportunityId,
      confidence: m.confidence,
      score: m.score,
      reasoning: m.reasoning,
      caveats: m.caveats ?? null,
    }));
}
