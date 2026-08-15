"use client";

import { useActionState } from "react";
import { requestDashboardLink } from "./actions";

export function ResendForm() {
  const [state, formAction, pending] = useActionState(requestDashboardLink, { submitted: false });

  if (state.submitted) {
    return (
      <p className="rounded-lg border border-white/10 bg-zinc-950/70 p-4 text-sm text-zinc-200 backdrop-blur-sm">
        If that email has a dashboard linked to it, we&apos;ve sent a fresh link. Check your inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-white/10 bg-zinc-950/70 p-6 backdrop-blur-sm">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-300">Recovery email</span>
        <input
          type="email"
          name="email"
          required
          placeholder="you@company.com"
          className="rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-zinc-50 px-6 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send me a new link"}
      </button>
    </form>
  );
}
