import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   REASSURANCE — No search results  (v1.63)

   Embeddable inline component (min-height, not full-page). Shown when a
   filtered search returns nothing. Quiet redirection — no movement-background
   SVG, per Studio ruling. The Catalogue nudge offers to watch for a match.
   ──────────────────────────────────────────────────────────────────────── */

export default function NoSearchResults() {
  return (
    <section className="relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden border-b border-[var(--border-faint)] px-6 py-12 text-center sm:px-8">
      {/* Breadcrumb */}
      <div className="absolute left-6 top-5 z-[1] flex items-center gap-1.5 text-[9px] tracking-[0.5px] text-[var(--void)] sm:left-8">
        <Link href="/browse" className="text-[var(--ghost)] transition-colors hover:text-[var(--muted)]">
          Browse
        </Link>
        <span>›</span>
        <span>Search</span>
      </div>

      <div className="relative z-[1] w-full max-w-[480px]">
        <div className="mb-3.5 text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
          No results
        </div>
        <h2 className="mb-2 font-display text-[28px] font-light leading-[1.25] tracking-[0.3px] text-[var(--platinum)]">
          No watches matched this search.
        </h2>
        <div className="mx-auto mb-4 h-px w-[28px] bg-[var(--gold-subtle)]" />
        <p className="mx-auto mb-6 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]">
          Your filters may be too specific, or no matching watches are currently listed. The
          right piece may simply not be here yet — but the market moves constantly.
        </p>

        {/* Catalogue nudge */}
        <div className="mx-auto mb-6 flex max-w-[400px] items-start gap-2.5 border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3 text-left">
          <span className="mt-0.5 shrink-0 text-[11px] text-[var(--gold-subtle)]">◎</span>
          <p className="font-display text-[13px] font-light leading-[1.65] text-[var(--muted)]">
            <strong className="font-normal not-italic text-[var(--platinum-dim)]">
              Save this search to your Catalogue.
            </strong>{" "}
            When a matching watch is listed anywhere on FairWatchTrade, you will be the first to
            know.
          </p>
        </div>

        {/* Actions — primary · ghost · quiet */}
        <div className="relative z-[1] flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/account"
            className="bg-[var(--gold)] px-[22px] py-2.5 font-[Inter] text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--ink)]"
          >
            Save Search to Catalogue
          </Link>
          <Link
            href="/browse"
            className="border border-[var(--border-subtle)] bg-transparent px-[18px] py-[9px] font-[Inter] text-[9px] uppercase tracking-[2px] text-[var(--slate)]"
          >
            Refine the Search
          </Link>
          <Link
            href="/browse"
            className="font-[Inter] text-[9px] uppercase tracking-[1.5px] text-[var(--ghost)]"
          >
            Browse All Watches
          </Link>
        </div>
      </div>
    </section>
  );
}
