import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/internal-auth";
import { prisma } from "@/lib/prisma";
import { prefilterOpportunities, scoreMatches } from "@/lib/matching";

// One LLM call per business over a bounded candidate pool; generous ceiling
// since this runs manually/post-enrichment, not on a tight cron cadence.
export const maxDuration = 300;

// One LLM call per business — keep concurrency modest like /api/enrich.
const CONCURRENCY = 3;

interface BusinessResult {
  id: string;
  name: string;
  matched: number;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businessId = req.nextUrl.searchParams.get("businessId");

  const businesses = businessId
    ? await prisma.business.findMany({ where: { id: businessId } })
    : await prisma.business.findMany();

  // Only match against opportunities that are still open, per plan.md's
  // "pulls current open opportunities" framing — no point recommending
  // something a founder can no longer apply to.
  const now = new Date();
  const openOpportunities = await prisma.opportunity.findMany({
    where: { OR: [{ closesAt: null }, { closesAt: { gte: now } }] },
  });

  const results: BusinessResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < businesses.length) {
      const business = businesses[cursor++];
      try {
        const candidates = prefilterOpportunities(business, openOpportunities);
        const matches = await scoreMatches(business, candidates);

        await prisma.$transaction([
          prisma.match.deleteMany({ where: { businessId: business.id } }),
          ...matches.map((m) =>
            prisma.match.create({
              data: {
                businessId: business.id,
                opportunityId: m.opportunityId,
                confidence: m.confidence,
                score: m.score,
                reasoning: m.reasoning,
                caveats: m.caveats ?? undefined,
              },
            }),
          ),
        ]);

        results.push({ id: business.id, name: business.name, matched: matches.length });
      } catch {
        results.push({ id: business.id, name: business.name, matched: 0 });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, businesses.length) }, worker));

  return NextResponse.json({
    processed: results.length,
    totalMatches: results.reduce((sum, r) => sum + r.matched, 0),
    results,
  });
}
