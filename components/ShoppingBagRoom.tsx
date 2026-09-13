"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/formatMoney";
import { cardImageSrc } from "@/lib/media/cardImage";
import FwtListingId from "@/components/FwtListingId";
import ShoppingBagIcon from "@/components/ShoppingBagIcon";
import { announceBagChanged } from "@/components/ShoppingBagEntrance";
import { AcceptedPurchaseStateMarker } from "@/components/AcceptedPurchaseStateMarker";
import {
  ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS,
  ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES,
  shoppingBagPrimaryStateInput,
  type AcceptedPurchaseStateInput,
} from "@/lib/payments/acceptedPurchaseStatePresentation";
import type { BagMember } from "@/lib/purchases/shoppingBag";

/* ────────────────────────────────────────────────────────────────────────
   SHOPPING BAG ROOM — the coherent accepted-purchase object
   (Accepted Purchase Continuity + Shopping Bag, 2026-09-11)

   Every watch here is composed at read time from truth owned elsewhere:
   the transaction (accepted amount + currency, identity snapshot), the
   request (original note, asking context at request time), the webhook-
   written payment record, the live listing (image, code), the public seller
   identity. The room owns no commercial truth and writes none.

   One card scans as one unit (§14): watch → seller → asking → accepted →
   state → note → correspondence → the one next action. Nothing about the
   watch is separated from the action that belongs to it.

   Payment truth: the redirect back from Stripe is a place to stand, never
   a proof. `Confirming payment` is shown until the webhook has written
   success; the room polls the Bag for a bounded window and, when the
   watch has left (webhook-confirmed), it leaves the room and the header
   together and says where the history now lives.

   Three distinguishable failure truths (§15): the Bag could not be read
   (unavailable, with Refresh); a purchase in a state this build has not
   ruled on (kept, no action, said plainly); and Stripe refusing to open a
   checkout (the reason, verbatim from the route's vocabulary).
   ──────────────────────────────────────────────────────────────────────── */

type Read = { ok: true; members: BagMember[] } | { ok: false };

const POLL_MS = 4000;
const POLL_WINDOW_MS = 120_000;

const UNAVAILABLE = "Your Shopping Bag could not be read just now. Nothing has changed. Refresh in a moment.";

const CHECKOUT_ERRORS: Record<string, string> = {
  unauthenticated: "Please sign in again to continue.",
  transaction_not_found: "This purchase could not be found.",
  not_transaction_buyer: "Only the buyer of this purchase can pay for it.",
  transaction_not_payment_eligible: "This purchase is not in a state that can be paid right now.",
  transaction_currency_missing: "This purchase has no recorded currency, so a payment cannot be started.",
  currency_unsupported: "This purchase's currency cannot be paid through Stripe yet.",
  amount_not_representable: "This amount cannot be represented in the currency's units.",
  connected_account_unavailable: "Stripe payments are not available right now.",
  stripe_not_configured: "Stripe payments are not available right now.",
  payment_state_unavailable: "FairWatchTrade could not read the payment state just now. Try again in a moment.",
  payment_locked: "A payment for this purchase is already in progress.",
  checkout_creation_failed: "Stripe could not open a checkout just now. Try again in a moment.",
};

