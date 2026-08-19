"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/formatMoney";
import { currencyMeta } from "@/lib/supportedCurrencies";
import { useListingPurchaseRequest } from "@/components/ListingPurchaseRequestProvider";
import {
  OPEN_PURCHASE_REQUEST,
  type OpenPurchaseRequestDetail,
} from "@/lib/purchaseRequestOpen";

/* ────────────────────────────────────────────────────────────────────────
   INLINE PURCHASE REQUEST — the listing page's own offer form.

   The collector never leaves the watch to make an offer on it. In the
   desktop right rail the card expands downward in place; below the rail's
   breakpoint the same component renders as one deliberate full-width
   section of the listing page. Gallery, thumbnails, identity, seller
   context, surrounding navigation and the Collector's Drawer all stay
   exactly where they were — nothing here is a modal, an overlay, or a
   layer above the page, so nothing can cover the Drawer or take focus
   away from it.

   This draws a form. It does not own one: state, validation, the POST and
   the entire error taxonomy live in usePurchaseRequest, shared with the
   dedicated /listings/[id]/purchase-request route. There
   is one submission contract and one set of error semantics.

   Draft text follows the collector: close the form, open the Drawer, study
   the caseback, come back — the amount and message are still there. It is
   session-scoped and listing-scoped, so it never leaks into another watch.
   ──────────────────────────────────────────────────────────────────────── */

const BAD = "#d8a171"; // approved soft-amber validation colour (not alarm red)
const BAD_BORDER = "rgba(216,161,113,0.65)";

