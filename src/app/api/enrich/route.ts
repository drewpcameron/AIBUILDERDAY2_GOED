import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/internal-auth";
import { prisma } from "@/lib/prisma";
import { enrichBusiness } from "@/lib/web-enrichment";

// Each business costs one LLM-assisted site lookup + one page fetch;
// keep this generous since it's triggered manually/post-ingest, not on a
// tight cron cadence like /api/sync-opportunities.
export const maxDuration = 300;

// Bounded concurrency so we don't fire dozens of simultaneous Anthropic
// calls + target-site fetches at once.
const CONCURRENCY = 3;

interface BusinessResult {
  id: string;
  name: string;
  found: boolean;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";

  const businesses = await prisma.business.findMany({
    where: force ? {} : { webEnrichedAt: null },
    select: { id: true, name: true, address: true },
  });

  const results: BusinessResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < businesses.length) {
      const business = businesses[cursor++];
      try {
        const enrichment = await enrichBusiness(business.name, business.address);
        await prisma.business.update({
          where: { id: business.id },
          data: { ...enrichment, webEnrichedAt: new Date() },
        });
        results.push({ id: business.id, name: business.name, found: enrichment.websiteUrl !== null });
      } catch {
        results.push({ id: business.id, name: business.name, found: false });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, businesses.length) }, worker));

  return NextResponse.json({
    processed: results.length,
    found: results.filter((r) => r.found).length,
    results,
  });
}
