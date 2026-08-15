"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { prefilterOpportunities, scoreMatches } from "@/lib/matching";
import { generateExplanation } from "@/lib/explanation";
import { generateApplicationFields } from "@/lib/autofill";

/**
 * Component 9 ("try it yourself"): runs a typed company description through
 * the same matching -> explanation -> autofill pipeline as the proactive
 * flow (components 3-8), just skipping ingestion/web-scraping and using the
 * typed text as the profile directly, per plan.md. Lands on the same
 * tokenized dashboard used for seeded businesses, so no separate results UI
 * is needed.
 */
export async function analyzeCompany(formData: FormData) {
  const name = formData.get("name");
  const description = formData.get("description");

  if (typeof name !== "string" || name.trim() === "") throw new Error("Company name is required");
  if (typeof description !== "string" || description.trim().length < 20) {
    throw new Error("Please describe the company in a bit more detail");
  }

  const business = await prisma.business.create({
    data: {
      source: "TRY_IT_YOURSELF",
      name: name.trim(),
      productDescription: description.trim(),
    },
  });

  try {
    const now = new Date();
    const openOpportunities = await prisma.opportunity.findMany({
      where: { OR: [{ closesAt: null }, { closesAt: { gte: now } }] },
    });

    const candidates = prefilterOpportunities(business, openOpportunities);
    const scored = await scoreMatches(business, candidates);

    const createdMatches = await Promise.all(
      scored.map((m) =>
        prisma.match.create({
          data: {
            businessId: business.id,
            opportunityId: m.opportunityId,
            confidence: m.confidence,
            score: m.score,
            reasoning: m.reasoning,
            caveats: m.caveats ?? undefined,
          },
          include: { opportunity: true },
        }),
      ),
    );

    // Re-explain each match against the opportunity's full text, same as
    // /api/explain — scoreMatches only sees a truncated slice per candidate.
    await Promise.all(
      createdMatches.map(async (match) => {
        const explanation = await generateExplanation(business, match.opportunity);
        if (explanation) {
          await prisma.match.update({
            where: { id: match.id },
            data: { reasoning: explanation.reasoning, caveats: explanation.caveats ?? undefined },
          });
        }
      }),
    );

    // Draft an SBIR/STTR application for the top eligible match, mirroring
    // /api/autofill's "top match per business" scope.
    const topSbirMatch = createdMatches
      .filter((m) => m.opportunity.isSbirEligible && m.confidence !== "LOW")
      .sort((a, b) => b.score - a.score)[0];

    if (topSbirMatch) {
      const fields = await generateApplicationFields(business, topSbirMatch.opportunity);
      if (fields) {
        await prisma.application.create({ data: { matchId: topSbirMatch.id, fields } });
      }
    }
  } catch {
    // Land on the dashboard regardless — partial results (or a clean "no
    // confident matches" state) beat an error page after a live typed demo.
  }

  redirect(`/dashboard/${business.dashboardToken}`);
}
