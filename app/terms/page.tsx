/* ────────────────────────────────────────────────────────────────────────
   TERMS OF SERVICE — /terms  (server component, static)
   ──────────────────────────────────────────────────────────────────────── */

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8">
        <div className="text-[11px] uppercase tracking-[0.15em] text-[var(--gold)]">
          FairWatchTrade
        </div>
        <h1 className="text-3xl font-light text-[var(--platinum)]">Terms of Service</h1>
        <p className="mt-2 text-[12px] text-[var(--muted)]">Last updated: June 2026</p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          1. Acceptance of Terms
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          By using FairWatchTrade you agree to these terms. If you don&rsquo;t
          agree, don&rsquo;t use the platform.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          2. Platform Description
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          FairWatchTrade is a curated peer-to-peer marketplace for independent
          and boutique timepieces. We charge a flat 5% fee on completed sales.
        </p>

        <h2
          id="seller-responsibilities"
          className="mt-8 mb-2 scroll-mt-24 text-[15px] font-medium text-[var(--platinum)]"
        >
          3. Seller Responsibilities
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          Sellers are responsible for accurate listing descriptions, authentic
          photographs of the actual watch, honest representation of condition,
          and fulfilling sales in good faith.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          4. Buyer Responsibilities
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          Buyers are responsible for reviewing listings carefully before
          purchase and communicating directly with sellers through the platform.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          5. Curation &amp; Eligibility
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          FairWatchTrade reserves the right to decline or remove any listing
          that does not meet our independent and boutique focus. Curation
          decisions are final.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          6. Fees
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          A flat 5% platform fee applies to all completed transactions. No
          hidden fees, no advertising fees, no tiered pricing.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          7. Prohibited Conduct
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          No counterfeit or misrepresented watches. No spam or fraudulent
          listings. No circumventing the platform fee by transacting
          off-platform.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          8. Limitation of Liability
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          FairWatchTrade facilitates connections between buyers and sellers but
          is not responsible for disputes arising from individual transactions.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          9. Changes to Terms
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          We may update these terms. Continued use of the platform constitutes
          acceptance.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[var(--platinum)]">
          10. Contact
        </h2>
        <p className="text-[14px] leading-relaxed text-[var(--slate)]">
          Questions? Email{" "}
          <a
            href="mailto:hello@fairwatchtrade.com"
            className="text-[var(--gold)] hover:underline"
          >
            hello@fairwatchtrade.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
