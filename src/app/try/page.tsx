import Link from "next/link";
import { analyzeCompany } from "./actions";
import { SubmitButton } from "./submit-button";

export default function TryItYourselfPage() {
  return (
    <div className="relative flex flex-col flex-1 bg-zinc-950 bg-[url('/dashboard-background.jpg')] bg-cover bg-center bg-no-repeat">
      <div className="absolute inset-0 bg-zinc-950/70" aria-hidden="true" />
      <main className="relative mx-auto w-full max-w-2xl flex-1 px-6 py-16 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-medium text-zinc-300">Utah Governor&apos;s Office of Economic Opportunity</p>
          <Link
            href="/dashboard/resend"
            className="shrink-0 rounded border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-400 hover:text-white"
          >
            Log back in
          </Link>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white drop-shadow-sm">
          Try it yourself
        </h1>
        <p className="mt-3 text-sm text-zinc-300">
          Describe your company in your own words. We&apos;ll score it against real, currently open federal
          funding opportunities, explain any strong matches in plain language, and — if one fits SBIR/STTR —
          draft a first-pass application, live.
        </p>

        <ol className="mt-6 flex flex-col gap-2 rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-zinc-300 sm:flex-row sm:items-center sm:gap-0 sm:divide-x sm:divide-white/10">
          <li className="flex items-start gap-2 sm:flex-1 sm:px-3 sm:first:pl-0">
            <span className="font-semibold text-white">1.</span>
            <span>Describe your company</span>
          </li>
          <li className="flex items-start gap-2 sm:flex-1 sm:px-3">
            <span className="font-semibold text-white">2.</span>
            <span>We match &amp; draft against live opportunities</span>
          </li>
          <li className="flex items-start gap-2 sm:flex-1 sm:px-3 sm:last:pr-0">
            <span className="font-semibold text-white">3.</span>
            <span>
              In production you&apos;d get this by email — here we skip straight to your results
            </span>
          </li>
        </ol>

        <form
          action={analyzeCompany}
          className="mt-8 flex flex-col gap-5 rounded-lg border border-white/10 bg-zinc-950/70 p-6 backdrop-blur-sm"
        >
          {/* Honeypot: hidden from real users via CSS (not display:none —
              some bots skip that), never filled by them; caught server-side
              in analyzeCompany. */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-300">Company name</span>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Acme Robotics"
              className="rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-300">What does your company do?</span>
            <textarea
              name="description"
              required
              minLength={20}
              rows={8}
              placeholder="What you build, your industry, your technology, team size, funding stage — the more specific, the better the matches."
              className="resize-y rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
            />
          </label>

          <SubmitButton />
        </form>

        <p className="mt-6 text-xs text-zinc-400">
          This creates a private results page just for you — nothing here is added to Utah&apos;s business
          registry or sent to anyone.
        </p>
      </main>
    </div>
  );
}
