import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateFounderInfo } from "./actions";
import { fetchSimilarAwards } from "@/lib/usaspending";
import type { MatchConfidence } from "@/generated/prisma/client";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// Only MEDIUM/HIGH matches are surfaced here — LOW matches are kept in the
// database for auditability but aren't confident enough to show a founder.
const SENDABLE_CONFIDENCE: MatchConfidence[] = ["MEDIUM", "HIGH"];
const MAX_MATCHES_SHOWN = 3;

const FOUNDER_FIELDS: Array<{
  name:
    | "annualRevenue"
    | "capitalNeed"
    | "usOwnershipPercent"
    | "ownershipDemographics"
    | "piPrimaryEmployer"
    | "priorSbirHistory";
  label: string;
  placeholder: string;
  type: "text" | "number";
}> = [
  { name: "annualRevenue", label: "Annual revenue", placeholder: "e.g. $1.2M", type: "text" },
  { name: "capitalNeed", label: "Capital need / amount seeking", placeholder: "e.g. $500K seed extension", type: "text" },
  { name: "usOwnershipPercent", label: "US ownership (%)", placeholder: "e.g. 100", type: "number" },
  { name: "ownershipDemographics", label: "Ownership demographics", placeholder: "e.g. woman-owned, veteran-owned", type: "text" },
  { name: "piPrimaryEmployer", label: "PI's primary employer", placeholder: "e.g. this company, full-time", type: "text" },
  { name: "priorSbirHistory", label: "Prior SBIR/STTR award history", placeholder: "e.g. none, or Phase I 2023", type: "text" },
];

