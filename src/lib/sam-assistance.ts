import type { NormalizedOpportunity } from "./opportunities";

const API_BASE = "https://api.sam.gov/assistance-listings/v1/search";

interface AssistanceListing {
  assistanceListingId: string;
  title: string;
  status?: string;
  federalOrganization?: {
    agency?: string;
    department?: string;
  };
  overview?: {
    assistanceListingDescription?: string;
    objective?: string;
  };
  criteriaForApplying?: {
    applicant?: { description?: string };
  };
  assistanceApplication?: {
    applicationProcedure?: { URL?: string };
  };
  programWebPage?: string;
}

interface AssistanceListingsResponse {
  totalRecords?: number;
  assistanceListingsData?: AssistanceListing[];
}

/**
 * Fetches active SAM.gov Assistance Listings (formerly CFDA programs).
 * Unlike Grants.gov, this listing IS the full program description — no
 * separate detail call needed.
 */
export async function fetchAssistanceListings(options: {
  apiToken: string;
  pageSize?: number;
  maxPages?: number;
}): Promise<NormalizedOpportunity[]> {
  const { apiToken, pageSize = 1000, maxPages = 10 } = options;

  const results: NormalizedOpportunity[] = [];

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      api_key: apiToken,
      status: "Active",
      pageSize: String(pageSize),
      pageNumber: String(page),
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`SAM.gov Assistance Listings request failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as AssistanceListingsResponse;
    const listings = body.assistanceListingsData ?? [];

    for (const listing of listings) {
      if (!listing.assistanceListingId || !listing.title) continue;

      results.push({
        externalId: listing.assistanceListingId,
        title: listing.title,
        agency: listing.federalOrganization?.agency ?? listing.federalOrganization?.department ?? null,
        description:
          listing.overview?.assistanceListingDescription || listing.overview?.objective || listing.title,
        eligibilityText: listing.criteriaForApplying?.applicant?.description ?? null,
        fundingCategory: null,
        applicationUrl:
          listing.assistanceApplication?.applicationProcedure?.URL || listing.programWebPage || null,
        opensAt: null,
        closesAt: null,
        isSbirEligible: false,
      });
    }

    if (listings.length < pageSize || results.length >= (body.totalRecords ?? 0)) break;
  }

  return results;
}
