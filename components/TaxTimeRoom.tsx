"use client";

/* ════════════════════════════════════════════════════════════════════════
   TAX TIME ROOM — components/TaxTimeRoom.tsx  (v8.30, shell only)

   The dealer-only recordkeeping room inside the real account workspace,
   built from the approved DesignDuck v2 direction (Layout order
   2026-09-09). It is reached like every other room — the AccountRail item
   and ?module=tax-time — and it renders here ONCE, outside any
   mobile/desktop split, the same reasoning as Saved Searches and the
   Dealer Accelerator room.

   ── THE ROOM IS READY. THE NUMBERS ARE NOT. ─────────────────────────────
   Nothing in this file reads, computes, estimates or formats a financial
   value. There is no ledger, no query, no fee arithmetic, no export. Every
   value position renders the word "Unavailable", and that word is a
   product truth, not a placeholder for a zero:

     "No completed sales" and "reporting unavailable" are different truths.

   A zero here would claim a successful ledger query found nothing. No such
   query exists yet, so no zero may appear — not a currency zero, not a
   transaction count of none, not an em-dash amount, not a skeleton
   number. When the authoritative
   completed-transaction read arrives, it moves INTO these positions; the
   room does not get replaced.

   ── WHO SEES IT ────────────────────────────────────────────────────────
   Not decided here. The server page resolves dealer access from
   dealer_profiles (lib/dealerAccess.ts), the workspace refuses the module
   for anyone else (lib/accountModules.ts), and this component simply
   renders when it is mounted. It has no access logic to get wrong.

   ── PRODUCTION FIT ─────────────────────────────────────────────────────
   Tokens and type roles are the account workspace's own: gold eyebrow for
   category identity, Cormorant (font-display) for the room title, section
   titles and the serif value slot, Inter for labels and body, mineral for
   structural notes. Sizes honour the v2 floor — nothing that matters sits
   below 11px; table headers 11px, state pills 11.5px, the boundary footer
   12px. Layout collapses on the workspace's own breakpoints; the table
   header keeps the product's horizontal-scroller idiom rather than
   crushing nine financial columns into fragments.

   ── COPY IS LOCKED ─────────────────────────────────────────────────────
   Every sentence below is the DesignDuck v2 wording Jason approved. Do not
   improve it here; a change is a Layout ruling.
   ════════════════════════════════════════════════════════════════════════ */

const EYEBROW = "text-[11px] uppercase tracking-[1.6px] text-[var(--gold)]";
const SECTION_TITLE = "font-display text-[24px] font-light leading-[1.2] text-[var(--platinum)]";
const SECTION_COPY = "mt-1 max-w-[680px] text-[13px] leading-[1.55] text-[var(--muted)]";
const STATUS_PILL =
  "shrink-0 self-start border border-[var(--border-subtle)] bg-[var(--control-wash)] px-2.5 py-1.5 text-[11px] text-[var(--muted)]";
const PANEL = "border border-[var(--border-subtle)] bg-[var(--surface)]";

/** The five governed Year at a Glance measures, in order. Permanent homes. */
export const TAX_TIME_METRICS = [
  "Completed Transactions",
  "Gross Sales",
  "FairWatchTrade Fees",
  "Refunds / Adjustments",
  "Net Proceeds",
] as const;

/** The durable Transaction Detail column contract. Headings only — no rows. */
export const TAX_TIME_COLUMNS = [
  "Sale date",
  "Brand",
  "Model",
  "Reference",
  "Transaction ID",
  "Gross sale",
  "FWT fee",
  "Refunds / Adj.",
  "Net proceeds",
] as const;

/** The two future output homes. Presentation rows: no href, no handler. */
export const TAX_TIME_OUTPUTS = [
  { name: "Annual PDF", description: "A readable annual summary of your completed FairWatchTrade business." },
  { name: "CSV", description: "Transaction-level records for your own files or further preparation." },
] as const;

/** The one word every value position shows until authoritative reporting exists. */
export const UNAVAILABLE = "Unavailable";

function LockMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="var(--mineral)" strokeWidth="1.8" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function LedgerMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="var(--gold)" strokeWidth="1.7" aria-hidden="true">
      <path d="M6 4h12v16H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

