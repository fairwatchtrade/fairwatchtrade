import type Stripe from "stripe";

/* ════════════════════════════════════════════════════════════════════════
   STRIPE CHECKOUT — request construction for an already-authoritative
   FairWatchTrade payment attempt (Stripe Step 1 of 4, 2026-09-10)

   Everything in here is derived from server truth the route already
   established: the transaction's accepted amount and snapshotted currency,
   the attempt id, the controlled connected account. Nothing is taken from
   the browser. This module builds the request; it does not send it, so the
   exact shape Stripe receives is unit-testable.

   Charge-model boundary: Step 1 uses a controlled sandbox DIRECT charge on
   one connected account, which is why the request options carry
   `stripeAccount`. That is a proof fixture, not the production charge-model
   ruling (Step 4). Changing to destination charges later changes THIS file,
   not what a FairWatchTrade transaction means.

   Cards only, enforced here in code, not left to Dashboard configuration.
   Automatic capture only: Step 2 owns authorization/capture policy.
   ════════════════════════════════════════════════════════════════════════ */

export type CheckoutInput = {
  transactionId: string;
  attemptId: string;
  /** Provider minor units, already converted with the governed exponent. */
  amountMinor: number;
  /** ISO code from the transaction snapshot, e.g. USD. */
  currency: string;
  /** What the collector is paying for, as Stripe should show it. */
  description: string;
  successUrl: string;
  cancelUrl: string;
};

/** `fwt:stripe:checkout:<transaction_uuid>:<payment_attempt_uuid>` */
export function checkoutIdempotencyKey(transactionId: string, attemptId: string): string {
  return `fwt:stripe:checkout:${transactionId}:${attemptId}`;
}

export function buildCheckoutParams(input: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  const correlation = {
    fwt_transaction_id: input.transactionId,
    fwt_payment_attempt_id: input.attemptId,
  };
  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountMinor,
          product_data: { name: input.description },
        },
      },
    ],
    client_reference_id: input.transactionId,
    metadata: correlation,
    payment_intent_data: {
      capture_method: "automatic",
      metadata: correlation,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

export function checkoutRequestOptions(
  transactionId: string,
  attemptId: string,
  connectedAccount: string
): Stripe.RequestOptions {
  return {
    idempotencyKey: checkoutIdempotencyKey(transactionId, attemptId),
    stripeAccount: connectedAccount,
  };
}

/** Where the collector lands afterwards: the same accepted purchase in the
    Shopping Bag, never home (Accepted Purchase Continuity, 2026-09-11).

    The Bag page resolves the return against CURRENT membership at arrival:
    while the transaction is still a member it is focused there; if the
    webhook already confirmed payment and the watch has left the Bag, the
    page sends the buyer on to the same transaction in persistent Your
    Purchases. Either way the redirect is navigation only — `payment=return`
    is where the collector came from, never what happened. */
export function returnUrls(origin: string, transactionId: string): { successUrl: string; cancelUrl: string } {
  const base = `${origin}/shopping-bag?transaction=${encodeURIComponent(transactionId)}`;
  return { successUrl: `${base}&payment=return`, cancelUrl: `${base}&payment=cancel` };
}
