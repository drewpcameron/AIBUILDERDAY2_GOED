import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchGrantsGovOpportunities } from "@/lib/grants-gov";
import { fetchAssistanceListings } from "@/lib/sam-assistance";
import { fetchSbirOpportunities } from "@/lib/sbir";
import type { NormalizedOpportunity } from "@/lib/opportunities";
import type { OpportunitySource } from "@/generated/prisma/enums";

// Grants.gov's synopsis lookups (one call per opportunity, bounded
// concurrency in src/lib/grants-gov.ts) are the long pole here. Vercel Hobby
// caps execution at 60s regardless of this value; Pro/Enterprise honor it.
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured yet (local dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

interface SourceResult {
  source: OpportunitySource;
  fetched: number;
  created: number;
  updated: number;
  error?: string;
}

async function syncSource(
  source: OpportunitySource,
  fetchOpportunities: () => Promise<NormalizedOpportunity[]>,
): Promise<SourceResult> {
  let opportunities: NormalizedOpportunity[];
  try {
    opportunities = await fetchOpportunities();
  } catch (err) {
    return {
      source,
      fetched: 0,
      created: 0,
      updated: 0,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }

  let created = 0;
  let updated = 0;

  for (const opp of opportunities) {
    const existing = await prisma.opportunity.findUnique({
      where: { source_externalId: { source, externalId: opp.externalId } },
      select: { id: true },
    });

    await prisma.opportunity.upsert({
      where: { source_externalId: { source, externalId: opp.externalId } },
      create: {
        source,
        externalId: opp.externalId,
        title: opp.title,
        agency: opp.agency ?? undefined,
        description: opp.description,
        eligibilityText: opp.eligibilityText ?? undefined,
        fundingCategory: opp.fundingCategory ?? undefined,
        applicationUrl: opp.applicationUrl ?? undefined,
        opensAt: opp.opensAt ?? undefined,
        closesAt: opp.closesAt ?? undefined,
        isSbirEligible: opp.isSbirEligible,
      },
      update: {
        title: opp.title,
        agency: opp.agency ?? undefined,
        description: opp.description,
        eligibilityText: opp.eligibilityText ?? undefined,
        fundingCategory: opp.fundingCategory ?? undefined,
        applicationUrl: opp.applicationUrl ?? undefined,
        opensAt: opp.opensAt ?? undefined,
        closesAt: opp.closesAt ?? undefined,
        isSbirEligible: opp.isSbirEligible,
        syncedAt: new Date(),
      },
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { source, fetched: opportunities.length, created, updated };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const samApiToken = process.env.SAM_GOV_API_KEY;

  const results = await Promise.all([
    syncSource("GRANTS_GOV", fetchGrantsGovOpportunities),
    samApiToken
      ? syncSource("SAM_GOV_ASSISTANCE_LISTINGS", () => fetchAssistanceListings({ apiToken: samApiToken }))
      : Promise.resolve<SourceResult>({
          source: "SAM_GOV_ASSISTANCE_LISTINGS",
          fetched: 0,
          created: 0,
          updated: 0,
          error: "SAM_GOV_API_KEY is not configured",
        }),
    syncSource("SBIR_GOV", fetchSbirOpportunities),
  ]);

  return NextResponse.json({ results });
}
