"use client";

import { useMetals } from "@/lib/useMetals";

const DOT: Record<string, string> = {
  gold: "bg-amber-600",
  silver: "bg-zinc-400",
  platinum: "bg-sky-500",
};

const PLACEHOLDER = [
  { key: "gold", label: "Gold", price: null as number | null },
  { key: "silver", label: "Silver", price: null as number | null },
  { key: "platinum", label: "Platinum", price: null as number | null },
];

function usd(n: number | null) {
  return n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function MetalsLine() {
  const metals = useMetals();
  const list = metals?.metals ?? PLACEHOLDER;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-zinc-200 py-2 text-[12px] text-zinc-500 dark:border-zinc-800">
      <span className="text-[11px] tracking-wide text-zinc-400">London spot</span>
      {list.map((m) => (
        <span key={m.key} className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[m.key] ?? "bg-zinc-400"}`} />
          <span className="font-medium text-zinc-600 dark:text-zinc-300">{m.label}</span>
          <span className="tabular-nums">{usd(m.price)}</span>
        </span>
      ))}
    </div>
  );
}