async function fetchBag(): Promise<Read> {
  try {
    const res = await fetch("/api/shopping-bag", { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { ok?: boolean; members?: BagMember[] };
    return data.ok && Array.isArray(data.members) ? { ok: true, members: data.members } : { ok: false };
  } catch {
    return { ok: false };
  }
}

type Presentation = {
  label: string;
  input: AcceptedPurchaseStateInput;
  action: "pay" | "continue" | "retry" | "refresh" | null;
  note: string | null;
  chips: { label: string; input: AcceptedPurchaseStateInput }[];
};

function present(m: BagMember, returned: "return" | "cancel" | null, waitedOut: boolean): Presentation {
  const chips: Presentation["chips"] = [];
  if (m.payment?.refundState === "partial") chips.push({ label: "Partially refunded", input: { axis: "refund", state: "partial" } });
  if (m.payment?.refundState === "full") chips.push({ label: "Refunded", input: { axis: "refund", state: "full" } });
  if (m.payment?.disputeState === "open") chips.push({ label: "Disputed", input: { axis: "dispute", state: "open" } });
  if (m.payment?.disputeState === "lost") chips.push({ label: "Dispute lost", input: { axis: "dispute", state: "lost" } });
  if (m.payment?.disputeState === "won") chips.push({ label: "Dispute won", input: { axis: "dispute", state: "won" } });
  const lc = m.payment?.lifecycle ?? null;
  const input = shoppingBagPrimaryStateInput({
    memberState: m.state,
    transactionStatus: m.transactionStatus,
    paymentLifecycle: lc,
    hasPayment: m.payment !== null,
    canPay: m.canPay,
    returned,
  });

  if (m.state === "unruled") {
    return {
      label: "Payment state unavailable",
      input,
      action: null,
      note: "FairWatchTrade has not established what happens next for this purchase. It stays here until it has. Nothing has been removed.",
      chips,
    };
  }
  if (m.state === "confirming" || (m.state === "checkout_open" && returned === "return")) {
    if (lc === "requires_capture") return { label: "Authorized", input, action: null, note: "Your card was authorized and is awaiting capture.", chips };
    return waitedOut
      ? { label: "Confirming payment", input, action: "refresh", note: "Stripe has not confirmed this payment yet. Refresh in a moment.", chips }
      : { label: "Confirming payment", input, action: null, note: "FairWatchTrade is confirming your payment with Stripe. This updates on its own.", chips };
  }
  if (m.state === "checkout_open" && returned === "cancel") {
    return { label: "Payment not completed", input, action: "retry", note: "You left Stripe before paying. Nothing was charged.", chips };
  }
  if (m.state === "checkout_open") return { label: "Checkout open", input, action: "continue", note: null, chips };
  if (m.state === "retry") {
    if (lc === "failed") return { label: "Payment failed", input, action: "retry", note: "Stripe could not complete the payment.", chips };
    if (lc === "expired") return { label: "Checkout expired", input, action: "retry", note: "The Stripe checkout expired before payment.", chips };
    if (lc === "canceled") return { label: "Payment canceled", input, action: "retry", note: null, chips };
    /* Resolver invariants admit only failed/canceled/expired here. Preserve
       the historical fallback copy/action if an unknown runtime value still
       reaches it, but keep its color neutral and axis-qualified. */
    return { label: "Payment canceled", input, action: "retry", note: null, chips };
  }
  if (m.canPay) {
    return {
      label: "Accepted · awaiting payment",
      input,
      action: "pay",
      note: null,
      chips,
    };
  }
  return { label: "Accepted · payment unavailable", input, action: null, note: "This purchase is accepted, but a payment cannot be started right now.", chips };
}

export default function ShoppingBagRoom({
  initial,
  focusTransactionId,
  returned,
}: {
  initial: Read;
  focusTransactionId: string | null;
  returned: "return" | "cancel" | null;
}) {
  const [members, setMembers] = useState<BagMember[] | null>(initial.ok ? initial.members : null);
  const [unavailable, setUnavailable] = useState(!initial.ok);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitedOut, setWaitedOut] = useState(false);
  /* A watch that left while this room was open: say where it went. */
  const [departed, setDeparted] = useState<string[]>([]);
  const pollStart = useRef<number | null>(null);
  const known = useRef<Set<string>>(new Set(initial.ok ? initial.members.map((m) => m.transactionId) : []));

  const load = useCallback(async () => {
    const next = await fetchBag();
    if (!next.ok) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    const ids = new Set(next.members.map((m) => m.transactionId));
    const gone = [...known.current].filter((id) => !ids.has(id));
    if (gone.length > 0) {
      setDeparted((d) => [...d, ...gone]);
      announceBagChanged();
    }
    known.current = ids;
    setMembers(next.members);
  }, []);

  /* Bounded polling while a confirmation is genuinely in flight. */
  useEffect(() => {
    if (!members) return;
    const pending = members.some(
      (m) => m.state === "confirming" || (m.state === "checkout_open" && returned === "return" && m.transactionId === focusTransactionId)
    );
    if (!pending) {
      pollStart.current = null;
      return;
    }
    if (pollStart.current === null) pollStart.current = Date.now();
    const exhausted = Date.now() - pollStart.current > POLL_WINDOW_MS;
    const t = window.setTimeout(() => (exhausted ? setWaitedOut(true) : void load()), exhausted ? 0 : POLL_MS);
    return () => window.clearTimeout(t);
  }, [members, returned, focusTransactionId, load]);

  /* Returning from Stripe: the header may already be stale. */
  useEffect(() => {
    if (returned) announceBagChanged();
  }, [returned]);

  async function pay(transactionId: string) {
    if (busy) return;
    setBusy(transactionId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (res.ok && data.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(CHECKOUT_ERRORS[data.error ?? ""] ?? "Stripe could not open a checkout just now. Try again in a moment.");
    } catch {
      setError("We could not reach FairWatchTrade just now. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const heading = (
    <div className="flex items-center gap-3">
      <ShoppingBagIcon size={26} className="text-[var(--platinum)]" />
      <h1 className="font-display text-[26px] font-light text-[var(--platinum)]">Shopping Bag</h1>
    </div>
  );

  /* Could not read, nothing on screen: say so. Never an empty Bag. */
  if (unavailable && (!members || members.length === 0)) {
    return (
      <section aria-label="Shopping Bag" data-shopping-bag-room="unavailable" className="mx-auto max-w-[900px]">
        {heading}
        <p role="status" className={ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES["availability-14"]}>
          <AcceptedPurchaseStateMarker input={{ axis: "availability", state: "read_unavailable" }}>{UNAVAILABLE}</AcceptedPurchaseStateMarker>
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 border border-[var(--border-mid)] px-3 py-1.5 text-[11px] uppercase tracking-[1.5px] text-[var(--platinum)] transition hover:border-[var(--gold-subtle)]"
        >
          Refresh
        </button>
      </section>
    );
  }

  const list = members ?? [];

  return (
    <section aria-label="Shopping Bag" data-shopping-bag-room={list.length === 0 ? "empty" : "members"} className="mx-auto max-w-[900px]">
      {heading}
      <p className="mt-2 text-[13px] leading-[1.6] text-[var(--muted)]">
        Accepted purchases, ready to continue. A watch leaves here once its payment is confirmed; the record stays in Your Purchases.
      </p>
      {unavailable && (
        <p role="status" className={ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES["availability-13-bag"]}>
          <AcceptedPurchaseStateMarker input={{ axis: "availability", state: "read_unavailable" }}>{UNAVAILABLE}</AcceptedPurchaseStateMarker>
        </p>
      )}

      {departed.length > 0 && (
        <p role="status" className="mt-4 border-l-2 border-[var(--gold)] pl-3 text-[13px] leading-[1.6] text-[var(--platinum)]">
          {departed.length === 1 ? "Payment confirmed. That watch has left your Shopping Bag." : "Payments confirmed. Those watches have left your Shopping Bag."}{" "}
          <Link href="/account?module=dashboard" className="text-[var(--gold)] underline-offset-4 hover:underline">
            See Your Purchases
          </Link>
        </p>
      )}

      {list.length === 0 ? (
        <div className="mt-6 border border-dashed border-[var(--border-faint)] px-4 py-8 text-center">
          <div className="fw-functional-copy text-[var(--platinum-dim)]">Nothing is waiting in your Shopping Bag.</div>
          <div className="mt-2 text-[12px] leading-[1.6] text-[var(--muted)]">
            When a seller accepts one of your purchase requests, the watch appears here.
          </div>
          <Link href="/catalogue#my-offers" className="mt-4 inline-block text-[11px] uppercase tracking-[1.4px] text-[var(--gold-on-tint)] transition hover:text-[var(--platinum)]">
            My Offers →
          </Link>
        </div>
      ) : (
        <div className="mt-6 border border-[var(--border-subtle)]">
          {list.map((m) => {
            const p = present(m, m.transactionId === focusTransactionId ? returned : null, waitedOut);
            const focused = m.transactionId === focusTransactionId;
            const title = [m.brand, m.model].filter(Boolean).join(" ") || "Watch";
            return (
              <article
                key={m.transactionId}
                data-bag-member={m.transactionId}
                data-bag-state={m.state}
                className={`grid gap-4 border-b border-[var(--border-faint)] px-4 py-5 last:border-b-0 md:grid-cols-[88px_1fr_auto] md:gap-6 ${focused ? ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS : ""}`}
              >
                {/* the watch */}
                <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden bg-[var(--image-well)]">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cardImageSrc(m.imageUrl, { width: 240 })} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <div className="text-[11px] tracking-[0.3px] text-[var(--muted)]">No photo</div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="font-display text-[18px] font-light text-[var(--platinum)]">
                    {m.listingId && m.listingAvailableToBuyer ? (
                      <Link href={`/listings/${m.listingId}`} className="hover:text-[var(--gold)]">
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </div>
                  {m.reference && <div className="text-[11px] tracking-[0.3px] text-[var(--muted)]">Ref. {m.reference}</div>}
                  <FwtListingId code={m.publicCode} className="mt-0.5" />
                  <div className="mt-2 text-[12px] text-[var(--slate)]">
                    Sold by{" "}
                    {m.sellerHref ? (
                      <Link href={m.sellerHref} className="text-[var(--platinum-dim)] underline-offset-4 hover:text-[var(--gold)] hover:underline">
                        {m.sellerName}
                      </Link>
                    ) : (
                      m.sellerName
                    )}
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-3">
                    <div>
                      <dt className="fw-transaction-fact uppercase text-[var(--muted)]">Asking</dt>
                      <dd className="mt-0.5 text-[var(--platinum-dim)]">
                        {m.askingAmount != null && m.askingCurrency ? formatMoney(m.askingAmount, m.askingCurrency) : <span className="italic text-[var(--muted)]">not recorded</span>}
                      </dd>
                    </div>
                    <div>
                      <dt className="fw-transaction-fact uppercase text-[var(--muted)]">Accepted</dt>
                      <dd className="mt-0.5 font-display text-[16px] font-light text-[var(--platinum)]">{formatMoney(m.acceptedAmount, m.acceptedCurrency)}</dd>
                    </div>
                    <div>
                      <dt className="fw-lifecycle-label uppercase text-[var(--muted)]">State</dt>
                      <dd className={ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES.primary} data-bag-label="">
                        <AcceptedPurchaseStateMarker input={p.input}>{p.label}</AcceptedPurchaseStateMarker>
                      </dd>
                      {p.chips.length > 0 && (
                        <dd className="fw-lifecycle-label mt-0.5 uppercase">
                          {p.chips.map((chip, index) => (
                            <span key={`${chip.input.axis}:${chip.input.state}`}>
                              {index > 0 && <span className="text-[var(--muted)]"> · </span>}
                              <AcceptedPurchaseStateMarker input={chip.input}>{chip.label}</AcceptedPurchaseStateMarker>
                            </span>
                          ))}
                        </dd>
                      )}
                    </div>
                  </dl>

                  {m.note && (
                    <blockquote className="mt-3 border-l border-[var(--border-mid)] pl-3 text-[12px] italic leading-[1.6] text-[var(--slate)]">
                      Your note: {m.note}
                    </blockquote>
                  )}
                  {p.note && <p className="mt-2 text-[12px] leading-[1.6] text-[var(--slate)]">{p.note}</p>}

                  {/* Correspondence — the existing relationship thread on the
                      listing, or the composer that establishes it (the messages
                      route admits the accepted buyer on a reserved listing). */}
                  {m.listingId && m.listingAvailableToBuyer && (
                    <Link
                      href={`/listings/${m.listingId}#correspondence`}
                      data-bag-correspondence=""
                      className="mt-3 inline-flex min-h-[40px] items-center border border-[var(--border-subtle)] px-3 text-[11px] uppercase tracking-[1.4px] text-[var(--platinum-dim)] transition-colors hover:border-[var(--border-mid)] hover:text-[var(--platinum)]"
                    >
                      Correspondence with {m.sellerName}
                    </Link>
                  )}
                </div>

                {/* the one next action */}
                <div className="flex flex-col items-start gap-1.5 md:items-end">
                  {(p.action === "pay" || p.action === "retry" || p.action === "continue") && (
                    <>
                      <button
                        type="button"
                        onClick={() => pay(m.transactionId)}
                        disabled={busy === m.transactionId}
                        data-bag-pay=""
                        className="flex min-h-[40px] cursor-pointer items-center justify-center border border-[var(--gold)] bg-[var(--cta-fill)] px-4 text-[12px] font-semibold text-[var(--on-cta)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-default disabled:opacity-60"
                      >
                        {busy === m.transactionId ? "Opening Stripe…" : p.action === "continue" ? "Continue to Stripe" : p.action === "retry" ? "Try again with Stripe" : "Pay with Stripe"}
                      </button>
                      <span className="max-w-[220px] text-[11px] leading-[1.5] text-[var(--muted)] md:text-right">You will leave FairWatchTrade for Stripe’s checkout and return to this Bag.</span>
                    </>
                  )}
                  {p.action === "refresh" && (
                    <button
                      type="button"
                      onClick={() => {
                        setWaitedOut(false);
                        pollStart.current = null;
                        void load();
                      }}
                      className="border border-[var(--border-mid)] px-3 py-1.5 text-[11px] uppercase tracking-[1.5px] text-[var(--platinum)] transition hover:border-[var(--gold-subtle)]"
                    >
                      Refresh
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 border-l-2 border-[var(--gold)] pl-3 text-[13px] leading-[1.6] text-[var(--platinum)]">
          {error}
        </p>
      )}
    </section>
  );
}