function confidenceBadgeClass(confidence: string): string {
  switch (confidence) {
    case "HIGH":
      return "bg-emerald-100 text-emerald-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

export default async function DashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const business = await prisma.business.findUnique({
    where: { dashboardToken: token },
    include: {
      matches: {
        where: { confidence: { in: SENDABLE_CONFIDENCE } },
        orderBy: { score: "desc" },
        take: MAX_MATCHES_SHOWN,
        include: { opportunity: true, application: true },
      },
    },
  });

  if (!business) notFound();

  // Live, on-demand only — never synced/cached (see plan.md's Data storage
  // budget: USAspending is transaction-scale data, unsuited to the local
  // Opportunity cache other sources use).
  const similarAwards = business.naicsCodeGuess ? await fetchSimilarAwards(business.naicsCodeGuess) : [];

  const missingFields = FOUNDER_FIELDS.filter((f) => {
    const value = business[f.name];
    return value === null || value === undefined;
  });

  const boundUpdateFounderInfo = updateFounderInfo.bind(null, token);

  return (
    <div className="relative flex flex-col flex-1 bg-zinc-950 bg-[url('/dashboard-background.jpg')] bg-cover bg-center bg-no-repeat">
      <div className="absolute inset-0 bg-zinc-950/70" aria-hidden="true" />
      <main className="relative mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-8">
        <header className="mb-10">
          <p className="text-sm font-medium text-zinc-300">Utah Governor&apos;s Office of Economic Opportunity</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white drop-shadow-sm">
            {business.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-300">
            {business.matches.length > 0
              ? `${business.matches.length} matched funding opportunit${business.matches.length === 1 ? "y" : "ies"}`
              : "No confident matches yet"}
          </p>
        </header>

        <section className="mb-12 flex flex-col gap-4">
          {business.matches.length === 0 && (
            <p className="rounded-lg border border-white/10 bg-zinc-950/70 p-4 text-sm text-zinc-300 backdrop-blur-sm">
              We haven&apos;t found a confident match yet. This can change as more opportunities sync or once you
              fill in the details below.
            </p>
          )}

          {business.matches.map((match) => (
            <article
              key={match.id}
              className="rounded-lg border border-white/10 bg-zinc-950/70 p-5 backdrop-blur-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h2 className="font-medium text-zinc-50">{match.opportunity.title}</h2>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${confidenceBadgeClass(match.confidence)}`}
                >
                  {match.confidence}
                </span>
              </div>
              <p className="mb-3 text-xs text-zinc-400">{match.opportunity.agency ?? "Agency not specified"}</p>
              <p className="mb-3 text-sm text-zinc-300">{match.reasoning}</p>
              {match.caveats && (
                <p className="mb-3 rounded bg-amber-950/50 p-3 text-sm text-amber-200">
                  <span className="font-medium">Before applying: </span>
                  {match.caveats}
                </p>
              )}
              {match.opportunity.applicationUrl && (
                <a
                  href={match.opportunity.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-zinc-50 underline underline-offset-2"
                >
                  View opportunity
                </a>
              )}
              {match.application && (
                <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-zinc-50">
                      SBIR/STTR draft application
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        match.application.status === "REVIEWED"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {match.application.status === "REVIEWED" ? "Reviewed" : "AI-drafted, unreviewed"}
                    </span>
                  </div>
                  <p className="mb-4 text-sm text-zinc-300">
                    A first-pass application was drafted from your business profile and this opportunity&apos;s
                    text — company info, technical narrative, and funding/eligibility fields, filled in where the
                    data is available.
                  </p>
                  <Link
                    href={`/dashboard/${token}/application/${match.application.id}`}
                    className="inline-block rounded-full bg-zinc-50 px-4 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    View full application →
                  </Link>
                </div>
              )}
            </article>
          ))}
        </section>

        {business.naicsCodeGuess && (
          <section className="mb-12 rounded-lg border border-white/10 bg-zinc-950/70 p-5 backdrop-blur-sm">
            <h2 className="mb-1 font-medium text-zinc-50">Similar companies funded</h2>
            <p className="mb-4 text-sm text-zinc-400">
              Recent federal awards to small businesses in your industry (NAICS {business.naicsCodeGuess}), pulled
              live from USAspending.gov — not stored, refreshed each time this page loads. These are companies
              with the same industry code, not a guarantee of comparable size or fit.
            </p>
            {similarAwards.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">
                No comparable award data found for this industry right now.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {similarAwards.map((award, i) => (
                  <li key={i} className="rounded border border-white/10 bg-black/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-zinc-100">{award.recipientName}</span>
                      {award.awardAmount !== null && (
                        <span className="shrink-0 text-sm font-medium text-emerald-300">
                          {currencyFormatter.format(award.awardAmount)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {award.awardingAgency ?? "Agency not specified"}
                      {award.awardDate ? ` · ${award.awardDate}` : ""}
                    </p>
                    {award.description && (
                      <p className="mt-1.5 text-xs text-zinc-400 capitalize">{award.description.toLowerCase()}</p>
                    )}
                    {award.sourceUrl && (
                      <a
                        href={award.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-block text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
                      >
                        View award on USAspending.gov
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-lg border border-white/10 bg-zinc-950/70 p-5 backdrop-blur-sm">
          <h2 className="mb-1 font-medium text-zinc-50">Tell us more about your business</h2>
          {missingFields.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Thanks — we have everything we currently ask for. We&apos;ll re-check your matches as new
              opportunities come in.
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-zinc-400">
                A few details aren&apos;t publicly available. Filling these in helps us refine and re-run your
                matches.
              </p>
              <form action={boundUpdateFounderInfo} className="flex flex-col gap-4">
                {missingFields.map((field) => (
                  <label key={field.name} className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-zinc-300">{field.label}</span>
                    <input
                      type={field.type}
                      name={field.name}
                      placeholder={field.placeholder}
                      className="rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
                      {...(field.type === "number" ? { min: 0, max: 100 } : {})}
                    />
                  </label>
                ))}
                <button
                  type="submit"
                  className="mt-2 self-start rounded-full bg-zinc-50 px-5 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  Save
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
