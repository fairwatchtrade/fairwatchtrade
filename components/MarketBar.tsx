"use client";

import { useEffect, useRef, useState } from "react";
import { useMetals } from "@/lib/useMetals";
import { statusOf, type Auction } from "@/lib/auctions";
import auctionsData from "@/data/auctions.json";

const auctions = auctionsData as Auction[];

const DOT: Record<string, string> = {
  gold: "bg-amber-600",
  silver: "bg-zinc-400",
  platinum: "bg-sky-500",
};

const PLACEHOLDER = [
  { key: "gold", label: "Gold", price: null as number | null, changePct: null as number | null },
  { key: "silver", label: "Silver", price: null as number | null, changePct: null as number | null },
  { key: "platinum", label: "Platinum", price: null as number | null, changePct: null as number | null },
];

function usd(n: number | null, key: string) {
  if (n == null) return "—";
  const digits = key === "silver" ? 2 : 0;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function countdown(ms: number) {
  if (ms < 0) ms = 0;
  const d = Math.floor(ms / 864e5);
  const h = Math.floor((ms % 864e5) / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  return `${d > 0 ? d + "d " : ""}${h}h ${m}m`;
}

export default function MarketBar() {
  const metals = useMetals();
  const [now, setNow] = useState(() => Date.now());
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ordered = auctions
    .filter((a) => statusOf(a, now) !== "past")
    .sort((a, b) => {
      const la = statusOf(a, now) === "live";
      const lb = statusOf(b, now) === "live";
      if (la !== lb) return la ? -1 : 1;
      return Date.parse(a.start) - Date.parse(b.start);
    });

  const scroll = (dir: number) =>
    scroller.current?.scrollBy({ left: dir * 220, behavior: "smooth" });

  const list = metals?.metals ?? PLACEHOLDER;

  return (
    <div className="w-full border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-2 px-3">
        <div className="flex shrink-0 items-center gap-4 pr-3">
          <span className="select-none text-[11px] tracking-wide text-zinc-400 [writing-mode:vertical-rl] rotate-180">
            London spot
          </span>
          {list.map((m) => (
            <div key={m.key} className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[m.key] ?? "bg-zinc-400"}`} />
              <div className="leading-tight">
                <div className="text-[11px] text-zinc-500">{m.label}</div>
                <div className="text-[13px] font-medium tabular-nums">
                  {usd(m.price, m.key)}
                  {m.changePct != null && (
                    <span
                      className={`ml-1 text-[11px] ${
                        m.changePct >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {m.changePct >= 0 ? "▲" : "▼"}
                      {Math.abs(m.changePct).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="my-2 w-px shrink-0 self-stretch bg-zinc-200 dark:bg-zinc-800" />

        <button
          onClick={() => scroll(-1)}
          aria-label="Scroll auctions left"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          ‹
        </button>

        <div
          ref={scroller}
          className="flex flex-1 gap-2 overflow-x-auto scroll-smooth px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ordered.map((a) => {
            const live = statusOf(a, now) === "live";
            return (
              <a
                key={a.id}
                href={a.catalogUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-[190px] shrink-0 items-center gap-2.5 rounded-md border border-zinc-200 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    live ? "animate-pulse bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                />
                <div className="min-w-0">
                  <div className="whitespace-nowrap text-[13px] font-medium">{a.house}</div>
                  <div className="whitespace-nowrap text-[11px] text-zinc-500">
                    {a.sale} · {a.city}
                  </div>
                </div>
                <div className="ml-auto whitespace-nowrap text-right">
                  {live ? (
                    <span className="text-[12px] font-medium text-emerald-600">Live now</span>
                  ) : (
                    <span className="text-[12px] font-medium tabular-nums">
                      {countdown(Date.parse(a.start) - now)}
                    </span>
                  )}
                </div>
              </a>
            );
          })}
        </div>

        <button
          onClick={() => scroll(1)}
          aria-label="Scroll auctions right"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          ›
        </button>
      </div>
    </div>
  );
}
