"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { parsePrice } from "@/lib/parsePrice";

/* ────────────────────────────────────────────────────────────────────────
   BUYER PURCHASE REQUEST — approved Design Gate implementation (v2.28)

   Offer ceremony, NOT checkout. The buyer authors only a proposed price and an
   optional message; the seller's listing supplies every commercial and
   fulfillment fact (shown read-only); the server creates the authoritative
   snapshot at submission (see app/api/purchase-requests/route.ts).

   Visual contract: the approved "FOCUSED REVISION" Design Gate artifact —
   two-region desktop layout (context panel · offer panel), mobile order
   identity → offer → collapsed listing details, OUTLINED gold Send action
   (soft-gold on hover), and the exact non-checkout truth beside the button.
   Scaffolding from the artifact (gate header, viewport/state/button switchers,
   floating badge, assumptions note) is demonstration-only and not shipped.

   States: default form · inline validation · session-expired (preserves the
   typed offer + message, no false success after 401) · listing-unavailable ·
   listing-changed (asking price moved mid-session) · success (View My Offers).
   ──────────────────────────────────────────────────────────────────────── */

type ListingContext = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  askingPrice: number;
  heroUrl: string | null;
  sellerName: string;
  condition: string | null;
  included: string | null;
  strap: string;
};

type View = "form" | "success" | "expired" | "unavailable" | "changed";

const BAD = "#d8a171"; // approved soft-amber validation colour (not alarm red)
const BAD_BORDER = "rgba(216,161,113,0.65)";

