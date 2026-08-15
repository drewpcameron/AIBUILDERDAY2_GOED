"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

const STAGES = [
  { label: "Scoring against open funding opportunities", durationMs: 6000 },
  { label: "Explaining your strongest matches", durationMs: 8000 },
  { label: "Drafting SBIR/STTR application (if eligible)", durationMs: Infinity },
];

function StageIcon({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs text-zinc-950">
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-50" />
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-zinc-700" />;
}

function AnalyzingChecklist() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 0; i < STAGES.length - 1; i++) {
      elapsed += STAGES[i].durationMs;
      timeouts.push(setTimeout(() => setStageIndex(i + 1), elapsed));
    }
    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-white/10 bg-black/40 p-4">
      {STAGES.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-3">
          <StageIcon state={i < stageIndex ? "done" : i === stageIndex ? "active" : "pending"} />
          <span className={`text-sm ${i <= stageIndex ? "text-zinc-200" : "text-zinc-500"}`}>{stage.label}</span>
        </div>
      ))}
    </div>
  );
}

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-start rounded-full bg-zinc-50 px-6 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Analyzing your company…" : "Find my matches"}
      </button>
      {pending && <AnalyzingChecklist />}
    </div>
  );
}
