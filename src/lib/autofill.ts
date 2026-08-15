import type { Business, Opportunity } from "@/generated/prisma/client";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";

// Field order matches plan.md's SBIR/STTR autofill mapping: filing-record +
// web-enrichment fields carry over directly where possible; the narrative
// fields (technical abstract, innovation, commercial potential) are drafted
// by the model from the business's product description and the opportunity's
// own text; fields that depend on founder-provided data the business hasn't
// entered yet are explicitly flagged as missing rather than invented.
const APPLICATION_FIELDS = [
  "companyName",
  "companyAddress",
  "entityType",
  "naicsCode",
  "technicalAbstract",
  "technicalInnovation",
  "commercialPotential",
  "numberOfEmployees",
  "annualRevenue",
  "fundingRequested",
  "usOwnershipPercent",
  "ownershipDemographics",
  "principalInvestigatorEmployer",
  "priorSbirSttrHistory",
] as const;

export type ApplicationFields = Record<(typeof APPLICATION_FIELDS)[number], string>;

const MISSING_PLACEHOLDER = "Not yet provided by founder — required before submitting";

function buildPrompt(business: Business, opportunity: Opportunity): string {
  const profile = `
Company name: ${business.name}
Entity type: ${business.entityType ?? "unknown"}
Address: ${business.address ?? "unknown"}
Industry (guessed): ${business.industryGuess ?? "unknown"}
NAICS (guessed): ${business.naicsCodeGuess ?? "unknown"}
Product/tech description: ${business.productDescription ?? "not available"}
Employee count signal: ${business.employeeCountSignal ?? "not available"}
Funding history signal: ${business.fundingHistorySignal ?? "not available"}
Annual revenue (self-reported): ${business.annualRevenue ?? "NOT PROVIDED"}
Capital need / funding requested (self-reported): ${business.capitalNeed ?? "NOT PROVIDED"}
US ownership % (self-reported): ${business.usOwnershipPercent ?? "NOT PROVIDED"}
Ownership demographics (self-reported): ${business.ownershipDemographics ?? "NOT PROVIDED"}
PI's primary employer (self-reported): ${business.piPrimaryEmployer ?? "NOT PROVIDED"}
Prior SBIR/STTR history (self-reported): ${business.priorSbirHistory ?? "NOT PROVIDED"}
`.trim();

  const opportunityText = `
Title: ${opportunity.title}
Agency: ${opportunity.agency ?? "unknown"}
Full description: ${opportunity.description}
Full eligibility text: ${opportunity.eligibilityText ?? "not specified"}
`.trim();

  return `This business has already been matched to this SBIR/STTR-eligible funding opportunity. Draft a first-pass SBIR/STTR application from the data below, to be reviewed and corrected by the founder before anything is submitted — never invent facts that aren't grounded in the profile or opportunity text.

${profile}

Matched opportunity (full text, not a summary):

${opportunityText}

Call record_application_fields with one string per field:
- companyName, companyAddress, entityType, naicsCode: copy directly from the profile above (best guess for naicsCode/entityType if only a guess is available, noted as such).
- technicalAbstract: 2-4 sentences describing the company's technology/product, grounded in the product/tech description above and framed toward this opportunity's focus area.
- technicalInnovation: 1-3 sentences on what's novel about the approach, grounded only in the product/tech description — do not invent technical claims not implied by it.
- commercialPotential: 1-3 sentences on commercial/market potential, grounded in the product description and any funding/employee signals available.
- numberOfEmployees, annualRevenue, fundingRequested, usOwnershipPercent, ownershipDemographics, principalInvestigatorEmployer, priorSbirSttrHistory: use the self-reported or signal value given above if present. If a field above is marked "NOT PROVIDED" and there's no usable signal, set that field to exactly this string: "${MISSING_PLACEHOLDER}" — do not guess a number or invent an answer.`;
}

interface RecordApplicationFieldsToolInput extends Record<string, string> {}

/**
 * Drafts SBIR/STTR application fields for one business/opportunity match.
 * Always DRAFT/unreviewed by construction — see Application.status in
 * schema.prisma and plan.md component 8.
 */
export async function generateApplicationFields(
  business: Business,
  opportunity: Opportunity,
): Promise<ApplicationFields | null> {
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
      max_tokens: 1536,
      tool_choice: { type: "tool", name: "record_application_fields" },
      tools: [
        {
          name: "record_application_fields",
          description: "Record the drafted SBIR/STTR application field values.",
          input_schema: {
            type: "object",
            properties: Object.fromEntries(APPLICATION_FIELDS.map((f) => [f, { type: "string" }])),
            required: [...APPLICATION_FIELDS],
          },
        },
      ],
      messages: [{ role: "user", content: buildPrompt(business, opportunity) }],
    }),
    cache: "no-store",
  });

  if (!res.ok) return null;

  const body = (await res.json()) as {
    content?: Array<{ type: string; input?: RecordApplicationFieldsToolInput }>;
  };

  const toolUse = body.content?.find((block) => block.type === "tool_use");
  if (!toolUse?.input) return null;

  const fields = {} as ApplicationFields;
  for (const key of APPLICATION_FIELDS) {
    fields[key] = toolUse.input[key] ?? MISSING_PLACEHOLDER;
  }
  return fields;
}

export const APPLICATION_FIELD_LABELS: Record<(typeof APPLICATION_FIELDS)[number], string> = {
  companyName: "Company name",
  companyAddress: "Company address",
  entityType: "Entity type",
  naicsCode: "NAICS code",
  technicalAbstract: "Technical abstract",
  technicalInnovation: "Technical innovation",
  commercialPotential: "Commercial potential",
  numberOfEmployees: "Number of employees",
  annualRevenue: "Annual revenue",
  fundingRequested: "Funding requested",
  usOwnershipPercent: "US ownership %",
  ownershipDemographics: "Ownership demographics",
  principalInvestigatorEmployer: "Principal investigator's employer",
  priorSbirSttrHistory: "Prior SBIR/STTR history",
};
