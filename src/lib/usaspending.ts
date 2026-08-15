const API_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

// USAspending requires award_type_codes to come from a single group per
// request (contracts XOR grants — a mixed list 422s). SBIR/STTR itself
// spans both: DoD issues it as a contract, NIH as a grant (R43/R44) — so we
// query both groups and merge, rather than picking one and missing half the
// real precedent.
const GRANT_TYPE_CODES = ["02", "03", "04", "05"];
const CONTRACT_TYPE_CODES = ["A", "B", "C", "D"];

export interface SimilarAward {
  recipientName: string;
  awardingAgency: string | null;
  awardAmount: number | null;
  description: string | null;
  awardDate: string | null;
  sourceUrl: string | null;
}

interface SpendingByAwardResult {
  generated_internal_id?: string;
  "Recipient Name"?: string;
  "Awarding Agency"?: string;
  "Award Amount"?: number;
  Description?: string;
  "Start Date"?: string;
  "Base Obligation Date"?: string;
}

/**
 * Live, on-demand USAspending.gov lookup — never cached/synced locally.
 * Transaction-level data at this source's scale (GB-TB) doesn't fit the
 * project's data storage budget (see plan.md), so this is queried fresh
 * per dashboard render for one business's NAICS code, not a background job.
 */
async function queryAwards(naicsCode: string, awardTypeCodes: string[], limit: number): Promise<SimilarAward[]> {
  const today = new Date();
  const threeYearsAgo = new Date(today);
  threeYearsAgo.setFullYear(today.getFullYear() - 3);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subawards: false,
      limit,
      page: 1,
      sort: "Award Amount",
      order: "desc",
      filters: {
        naics_codes: { require: [naicsCode] },
        award_type_codes: awardTypeCodes,
        // Without this, results are dominated by huge prime contractors
        // (Oracle, L3Harris, CVS) whose award size has nothing to do with
        // being a useful comparison for a startup — small_business narrows
        // to recipients actually comparable to who's using this dashboard.
        recipient_type_names: ["small_business"],
        // Some recipients keep a stale "small business" self-categorization
        // from SAM.gov long after outgrowing it (e.g. IBM still showed up
        // without this) — an amount ceiling filters out that residue even
        // when the category alone doesn't.
        award_amounts: [{ lower_bound: 0, upper_bound: 15_000_000 }],
        time_period: [
          {
            start_date: threeYearsAgo.toISOString().slice(0, 10),
            end_date: today.toISOString().slice(0, 10),
          },
        ],
      },
      fields: [
        "generated_internal_id",
        "Recipient Name",
        "Awarding Agency",
        "Award Amount",
        "Description",
        "Start Date",
        "Base Obligation Date",
      ],
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return [];

  const body = (await res.json()) as { results?: SpendingByAwardResult[] };

  return (body.results ?? [])
    .filter((r) => r["Recipient Name"])
    .map((r) => ({
      recipientName: r["Recipient Name"]!,
      awardingAgency: r["Awarding Agency"] ?? null,
      awardAmount: r["Award Amount"] ?? null,
      description: r.Description ?? null,
      awardDate: r["Start Date"] ?? r["Base Obligation Date"] ?? null,
      sourceUrl: r.generated_internal_id ? `https://www.usaspending.gov/award/${r.generated_internal_id}` : null,
    }));
}

export async function fetchSimilarAwards(naicsCode: string, limit: number = 5): Promise<SimilarAward[]> {
  const [grants, contracts] = await Promise.all([
    queryAwards(naicsCode, GRANT_TYPE_CODES, limit),
    queryAwards(naicsCode, CONTRACT_TYPE_CODES, limit),
  ]);

  return [...grants, ...contracts]
    .sort((a, b) => (b.awardAmount ?? 0) - (a.awardAmount ?? 0))
    .slice(0, limit);
}
