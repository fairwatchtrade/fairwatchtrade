"use client";

import { useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   PURCHASE REQUEST FORM — client component (v2.4a)

   Not in the brief's explicit destination-path list — flagged in the
   delivery notes. Split out as a client component because the page above it
   must stay a Server Component (auth gate via redirect(), server-side
   listing fetch) — same server-page → client-component split already used
   throughout this codebase (app/account/page.tsx → AccountDashboard.tsx,
   SellFlow's own step components, etc.).

   POSTs the brief's exact request-body contract to /api/purchase-requests.
   buyer_id is never sent from here — the API route derives it from
   auth.getUser() server-side.
   ──────────────────────────────────────────────────────────────────────── */

type ListingContext = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  askingPrice: number;
  heroUrl: string | null;
};

const inputCls =
  "w-full border-b border-[var(--border-mid)] bg-transparent px-2 py-2 text-[14px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--gold)] focus:outline-none transition";
const labelCls = "mb-1 block text-[10px] uppercase tracking-[2px] text-[var(--muted)]";

export default function PurchaseRequestForm({
  listing,
  sellerName,
}: {
  listing: ListingContext;
  sellerName: string;
}) {
  const [proposedPrice, setProposedPrice] = useState(String(listing.askingPrice));
  const [shippingTerms, setShippingTerms] = useState("");
  const [includedItems, setIncludedItems] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const title = listing.model ? `${listing.brand} ${listing.model}` : listing.brand;
  const priceText = `$${Number(listing.askingPrice).toLocaleString()}`;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          proposedPurchasePrice: Number(proposedPrice),
          shippingTerms: shippingTerms.trim() || undefined,
          includedItems: includedItems.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "You already have a pending request on this listing.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong sending your request. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong sending your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    // v2.5: no longer a true dead end. The listing detail page already shows
    // a live pending/accepted/declined badge for the buyer's own most recent
    // request on that listing (fetched fresh server-side on every visit,
    // per the v2.4a "Start Purchase Request" section) — this screen now says
    // so explicitly, instead of leaving the buyer with nowhere to check back.
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--ink)] px-6 text-[var(--platinum)]">
        <div className="max-w-md text-center">
          <h1 className="font-display text-[24px] font-light">Request sent.</h1>
          <p className="mt-3 text-[14px] leading-[1.6] text-[var(--muted)]">
            {sellerName} will respond soon. Return to the listing anytime to see
            whether it&apos;s still pending, accepted, or declined.
          </p>
          <Link
            href={`/listings/${listing.id}`}
            className="mt-6 inline-block border border-[var(--border-gold)] px-5 py-2 text-[11px] uppercase tracking-[2px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)]"
          >
            Back to listing
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--ink)] px-6 py-10 text-[var(--platinum)] sm:px-8">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href={`/listings/${listing.id}`}
          className="text-[11px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]"
        >
          ← Back to listing
        </Link>

        <h1 className="mt-4 font-display text-[22px] font-light">Start a Purchase Request</h1>

        <div className="mt-4 flex items-center gap-3 border border-[var(--border-faint)] bg-[var(--surface)] px-4 py-3">
          {listing.heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.heroUrl}
              alt=""
              className="h-12 w-12 shrink-0 border border-[var(--border-subtle)] object-cover"
            />
          )}
          <div className="min-w-0">
            <div className="truncate text-[14px] font-light text-[var(--platinum)]">{title}</div>
            <div className="text-[11px] text-[var(--muted)]">
              Ref. {listing.reference} · {priceText}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label className={labelCls}>Proposed purchase price (USD)</label>
            <input
              className={inputCls}
              value={proposedPrice}
              onChange={(e) => setProposedPrice(e.target.value)}
              inputMode="numeric"
            />
          </div>

          <div>
            <label className={labelCls}>Shipping terms (optional)</label>
            <textarea
              className={`${inputCls} min-h-[64px]`}
              value={shippingTerms}
              onChange={(e) => setShippingTerms(e.target.value)}
              placeholder="Who ships, insured, signature required, etc."
              spellCheck={false}
            />
          </div>

          <div>
            <label className={labelCls}>Included items (optional)</label>
            <textarea
              className={`${inputCls} min-h-[64px]`}
              value={includedItems}
              onChange={(e) => setIncludedItems(e.target.value)}
              placeholder="Box, papers, extra links, etc."
              spellCheck={false}
            />
          </div>

          <div>
            <label className={labelCls}>Notes to seller (optional)</label>
            <textarea
              className={`${inputCls} min-h-[64px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>

        {error && <div className="mt-4 text-[13px] text-[var(--danger)]">{error}</div>}

        <button
          type="button"
          onClick={submit}
          disabled={busy || !proposedPrice.trim()}
          className="mt-6 bg-[var(--gold)] px-6 py-[13px] font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--ink)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send Purchase Request"}
        </button>
      </div>
    </main>
  );
}
