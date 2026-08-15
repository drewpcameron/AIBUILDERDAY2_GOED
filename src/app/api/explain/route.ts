import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateExplanation } from "@/lib/explanation";

// One LLM call per match; generous ceiling since this runs manually/
// post-match, not on a tight cron cadence.
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured yet (local dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const CONCURRENCY = 3;

interface MatchResult {
  id: string;
  businessName: string;
  opportunityTitle: string;
  explained: boolean;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businessId = req.nextUrl.searchParams.get("businessId");
  const matchId = req.nextUrl.searchParams.get("matchId");

  const matches = await prisma.match.findMany({
    where: {
      ...(matchId ? { id: matchId } : {}),
      ...(businessId ? { businessId } : {}),
    },
    include: { business: true, opportunity: true },
  });

  const results: MatchResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < matches.length) {
      const match = matches[cursor++];
      try {
        const explanation = await generateExplanation(match.business, match.opportunity);
        if (explanation) {
          await prisma.match.update({
            where: { id: match.id },
            data: { reasoning: explanation.reasoning, caveats: explanation.caveats ?? undefined },
          });
        }
        results.push({
          id: match.id,
          businessName: match.business.name,
          opportunityTitle: match.opportunity.title,
          explained: explanation !== null,
        });
      } catch {
        results.push({
          id: match.id,
          businessName: match.business.name,
          opportunityTitle: match.opportunity.title,
          explained: false,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, matches.length) }, worker));

  return NextResponse.json({
    processed: results.length,
    explained: results.filter((r) => r.explained).length,
    results,
  });
}
