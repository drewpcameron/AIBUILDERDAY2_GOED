import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/internal-auth";
import { prisma } from "@/lib/prisma";
import { sendOutreachEmail } from "@/lib/email";
import type { MatchConfidence } from "@/generated/prisma/client";

export const maxDuration = 60;

// Only MEDIUM/HIGH matches are surfaced to a founder — LOW matches are kept
// for auditability (see schema comment on Match) but aren't confident
// enough to lead with in an outreach email.
const SENDABLE_CONFIDENCE: MatchConfidence[] = ["MEDIUM", "HIGH"];
const MAX_MATCHES_PER_EMAIL = 3;

interface BusinessResult {
  id: string;
  name: string;
  sent: boolean;
  matchCount: number;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const businessId = req.nextUrl.searchParams.get("businessId");
  const force = req.nextUrl.searchParams.get("force") === "true";

  const businesses = await prisma.business.findMany({
    where: {
      ...(businessId ? { id: businessId } : {}),
      ...(force ? {} : { outreachSentAt: null }),
    },
    include: {
      matches: {
        where: { confidence: { in: SENDABLE_CONFIDENCE } },
        orderBy: { score: "desc" },
        take: MAX_MATCHES_PER_EMAIL,
        include: { opportunity: true },
      },
    },
  });

  const results: BusinessResult[] = [];

  for (const business of businesses) {
    if (business.matches.length === 0) {
      results.push({ id: business.id, name: business.name, sent: false, matchCount: 0 });
      continue;
    }

    const sent = await sendOutreachEmail(business, business.matches);
    if (sent) {
      await prisma.business.update({ where: { id: business.id }, data: { outreachSentAt: new Date() } });
    }
    results.push({ id: business.id, name: business.name, sent, matchCount: business.matches.length });
  }

  return NextResponse.json({
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    results,
  });
}
