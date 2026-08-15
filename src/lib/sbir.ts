import type { NormalizedOpportunity } from "./opportunities";

const API_BASE = "https://api.www.sbir.gov/public/api/solicitations";

interface SbirTopic {
  topic_title?: string;
  topic_number?: string;
  topic_description?: string;
  sbir_topic_link?: string;
}

interface SbirSolicitation {
  solicitation_title?: string;
  solicitation_number?: string;
  agency?: string;
  branch?: string;
  open_date?: string;
  close_date?: string;
  application_due_date?: string[];
  sbir_solicitation_link?: string;
  current_status?: string;
  solicitation_topics?: SbirTopic[];
}

function parseSbirDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Pulls open SBIR/STTR solicitations and flattens them to one
 * NormalizedOpportunity per topic — topics are what a company actually
 * applies against, and each has its own description, so matching against
 * topics gives much better signal than matching against a whole
 * solicitation (see plan.md SBIR granularity decision).
 */
export async function fetchSbirOpportunities(options: { rows?: number; maxPages?: number } = {}): Promise<
  NormalizedOpportunity[]
> {
  const { rows = 50, maxPages = 20 } = options;

  const results: NormalizedOpportunity[] = [];

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      open: "1",
      rows: String(rows),
      start: String(page * rows),
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`SBIR.gov request failed: HTTP ${res.status}`);
    }

    const solicitations = (await res.json()) as SbirSolicitation[];
    if (solicitations.length === 0) break;

    for (const solicitation of solicitations) {
      const closesAt =
        parseSbirDate(solicitation.application_due_date?.[0]) ?? parseSbirDate(solicitation.close_date);
      const opensAt = parseSbirDate(solicitation.open_date);
      const agency = [solicitation.agency, solicitation.branch].filter(Boolean).join(" / ") || null;

      for (const topic of solicitation.solicitation_topics ?? []) {
        if (!topic.topic_number || !topic.topic_title) continue;

        results.push({
          externalId: topic.topic_number,
          title: topic.topic_title,
          agency,
          description: topic.topic_description || topic.topic_title,
          eligibilityText: null,
          fundingCategory: null,
          applicationUrl:
            topic.sbir_topic_link || solicitation.sbir_solicitation_link || null,
          opensAt,
          closesAt,
          isSbirEligible: true,
        });
      }
    }

    if (solicitations.length < rows) break;
  }

  return results;
}