export default function TaxTimeRoom() {
  /* Context only, current calendar year at render. Not a control, not a
     query, and never a permanent literal. */
  const year = new Date().getFullYear();

  return (
    <section aria-label="Tax Time" className="px-4 pb-10 pt-2 md:px-0">
      {/* ── Room identity ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-7">
        <div className="min-w-0">
          <div className={EYEBROW}>Dealer records</div>
          <h1 className="mt-2 font-display text-[38px] font-light leading-[1.03] tracking-[-0.01em] text-[var(--platinum)] md:text-[48px]">
            Tax Time
          </h1>
          <p className="mt-3 max-w-[720px] text-[15px] leading-[1.55] text-[var(--slate)]">
            A permanent home for understanding completed FairWatchTrade business, preparing records, and tracing every reported total back to the transactions behind it.
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 self-start border border-[var(--border-subtle)] bg-[var(--control-wash)] px-3 py-2 text-[12px] text-[var(--slate)]">
          <LockMark />
          Dealer-only workspace
        </div>
      </header>

      {/* ── Reporting availability ─────────────────────────────────────── */}
      <div
        role="note"
        aria-label="Reporting availability"
        className="mt-6 grid grid-cols-[auto_1fr] items-start gap-3.5 border border-[var(--border-subtle)] border-l-2 border-l-[var(--mineral)] bg-[var(--surface)] px-4 py-4"
      >
        <div className="grid h-7 w-7 place-items-center rounded-full border border-[var(--border-mid)] font-display text-[15px] text-[var(--mineral)]" aria-hidden="true">
          i
        </div>
        <div className="min-w-0">
          <strong className="block text-[14px] font-medium text-[var(--platinum)]">Reporting is not available yet.</strong>
          <p className="mt-1 max-w-[850px] text-[13px] leading-[1.55] text-[var(--slate)]">
            Tax Time is being prepared. When reporting opens, this room will show your completed FairWatchTrade transactions and the totals built from them. Until then, no balances or transaction counts are shown.
          </p>
        </div>
      </div>

      {/* ── The room surface ──────────────────────────────────────────── */}
      <div className={`mt-6 ${PANEL}`}>
        <div className="flex flex-col gap-3 border-b border-[var(--border-faint)] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5 text-[12px] uppercase tracking-[1.2px] text-[var(--gold-dim)]">
            <span className="h-[7px] w-[7px] rounded-full bg-[var(--gold)] shadow-[0_0_0_4px_var(--gold-whisper)]" aria-hidden="true" />
            Completed FairWatchTrade business
          </div>
          <div className="flex flex-col items-start gap-1.5 text-[12px] text-[var(--muted)] sm:flex-row sm:items-center sm:gap-2.5" aria-label="Reporting period context">
            <span>Reporting period</span>
            <span className="border border-[var(--border-subtle)] bg-[var(--control-wash)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--platinum-dim)]">
              {year} · Annual
            </span>
          </div>
        </div>

        {/* Year at a Glance */}
        <div className="px-5 py-6 md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
            <div className="min-w-0">
              <h2 className={SECTION_TITLE}>Year at a Glance</h2>
              <p className={SECTION_COPY}>Your completed FairWatchTrade business for the selected period will appear here.</p>
            </div>
            <div className={STATUS_PILL}>Reporting not available yet</div>
          </div>

          <div
            className="mt-5 grid grid-cols-1 border border-[var(--border-subtle)] bg-[var(--card-surface)] sm:grid-cols-2 lg:grid-cols-5"
            aria-label="Year at a Glance reporting concepts"
          >
            {TAX_TIME_METRICS.map((label, i) => (
              <div
                key={label}
                className={`flex min-h-[118px] flex-col justify-between px-4 pb-4 pt-4 ${
                  i > 0 ? "border-t border-[var(--border-faint)] sm:[&:nth-child(2)]:border-t-0 lg:border-t-0 lg:border-l" : ""
                }`}
              >
                <div className="text-[12px] font-medium leading-[1.35] text-[var(--platinum-dim)]">{label}</div>
                <div className="mt-5 font-display text-[20px] leading-[1.1] text-[var(--muted)]">{UNAVAILABLE}</div>
              </div>
            ))}
          </div>

          <div className="mt-3.5 flex items-center gap-2.5 text-[12px] text-[var(--muted)]">
            <LedgerMark />
            Every total in Tax Time will trace back to the completed transactions behind it.
          </div>
        </div>

        {/* Transaction Detail */}
        <div className="border-t border-[var(--border-faint)] px-5 py-6 md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
            <div className="min-w-0">
              <h2 className={SECTION_TITLE}>Transaction Detail</h2>
              <p className={SECTION_COPY}>The completed transactions behind your totals will appear here.</p>
            </div>
            <div className={STATUS_PILL}>Reporting not available yet</div>
          </div>

          <div className="mt-5 border border-[var(--border-subtle)] bg-[var(--card-surface)]">
            {/* The column contract, in the product's horizontal-scroller idiom
                at narrow widths — nine financial columns are never crushed. */}
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[1040px] grid-cols-[110px_1.1fr_1fr_.9fr_1.15fr_1fr_1fr_1fr_1fr] border-b border-[var(--border-faint)] bg-[var(--control-wash)]"
                aria-hidden="true"
              >
                {TAX_TIME_COLUMNS.map((c) => (
                  <div key={c} className="whitespace-nowrap px-3 py-2.5 text-[11px] uppercase tracking-[0.04em] text-[var(--muted)]">
                    {c}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid min-h-[150px] place-items-center px-6 py-7 text-center">
              <div className="max-w-[500px]">
                <div className="mx-auto mb-2.5 grid h-9 w-9 place-items-center rounded-full border border-[var(--border-mid)] font-display text-[18px] text-[var(--muted)]" aria-hidden="true">
                  —
                </div>
                <strong className="block text-[13px] font-medium text-[var(--platinum-dim)]">Transaction reporting is not available yet.</strong>
                <p className="mt-1.5 text-[12px] leading-[1.55] text-[var(--muted)]">
                  When reporting opens, you&rsquo;ll be able to review the completed sales and adjustments behind each total.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Reports & Exports */}
        <div className="border-t border-[var(--border-faint)] px-5 py-6 md:px-6">
          <div className="min-w-0">
            <h2 className={SECTION_TITLE}>Reports &amp; Exports</h2>
            <p className={SECTION_COPY}>Downloadable records will be prepared from the same completed FairWatchTrade transaction history shown here.</p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1.15fr_.85fr]">
            {/* Presentation rows only: no href, no button, no download, no
                fetch. A future output home is not a working control. */}
            <div className="border border-[var(--border-subtle)] bg-[var(--card-surface)]" aria-label="Future reporting outputs">
              {TAX_TIME_OUTPUTS.map((o, i) => (
                <div
                  key={o.name}
                  className={`grid grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3.5 ${
                    i > 0 ? "border-t border-[var(--border-faint)]" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <strong className="block text-[13px] font-medium text-[var(--platinum-dim)]">{o.name}</strong>
                    <span className="mt-0.5 block text-[12px] leading-[1.5] text-[var(--muted)]">{o.description}</span>
                  </div>
                  <div className="justify-self-start whitespace-nowrap border border-[var(--border-subtle)] bg-[var(--control-wash)] px-2.5 py-1.5 text-[11.5px] text-[var(--muted)] sm:justify-self-end">
                    Not available yet
                  </div>
                </div>
              ))}
            </div>

            <aside className="border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]">Recordkeeping first</div>
              <h3 className="mt-2 font-display text-[19px] font-light leading-[1.2] text-[var(--platinum)]">One record. Explainable totals.</h3>
              <p className="mt-2 text-[12px] leading-[1.55] text-[var(--slate)]">
                Your summaries, transaction details, and exports will come from the same completed FairWatchTrade record.
              </p>
              <ul className="mt-3.5 grid gap-2 text-[12px] text-[var(--slate)]">
                {[
                  "Totals trace back to completed transactions",
                  "Exports use the same underlying record",
                  "No number is shown until the record can support it",
                ].map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--gold)]" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>

        {/* Product boundary — a real boundary, not fine print. */}
        <footer className="flex flex-col gap-3 border-t border-[var(--border-faint)] bg-[var(--control-wash)] px-5 py-4 text-[12px] leading-[1.55] text-[var(--muted)] md:flex-row md:items-start md:justify-between md:gap-7 md:px-6">
          <div className="max-w-[620px]">
            <strong className="font-medium text-[var(--platinum-dim)]">Tax Time supports record preparation.</strong> It is not tax advice, a tax filing service, an accounting system, a profit-and-loss engine, or an official tax-form generator.
          </div>
          <div className="shrink-0 md:text-right">FairWatchTrade dealer recordkeeping</div>
        </footer>
      </div>
    </section>
  );
}
