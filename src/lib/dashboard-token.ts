// Dashboard links never expired before this — a leaked link (forwarded
// email, browser history, shared screen) stayed valid forever with no way
// to revoke it. 90 days balances that against founders bookmarking the
// link and coming back to it weeks later, which is the whole point of a
// tokenized, no-login dashboard.
export const TOKEN_TTL_DAYS = 90;

export function isTokenExpired(dashboardTokenCreatedAt: Date): boolean {
  const ageMs = Date.now() - dashboardTokenCreatedAt.getTime();
  return ageMs > TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}
