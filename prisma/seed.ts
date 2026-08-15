import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { SEED_BUSINESSES } from "./seed-data";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  let created = 0;
  let updated = 0;

  for (const business of SEED_BUSINESSES) {
    const externalId = slugify(business.name);
    const existing = await prisma.business.findUnique({
      where: { source_externalId: { source: "UTAH_REGISTRY", externalId } },
      select: { id: true },
    });

    await prisma.business.upsert({
      where: { source_externalId: { source: "UTAH_REGISTRY", externalId } },
      create: {
        source: "UTAH_REGISTRY",
        externalId,
        name: business.name,
        entityType: business.entityType,
        address: business.address,
      },
      update: {
        name: business.name,
        entityType: business.entityType,
        address: business.address,
      },
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  console.log(`Seeded ${SEED_BUSINESSES.length} businesses (${created} created, ${updated} updated).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
