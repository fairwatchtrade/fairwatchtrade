/* ════════════════════════════════════════════════════════════════════════
   PAYMENT STATE — FairWatchTrade's own vocabulary for a provider payment
   (Stripe Step 1 of 4, 2026-09-10)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "A payment is paid or not paid."

   A payment has three independent truths that can all be true at once: it
   was captured, part of it was refunded, and it is under dispute. A single
   flat status would have to throw two of those away. Each axis lives in its
   own column and only its own events move it.

   Provider-neutral on purpose: the Stripe adapter (lib/payments/stripe/
   events.ts) turns a webhook into a NormalizedEvent; this file decides what
   that event means for the attempt's current truth. No HTTP, no Stripe SDK,
   no database here, so the whole decision table is unit-testable.

   Rules that are load-bearing:
     · `succeeded` is terminal for the capture axis. A later failed / canceled
       / expired event never demotes it (Stripe can emit checkout.session
       .expired after a session already paid; a dispute never erases the
       capture).
     · The refund axis is derived from amount_refunded vs the attempt amount,
       never from "a refund happened": 1 of 7150 is partial, 7150 is full.
     · The dispute axis records provider status and a coarse state; it moves
       nothing else.
     · Unknown event types are ignored, and the caller still records them.
   ════════════════════════════════════════════════════════════════════════ */

export const LIFECYCLE = [
  "pending",
  "checkout_created",
  "confirming",
  "requires_capture",
  "succeeded",
  "failed",
  "canceled",
  "expired",
] as const;
export type Lifecycle = (typeof LIFECYCLE)[number];

export const REFUND_STATES = ["none", "partial", "full"] as const;
export type RefundState = (typeof REFUND_STATES)[number];

export const DISPUTE_STATES = ["none", "open", "won", "lost"] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];

/** The capture axis states from which a session may still be paid. */
export const PAYABLE_LIFECYCLES: readonly Lifecycle[] = ["pending", "checkout_created", "failed", "canceled", "expired"];
/** States in which a new Checkout must NOT be started. */
export const LOCKED_LIFECYCLES: readonly Lifecycle[] = ["confirming", "requires_capture", "succeeded"];

export type PaymentTruth = {
  lifecycle: Lifecycle;
  amountMinor: number;
  refundState: RefundState;
  refundedAmountMinor: number;
  disputeState: DisputeState;
  disputeProviderStatus: string | null;
};

export type NormalizedRefund = { id: string; amountMinor: number; status: string | null; created: number | null };

/** What the adapter extracts from a provider event. Transport-free. */
export type NormalizedEvent = {
  eventId: string;
  type: string;
  livemode: boolean;
  /** Connected-account context when Stripe supplied it; null = platform. */
  account: string | null;
  objectType: string | null;
  objectId: string | null;
  created: number;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  /** checkout.session.payment_status: paid | unpaid | no_payment_required */
  paymentStatus: string | null;
  amountMinor: number | null;
  amountRefundedMinor: number | null;
  refunds: NormalizedRefund[];
  disputeId: string | null;
  disputeStatus: string | null;
  metadata: Record<string, string>;
};

export type TruthPatch = Partial<
  Pick<PaymentTruth, "lifecycle" | "refundState" | "refundedAmountMinor" | "disputeState" | "disputeProviderStatus">
> & {
  paymentIntentId?: string;
  chargeId?: string;
  disputeId?: string;
  providerStatus?: string;
  refunds?: NormalizedRefund[];
};

export type Transition =
  | { kind: "apply"; patch: TruthPatch; note: string }
  | { kind: "ignore"; reason: string };

const ignore = (reason: string): Transition => ({ kind: "ignore", reason });
const apply = (patch: TruthPatch, note: string): Transition => ({ kind: "apply", patch, note });

export function refundStateFor(amountRefundedMinor: number, amountMinor: number): RefundState {
  if (amountRefundedMinor <= 0) return "none";
  return amountRefundedMinor >= amountMinor ? "full" : "partial";
}

