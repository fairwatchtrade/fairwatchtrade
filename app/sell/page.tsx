"use client";

import Link from "next/link";
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

          {/* v2.56 — the seller's approved answer, near the entry. */}
          <div className="mt-4 text-[14px] leading-[1.6]">
            <span className="font-display text-[16px] text-[var(--platinum)]">
              Pay a flat 5% only when your watch sells.
            </span>
            <span className="mt-0.5 block text-[13px] text-[var(--muted)]">
              No listing fee. No paid placement. No games.
            </span>
          </div>

          {/* v2.2 — List from Phone. A quiet, explicit opt-in for mobile
              sellers (md:hidden). Never an auto-redirect: tablets, foldables,
              desktop-mode browsers, and sellers who prefer this form all stay
              right here. The wizard is a choice, not a funnel. */}
          <Link
            href="/sell/mobile"
            className="mt-5 inline-flex items-center gap-2 border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold-dim)] transition-colors hover:text-[var(--gold)] md:hidden"
          >
            List from Phone →
          </Link>
        </div>
        <SellFlow />
      </div>
    </main>
  );
}
