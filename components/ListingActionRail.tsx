import Link from "next/link";
import AskSellerLink from "@/components/AskSellerLink";
import InlinePurchaseRequest from "@/components/InlinePurchaseRequest";
import OpenPurchaseRequestButton from "@/components/OpenPurchaseRequestButton";

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

import CurationReviewCard from "@/components/CurationReviewCard";
import type { CurationSummary } from "@/lib/curationReview";

export default function ListingActionRail({
  variant,
  listingId,
  sellerId,
  sellerHref,
  sellerName,
  priceText,
  isOwner,
  requestStatus,
  listingStatus,
  askingPrice,
  askingCurrency,
  canRequestInline = false,
  curation,
}: {
  /* "bar" is the compact dressing used inside the mobile Listing Detail fixed
     action bar. It renders ONLY the offer action — no price, no dealer card. */
  variant: "rail" | "inline" | "bar";
  listingId: string;
  sellerId: string;
  /** Canonical dealer path, resolved by the page. A dealer's room lives at
      its slug; linking by raw UUID still arrives, but only after a redirect
      hop, and it puts a non-canonical dealer URL on the page beside the
      canonical one. Optional so a caller without the resolution falls back
      to the id it does have. */
  sellerHref?: string;
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
  /* Offer context for the in-page form. The dedicated route still derives its
     own copy server-side; these are the same facts, not a second source. */
  askingPrice?: number;
  askingCurrency?: string | null;
  /* Only a signed-in non-owner composes the request in place. A signed-out
     visitor keeps the link, so the route's server-side auth gate can send
     them to sign in and bring them back — identity is never decided here. */
  canRequestInline?: boolean;
  /* Curation Review V1 — resolved by the page (requester-only pending is a
     per-viewer fact, so it cannot be computed in this component). Absent
     means the card does not render at all. */
  curation?: {
    signedIn: boolean;
    state: "none" | "pending" | "completed";
    summary: CurationSummary | null;
  } | null;
}) {
  const isReserved = listingStatus === "reserved";

  /* ── ONE STATE DECISION, THREE DRESSINGS ─────────────────────────────────
     The `bar` variant made this extraction necessary. The branch conditions
     used to be written inline in the JSX below; a third presentation would
     have had to restate them, which is exactly the drift this component's
     header warns against. The decision is now taken once and each variant
     only chooses how to show it. Order and meaning are unchanged from the
     shipped version — this is a lift, not a behaviour change:
       owner      → nothing at all
       reserved   → sale pending, CTA suppressed (the v2.27 short-circuit)
       superseded → sold to another buyer, CTA suppressed
       pending    → CTA suppressed (a second request would just 409)
       accepted   → CTA suppressed (already past this step)
       declined   → note shown, CTA STILL OFFERED (declined does not trip
                    the exclusivity rule)
       otherwise  → CTA offered
     ────────────────────────────────────────────────────────────────────── */
  const ctaState: "owner" | "reserved" | "superseded" | "pending" | "accepted" | "open" =
    isOwner
      ? "owner"
      : isReserved
        ? "reserved"
        : requestStatus === "superseded"
          ? "superseded"
          : requestStatus === "pending"
            ? "pending"
            : requestStatus === "accepted"
              ? "accepted"
              : "open";

  /* ── FIXED BOTTOM BAR — compact dressing of the same decision.
     The mobile Listing Detail action bar previously carried two messaging
     affordances and no offer action, so the offer path existed only in the
     in-flow block and scrolled out of reach. This renders the offer action
     into that bar. It deliberately reuses the state machine above rather
     than linking unconditionally: a bare link would have offered a second
     request while one was already pending, contradicting the rail. ── */
  if (variant === "bar") {
    if (ctaState === "owner") return null;
    if (ctaState === "open") {
      const barCta =
        "shrink-0 bg-[var(--cta-fill)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--on-cta)] transition hover:opacity-90";

      /* The responsive composition now keeps one in-page Purchase Request
         surface mounted at every width: rail while the columns coexist,
         inline immediately below the gallery after they stack. The bar can
         therefore open that one live form at every signed-in width. Guests
         retain the dedicated route so its server-side auth gate can return
         them to the listing after sign-in. */
      if (canRequestInline) {
        return <OpenPurchaseRequestButton listingId={listingId} className={barCta} />;
      }

      return (
        <Link href={`/listings/${listingId}/purchase-request`} className={barCta}>
          Make Offer
        </Link>
      );
    }
    /* Suppressed states still speak — a bar that simply emptied would read as
       a broken control rather than an honest state. Wording is compressed to
       the bar's width; the full sentence remains in the in-flow block. */
    return (
      <span className="shrink-0 border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
        {ctaState === "reserved"
          ? "Reserved"
          : ctaState === "superseded"
            ? "Unavailable"
            : ctaState === "pending"
              ? "Request pending"
              : "Request accepted"}
      </span>
    );
  }

  /* Private Listing V1 — the authorized buyer sees a normal, trustworthy
     listing with one quiet truth added: this watch is offered to them alone.
     Only the authorized buyer and the seller can fetch a private row at all
     (RLS), so this renders for exactly one person. */
  const privateMarker =
    listingStatus === "private_active" && !isOwner ? (
      <div className="inline-block border border-[var(--lc-private_active-line)] px-4 py-3 text-[11px] tracking-[0.5px]">
        <div
          className="uppercase tracking-[2px]"
          style={{ color: "var(--lc-private_active-badge)" }}
        >
          Private listing
        </div>
        <div className="mt-1 text-[var(--muted)]">
          Offered to you alone — this watch is not on the public market.
        </div>
      </div>
    ) : null;

  const purchaseBlock = ctaState === "owner" ? null : ctaState === "reserved" ? (
    <div className={variant === "inline" ? "mt-6 space-y-3" : "space-y-3"}>
      <div className="inline-block border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3 text-[11px] tracking-[0.5px]">
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
      {privateMarker}
      {requestStatus === "declined" && (
        <div className="inline-block border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
          Your previous request was declined
        </div>
      )}

      {ctaState === "superseded" ? (
        /* superseded — the watch sold to ANOTHER buyer via an accepted
           request; this buyer was not individually declined. Explain the
           state honestly and suppress the CTA. */
        <div className="inline-block border border-[var(--border-mid)] px-4 py-3 text-[11px] tracking-[0.5px] text-[var(--muted)]">
          <div className="uppercase tracking-[2px] text-[var(--slate)]">
            Another purchase request for this watch was accepted
          </div>
          <div className="mt-1 text-[var(--muted)]">This watch is no longer available.</div>
        </div>
      ) : ctaState === "pending" ? (
        <div className="inline-block border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--gold-dim)]">
          Your request is pending
        </div>
      ) : ctaState === "accepted" ? (
        <div className="inline-block border border-[var(--success)] bg-[rgba(120,200,140,0.05)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--success)]">
          Your request was accepted
        </div>
      ) : canRequestInline && typeof askingPrice === "number" ? (
        /* The collector composes the request without leaving the watch. Same
           controller, same validation, same POST and same error semantics as
           the dedicated route — only the place it is drawn differs. */
        <InlinePurchaseRequest
          listingId={listingId}
          askingPrice={askingPrice}
          askingCurrency={askingCurrency ?? null}
          variant={variant}
        />
      ) : (
        <Link
          href={`/listings/${listingId}/purchase-request`}
          className={[
            "bg-[var(--cta-fill)] px-6 py-3 font-[Inter] text-[11px] uppercase tracking-[2px]",
            "text-[var(--on-cta)] transition hover:opacity-90",
            variant === "rail" ? "block text-center" : "inline-block",
          ].join(" ")}
        >
          Start Purchase Request
        </Link>
      )}
    </div>
  );

  /* ── STACKED LAYOUT — the same request in the narrow content flow. ── */
  if (variant === "inline") {
    return (
      <>
        <div className="mt-10 border-t border-[var(--border-faint)] pt-6">
          <p className="font-display text-[36px] font-light text-[var(--platinum)]">{priceText}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
            Asking Price
          </p>
          {/* The stacked composition has no rail composer, so the question
              door is a quiet link here — it opens the existing conversation home.
              Authed non-owners only: the listener lives in
              ListingCorrespondence, which owners and guests don't mount. */}
          {!isOwner && canRequestInline && (
            <div className="mt-3">
              <AskSellerLink />
            </div>
          )}
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
        <div className="text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]">
          Dealer Information
        </div>
        <Link
          href={sellerHref ?? `/sellers/${sellerId}`}
          className="mt-3 block text-[13px] leading-snug text-[var(--muted)] transition hover:text-[var(--gold)]"
        >
          Sold by {sellerName} →
        </Link>
      </section>

      {/* Curation utility sits between dealer identity and the transaction:
          Dealer Information → Curation → Purchase Request. Informational and
          deliberately quieter than the purchase card; never merged into it. */}
      {curation && (
        <CurationReviewCard
          listingId={listingId}
          signedIn={curation.signedIn}
          initialState={curation.state}
          summary={curation.summary}
        />
      )}

      {/* Purchase Request — or, for the listing's own seller, plain price
          truth. The owner card previously kept the "Purchase Request" header
          with nothing beneath it (owner ⇒ purchaseBlock null): a purchase
          card offering no purchase, standing there alone. Founder finding,
          2026-08-12. Same card, honest header. */}
      <section className="border border-[var(--border-gold)] px-[18px] pb-[18px] pt-[18px]">
        <div className="text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]">
          {isOwner ? "Your Listing" : "Purchase Request"}
        </div>
        <p className="mt-3 font-display text-[28px] font-light leading-none text-[var(--platinum)]">
          {priceText}
        </p>
        <p className="mt-1.5 text-[11px] uppercase tracking-[1.5px] text-[var(--muted)]">
          Asking Price
        </p>
        {purchaseBlock && <div className="mt-4">{purchaseBlock}</div>}
      </section>
    </>
  );
}
