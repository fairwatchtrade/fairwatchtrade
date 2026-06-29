import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   REASSURANCE — Listing review  (v1.63)

   Embeddable inline component (min-height, not full-page). Shown when a
   listing doesn't pass curation. Per PRODUCT_SOUL: a declined listing is not
   a rejection of the seller — dignity is preserved, the path forward is
   explained, the door stays open. Framed as "how we can get this ready,"
   never "rejected." No movement-background SVG, per Studio ruling.
   ──────────────────────────────────────────────────────────────────────── */

const IMPROVEMENTS = [
  "Add more detail to your provenance note — collectors trust context.",
  "Upload clear photographs of the dial, caseback, and clasp.",
  "Review your asking price against comparable references on the platform.",
];

export default function ListingDeclined() {
  return (
    <section className="relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden border-b border-[var(--border-faint)] px-6 py-12 text-center sm:px-8">
      {/* Breadcrumb */}
      <div className="absolute left-6 top-5 z-[1] flex items-center gap-1.5 text-[9px] tracking-[0.5px] text-[var(--void)] sm:left-8">
        <Link href="/sell" className="text-[var(--ghost)] transition-colors hover:text-[var(--muted)]">
          Sell
        </Link>
        <span>›</span>
        <span>Review</span>
      </div>

      <div className="relative z-[1] w-full max-w-[480px]">
        <div className="mb-3.5 text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
          Listing review
        </div>
        <h2 className="mb-2 font-display text-[28px] font-light leading-[1.25] tracking-[0.3px] text-[var(--platinum)]">
          Here&apos;s how we can get this listing ready.
        </h2>
        <div className="mx-auto mb-4 h-px w-[28px] bg-[var(--gold-subtle)]" />
        <p className="mx-auto mb-8 max-w-[460px] font-display text-[15px] font-light italic leading-[1.8] text-[var(--slate)]">
          Your listing didn&apos;t pass curation this time. Here&apos;s what to focus on — each
          step brings it closer.
        </p>

        {/* Improvement points — quiet numbered list */}
        <ol className="mx-auto mb-8 max-w-[400px] space-y-3 text-left">
          {IMPROVEMENTS.map((item, i) => (
            <li key={i} className="flex gap-3 text-[13px] leading-[1.6] text-[var(--slate)]">
              <span className="shrink-0 text-[var(--gold-subtle)]">{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>

        {/* Actions — primary · quiet (door stays open) */}
        <div className="relative z-[1] flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/sell"
            className="bg-[var(--gold)] px-[22px] py-2.5 font-[Inter] text-[9px] font-normal uppercase tracking-[2.5px] text-[var(--ink)]"
          >
            Revise Your Listing
          </Link>
          <Link
            href="/account"
            className="font-[Inter] text-[9px] uppercase tracking-[1.5px] text-[var(--ghost)]"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
