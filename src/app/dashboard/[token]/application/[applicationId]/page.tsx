import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markApplicationReviewed } from "../../actions";
import { type ApplicationFields } from "@/lib/autofill";

const FIELD_SECTIONS: Array<{ heading: string; fields: Array<keyof ApplicationFields> }> = [
  {
    heading: "Company information",
    fields: ["companyName", "companyAddress", "entityType", "naicsCode", "numberOfEmployees", "annualRevenue"],
  },
  {
    heading: "Technical narrative",
    fields: ["technicalAbstract", "technicalInnovation", "commercialPotential"],
  },
  {
    heading: "Funding & eligibility",
    fields: [
      "fundingRequested",
      "usOwnershipPercent",
      "ownershipDemographics",
      "principalInvestigatorEmployer",
      "priorSbirSttrHistory",
    ],
  },
];

const FIELD_LABELS: Record<keyof ApplicationFields, string> = {
  companyName: "Company name",
  companyAddress: "Company address",
  entityType: "Entity type",
  naicsCode: "NAICS code",
  numberOfEmployees: "Number of employees",
  annualRevenue: "Annual revenue",
  technicalAbstract: "Technical abstract",
  technicalInnovation: "Technical innovation",
  commercialPotential: "Commercial potential",
  fundingRequested: "Funding requested",
  usOwnershipPercent: "US ownership %",
  ownershipDemographics: "Ownership demographics",
  principalInvestigatorEmployer: "Principal investigator's employer",
  priorSbirSttrHistory: "Prior SBIR/STTR history",
};

const LONG_FIELDS = new Set<keyof ApplicationFields>([
  "technicalAbstract",
  "technicalInnovation",
  "commercialPotential",
]);

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ token: string; applicationId: string }>;
}) {
  const { token, applicationId } = await params;

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { match: { include: { business: true, opportunity: true } } },
  });

  if (!application || application.match.business.dashboardToken !== token) notFound();

  const { match } = application;
  const fields = application.fields as unknown as ApplicationFields;
  const isReviewed = application.status === "REVIEWED";

  return (
    <div className="relative flex flex-col flex-1 bg-zinc-950 bg-[url('/dashboard-background.jpg')] bg-cover bg-center bg-no-repeat">
      <div className="absolute inset-0 bg-zinc-950/70" aria-hidden="true" />
      <main className="relative mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-8">
        <Link href={`/dashboard/${token}`} className="text-sm text-zinc-300 underline underline-offset-2 hover:text-white">
          ← Back to dashboard
        </Link>

        <header className="mt-6 mb-8">
          <p className="text-sm font-medium text-zinc-300">SBIR/STTR Application Draft</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white drop-shadow-sm">
            {match.opportunity.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{match.opportunity.agency ?? "Agency not specified"}</p>

          <div className="mt-4 flex items-center gap-3">
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isReviewed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isReviewed ? "Reviewed" : "AI-drafted, unreviewed"}
            </span>
            {match.opportunity.applicationUrl && (
              <a
                href={match.opportunity.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-zinc-50 underline underline-offset-2"
              >
                View official opportunity
              </a>
            )}
          </div>
        </header>

        <p className="mb-8 rounded-lg border border-amber-900/40 bg-amber-950/50 p-4 text-sm text-amber-200">
          Every field below was drafted by AI from your business profile and this opportunity&apos;s text. Nothing
          here has been sent to any agency — review and correct each field before copying it into an actual
          submission.
        </p>

        <form
          action={markApplicationReviewed.bind(null, token, application.id)}
          className="flex flex-col gap-8 rounded-lg border border-white/10 bg-zinc-950/70 p-6 backdrop-blur-sm sm:p-8"
        >
          {FIELD_SECTIONS.map((section) => (
            <fieldset key={section.heading} className="flex flex-col gap-5">
              <legend className="mb-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                {section.heading}
              </legend>
              {section.fields.map((key) => {
                const value = fields[key];
                const isMissing = value?.startsWith("Not yet provided by founder");
                return (
                  <label key={key} className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-zinc-300">{FIELD_LABELS[key]}</span>
                    {LONG_FIELDS.has(key) ? (
                      <textarea
                        readOnly
                        rows={4}
                        value={value}
                        className={`resize-y rounded border px-3 py-2 text-sm outline-none ${
                          isMissing
                            ? "border-amber-800/60 bg-amber-950/20 text-amber-300 italic"
                            : "border-white/20 bg-black/40 text-zinc-100"
                        }`}
                      />
                    ) : (
                      <input
                        readOnly
                        type="text"
                        value={value}
                        className={`rounded border px-3 py-2 text-sm outline-none ${
                          isMissing
                            ? "border-amber-800/60 bg-amber-950/20 text-amber-300 italic"
                            : "border-white/20 bg-black/40 text-zinc-100"
                        }`}
                      />
                    )}
                  </label>
                );
              })}
            </fieldset>
          ))}

          {!isReviewed && (
            <button
              type="submit"
              className="self-start rounded-full bg-zinc-50 px-6 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Mark as reviewed
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
