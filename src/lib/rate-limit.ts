// In-memory sliding-window limiter. Good enough to blunt casual abuse of a
// public endpoint that triggers real paid LLM calls per submission (/try) —
// NOT a real distributed rate limiter, since Vercel serverless instances
// don't share memory, so an attacker spread across enough cold starts can
// still get through. A real fix (Upstash Redis / Vercel KV) is a follow-up,
// not a same-day hackathon item; this is the honest, scoped-down version.
const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    hits.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return true;
}
