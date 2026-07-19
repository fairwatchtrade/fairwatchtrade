import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   LISTING ACTION RAIL — components/ListingActionRail.tsx  (v2.11)

   The 276px right-hand column of the approved two-column composition:
   Dealer Information above Purchase Request, staggered 112px down from the
   gallery's top edge (the stagger itself is applied by page.tsx, since it
   belongs to the grid, not to this component).

   ── RELOCATED, NOT REBUILT ─────────────────────────────────────────────
   The isOwner / myLatestRequest / purchase-request logic below is the exact
   logic that previously lived inline in app/listings/[id]/page.tsx, moved
   here unchanged in behaviour. Every branch is preserved verbatim:
     · superseded → explain honestly, suppress the CTA (a resubmission would
       contradict the state of the listing)
     · pending    → suppress the CTA (a second request would just 409)
     · accepted   → suppress the CTA (already moved past this step)
     · declined   → show the note but STILL allow a new attempt; declined
       does not trip the exclusivity rule
     · owner      → the whole block is hidden entirely
   If any of that reads as new, it isn't — it's the shipped behaviour, lifted.

   ── ONE LOGIC, TWO PRESENTATIONS ───────────────────────────────────────
   Desktop shows this as rail cards; mobile keeps today's in-flow layout
   exactly, per the locked responsive ruling. Rather than duplicate the
   status logic in two places (which would drift the moment one branch
   changes), the logic lives here once and `variant` selects its dressing.
   page.tsx renders both and lets the breakpoint hide one — and `hidden` is
   display:none, so the inactive variant leaves the accessibility tree
   entirely. Exactly one is ever exposed to a screen reader.

   ── DEALER CARD ────────────────────────────────────────────────────────
   The "Sold by {seller} →" link is RELOCATED from the identity block into
   the rail on desktop, per ruling: relocate, don't redesign or duplicate.
   On mobile it stays in the identity block, where it is today. Its
   --muted → hover:--gold treatment is unchanged from the original.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

export default function ListingActionRail({
  variant,
  listingId,
  sellerId,
  sellerName,
  priceText,
  isOwner,
  requestStatus,
  listingStatus,
}: {
  variant: "rail" | "inline";
  listingId: string;
  sellerId: string;
  sellerName: string;
  priceText: string;
  isOwner: boolean;
  requestStatus?: string | null;
  /* v2.27 — the listing's own lifecycle status. 'reserved' means an offer was
     accepted: the watch is off the competitive market and no new requests are
     taken. Settlement is NOT represented — reserved never implies payment or
     completion. Only authorized viewers (seller / accepted buyer) ever reach a
     reserved listing detail page; RLS denies the row to everyone else. */
  listingStatus?: string | null;
}) {
  const isReserved = listingStatus === "reserved";

  /* The purchase state machine — identical branches to the shipped version,
     with a v2.27 reserved short-circuit above them: on a reserved listing the
     CTA is always suppressed and a truthful sale-pending state is shown. */
  const purchaseBlock = isOwner ? null : isReserved ? (
    <div className={variant === "inline" ? "mt-6 space-y-3" : "space-y-3"}>
      <div className="inline-block border border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)] px-4 py-3 text-[11px] tracking-[0.5px]">
        <div className="uppercase tracking-[2px] text-[var(--gold-dim)]">
          {requestStatus === "accepted" ? "Your request was accepted" : "Reserved"}
        </div>
        <div className="mt-1 text-[var(--muted)]">
          Sale pending — this watch is no longer available for new requests.
        </div>
      </div>
    </div>
  ) : (
    <div className={variant === "inline" ? "mt-6 space-y-3" : "space-y-3"}>
      {requestStatus === "declined" && (
        <div className="inline-block border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
          Your previous request was declined
        </div>
      )}

      {requestStatus === "superseded" ? (
        /* superseded — the watch sold to ANOTHER buyer via an accepted
           request; this buyer was not individually declined. Explain the
           state honestly and suppress the CTA. */
        <div className="inline-block border border-[var(--border-mid)] px-4 py-3 text-[11px] tracking-[0.5px] text-[var(--muted)]">
          <div className="uppercase tracking-[2px] text-[var(--slate)]">
            Another purchase request for this watch was accepted
          </div>
          <div className="mt-1 text-[var(--muted)]">This watch is no longer available.</div>
        </div>
      ) : requestStatus === "pending" ? (
        <div className="inline-block border border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--gold-dim)]">
          Your request is pending
        </div>
      ) : requestStatus === "accepted" ? (
        <div className="inline-block border border-[var(--success)] bg-[rgba(120,200,140,0.05)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--success)]">
          Your request was accepted
        </div>
      ) : (
        <Link
          href={`/listings/${listingId}/purchase-request`}
          className={[
            "bg-[var(--gold)] px-6 py-3 font-[Inter] text-[11px] uppercase tracking-[2px]",
            "text-[var(--ink)] transition hover:opacity-90",
            variant === "rail" ? "block text-center" : "inline-block",
          ].join(" ")}
        >
          Start Purchase Request
        </Link>
      )}
    </div>
  );

  /* ── MOBILE / TABLET — today's in-flow layout, unchanged. ── */
  if (variant === "inline") {
    return (
      <>
        <div className="mt-10 border-t border-[var(--border-faint)] pt-6">
          <p className="font-display text-[36px] font-light text-[var(--platinum)]">{priceText}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[2px] text-[var(--muted)]">
            Asking Price · 5% platform fee applies
          </p>
        </div>
        {purchaseBlock}
      </>
    );
  }

  /* ── DESKTOP RAIL — two stacked cards, 14px apart (gap owned by page.tsx). ── */
  return (
    <>
      {/* Dealer Information */}
      <section className="border border-[var(--border-gold)] bg-[linear-gradient(180deg,rgba(201,168,76,0.045),rgba(255,255,255,0.012))] px-[18px] pb-[18px] pt-[18px]">
        <div className="text-[8px] uppercase tracking-[2px] text-[var(--gold-dim)]">
          Dealer Information
        </div>
        <Link
          href={`/sellers/${sellerId}`}
          className="mt-3 block text-[13px] leading-snug text-[var(--muted)] transition hover:text-[var(--gold)]"
        >
          Sold by {sellerName} →
        </Link>
      </section>

      {/* Purchase Request */}
      <section className="border border-[var(--border-gold)] px-[18px] pb-[18px] pt-[18px]">
        <div className="text-[8px] uppercase tracking-[2px] text-[var(--gold-dim)]">
          Purchase Request
        </div>
        <p className="mt-3 font-display text-[28px] font-light leading-none text-[var(--platinum)]">
          {priceText}
        </p>
        <p className="mt-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
          Asking Price · 5% fee applies
        </p>
        {purchaseBlock && <div className="mt-4">{purchaseBlock}</div>}
      </section>
    </>
  );
}
