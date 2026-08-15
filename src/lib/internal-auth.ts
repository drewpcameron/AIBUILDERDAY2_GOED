import type { NextRequest } from "next/server";

/**
 * Shared auth check for internal/cron-triggered routes (sync, ingest,
 * enrich, match, explain, autofill, send). Previously each route defined
 * its own copy that returned `true` whenever CRON_SECRET was unset — meant
 * as a local-dev convenience, but that also means any of these routes
 * (several of which trigger real paid LLM calls or resync data) is wide
 * open if the secret is never configured in a deployed environment. This
 * only allows the no-secret bypass when NODE_ENV isn't "production" —
 * Vercel always sets NODE_ENV=production at deploy time, so a deployment
 * that forgot to set CRON_SECRET now fails closed instead of open.
 */
export function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