export function disputeStateFor(providerStatus: string | null): DisputeState {
  if (!providerStatus) return "open";
  if (providerStatus === "won") return "won";
  if (providerStatus === "lost") return "lost";
  return "open";
}

/**
 * Decide the transition for one event against the attempt's current truth.
 * Pure. Idempotency (the same event twice) is the caller's job via the event
 * log; this function only guards semantic regressions.
 */
export function transitionFor(current: PaymentTruth, ev: NormalizedEvent): Transition {
  const captured = current.lifecycle === "succeeded";
  const ids: TruthPatch = {};
  if (ev.paymentIntentId) ids.paymentIntentId = ev.paymentIntentId;
  if (ev.chargeId) ids.chargeId = ev.chargeId;

  switch (ev.type) {
    case "checkout.session.completed": {
      if (ev.paymentStatus === "paid") {
        if (captured) return ignore("already_succeeded");
        return apply({ ...ids, lifecycle: "succeeded", providerStatus: "paid" }, "checkout completed and paid");
      }
      if (captured) return ignore("already_succeeded");
      return apply({ ...ids, lifecycle: "confirming", providerStatus: ev.paymentStatus ?? "completed" }, "checkout completed, payment pending");
    }
    case "checkout.session.async_payment_succeeded":
      if (captured) return ignore("already_succeeded");
      return apply({ ...ids, lifecycle: "succeeded", providerStatus: "paid" }, "async payment succeeded");
    case "checkout.session.async_payment_failed":
      if (captured) return ignore("already_succeeded");
      return apply({ ...ids, lifecycle: "failed", providerStatus: "async_payment_failed" }, "async payment failed");
    case "checkout.session.expired":
      if (captured) return ignore("already_succeeded");
      if (current.lifecycle === "expired") return ignore("already_expired");
      return apply({ lifecycle: "expired", providerStatus: "expired" }, "checkout session expired");
    case "payment_intent.succeeded":
      if (captured) return ignore("already_succeeded");
      return apply({ ...ids, lifecycle: "succeeded", providerStatus: "succeeded" }, "payment intent succeeded");
    case "payment_intent.processing":
      if (captured) return ignore("already_succeeded");
      return apply({ ...ids, lifecycle: "confirming", providerStatus: "processing" }, "payment processing");
    case "payment_intent.amount_capturable_updated":
      if (captured) return ignore("already_succeeded");
      return apply({ ...ids, lifecycle: "requires_capture", providerStatus: "requires_capture" }, "authorization awaiting capture");
    case "payment_intent.payment_failed":
      if (captured) return ignore("already_succeeded");
      return apply({ ...ids, lifecycle: "failed", providerStatus: "payment_failed" }, "payment failed");
    case "payment_intent.canceled":
      if (captured) return ignore("already_succeeded");
      return apply({ ...ids, lifecycle: "canceled", providerStatus: "canceled" }, "payment intent canceled");
    case "charge.refunded":
    case "refund.created":
    case "refund.updated":
    case "charge.refund.updated": {
      if (ev.amountRefundedMinor == null) return ignore("no_refund_amount");
      const refundState = refundStateFor(ev.amountRefundedMinor, current.amountMinor);
      return apply(
        { ...ids, refundState, refundedAmountMinor: ev.amountRefundedMinor, refunds: ev.refunds },
        `refund truth: ${refundState}`
      );
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated":
    case "charge.dispute.closed": {
      const disputeState = disputeStateFor(ev.disputeStatus);
      return apply(
        { ...ids, disputeState, disputeProviderStatus: ev.disputeStatus, ...(ev.disputeId ? { disputeId: ev.disputeId } : {}) },
        `dispute truth: ${disputeState}`
      );
    }
    default:
      return ignore(`unhandled_event_type:${ev.type}`);
  }
}

/** Whether a buyer may start (or restart) Checkout given the active attempt. */
export function canStartCheckout(active: PaymentTruth | null): boolean {
  if (!active) return true;
  return PAYABLE_LIFECYCLES.includes(active.lifecycle);
}