function money(n: number): string {
  return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export default function PurchaseRequestForm({ listing }: { listing: ListingContext }) {
  const [offer, setOffer] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("form");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [changed, setChanged] = useState<{ old: number; current: number } | null>(null);
  const [submittedOffer, setSubmittedOffer] = useState<number | null>(null);
  const offerRef = useRef<HTMLInputElement>(null);

  const draftKey = `fwt.pr.draft.${listing.id}`;
  const backToListing = `/listings/${listing.id}`;
  const signInHref = `/login?callbackUrl=/listings/${listing.id}/purchase-request`;
  const title = listing.model ? `${listing.brand} ${listing.model}` : listing.brand;
  const askingText = money(listing.askingPrice);
  const parsed = parsePrice(offer);
  // Field-associated validation: a non-empty amount that isn't a valid positive
  // number surfaces the approved validation state immediately (the Send button
  // also stays disabled). An empty field stays in the neutral helper state.
  const invalidOffer = offer.trim() !== "" && parsed === null;
  const showOfferError = fieldError !== null || invalidOffer;
  const offerErrorText = fieldError ?? "Enter an offer greater than $0 using numbers only.";

  // Restore a draft preserved across a sign-in round-trip (session-expired
  // flow). This is a one-time hydration from an external store (sessionStorage),
  // which is only readable on the client — the exact "synchronise from an
  // external system" case the set-state-in-effect rule is meant to allow.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as { offer?: string; message?: string };
        if (d.offer) setOffer(d.offer);
        if (d.message) setMessage(d.message);
        sessionStorage.removeItem(draftKey);
      }
    } catch {
      /* no draft to restore */
    }
  }, [draftKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Neutral difference-from-asking, shown without any persuasion language.
  let comparison: string | null = null;
  if (parsed !== null && parsed !== listing.askingPrice && listing.askingPrice > 0) {
    const diff = parsed - listing.askingPrice;
    const pct = Math.abs(diff / listing.askingPrice) * 100;
    const dir = diff < 0 ? "below" : "above";
    comparison = `${money(Math.abs(diff))} ${dir} asking · ${pct.toFixed(1)}% ${dir} asking`;
  }

  function persistDraft() {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ offer, message }));
    } catch {
      /* preservation is best-effort */
    }
  }

  async function submit() {
    setFieldError(null);
    setFormError(null);
    const p = parsePrice(offer);
    if (p === null) {
      setFieldError("Enter an offer greater than $0 using numbers only.");
      offerRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          proposedPurchasePrice: p,
          notes: message.trim() || undefined,
          // Non-authoritative: lets the server detect a mid-session asking change.
          displayedAskingPrice: listing.askingPrice,
        }),
      });

      // No false success after 401 — preserve the draft and show the expired state.
      if (res.status === 401) {
        persistDraft();
        setView("expired");
        return;
      }

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setSubmittedOffer(typeof data?.proposedPurchasePrice === "number" ? data.proposedPurchasePrice : p);
        setView("success");
        return;
      }

      const err = data?.error as string | undefined;
      if (res.status === 409 && err === "listing_changed") {
        setChanged({ old: Number(data.old), current: Number(data.current) });
        setView("changed");
        return;
      }
      // Unavailable at submit: either the listing is explicitly non-published
      // (409) or it is no longer readable by this buyer at all (404) — once
      // reserved, RLS hides the row from a non-owner, non-accepted buyer, so a
      // listing that was open at load and is gone at submit reads as a 404.
      // Both mean the same truthful outcome for the buyer.
      if (res.status === 404 || (res.status === 409 && err === "listing_unavailable")) {
        setView("unavailable");
        return;
      }
      if (res.status === 409 && err === "duplicate_request") {
        setFormError(data?.detail ?? "You already have a pending request on this listing.");
        return;
      }
      if (res.status === 403) {
        setFormError(data?.detail ?? "You can't request your own listing.");
        return;
      }
      if (res.status === 400 && err === "invalid_amount") {
        setFieldError(data?.detail ?? "Enter an offer greater than $0 using numbers only.");
        offerRef.current?.focus();
        return;
      }
      setFormError("Something went wrong sending your request. Please try again.");
    } catch {
      setFormError("Something went wrong sending your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /* ── read-only seller facts (derived server-side from the live listing) ── */
  const truthRows: Array<{ label: string; value: string }> = [];
  if (listing.condition) truthRows.push({ label: "Condition", value: listing.condition });
  if (listing.included) truthRows.push({ label: "Included", value: listing.included });
  truthRows.push({ label: "Band", value: listing.strap });
  truthRows.push({ label: "Fulfillment", value: "Shipping details will be confirmed with the seller." });

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      {/* sub-bar: return to listing */}
      <div className="border-b border-[var(--border-faint)] bg-[var(--ink)]">
        <div className="mx-auto flex max-w-[1260px] items-center justify-between px-6 py-3 sm:px-8">
          <Link
            href={backToListing}
            className="text-[11px] tracking-[0.3px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]"
          >
            ← Return to listing
          </Link>
          <span className="text-[9px] uppercase tracking-[2px] text-[var(--ghost)]">
            Purchase Request
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1260px] px-6 pb-20 pt-9 sm:px-8">
        {/* page head + ceremony */}
        <header className="grid grid-cols-1 items-end gap-4 border-b border-[var(--border-faint)] pb-6 md:grid-cols-[1fr_auto]">
          <div>
            <div className="text-[8px] uppercase tracking-[3px] text-[var(--gold)]">Purchase Request</div>
            <h1 className="mt-2 font-display text-[34px] font-light leading-[1.06] text-[var(--platinum)] sm:text-[37px]">
              Make an offer on this watch
            </h1>
            <p className="mt-2 max-w-[680px] text-[12px] leading-[1.6] text-[var(--muted)]">
              Review the listing details, enter your offer, and add an optional message to the seller.
            </p>
          </div>
          <div className="font-display text-[13px] italic leading-[1.45] text-[var(--platinum-dim)] md:max-w-[290px] md:text-right">
            No payment is collected at this step.
          </div>
        </header>

        {/* request room: mobile order identity → offer → details; desktop two-region */}
        <div className="mt-7 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(340px,42%)_minmax(0,58%)] lg:items-start lg:gap-6">
          {/* A · WATCH IDENTITY */}
          <section className="order-1 border border-[var(--border-faint)] bg-[var(--surface)] lg:order-none lg:col-start-1 lg:row-start-1">
            <div className="grid grid-cols-[112px_1fr] sm:grid-cols-[minmax(150px,42%)_1fr]">
              <div className="relative grid min-h-[168px] place-items-center overflow-hidden bg-[#eeeae2]">
                {listing.heroUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={listing.heroUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[9px] uppercase tracking-[1.5px] text-[#8a8577]">No photo</span>
                )}
              </div>
              <div className="flex flex-col justify-center p-5">
                <div className="text-[9px] uppercase tracking-[1.7px] text-[var(--gold)]">{listing.brand}</div>
                <div className="mt-1.5 font-display text-[22px] font-light leading-[1.08] text-[var(--platinum)]">
                  {listing.model ?? listing.brand}
                </div>
                <div className="mt-1.5 text-[10px] text-[var(--muted)]">Ref. {listing.reference}</div>
                <div className="mt-4 border-t border-[var(--border-faint)] pt-3 text-[11px] text-[var(--platinum-dim)]">
                  {listing.sellerName}
                </div>
                <div className="mt-2 font-display text-[22px] font-light text-[var(--platinum)]">
                  {askingText}
                  <span className="mt-1 block text-[7px] font-medium uppercase tracking-[1.3px] text-[var(--ghost)]">
                    Seller&apos;s asking price
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* B · LISTING DETAILS (read-only seller truth; collapsible) */}
          <section className="order-3 lg:order-none lg:col-start-1 lg:row-start-2">
            <details open className="border border-[var(--border-faint)] bg-[var(--surface)] lg:border-t-0">
              <summary className="flex cursor-pointer items-end justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <h2 className="font-display text-[19px] font-light text-[var(--platinum)]">Listing details</h2>
                <span className="text-[7px] uppercase tracking-[1.5px] text-[var(--ghost)]">From the seller&apos;s listing</span>
              </summary>
              <div className="px-5 pb-5">
                <div className="grid">
                  {truthRows.map((row, i) => (
                    <div
                      key={row.label}
                      className={`grid grid-cols-[110px_1fr] gap-4 py-[11px] text-[11px] leading-[1.45] ${
                        i === 0 ? "" : "border-t border-[var(--border-faint)]"
                      }`}
                    >
                      <b className="font-medium text-[var(--muted)]">{row.label}</b>
                      <span className="text-[var(--platinum-dim)]">{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-[var(--border-gold)] pt-3 text-[10px] leading-[1.55] text-[var(--muted)]">
                  Review these details from the seller before sending your request.
                </div>
              </div>
            </details>
          </section>

          {/* C · OFFER PANEL (form or active state) */}
          <section className="order-2 min-h-[560px] border border-[var(--border-subtle)] bg-[var(--surface-2)] px-6 py-7 sm:px-8 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2">
            {view === "form" && (
              <>
                <div className="flex items-start justify-between gap-5 border-b border-[var(--border-faint)] pb-5">
                  <div>
                    <div className="text-[8px] uppercase tracking-[3px] text-[var(--gold)]">Your offer</div>
                    <h2 className="mt-1.5 font-display text-[26px] font-light text-[var(--platinum)]">Offer to the seller</h2>
                    <p className="mt-2 max-w-[520px] text-[11px] leading-[1.55] text-[var(--muted)]">
                      Enter the amount you would like to offer. You may also add a brief message.
                    </p>
                  </div>
                  <div className="whitespace-nowrap text-right text-[8px] uppercase tracking-[1px] text-[var(--muted)]">
                    Seller&apos;s asking price
                    <strong className="mt-1 block font-display text-[20px] font-normal normal-case tracking-normal text-[var(--platinum)]">
                      {askingText}
                    </strong>
                  </div>
                </div>

                <div className="pt-6">
                  {/* offer amount */}
                  <div className="mb-5">
                    <label htmlFor="offer" className="mb-2 block text-[10px] uppercase tracking-[0.8px] text-[var(--platinum-dim)]">
                      Your offer
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-display text-[22px] text-[var(--gold)]">$</span>
                      <input
                        id="offer"
                        ref={offerRef}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={offer}
                        onChange={(e) => setOffer(e.target.value)}
                        aria-describedby="offerHelp offerError"
                        aria-invalid={showOfferError ? true : undefined}
                        className="h-[54px] w-full border bg-[#10131a] pl-9 pr-4 font-display text-[23px] text-[var(--platinum)] outline-none transition placeholder:text-[var(--ghost)] focus:bg-[#11151c]"
                        style={{ borderColor: showOfferError ? BAD_BORDER : "var(--border-mid)" }}
                      />
                    </div>
                    {showOfferError ? (
                      <div id="offerError" className="mt-2 text-[10px] leading-[1.45]" style={{ color: BAD }}>
                        {offerErrorText}
                      </div>
                    ) : (
                      <div id="offerHelp" className="mt-2 text-[9px] leading-[1.5] text-[var(--ghost)]">
                        {comparison ?? "Enter a purchase price in U.S. dollars."}
                      </div>
                    )}
                  </div>

                  {/* optional message */}
                  <div className="mb-5">
                    <label htmlFor="message" className="mb-2 block text-[10px] uppercase tracking-[0.8px] text-[var(--platinum-dim)]">
                      Message to the seller <span className="text-[8px] normal-case tracking-normal text-[var(--ghost)]">— optional</span>
                    </label>
                    <textarea
                      id="message"
                      value={message}
                      maxLength={2000}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Share a concise note with the seller."
                      spellCheck={false}
                      className="h-[132px] w-full resize-y border border-[var(--border-mid)] bg-[#10131a] px-4 py-3.5 text-[12px] leading-[1.55] text-[var(--platinum)] outline-none transition placeholder:text-[var(--ghost)] focus:bg-[#11151c]"
                    />
                    <div className="mt-1.5 text-[9px] leading-[1.5] text-[var(--ghost)]">
                      Ask a concise question or share a short note with the seller.
                    </div>
                  </div>

                  {formError && (
                    <div className="mb-4 text-[11px] leading-[1.45]" style={{ color: BAD }}>
                      {formError}
                    </div>
                  )}

                  {/* submit row: OUTLINED gold action + non-checkout truth */}
                  <div className="flex flex-col gap-4 border-t border-[var(--border-faint)] pt-5 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={busy || parsed === null}
                      className="min-h-[43px] shrink-0 border border-[var(--gold)] bg-transparent px-[18px] text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] hover:text-[var(--platinum)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy ? "Sending…" : "Send Purchase Request"}
                    </button>
                    <div className="max-w-[480px] text-[9px] leading-[1.55] text-[var(--muted)]">
                      <strong className="font-medium text-[var(--platinum-dim)]">
                        Sending a purchase request does not complete the purchase.
                      </strong>{" "}
                      The seller may accept or decline it.
                    </div>
                  </div>
                </div>
              </>
            )}

            {view === "changed" && changed && (
              <StatePanel
                mark="!"
                markTone="gold"
                eyebrow="Listing updated"
                heading="The seller updated the asking price."
              >
                <p className="mt-3 max-w-[600px] text-[11px] leading-[1.65] text-[var(--muted)]">
                  The asking price changed from {money(changed.old)} to {money(changed.current)} after this page was
                  opened. Your offer and message are kept below. Review the current listing before submitting your
                  offer — nothing has been sent to the seller.
                </p>
                <Preserved offer={offer} message={message} />
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link href={backToListing} className={primaryBtn}>Review the current listing</Link>
                  <button
                    type="button"
                    className={tertiaryBtn}
                    onClick={() => {
                      setChanged(null);
                      setView("form");
                    }}
                  >
                    Keep editing my offer
                  </button>
                </div>
              </StatePanel>
            )}

            {view === "unavailable" && (
              <StatePanel
                mark="—"
                markTone="platinum"
                eyebrow="Listing status changed"
                heading="This watch is no longer available for a new purchase request."
              >
                <p className="mt-3 max-w-[600px] text-[11px] leading-[1.65] text-[var(--muted)]">
                  The listing became reserved after this page was opened. No request was sent, and the form is no
                  longer editable.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link href={backToListing} className={primaryBtn}>Return to listing</Link>
                  <Link href="/browse" className={tertiaryBtn}>Browse other watches</Link>
                </div>
              </StatePanel>
            )}

            {view === "expired" && (
              <StatePanel
                mark="↻"
                markTone="gold"
                eyebrow="Identity needs to be rechecked"
                heading="Your session ended before the request was sent."
              >
                <p className="mt-3 max-w-[600px] text-[11px] leading-[1.65] text-[var(--muted)]">
                  Your offer and message are preserved below. Sign in again, and FairWatchTrade will recheck your
                  identity before submission. Nothing has been sent to the seller.
                </p>
                <Preserved offer={offer} message={message} />
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link href={signInHref} className={primaryBtn}>Sign in to continue</Link>
                  <Link href={backToListing} className={tertiaryBtn}>Return to listing</Link>
                </div>
              </StatePanel>
            )}

            {view === "success" && (
              <StatePanel
                mark="✓"
                markTone="ok"
                eyebrow="Request sent"
                heading="Your purchase request was sent to the seller."
              >
                <p className="mt-3 max-w-[600px] text-[11px] leading-[1.65] text-[var(--muted)]">
                  The seller can now accept or decline the request. This confirmation does not mean the watch is
                  reserved, payment has occurred, or the purchase is complete.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-4 border-y border-[var(--border-faint)] py-4 sm:grid-cols-[1fr_auto]">
                  <div className="font-display text-[16px] font-light text-[var(--platinum)]">
                    {title}
                    <small className="mt-1 block font-sans text-[10px] not-italic text-[var(--ghost)]">
                      Reference {listing.reference} · {listing.sellerName}
                    </small>
                  </div>
                  <div className="sm:text-right">
                    <small className="block font-sans text-[8px] uppercase tracking-[1.3px] text-[var(--ghost)]">Submitted offer</small>
                    <span className="mt-1 block font-display text-[18px] font-light text-[var(--platinum)]">
                      {money(submittedOffer ?? 0)}
                    </span>
                  </div>
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link href="/catalogue" className={primaryBtn}>View My Offers</Link>
                  <Link href={backToListing} className={tertiaryBtn}>Return to listing</Link>
                </div>
              </StatePanel>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/* ── shared state-panel primitives (approved visual idiom) ───────────────── */

const primaryBtn =
  "inline-flex min-h-[43px] items-center justify-center border border-[var(--gold)] bg-transparent px-[18px] text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] hover:text-[var(--platinum)]";
const tertiaryBtn =
  "inline-flex min-h-[43px] items-center justify-center px-2 text-[9px] uppercase tracking-[1.2px] text-[var(--muted)] transition hover:text-[var(--platinum)]";

function StatePanel({
  mark,
  markTone,
  eyebrow,
  heading,
  children,
}: {
  mark: string;
  markTone: "gold" | "platinum" | "ok";
  eyebrow: string;
  heading: string;
  children: React.ReactNode;
}) {
  const markColor =
    markTone === "ok" ? "var(--success)" : markTone === "platinum" ? "var(--platinum)" : "var(--gold)";
  const markBorder =
    markTone === "ok" ? "rgba(112,192,144,0.42)" : markTone === "platinum" ? "var(--border-subtle)" : "var(--border-gold)";
  return (
    <div className="pt-1">
      <div
        className="mb-4 grid h-[34px] w-[34px] place-items-center border font-display text-[18px]"
        style={{ color: markColor, borderColor: markBorder }}
        aria-hidden="true"
      >
        {mark}
      </div>
      <div className="text-[8px] uppercase tracking-[3px] text-[var(--gold)]">{eyebrow}</div>
      <h3 className="mt-2 font-display text-[26px] font-light leading-[1.1] text-[var(--platinum)] sm:text-[28px]">{heading}</h3>
      {children}
    </div>
  );
}

function Preserved({ offer, message }: { offer: string; message: string }) {
  const shown = parsePrice(offer);
  return (
    <div className="mt-5 grid grid-cols-1 gap-4 border-y border-[var(--border-faint)] py-4 sm:grid-cols-2">
      <div>
        <b className="block text-[7px] font-medium uppercase tracking-[1.2px] text-[var(--ghost)]">Preserved offer</b>
        <span className="mt-1.5 block break-words font-display text-[16px] font-light text-[var(--platinum-dim)]">
          {shown !== null ? money(shown) : "—"}
        </span>
      </div>
      <div>
        <b className="block text-[7px] font-medium uppercase tracking-[1.2px] text-[var(--ghost)]">Preserved message</b>
        <span className="mt-1.5 block break-words font-display text-[16px] font-light text-[var(--platinum-dim)]">
          {message.trim() !== "" ? message : "—"}
        </span>
      </div>
    </div>
  );
}
