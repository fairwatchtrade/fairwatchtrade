"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatMoney } from "@/lib/formatMoney";

/* ────────────────────────────────────────────────────────────────────────
   YOUR PURCHASES — the buyer's accepted purchases and their payment truth
   (Stripe Step 1 of 4, 2026-09-10)

   Renders on the buyer's Overview only when this account is the buyer of
   at least one accepted purchase; otherwise nothing, so an ordinary seller
   never sees an empty payments box.

   Everything shown comes from /api/stripe/payment-state, which reads the
   transaction and the provider payment record under RLS. This component
   never decides that a payment succeeded: it shows what the webhook has
   confirmed, and while confirmation is still in flight it says so.

   Leaving for Stripe is deliberate and visible: the button says where the
   collector is going, and the browser navigates there in this tab. Coming
   back lands on the same transaction (?transaction=…), which is only a
   place to stand, never a proof of payment. The return-before-webhook
   window shows "Confirming payment" and polls for a bounded time; past
   that it says plainly that confirmation is still pending and offers a
   refresh rather than guessing.
   ──────────────────────────────────────────────────────────────────────── */

type Purchase = {
  transactionId: string;
  transactionStatus: string | null;
  listingId: string | null;
  brand: string | null;
  model: string | null;
  reference: string | null;
  amount: string | number;
  currency: string | null;
  acceptedAt: string | null;
  payment: {
    attemptId: string;
    lifecycle: string;
    refundState: "none" | "partial" | "full";
    refundedAmountMinor: number;
    disputeState: "none" | "open" | "won" | "lost";
    disputeProviderStatus: string | null;
    checkoutExpiresAt: string | null;
    updatedAt: string;
  } | null;
  canPay: boolean;
};

const POLL_MS = 4000;
const POLL_WINDOW_MS = 120_000;

/** One read of the buyer's purchases; null when the read did not succeed,
    so the caller leaves the last known state on screen. */
async function fetchPurchases(): Promise<Purchase[] | null> {
  try {
    const res = await fetch("/api/stripe/payment-state", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; purchases?: Purchase[] };
    return data.ok && Array.isArray(data.purchases) ? data.purchases : null;
  } catch {
    return null;
  }
}

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
  payment_locked: "A payment for this purchase is already in progress.",
  checkout_creation_failed: "Stripe could not open a checkout just now. Try again in a moment.",
};

function describe(p: Purchase, returned: string | null, waitedOut: boolean) {
  const lc = p.payment?.lifecycle ?? null;
  const chips: string[] = [];
  if (p.payment?.refundState === "partial") chips.push("Partially refunded");
  if (p.payment?.refundState === "full") chips.push("Refunded");
  if (p.payment?.disputeState === "open") chips.push("Disputed");
  if (p.payment?.disputeState === "lost") chips.push("Dispute lost");
  if (p.payment?.disputeState === "won") chips.push("Dispute won");

  if (lc === "succeeded") return { label: "Paid", tone: "paid", action: null as string | null, note: null as string | null, chips };
  if (lc === "requires_capture") return { label: "Authorized", tone: "wait", action: null, note: "Your card was authorized and is awaiting capture.", chips };
  if (lc === "confirming" || (lc === "checkout_created" && returned === "return")) {
    return waitedOut
      ? { label: "Confirming payment", tone: "wait", action: "refresh", note: "Stripe has not confirmed this payment yet. Refresh in a moment.", chips }
      : { label: "Confirming payment", tone: "wait", action: null, note: "FairWatchTrade is confirming your payment with Stripe. This updates on its own.", chips };
  }
  if (lc === "checkout_created" && returned === "cancel") return { label: "Payment not completed", tone: "open", action: "retry", note: "You left Stripe before paying. Nothing was charged.", chips };
  if (lc === "checkout_created") return { label: "Checkout open", tone: "open", action: "continue", note: null, chips };
  if (lc === "failed") return { label: "Payment failed", tone: "open", action: "retry", note: "Stripe could not complete the payment.", chips };
  if (lc === "canceled") return { label: "Payment canceled", tone: "open", action: "retry", note: null, chips };
  if (lc === "expired") return { label: "Checkout expired", tone: "open", action: "retry", note: "The Stripe checkout expired before payment.", chips };
  if (p.canPay) return { label: "Awaiting payment", tone: "open", action: "pay", note: null, chips };
  return { label: p.transactionStatus ?? "Accepted", tone: "wait", action: null, note: null, chips };
}

