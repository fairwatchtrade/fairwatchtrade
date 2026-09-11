import { isPayableTransactionStatus, isPostPaymentTransactionStatus } from "../payments/transactionPayability.ts";
import { canStartCheckout, type PaymentTruth } from "../payments/paymentState.ts";

/* ════════════════════════════════════════════════════════════════════════
   SHOPPING BAG MEMBERSHIP — the pure lifecycle mapping
   (Accepted Purchase Continuity + Shopping Bag, 2026-09-11)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The Shopping Bag is a list the buyer adds things to."

   Nobody adds anything. The Bag is a PROJECTION: for each transaction the
   buyer owns, this function reads the authoritative transaction status and
   the webhook-written payment truth of its active attempt, and answers one
   question — is this accepted purchase still inside the buyer's
   payment/funding phase? Membership is derived at read time, every time.
   There is no bag table, no bag row, no bag write, and nothing the browser
   can send changes the answer.

   Membership is broader than "there is a button to press". A purchase
   whose payment is CONFIRMING (the buyer already paid, the webhook has not
   yet said so) is still a member: the buyer's phase is not over until
   FairWatchTrade knows it is over.

   Governed states (founder-locked product law, v3):

     accepted, payable, no payment yet ............ member  awaiting_payment
     Checkout open ................................. member  checkout_open
     failed / canceled / expired, retry available .. member  retry
     confirming (webhook not yet landed) ........... member  confirming
     authorized, awaiting capture .................. member  confirming
     webhook-confirmed paid / funded ............... EXITS the Bag
     any post-payment transaction status ........... EXITS (no resurrection)

   Everything else — cancelled, disputed, refunded, or a status this file
   has never heard of, reached WITHOUT a confirmed capture — is not ruled.
   The mapping refuses to invent a removal: such a purchase stays visible as
   a member in an `unruled` state with no action, and the surface says the
   state could not be established. "Silently gone" is the one answer this
   file may never give.

   No resurrection: once the capture axis says succeeded, later refund or
   dispute truth on the same attempt, and later shipment / inspection
   statuses on the transaction, never bring the watch back into the Bag.
   That is why the succeeded check runs BEFORE the transaction-status
   checks, and why post-payment statuses exit regardless of the attempt.

   Pure on purpose: no HTTP, no database, so every branch is unit-testable.
   The composition (reading rows, joining the watch, the seller, the
   request note) lives in lib/purchases/shoppingBag.ts.
   ════════════════════════════════════════════════════════════════════════ */

export const BAG_MEMBER_STATES = ["awaiting_payment", "checkout_open", "retry", "confirming", "unruled"] as const;
export type BagMemberState = (typeof BAG_MEMBER_STATES)[number];

export type BagDecision =
  | { member: true; state: BagMemberState; canPay: boolean }
  | { member: false; reason: "paid" | "post_payment" };

/** Decide whether one transaction is currently in the buyer's Shopping Bag. */
export function bagDecisionFor(transactionStatus: string | null | undefined, payment: PaymentTruth | null): BagDecision {
  /* 1 · webhook-confirmed capture: the buyer's phase is over, whatever else
         has happened since. Refund and dispute axes never reopen it. */
  if (payment?.lifecycle === "succeeded") return { member: false, reason: "paid" };

  /* 2 · a transaction already past payment can only have got there through
         a governed writer; the Bag does not reappear behind it. */
  if (isPostPaymentTransactionStatus(transactionStatus)) return { member: false, reason: "post_payment" };

  /* 3 · inside the payable phase: the provider lifecycle names the state. */
  if (isPayableTransactionStatus(transactionStatus)) {
    const lc = payment?.lifecycle ?? null;
    if (lc === null || lc === "pending") return { member: true, state: "awaiting_payment", canPay: canStartCheckout(payment) };
    if (lc === "checkout_created") return { member: true, state: "checkout_open", canPay: true };
    if (lc === "failed" || lc === "canceled" || lc === "expired") return { member: true, state: "retry", canPay: true };
    if (lc === "confirming" || lc === "requires_capture") return { member: true, state: "confirming", canPay: false };
    /* A lifecycle this build does not know. Conservative: still a member,
       no action offered. */
    return { member: true, state: "unruled", canPay: false };
  }

  /* 4 · cancelled / disputed / refunded / unknown, with no confirmed capture:
         not ruled. Never silently removed. */
  return { member: true, state: "unruled", canPay: false };
}

/** The header's three distinguishable truths. `unavailable` is reserved for
    a read that FAILED; `none` requires a read that SUCCEEDED and found no
    member. Never derive `none` from an error. */
export type BagHeaderTruth = { status: "none" } | { status: "members"; count: number } | { status: "unavailable" };

export function bagHeaderTruthFor(read: { ok: true; memberCount: number } | { ok: false }): BagHeaderTruth {
  if (!read.ok) return { status: "unavailable" };
  return read.memberCount > 0 ? { status: "members", count: read.memberCount } : { status: "none" };
}
