"use client";

import { useEffect, useRef, useState } from "react";
import { useMetals } from "@/lib/useMetals";
import { statusOf, type Auction } from "@/lib/auctions";

/* v2.5b — the seam. MarketBar no longer imports data/auctions.json;
   it consumes GET /api/auctions, the abstraction boundary. The UI never
   knows (and must never care) where auction data came from — when the
   backend becomes a table, importers, or feeds, this component does not
   change. The endpoint pre-filters "past" server-side against real
   time; the client-side statusOf() below remains only as the live-
   session updater (an auction ending while the tab sits open still
   drops; one starting still flips to Live). */

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
  const [auctions, setAuctions] = useState<Auction[]>([]);
  // v2.4z — initialize with REAL time. useState(0) meant the first render
  // evaluated statusOf() against the Unix epoch: every expired auction
  // read as "upcoming" for one second, then the first tick emptied the
  // filter — the ghost flash. Product law: an expired auction may
  // disappear. It may not come back from 1970 for one second first.
  const [now, setNow] = useState(() => Date.now());
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // v2.5b — fetch through the contract. Fail-open to []: on any error the
  // auction chrome simply collapses (the v2.4z empty state), the metals
  // stand, nothing crashes, nothing ghosts.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auctions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.auctions)) return;
        setAuctions(data.auctions as Auction[]);
      })
      .catch(() => {
        /* fail-open — empty chrome, never a crash */
      });
    return () => {
      cancelled = true;
    };
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
    <div className="w-full border-b border-white/10 bg-[#13151C]">
      <div className="mx-auto flex h-11 max-w-screen-2xl items-center gap-2 px-3">
        <div className="flex shrink-0 items-center gap-4 pr-3">
          <span className="select-none text-[11px] tracking-wide text-[#C9A84C] [writing-mode:vertical-rl] rotate-180">
            London
          </span>
          {list.map((m) => (
            <div key={m.key} className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[m.key] ?? "bg-zinc-400"}`} />
              <div className="leading-tight">
                <div className="text-[11px] text-[#8A8F9E]">{m.label}</div>
                <div className="text-[13px] font-medium tabular-nums text-[#E8E4DC]">
                  {usd(m.price, m.key)}
                  {m.changePct != null && (
                    <span
                      className={`ml-1 text-[11px] ${
                        m.changePct >= 0 ? "text-emerald-400" : "text-red-400"
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

        {/* v2.4z — zero live/upcoming auctions: the auction chrome
            (divider, arrows, strip) collapses entirely rather than
            leaving arrows pointing at nothing. No placeholder auctions,
            nothing resurrected — the metals bar stands alone, intact. */}
        {ordered.length > 0 && (
          <>
            <div className="my-2 w-px shrink-0 self-stretch bg-white/10" />

            <button
              onClick={() => scroll(-1)}
          aria-label="Scroll auctions left"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-[#8A8F9E] hover:bg-white/5"
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
                className="flex min-w-[190px] shrink-0 items-center gap-2.5 rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/5"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    live ? "animate-pulse bg-emerald-500" : "bg-[#3A3D45]"
                  }`}
                />
                <div className="min-w-0">
                  <div className="whitespace-nowrap text-[13px] font-medium text-[#E8E4DC]">{a.house}</div>
                  <div className="whitespace-nowrap text-[11px] text-[#8A8F9E]">
                    {a.sale} · {a.city}
                  </div>
                </div>
                <div className="ml-auto whitespace-nowrap text-right">
                  {live ? (
                    <span className="text-[12px] font-medium text-emerald-400">Live now</span>
                  ) : (
                    <span
                      className="text-[12px] font-medium tabular-nums text-[#E8E4DC]"
                      // v2.4z — server render and client hydrate read Date.now()
                      // moments apart; the countdown text may differ by a minute
                      // across that gap. Time-sensitive text is the textbook case
                      // for suppressing the warning on THIS node only.
                      suppressHydrationWarning
                    >
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-[#8A8F9E] hover:bg-white/5"
        >
          ›
        </button>
          </>
        )}
      </div>
    </div>
  );
}
