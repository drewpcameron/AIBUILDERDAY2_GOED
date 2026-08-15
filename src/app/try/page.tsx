import { analyzeCompany } from "./actions";
import { SubmitButton } from "./submit-button";

export default function TryItYourselfPage() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 sm:px-8">
        <p className="text-sm font-medium text-zinc-500">Utah Governor&apos;s Office of Economic Opportunity</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Try it yourself
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Describe your company in your own words. We&apos;ll score it against real, currently open federal
          funding opportunities, explain any strong matches in plain language, and — if one fits SBIR/STTR —
          draft a first-pass application, live.
        </p>

        <form action={analyzeCompany} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Company name</span>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Acme Robotics"
              className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">What does your company do?</span>
            <textarea
              name="description"
              required
              minLength={20}
              rows={8}
              placeholder="What you build, your industry, your technology, team size, funding stage — the more specific, the better the matches."
              className="resize-y rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
            />
          </label>

          <SubmitButton />
        </form>

        <p className="mt-6 text-xs text-zinc-500">
          This creates a private results page just for you — nothing here is added to Utah&apos;s business
          registry or sent to anyone.
        </p>
      </main>
    </div>
  );
}
