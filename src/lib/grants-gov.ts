import type { NormalizedOpportunity } from "./opportunities";

const SEARCH_URL = "https://api.grants.gov/v1/api/search2";
const FETCH_URL = "https://api.grants.gov/v1/api/fetchOpportunity";

// Grants.gov fundingCategories codes, narrowed to what a tech/R&D-heavy
// startup could plausibly qualify for. Excludes categories like Housing,
// Agriculture, or Disaster Relief that would never surface a real match —
// see plan.md's anti-hallucination rule and the Grants.gov depth decision
// (full synopsis text for a relevant slice, not title-only for everything).
const STARTUP_RELEVANT_CATEGORIES = ["ST", "BC", "HL", "ENV", "EN", "ELT"];

interface Search2Hit {
  id: string;
  number?: string;
  title: string;
  agencyCode?: string;
  agency?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
  docType?: string;
  cfdaList?: string[];
}

interface Search2Response {
  errorcode?: number;
  msg?: string;
  data?: {
    hitCount: number;
    oppHits: Search2Hit[];
  };
}

interface FetchOpportunityResponse {
  errorcode?: number;
  msg?: string;
  data?: {
    synopsis?: {
      synopsisDesc?: string;
      applicantEligibilityDesc?: string;
    };
    // Forecasted opportunities (docType "forecast") carry their
    // description here instead of in `synopsis` — no synopsis exists yet
    // since the actual funding announcement hasn't posted, and forecasts
    // don't carry a free-text eligibility description at all.
    forecast?: {
      forecastDesc?: string;
    };
  };
}

function parseGrantsGovDate(value: string | undefined): Date | undefined {
  // Grants.gov dates come back as MM/DD/YYYY.
  if (!value) return undefined;
  const [month, day, year] = value.split("/").map(Number);
  if (!month || !day || !year) return undefined;
  return new Date(Date.UTC(year, month - 1, day));
}

async function searchOpenHits(rowsPerPage = 100, maxPages = 20): Promise<Search2Hit[]> {
  const hits: Search2Hit[] = [];

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: rowsPerPage,
        startRecordNum: page * rowsPerPage,
        oppStatuses: "forecasted|posted",
        fundingCategories: STARTUP_RELEVANT_CATEGORIES.join("|"),
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Grants.gov search2 request failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as Search2Response;
    if (!body.data) {
      throw new Error(`Grants.gov search2 request failed: ${body.msg ?? "no data"}`);
    }

    hits.push(...body.data.oppHits);

    if (body.data.oppHits.length < rowsPerPage || hits.length >= body.data.hitCount) break;
  }

  return hits;
}

async function fetchSynopsis(
  opportunityId: string,
): Promise<{ description: string | null; eligibilityText: string | null }> {
  const res = await fetch(FETCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunityId }),
    cache: "no-store",
  });

  if (!res.ok) {
    return { description: null, eligibilityText: null };
  }

  const body = (await res.json()) as FetchOpportunityResponse;
  return {
    description: body.data?.synopsis?.synopsisDesc ?? body.data?.forecast?.forecastDesc ?? null,
    eligibilityText: body.data?.synopsis?.applicantEligibilityDesc ?? null,
  };
}

// Fetches full synopsis detail for many opportunities with bounded
// concurrency, so a large hit count doesn't fire hundreds of simultaneous
// requests at Grants.gov or blow past the sync route's execution limit.
async function fetchSynopsesBatched(
  hits: Search2Hit[],
  concurrency = 8,
): Promise<Map<string, { description: string | null; eligibilityText: string | null }>> {
  const results = new Map<string, { description: string | null; eligibilityText: string | null }>();
  let cursor = 0;

  async function worker() {
    while (cursor < hits.length) {
      const hit = hits[cursor++];
      try {
        results.set(hit.id, await fetchSynopsis(hit.id));
      } catch {
        results.set(hit.id, { description: null, eligibilityText: null });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, hits.length) }, worker));
  return results;
}

/**
 * Pulls currently open/forecasted Grants.gov opportunities, narrowed to
 * startup-relevant funding categories, with full synopsis text fetched for
 * every result in that narrowed slice (see STARTUP_RELEVANT_CATEGORIES).
 */
export async function fetchGrantsGovOpportunities(): Promise<NormalizedOpportunity[]> {
  const hits = await searchOpenHits();
  const synopses = await fetchSynopsesBatched(hits);

  return hits.map((hit) => {
    const synopsis = synopses.get(hit.id);
    return {
      externalId: hit.id,
      title: hit.title,
      agency: hit.agency ?? hit.agencyCode ?? null,
      description: synopsis?.description || hit.title,
      eligibilityText: synopsis?.eligibilityText ?? null,
      fundingCategory: null,
      applicationUrl: `https://grants.gov/search-results-detail/${hit.id}`,
      opensAt: parseGrantsGovDate(hit.openDate) ?? null,
      closesAt: parseGrantsGovDate(hit.closeDate) ?? null,
      isSbirEligible: false,
    };
  });
}
