"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

/**
 * Marks a draft SBIR/STTR application as reviewed by the founder. Per
 * plan.md ("no auto-submission — founder reviews and exports/copies it
 * themselves"), this only flips the review flag; it never submits anything.
 * Scoped to the token's own business so one dashboard link can't mark
 * another business's application reviewed.
 */
export async function markApplicationReviewed(token: string, applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { match: { include: { business: true } } },
  });
  if (!application || application.match.business.dashboardToken !== token) {
    throw new Error("Not found");
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: "REVIEWED", reviewedAt: new Date() },
  });

  revalidatePath(`/dashboard/${token}`);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sets a founder-provided recovery email, purely opt-in — see the schema
 * comment on Business.recoveryEmail for why this (and not the filing
 * record's contact email) is what the resend-link flow is allowed to
 * actually send to.
 */
export async function setRecoveryEmail(token: string, formData: FormData) {
  const business = await prisma.business.findUnique({ where: { dashboardToken: token } });
  if (!business) throw new Error("Not found");

  const email = formData.get("recoveryEmail");
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    throw new Error("Enter a valid email address");
  }

  await prisma.business.update({ where: { id: business.id }, data: { recoveryEmail: email.trim() } });

  revalidatePath(`/dashboard/${token}`);
}

/**
 * Invalidates the current dashboard link and mints a new one, then sends
 * the founder to the new URL. Requires the *current, still-valid* token to
 * call — this is for "I want to rotate this out of caution" (e.g. after
 * screen-sharing the link in a demo), not "my link expired and I lost it"
 * (that needs the separate email-resend flow, since anyone could otherwise
 * regenerate a link they don't actually own).
 */
export async function regenerateDashboardToken(token: string) {
  const business = await prisma.business.findUnique({ where: { dashboardToken: token } });
  if (!business) throw new Error("Not found");

  const newToken = randomUUID();
  await prisma.business.update({
    where: { id: business.id },
    data: { dashboardToken: newToken, dashboardTokenCreatedAt: new Date() },
  });

  redirect(`/dashboard/${newToken}`);
}
