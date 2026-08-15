import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateApplicationFields } from "@/lib/autofill";

// One LLM call per business; generous ceiling since this runs manually/
// post-explanation, not on a tight cron cadence — same rationale as /api/explain.
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured yet (local dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const CONCURRENCY = 3;

interface AutofillResult {
  businessId: string;
  businessName: string;
  matchId: string;
  opportunityTitle: string;
  drafted: boolean;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businessId = req.nextUrl.searchParams.get("businessId");

  // Per plan.md component 8, autofill targets only the top SBIR/STTR-eligible
  // match for each business — not every SBIR-eligible match it has.
  const candidates = await prisma.match.findMany({
    where: {
      ...(businessId ? { businessId } : {}),
      confidence: { in: ["MEDIUM", "HIGH"] },
      opportunity: { isSbirEligible: true },
      application: null,
    },
    include: { business: true, opportunity: true },
    orderBy: { score: "desc" },
  });

  const topPerBusiness = new Map<string, (typeof candidates)[number]>();
  for (const match of candidates) {
    if (!topPerBusiness.has(match.businessId)) topPerBusiness.set(match.businessId, match);
  }
  const matches = Array.from(topPerBusiness.values());

  const results: AutofillResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < matches.length) {
      const match = matches[cursor++];
      try {
        const fields = await generateApplicationFields(match.business, match.opportunity);
        if (fields) {
          await prisma.application.create({
            data: { matchId: match.id, fields },
          });
        }
        results.push({
          businessId: match.businessId,
          businessName: match.business.name,
          matchId: match.id,
          opportunityTitle: match.opportunity.title,
          drafted: fields !== null,
        });
      } catch {
        results.push({
          businessId: match.businessId,
          businessName: match.business.name,
          matchId: match.id,
          opportunityTitle: match.opportunity.title,
          drafted: false,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, matches.length) }, worker));

  return NextResponse.json({
    processed: results.length,
    drafted: results.filter((r) => r.drafted).length,
    results,
  });
}
