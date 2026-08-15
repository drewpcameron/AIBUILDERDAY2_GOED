"use server";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendDashboardLinkEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Throttled per-email, not per-IP — the thing worth protecting here isn't
// server cost (no LLM calls involved) but not letting someone hammer the
// same address with reset emails.
const RATE_LIMIT = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Looks up a business by its self-service recoveryEmail (never
 * filingContactEmail — see the schema comment) and, if found, mints a new
 * dashboard token and emails the fresh link to it. Always returns the same
 * generic result regardless of whether a match was found, so this can't be
 * used to enumerate which businesses exist / have a recovery email set.
 */
export async function requestDashboardLink(
  _prevState: { submitted: boolean },
  formData: FormData,
): Promise<{ submitted: boolean }> {
  const email = formData.get("email");
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    throw new Error("Enter a valid email address");
  }
  const normalized = email.trim().toLowerCase();

  if (checkRateLimit(`resend:${normalized}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    const business = await prisma.business.findFirst({
      where: { recoveryEmail: { equals: normalized, mode: "insensitive" } },
    });

    if (business) {
      const newToken = randomUUID();
      const updated = await prisma.business.update({
        where: { id: business.id },
        data: { dashboardToken: newToken, dashboardTokenCreatedAt: new Date() },
      });
      await sendDashboardLinkEmail(updated, normalized);
    }
  }

  // Same result either way — a miss, a rate-limited retry, and a real send
  // all look identical to the caller so this can't be used to enumerate
  // which addresses have a business attached.
  return { submitted: true };
}
