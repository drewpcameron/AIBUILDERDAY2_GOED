"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const FOUNDER_FIELDS = [
  "annualRevenue",
  "capitalNeed",
  "usOwnershipPercent",
  "ownershipDemographics",
  "piPrimaryEmployer",
  "priorSbirHistory",
] as const;

/**
 * Saves founder-provided fields for the business identified by its
 * dashboard token. The token itself is the auth boundary here (tokenized
 * link, no login, per plan.md component 7) — anyone with the link can
 * update that one business's own self-reported fields, nothing else.
 */
export async function updateFounderInfo(token: string, formData: FormData) {
  const business = await prisma.business.findUnique({ where: { dashboardToken: token } });
  if (!business) throw new Error("Not found");

  const data: Record<string, string | number> = {};

  for (const field of FOUNDER_FIELDS) {
    const raw = formData.get(field);
    if (typeof raw !== "string" || raw.trim() === "") continue;

    if (field === "usOwnershipPercent") {
      const n = Number(raw);
      if (Number.isFinite(n)) data[field] = Math.max(0, Math.min(100, n));
    } else {
      data[field] = raw.trim();
    }
  }

  if (Object.keys(data).length === 0) return;

  await prisma.business.update({
    where: { id: business.id },
    data: { ...data, founderEnrichedAt: new Date() },
  });

  revalidatePath(`/dashboard/${token}`);
}
