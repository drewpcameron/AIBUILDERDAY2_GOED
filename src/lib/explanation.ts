import type { Business, Opportunity } from "@/generated/prisma/client";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";

export interface Explanation {
  reasoning: string;
  caveats: string | null;
}

function buildPrompt(business: Business, opportunity: Opportunity): string {
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
Ownership demographics (self-reported): ${business.ownershipDemographics ?? "not provided"}
PI's primary employer (self-reported): ${business.piPrimaryEmployer ?? "not provided"}
Prior SBIR/STTR history (self-reported): ${business.priorSbirHistory ?? "not provided"}
`.trim();

  const opportunityText = `
Title: ${opportunity.title}
Agency: ${opportunity.agency ?? "unknown"}
Funding category: ${opportunity.fundingCategory ?? "unknown"}
SBIR/STTR eligible: ${opportunity.isSbirEligible}
Full description: ${opportunity.description}
Full eligibility text: ${opportunity.eligibilityText ?? "not specified"}
`.trim();

  return `This business has already been matched to this funding opportunity by a prior scoring step. Your job is to write the founder-facing "why this fits" explanation and caveats — grounded ONLY in the text below, no invented facts about either side.

${profile}

Matched opportunity (full text, not a summary):

${opportunityText}

Call record_explanation with:
- reasoning: 1-3 plain-language sentences a founder would read on a dashboard, explaining specifically why this business fits this opportunity's eligibility and focus — cite concrete details from the eligibility text and business profile, not generic praise.
- caveats: concrete eligibility risks, missing-info gaps, or fit concerns a founder should resolve before applying (e.g. "eligibility text specifies non-profit or academic applicants; confirm this business's entity type qualifies"), grounded in the eligibility text above. Omit only if there is truly nothing worth flagging.`;
}

interface RecordExplanationToolInput {
  reasoning: string;
  caveats?: string;
}

/**
 * Produces the founder-facing "why this fits" + caveats text for one match,
 * grounded in the opportunity's full (untruncated) eligibility text — unlike
 * the matching service's scoring pass, which only sees a truncated slice of
 * each candidate to keep the ranking prompt token-bounded.
 */
export async function generateExplanation(business: Business, opportunity: Opportunity): Promise<Explanation | null> {
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
      max_tokens: 1024,
      tool_choice: { type: "tool", name: "record_explanation" },
      tools: [
        {
          name: "record_explanation",
          description: "Record the why-this-fits explanation and caveats for this match.",
          input_schema: {
            type: "object",
            properties: {
              reasoning: { type: "string" },
              caveats: { type: "string" },
            },
            required: ["reasoning"],
          },
        },
      ],
      messages: [{ role: "user", content: buildPrompt(business, opportunity) }],
    }),
    cache: "no-store",
  });

  if (!res.ok) return null;

  const body = (await res.json()) as {
    content?: Array<{ type: string; input?: RecordExplanationToolInput }>;
  };

  const toolUse = body.content?.find((block) => block.type === "tool_use");
  if (!toolUse?.input) return null;

  return {
    reasoning: toolUse.input.reasoning,
    caveats: toolUse.input.caveats ?? null,
  };
}
