import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchUtahEntities } from "@/lib/sam";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured yet (local dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiToken = process.env.SAM_GOV_API_KEY;
  if (!apiToken) {
    return NextResponse.json(
      { error: "SAM_GOV_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let entities;
  try {
    entities = await fetchUtahEntities({ apiToken });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SAM.gov fetch failed" },
      { status: 502 },
    );
  }

  let created = 0;
  let updated = 0;

  for (const entity of entities) {
    const existing = await prisma.business.findUnique({
      where: {
        source_externalId: {
          source: "UTAH_REGISTRY",
          externalId: entity.ueiSAM,
        },
      },
      select: { id: true },
    });

    await prisma.business.upsert({
      where: {
        source_externalId: {
          source: "UTAH_REGISTRY",
          externalId: entity.ueiSAM,
        },
      },
      create: {
        source: "UTAH_REGISTRY",
        externalId: entity.ueiSAM,
        name: entity.legalBusinessName,
        entityType: entity.entityType ?? undefined,
        filingDate: entity.registrationDate ? new Date(entity.registrationDate) : undefined,
        address: entity.address ?? undefined,
      },
      update: {
        name: entity.legalBusinessName,
        entityType: entity.entityType ?? undefined,
        address: entity.address ?? undefined,
      },
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return NextResponse.json({
    fetched: entities.length,
    created,
    updated,
  });
}
