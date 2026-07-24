"use client";

import { useEffect, useState } from "react";
import type { MarketEvidenceRecord } from "@/app/api/vault/market-evidence/route";

/* ════════════════════════════════════════════════════════════════════════
   MARKET EVIDENCE — Vault reference-card section  (ME3, hash-pinned)

   Renders reviewed Market Evidence beneath a variant's reference list in the
   VaultGalaxy detail card. Subordinate to the watch identity — the watch is
   the star; this section quietly supports it.

   Data comes live from /api/vault/market-evidence (eligibility computed
   server-side on every request). Nothing here hardcodes the Phillips record;
   a reference with no eligible evidence renders NOTHING at all, so every
   other card in the Vault is byte-identical to before.

   Jason's final ME3 ruling, implemented:
     · Desktop: the evidence summary is visible by default; "View source
       evidence" is a second, collapsed disclosure.
     · Galaxy (mobile): the ENTIRE section is collapsed by default to one
       ≥44px row — "Market Evidence · 1 reviewed sale" + a restrained
       chevron. Tapping expands the summary in place; the source disclosure
       stays collapsed inside it; closing the parent hides the child too.

   One reviewed sale is evidence only. No range, no valuation, no comparison
   — and no language implying one.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

function formatPrice(value: number, currency: string): string {
  if (currency === "USD") return `$${value.toLocaleString("en-US")}`;
  return `${value.toLocaleString("en-US")} ${currency}`;
}

function formatSaleDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const BASIS_LABELS: Record<string, string> = {
  hammer_plus_premium: "Including buyer’s premium",
  hammer: "Hammer price",
  other: "As stated by the auction house",
};

/** Desktop opens by default; Galaxy stays collapsed (Jason's ME3 ruling). */
function defaultSectionOpen(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 640px)").matches
  );
}

export default function VaultMarketEvidence({ variantId }: { variantId: string }) {
  const [records, setRecords] = useState<MarketEvidenceRecord[] | null>(null);
  const [sectionOpen, setSectionOpen] = useState<boolean>(defaultSectionOpen);
  const [sourceOpen, setSourceOpen] = useState(false);

  // A new variant resets the section during render (no cascading effect):
  // fresh records, closed source panel, viewport-default parent state.
  const [mirroredVariant, setMirroredVariant] = useState(variantId);
  if (variantId !== mirroredVariant) {
    setMirroredVariant(variantId);
    setRecords(null);
    setSourceOpen(false);
    setSectionOpen(defaultSectionOpen());
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vault/market-evidence?variantId=${encodeURIComponent(variantId)}`)
      .then((r) => (r.ok ? r.json() : { evidence: [] }))
      .then((j) => {
        if (!cancelled) setRecords(Array.isArray(j.evidence) ? j.evidence : []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  // No eligible evidence → render nothing: other reference cards unchanged.
  if (!records || records.length === 0) return null;

  const toggleSection = () => {
    setSectionOpen((open) => {
      // Closing the parent also hides the nested source panel.
      if (open) setSourceOpen(false);
      return !open;
    });
  };

  return (
    <section
      aria-labelledby="market-evidence-title"
      className="mt-3 border-t border-[var(--border-faint)] pt-3"
    >
      {/* Parent disclosure row — the only visible element while collapsed.
          44px minimum touch target on Galaxy. */}
      <button
        type="button"
        onClick={toggleSection}
        aria-expanded={sectionOpen}
        aria-controls="market-evidence-panel"
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left sm:min-h-0"
      >
        <span
          id="market-evidence-title"
          className="text-[9px] uppercase tracking-[2px] text-[var(--platinum-dim)]"
        >
          Market Evidence
          <span className="ml-2 normal-case tracking-normal text-[var(--muted)]">
            · {records.length} reviewed sale{records.length === 1 ? "" : "s"}
          </span>
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 8 8"
          fill="none"
          aria-hidden="true"
          className={`flex-none text-[var(--gold-dim)] transition-transform ${
            sectionOpen ? "rotate-180" : ""
          }`}
        >
          <path
            d="M1 2.5L4 5.5L7 2.5"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div id="market-evidence-panel" hidden={!sectionOpen}>
        {records.map((ev) => (
          <div key={ev.referenceId} className="mt-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] leading-[1.5] text-[var(--muted)]">
                <strong className="font-medium text-[var(--platinum-dim)]">
                  {ev.house}
                </strong>
                {ev.location ? ` · ${ev.location}` : ""}
                {formatSaleDate(ev.saleDate) ? ` · ${formatSaleDate(ev.saleDate)}` : ""}
                {` · Lot ${ev.lotNumber}`}
              </div>
              <span className="flex-none border border-[rgba(112,192,144,0.28)] px-[6px] py-[3px] text-[8px] uppercase tracking-[1px] text-[var(--success)]">
                Reviewed exact match
              </span>
            </div>

            <div className="mt-2 font-display text-[20px] font-light text-[var(--platinum)]">
              Sold for {formatPrice(ev.priceRealized, ev.currency)}
            </div>
            <div className="mt-[2px] text-[10px] text-[var(--muted)]">
              {BASIS_LABELS[ev.priceBasis] ?? ev.priceBasis}
            </div>

            <p className="mt-2 text-[10px] leading-[1.5] text-[var(--muted)]">
              One reviewed sale result attached to this exact reference. Evidence
              only — no range or valuation is inferred.
            </p>

            {/* Nested source disclosure — collapsed by default everywhere. */}
            <button
              type="button"
              onClick={() => setSourceOpen((v) => !v)}
              aria-expanded={sourceOpen}
              aria-controls={`market-evidence-source-${ev.referenceId}`}
              className="mt-2 min-h-[44px] p-0 text-left text-[11px] text-[var(--gold-dim)] underline decoration-[rgba(201,168,76,0.44)] underline-offset-4 transition-colors hover:text-[var(--gold)] sm:min-h-0"
            >
              {sourceOpen ? "Hide source evidence" : "View source evidence"}
            </button>

            <div
              id={`market-evidence-source-${ev.referenceId}`}
              hidden={!sourceOpen}
              className="mt-2 border-l border-[var(--gold-dim)] pl-3"
            >
              <p className="mb-[6px] text-[10px] leading-[1.5] text-[var(--muted)]">
                <b className="font-medium text-[var(--platinum-dim)]">Sale:</b>{" "}
                {ev.saleTitle}
              </p>
              {ev.saleCode && (
                <p className="mb-[6px] text-[10px] leading-[1.5] text-[var(--muted)]">
                  <b className="font-medium text-[var(--platinum-dim)]">Sale code:</b>{" "}
                  {ev.saleCode}
                </p>
              )}
              <p className="mb-[6px] text-[10px] leading-[1.5] text-[var(--muted)]">
                <b className="font-medium text-[var(--platinum-dim)]">Lot:</b>{" "}
                {ev.lotNumber}
              </p>
              <p className="mb-[6px] text-[10px] leading-[1.5] text-[var(--muted)]">
                <b className="font-medium text-[var(--platinum-dim)]">
                  Identity source:
                </b>{" "}
                {ev.lotPageUrl ? (
                  <a
                    href={ev.lotPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--gold-dim)] underline underline-offset-2 transition-colors hover:text-[var(--gold)]"
                  >
                    {ev.identitySourceLabel}
                  </a>
                ) : (
                  ev.identitySourceLabel
                )}
              </p>
              <p className="text-[10px] leading-[1.5] text-[var(--muted)]">
                <b className="font-medium text-[var(--platinum-dim)]">
                  Result source:
                </b>{" "}
                {ev.resultSourceLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