export default function BuyerPurchasesPanel() {
  const params = useSearchParams();
  const focusId = params.get("transaction");
  const returned = params.get("payment");

  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitedOut, setWaitedOut] = useState(false);
  const pollStart = useRef<number | null>(null);

  const load = useCallback(async () => {
    const next = await fetchPurchases();
    if (next) setPurchases(next);
  }, []);

  /* First read. The async body sets state only after the network answers,
     and never after unmount. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchPurchases();
      if (!cancelled && next) setPurchases(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Bounded polling while confirmation is genuinely in flight. */
  useEffect(() => {
    if (!purchases) return;
    const pending = purchases.some((p) => {
      const lc = p.payment?.lifecycle;
      return lc === "confirming" || (lc === "checkout_created" && returned === "return" && p.transactionId === focusId);
    });
    if (!pending) {
      pollStart.current = null;
      return;
    }
    if (pollStart.current === null) pollStart.current = Date.now();
    const exhausted = Date.now() - pollStart.current > POLL_WINDOW_MS;
    /* Past the window: say so on the next tick rather than guessing. Inside
       it: read again shortly. Both are scheduled callbacks, never a
       synchronous state write in the effect body. */
    const t = window.setTimeout(() => (exhausted ? setWaitedOut(true) : void load()), exhausted ? 0 : POLL_MS);
    return () => window.clearTimeout(t);
  }, [purchases, returned, focusId, load]);

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
        /* The deliberate leave: Stripe's hosted page, this tab. */
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

  if (!purchases || purchases.length === 0) return null;

  return (
    <section aria-label="Your purchases" className="px-6 pt-6">
      <div className="text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]">Your Purchases</div>
      <div className="mt-2 border border-[var(--border-faint)]">
        {purchases.map((p) => {
          const d = describe(p, p.transactionId === focusId ? returned : null, waitedOut);
          const focused = p.transactionId === focusId;
          const tone =
            d.tone === "paid" ? "text-[var(--lc-published-badge)]" : d.tone === "wait" ? "text-[var(--gold)]" : "text-[var(--platinum-dim)]";
          return (
            <div
              key={p.transactionId}
              className={`grid gap-3 border-b border-[var(--border-faint)] px-4 py-4 last:border-b-0 md:grid-cols-[1.4fr_auto_auto] md:items-center md:gap-6 ${focused ? "bg-[var(--gold-whisper)]" : ""}`}
            >
              <div className="min-w-0">
                <div className="truncate font-display text-[16px] font-light text-[var(--platinum)]">
                  {[p.brand, p.model].filter(Boolean).join(" ") || "Watch"}
                </div>
                {p.reference && <div className="text-[11px] tracking-[0.3px] text-[var(--muted)]">Ref. {p.reference}</div>}
                {d.note && <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--slate)]">{d.note}</p>}
              </div>
              <div className="md:text-right">
                <div className="font-display text-[16px] font-light text-[var(--platinum)]">{formatMoney(p.amount, p.currency)}</div>
                <div className={`mt-0.5 text-[11px] uppercase tracking-[1.2px] ${tone}`}>{d.label}</div>
                {d.chips.length > 0 && (
                  <div className="mt-1 text-[11px] uppercase tracking-[1.2px] text-[var(--muted)]">{d.chips.join(" · ")}</div>
                )}
              </div>
              <div className="flex flex-col items-start gap-1.5 md:items-end">
                {(d.action === "pay" || d.action === "retry" || d.action === "continue") && (
                  <>
                    <button
                      type="button"
                      onClick={() => pay(p.transactionId)}
                      disabled={busy === p.transactionId}
                      className="flex min-h-[40px] cursor-pointer items-center justify-center border border-[var(--gold)] bg-[var(--cta-fill)] px-4 text-[12px] font-semibold text-[var(--on-cta)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-default disabled:opacity-60"
                    >
                      {busy === p.transactionId ? "Opening Stripe…" : d.action === "continue" ? "Continue to Stripe" : d.action === "retry" ? "Try again with Stripe" : "Pay with Stripe"}
                    </button>
                    <span className="text-[11px] leading-[1.5] text-[var(--muted)]">You will leave FairWatchTrade for Stripe’s checkout and return here.</span>
                  </>
                )}
                {d.action === "refresh" && (
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
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 border-l-2 border-[var(--gold)] pl-3 text-[13px] leading-[1.6] text-[var(--platinum)]">
          {error}
        </p>
      )}
    </section>
  );
}
