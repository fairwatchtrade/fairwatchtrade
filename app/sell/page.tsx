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

          {/* v2.2 — List from Phone. A quiet, explicit opt-in for mobile
              sellers (md:hidden). Never an auto-redirect: tablets, foldables,
              desktop-mode browsers, and sellers who prefer this form all stay
              right here. The wizard is a choice, not a funnel. */}
          <Link
            href="/sell/mobile"
            className="mt-5 inline-flex items-center gap-2 border border-[var(--border-gold)] px-4 py-2 text-[10px] uppercase tracking-[2px] text-[var(--gold-subtle)] transition-colors hover:text-[var(--gold)] md:hidden"
          >
            List from Phone →
          </Link>
        </div>
        <SellFlow />
      </div>
    </main>
  );
}