export default function InlinePurchaseRequest({
  listingId,
  askingPrice,
  askingCurrency,
  variant,
}: {
  listingId: string;
  askingPrice: number;
  askingCurrency: string | null;
  variant: "rail" | "inline";
}) {
  const startRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /* Destructured, not held as an object: the controller hands back a ref,
     and reading fields off the returned object would look like a ref access
     during render. */
  const {
    offer, setOffer, message, setMessage, busy, view, open, setOpen,
    formError, changed, submittedOffer, offerRef, parsed,
    showOfferError, offerErrorText, submit, keepEditing, restoreDraft,
  } = useListingPurchaseRequest(listingId);
  const currency = currencyMeta(askingCurrency);
  const fmt = (n: number) => formatMoney(n, askingCurrency);

  const isRail = variant === "rail";

  function close() {
    setOpen(false);
    // The control that opened the form takes focus back, never the document.
    startRef.current?.focus();
  }

  /* The fixed bottom bar's offer action reaches the form through this.
     Both in-page surfaces are mounted at once with the breakpoint hiding
     one, so both hear the request — only the surface actually on screen
     scrolls and takes focus. getClientRects() is empty for a display:none
     element, which is exactly how the hidden one stays quiet. */
  useEffect(() => {
    function onAsk(e: Event) {
      const detail = (e as CustomEvent<OpenPurchaseRequestDetail>).detail;
      if (detail?.listingId !== listingId) return;
      if (!startRef.current || startRef.current.getClientRects().length === 0) return;
      restoreDraft();
      setOpen(true);
      startRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.addEventListener(OPEN_PURCHASE_REQUEST, onAsk);
    return () => window.removeEventListener(OPEN_PURCHASE_REQUEST, onAsk);
  }, [listingId, restoreDraft, setOpen]);

  const startButton = (
    <button
      ref={startRef}
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => {
        // Opening asks for the stored draft, so the surface the collector
        // opens carries what they typed into the other one.
        if (!open) restoreDraft();
        setOpen((v) => !v);
      }}
      className={[
        "bg-[var(--cta-fill)] px-6 py-3 font-[Inter] text-[11px] uppercase tracking-[2px]",
        "text-[var(--on-cta)] transition hover:opacity-90",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "focus-visible:outline-[var(--platinum)]",
        isRail ? "block w-full text-center" : "inline-block",
      ].join(" ")}
    >
      {open ? "Close Purchase Request" : "Start Purchase Request"}
    </button>
  );

  /* A resolved state replaces the form but never the page — the watch, the
     gallery and the Drawer are all still right there behind this card. */
  if (view !== "form") {
    return (
      <div className={isRail ? "space-y-3" : "mt-6 space-y-3"}>
        <div className="border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[2px] text-[var(--gold-dim)]">
            {view === "success"
              ? "Request sent"
              : view === "changed"
                ? "Listing updated"
                : view === "expired"
                  ? "Session ended"
                  : "Listing status changed"}
          </div>
          <p className="mt-2 text-[12px] leading-[1.55] text-[var(--platinum-dim)]">
            {view === "success" ? (
              <>
                Your purchase request for {submittedOffer !== null ? fmt(submittedOffer) : "—"} was
                sent to the seller. The seller may accept or decline it — this does not mean the watch is
                reserved or that any payment has occurred.
              </>
            ) : view === "changed" && changed ? (
              <>
                The asking price changed from {fmt(changed.old)} to {fmt(changed.current)} after
                this page was opened. Your offer and message are kept. Nothing was sent to the seller.
              </>
            ) : view === "expired" ? (
              <>
                Your session ended before the request was sent. Your offer and message are preserved.
                Nothing was sent to the seller.
              </>
            ) : (
              <>
                This watch is no longer available for a new purchase request. No request was sent.
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {view === "success" && (
              <Link href="/catalogue" className={linkAction}>
                View My Offers
              </Link>
            )}
            {view === "expired" && (
              <Link
                href={`/login?callbackUrl=/listings/${listingId}/purchase-request`}
                className={linkAction}
              >
                Sign in to continue
              </Link>
            )}
            {view === "changed" && (
              <button type="button" onClick={keepEditing} className={linkAction}>
                Keep editing my offer
              </button>
            )}
            {view === "unavailable" && (
              <Link href="/browse" className={linkAction}>
                Browse other watches
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* No recorded currency: an amount without one is a number, not a price.
     Said plainly rather than inviting an offer that could never be sent. */
  if (!currency) {
    return (
      <div className={isRail ? "space-y-3" : "mt-6 space-y-3"}>
        <div className="border border-[var(--border-mid)] px-4 py-3 text-[11px] leading-[1.55] text-[var(--muted)]">
          <div className="uppercase tracking-[2px] text-[var(--slate)]">Currency not recorded</div>
          <div className="mt-1">
            This listing can&apos;t take an offer until its currency is on the record.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isRail ? "space-y-3" : "mt-6 space-y-3"}>
      {startButton}

      {open && (
        <div
          id={panelId}
          className={[
            "border border-[var(--border-gold)] bg-[rgba(201,168,76,0.03)] px-4 py-4",
            isRail ? "" : "max-w-[560px]",
          ].join(" ")}
        >
          {/* offer amount */}
          <label
            htmlFor={`${panelId}-offer`}
            className="mb-2 block text-[11px] uppercase tracking-[0.8px] text-[var(--platinum-dim)]"
          >
            Your offer
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-display text-[18px] text-[var(--gold)]">
              {currency.displayPrefix.trim()}
            </span>
            {/* The field's background must follow the theme, because its TEXT
                does. --platinum is light-dark(#25231F, #E8E4DC): in Daylight the
                typed amount is near-black charcoal. This input carried a
                hardcoded #10131a, so a real offer rendered near-black on
                near-black — present, valid, and effectively invisible (caught
                on a live listing with 7100 entered).

                It was the only hardcoded hex in this file; its own sibling
                textarea below already uses the themed .fw-correspondence. Both
                fields in one panel now agree. Nothing about the offer value,
                currency, parsing, validation or submission is touched — only
                the surface the amount is read against. */}
            <input
              id={`${panelId}-offer`}
              ref={offerRef}
              data-purchase-offer-for={listingId}
              inputMode="decimal"
              autoComplete="off"
              placeholder={currency.exponent > 0 ? "0.00" : "0"}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              aria-describedby={`${panelId}-help`}
              aria-label={`Your offer in ${currency.displayName}`}
              aria-invalid={showOfferError ? true : undefined}
              className="h-[46px] w-full border bg-[var(--surface-2)] pr-3 font-display text-[19px] text-[var(--platinum)] outline-none transition placeholder:text-[var(--muted)] focus:bg-[var(--surface)]"
              style={{
                borderColor: showOfferError ? BAD_BORDER : "var(--border-mid)",
                paddingLeft: `calc(0.75rem + ${currency.displayPrefix.trim().length}ch + 0.4rem)`,
              }}
            />
          </div>
          <div
            id={`${panelId}-help`}
            className="mt-2 text-[11px] leading-[1.5]"
            style={{ color: showOfferError ? BAD : "var(--muted)" }}
          >
            {showOfferError
              ? offerErrorText
              : `Asking ${fmt(askingPrice)} · offers are made in ${currency.code}.`}
          </div>

          {/* optional message */}
          <label
            htmlFor={`${panelId}-message`}
            className="mb-2 mt-4 block text-[11px] uppercase tracking-[0.8px] text-[var(--platinum-dim)]"
          >
            Note with your offer{" "}
            {/* Readable at arm's length: the 8px ghost whisper this replaces
                was metadata-coloured and effectively unreadable in sunlight.
                Renamed from "Message" (founder ruling 2026-08-12): this field
                belongs to the OFFER — questions have their own door now, so
                this one stops moonlighting as the question box. */}
            <span className="text-[10px] normal-case tracking-normal text-[var(--muted)]">
              — optional
            </span>
          </label>
          <textarea
            id={`${panelId}-message`}
            value={message}
            maxLength={2000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Anything the seller should know about this offer."
            spellCheck={false}
            /* The message body is a CORRESPONDENCE instrument and wears the
               shared treatment. The offer amount beside it is a
               TRANSACTIONAL instrument and deliberately does not — they are
               different instruments and must not converge. */
            className="fw-correspondence h-[86px] resize-y"
          />

          {formError && (
            <div className="mt-3 text-[11px] leading-[1.45]" style={{ color: BAD }}>
              {formError}
            </div>
          )}

          <p className="mt-4 text-[11px] leading-[1.55] text-[var(--muted)]">
            No payment is collected at this step. Sending a purchase request does not complete the
            purchase — the seller may accept or decline it.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !parsed.ok}
              className="min-h-[40px] border border-[var(--gold)] bg-transparent px-4 text-[11px] font-bold uppercase tracking-[1.2px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--platinum)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send Purchase Request"}
            </button>
            <button
              type="button"
              onClick={close}
              className="min-h-[40px] px-2 text-[11px] uppercase tracking-[1.2px] text-[var(--muted)] transition hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--platinum)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const linkAction =
  "inline-flex min-h-[36px] items-center justify-center border border-[var(--gold)] bg-transparent px-3 text-[11px] font-bold uppercase tracking-[1.2px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] hover:text-[var(--platinum)]";
