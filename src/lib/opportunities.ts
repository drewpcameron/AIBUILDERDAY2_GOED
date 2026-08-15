// Shape every source client normalizes into before the sync route upserts
// it into the `Opportunity` table (component 1 in plan.md). Keeping this
// separate from the Prisma model lets each source client stay a pure
// fetch-and-normalize function with no database dependency.
export interface NormalizedOpportunity {
  externalId: string;
  title: string;
  agency: string | null;
  description: string;
  eligibilityText: string | null;
  fundingCategory: string | null;
  applicationUrl: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
  isSbirEligible: boolean;
}
