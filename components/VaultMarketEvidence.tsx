"use client";

import { useEffect, useState } from "react";
import type { MarketEvidenceRecord } from "@/app/api/vault/market-evidence/route";
import { formatMoney, hasMoneyTruth } from "@/lib/formatMoney";

/* ════════════════════════════════════════════════════════════════════════
   MARKET EVIDENCE — Vault reference-card section  (ME3 · v5 rights gate)

   Renders reviewed Market Evidence beneath a variant's reference list in the
   VaultGalaxy detail card. Subordinate to the watch identity — the watch is
   the star; this section quietly supports it.

   Mounted once per Vault reference. Data comes live from
   /api/vault/market-evidence?referenceId=<exact vault_references.id>, which
   calls the narrow read-only RPC market_evidence_for_reference. Eligibility AND
   source-rights are enforced in the database, scoped to THIS exact reference —
   a sibling reference of the same variant never inherits its evidence. This
   component hardcodes nothing and renders NOTHING when there is no
   rights-cleared evidence, so every other card in the Vault is byte-identical
   to before. While the Phillips artifacts remain 'internal_only', this section
   does not appear.

   v5 changes, all truth-preserving:
     · at most ONE result (the RPC selects deterministically) — no array;
     · a sold result with no disclosed price renders "Price undisclosed" rather
       than being hidden or given an invented number;
     · the identity-source label links out ONLY when a genuine public lot-detail
       URL is available; a sale-page URL is never dressed up as a lot link;
     · the sale is linked, labelled as the sale, only when a public sale-page
       URL is rights-eligible.

   Jason's ME3 layout ruling is preserved: desktop shows the summary by default
   with a collapsed source disclosure; Galaxy (mobile) collapses the whole
   section to one ≥44px row that expands in place.

   One reviewed sale is evidence only. No range, no valuation, no comparison.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/* Money Truth Stage B (order §8) — Auction Evidence adopts the marketplace
   display convention, PRESENTATION ONLY: US$22,860 rather than a bare $.
   Stored evidence values, constraints, and the correction chain are untouched.
   A currency outside the curated launch set keeps the old code-suffix form —
   a disclosed price is never hidden behind the undisclosed state just because
   its currency isn't marketplace-supported. */
function formatPrice(value: number, currency: string): string {
  if (hasMoneyTruth(value, currency)) return formatMoney(value, currency);
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

export default function VaultMarketEvidence({ referenceId }: { referenceId: string }) {
  const [record, setRecord] = useState<MarketEvidenceRecord | null>(null);
  const [sectionOpen, setSectionOpen] = useState<boolean>(defaultSectionOpen);
  const [sourceOpen, setSourceOpen] = useState(false);

  // Mounted once per reference, so element ids must be reference-scoped —
  // otherwise sibling references collide on duplicate DOM ids behind
  // aria-controls (the double-mount defect learned in Saved Searches).
  const titleId = `market-evidence-title-${referenceId}`;
  const panelId = `market-evidence-panel-${referenceId}`;
  const sourceId = `market-evidence-source-${referenceId}`;

  // A new reference resets the section during render (no cascading effect):
  // fresh record, closed source panel, viewport-default parent state.
  const [mirroredReference, setMirroredReference] = useState(referenceId);
  if (referenceId !== mirroredReference) {
    setMirroredReference(referenceId);
    setRecord(null);
    setSourceOpen(false);
    setSectionOpen(defaultSectionOpen());
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vault/market-evidence?referenceId=${encodeURIComponent(referenceId)}`)
      .then((r) => (r.ok ? r.json() : { evidence: null }))
      .then((j) => {
        if (!cancelled) setRecord(j && j.evidence ? (j.evidence as MarketEvidenceRecord) : null);
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [referenceId]);

  // No eligible, rights-cleared evidence → render nothing.
  if (!record) return null;
  const ev = record;

  const toggleSection = () => {
    setSectionOpen((open) => {
      // Closing the parent also hides the nested source panel.
      if (open) setSourceOpen(false);
      return !open;
    });
  };

  return (
    <section
      aria-labelledby={titleId}
      className="mt-3 border-t border-[var(--border-faint)] pt-3"
    >
      {/* Parent disclosure row — the only visible element while collapsed.
          44px minimum touch target on Galaxy. */}
      <button
        type="button"
        onClick={toggleSection}
        aria-expanded={sectionOpen}
        aria-controls={panelId}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left sm:min-h-0"
      >
        <span
          id={titleId}
          className="text-[11px] uppercase tracking-[2px] text-[var(--platinum-dim)]"
        >
          Market Evidence
          <span className="ml-2 normal-case tracking-normal text-[var(--muted)]">
            · 1 reviewed sale
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

      <div id={panelId} hidden={!sectionOpen}>
        <div className="mt-2">
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

          {/* Price line — a sold-with-price-undisclosed result stays visible and
              states the truth rather than inventing a number. */}
          <div className="mt-2 font-display text-[20px] font-light text-[var(--platinum)]">
            {ev.priceRealized == null || ev.currency == null
              ? "Price undisclosed"
              : `Sold for ${formatPrice(ev.priceRealized, ev.currency)}`}
          </div>
          {ev.priceBasis && (
            <div className="mt-[2px] text-[10px] text-[var(--muted)]">
              {BASIS_LABELS[ev.priceBasis] ?? ev.priceBasis}
            </div>
          )}

          <p className="mt-2 text-[10px] leading-[1.5] text-[var(--muted)]">
            One reviewed sale result attached to this exact reference. Evidence
            only — no range or valuation is inferred.
          </p>

          {/* Nested source disclosure — collapsed by default everywhere. */}
          <button
            type="button"
            onClick={() => setSourceOpen((val) => !val)}
            aria-expanded={sourceOpen}
            aria-controls={sourceId}
            className="mt-2 min-h-[44px] p-0 text-left text-[11px] text-[var(--gold-dim)] underline decoration-[rgba(201,168,76,0.44)] underline-offset-4 transition-colors hover:text-[var(--gold)] sm:min-h-0"
          >
            {sourceOpen ? "Hide source evidence" : "View source evidence"}
          </button>

          <div
            id={sourceId}
            hidden={!sourceOpen}
            className="mt-2 border-l border-[var(--gold-dim)] pl-3"
          >
            <p className="mb-[6px] text-[10px] leading-[1.5] text-[var(--muted)]">
              <b className="font-medium text-[var(--platinum-dim)]">Sale:</b>{" "}
              {/* Linked only when a public sale-page URL is rights-eligible;
                  the label names the sale, never the lot. */}
              {ev.salePageUrl ? (
                <a
                  href={ev.salePageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--gold-dim)] underline underline-offset-2 transition-colors hover:text-[var(--gold)]"
                >
                  {ev.saleTitle}
                </a>
              ) : (
                ev.saleTitle
              )}
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
              {/* Linked ONLY to a genuine public lot-detail URL. A sale-page URL
                  never becomes a lot link — the label would then be untrue. */}
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
      </div>
    </section>
  );
}
