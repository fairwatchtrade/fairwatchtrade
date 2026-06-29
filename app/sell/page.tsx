"use client";

import SellFlow from "@/components/SellFlow";

export default function SellPage() {
  return (
    <main className="min-h-screen bg-[var(--ink)]">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <div className="mb-8">
          <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
            FairWatchTrade
          </div>
          <h1 className="mt-2 font-display text-[28px] font-light tracking-[0.3px] text-[var(--platinum)]">
            List your watch.
          </h1>
          <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
            Independent &amp; boutique makers only. Curated before listed.
          </p>
        </div>
        <SellFlow />
      </div>
    </main>
  );
}
