"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { prefilterOpportunities, scoreMatches } from "@/lib/matching";
import { generateExplanation } from "@/lib/explanation";
import { generateApplicationFields } from "@/lib/autofill";
import { checkRateLimit } from "@/lib/rate-limit";
import { enrichBusiness } from "@/lib/web-enrichment";

// This is public and unauthenticated, and each submission triggers several
// real Anthropic API calls — without a limit, it's an open spigot for
// running up API costs or filling the database with junk businesses.
const RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Component 9 ("try it yourself"): runs a typed company description through
 * the same matching -> explanation -> autofill pipeline as the proactive
 * flow (components 3-8), just skipping ingestion/web-scraping and using the
 * typed text as the profile directly, per plan.md. Lands on the same
 * tokenized dashboard used for seeded businesses, so no separate results UI
 * is needed.
 */
export async function analyzeCompany(formData: FormData) {
  // Honeypot: a hidden field real users never see or fill; bots that
  // auto-fill every input on a form trip it.
  if (typeof formData.get("website") === "string" && formData.get("website") !== "") {
    throw new Error("Submission rejected");
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`try:${ip}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    throw new Error("Too many submissions — please wait a few minutes and try again.");
  }

  const name = formData.get("name");
  const description = formData.get("description");

  if (typeof name !== "string" || name.trim() === "") throw new Error("Company name is required");
  if (typeof description !== "string" || description.trim().length < 20) {
    throw new Error("Please describe the company in a bit more detail");
  }

  let business = await prisma.business.create({
    data: {
      source: "TRY_IT_YOURSELF",
      name: name.trim(),
      productDescription: description.trim(),
    },
  });

  try {
    // Look up public signals about the named company (official site, industry/NAICS
    // guess, employee/funding signals) the same way the proactive pipeline's web
    // enrichment step does, and fold them in alongside the founder's own typed
    // description so matching sees more than just what they wrote — without
    // overwriting the description itself, which stays in the founder's own words.
    const enrichment = await enrichBusiness(name.trim(), null);
    business = await prisma.business.update({
      where: { id: business.id },
      data: {
        websiteUrl: enrichment.websiteUrl,
        industryGuess: enrichment.industryGuess,
        naicsCodeGuess: enrichment.naicsCodeGuess,
        employeeCountSignal: enrichment.employeeCountSignal,
        fundingHistorySignal: enrichment.fundingHistorySignal,
        webEnrichedAt: new Date(),
      },
    });

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
