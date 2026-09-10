import type Stripe from "stripe";
import type { NormalizedEvent, NormalizedRefund } from "@/lib/payments/paymentState";

/* ════════════════════════════════════════════════════════════════════════
   STRIPE EVENTS — verify the wire, then flatten the provider's shape into
   FairWatchTrade's NormalizedEvent (Stripe Step 1 of 4, 2026-09-10)

   Two jobs, kept apart:

   1. verifyStripeEvent — the signature check over the RAW request body. The
      body must reach this function as the exact bytes Stripe sent; parsing
      and re-serialising first would break the HMAC and, worse, might not,
      which is how forged events get in. The route reads `request.text()`
      and hands it here untouched.

   2. normalizeEvent — pull out the identifiers and facts the state machine
      needs (session, payment intent, charge, amounts, refunds, dispute) so
      lib/payments/paymentState.ts never sees a Stripe object. Connect-aware
      from birth: `event.account` is carried as `account`, and its absence
      means the platform account, not "unknown".

   No database and no HTTP here; both halves are unit-testable, the first
   with the SDK's own test-header generator.
   ════════════════════════════════════════════════════════════════════════ */

export function verifyStripeEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string | null,
  secret: string
): Stripe.Event {
  if (!signature) throw new Error("stripe_signature_missing");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const idOf = (v: unknown): string | null => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? str((v as { id: unknown }).id) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function refundsOf(charge: Record<string, unknown> | null): NormalizedRefund[] {
  const list = charge && typeof charge.refunds === "object" && charge.refunds
    ? (charge.refunds as { data?: unknown[] }).data
    : undefined;
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => {
      const x = r as Record<string, unknown>;
      const id = str(x.id);
      return id ? { id, amountMinor: num(x.amount) ?? 0, status: str(x.status), created: num(x.created) } : null;
    })
    .filter((r): r is NormalizedRefund => r !== null);
}

export function normalizeEvent(event: Stripe.Event): NormalizedEvent {
  /* The union of every Stripe object type has no index signature; this
     normalizer reads it as a plain record on purpose, checking each field's
     runtime type as it goes. */
  const obj = (event.data?.object ?? {}) as unknown as Record<string, unknown>;
  const objectType = str(obj.object);
  const type = event.type;

  let checkoutSessionId: string | null = null;
  let paymentIntentId: string | null = null;
  let chargeId: string | null = null;
  let paymentStatus: string | null = null;
  let amountMinor: number | null = null;
  let amountRefundedMinor: number | null = null;
  let refunds: NormalizedRefund[] = [];
  let disputeId: string | null = null;
  let disputeStatus: string | null = null;
  let metadata: Record<string, string> = {};

  const meta = obj.metadata;
  if (meta && typeof meta === "object") {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) if (typeof v === "string") metadata[k] = v;
  }

  if (objectType === "checkout.session") {
    checkoutSessionId = str(obj.id);
    paymentIntentId = idOf(obj.payment_intent);
    paymentStatus = str(obj.payment_status);
    amountMinor = num(obj.amount_total);
  } else if (objectType === "payment_intent") {
    paymentIntentId = str(obj.id);
    chargeId = idOf(obj.latest_charge);
    amountMinor = num(obj.amount);
    paymentStatus = str(obj.status);
  } else if (objectType === "charge") {
    chargeId = str(obj.id);
    paymentIntentId = idOf(obj.payment_intent);
    amountMinor = num(obj.amount);
    amountRefundedMinor = num(obj.amount_refunded);
    refunds = refundsOf(obj);
  } else if (objectType === "refund") {
    chargeId = idOf(obj.charge);
    paymentIntentId = idOf(obj.payment_intent);
    const id = str(obj.id);
    if (id) refunds = [{ id, amountMinor: num(obj.amount) ?? 0, status: str(obj.status), created: num(obj.created) }];
    // A refund object carries its own amount only; the caller resolves the
    // running total against the attempt (see route) — here we pass this
    // refund's amount so a lone refund.* event still moves the axis.
    amountRefundedMinor = num(obj.amount);
    const rm = obj.metadata;
    if (rm && typeof rm === "object" && Object.keys(metadata).length === 0) {
      metadata = {};
      for (const [k, v] of Object.entries(rm as Record<string, unknown>)) if (typeof v === "string") metadata[k] = v;
    }
  } else if (objectType === "dispute") {
    disputeId = str(obj.id);
    disputeStatus = str(obj.status);
    chargeId = idOf(obj.charge);
    paymentIntentId = idOf(obj.payment_intent);
    amountMinor = num(obj.amount);
  }

  return {
    eventId: event.id,
    type,
    livemode: Boolean(event.livemode),
    account: str((event as { account?: unknown }).account),
    objectType,
    objectId: str(obj.id),
    created: typeof event.created === "number" ? event.created : Math.floor(Date.now() / 1000),
    checkoutSessionId,
    paymentIntentId,
    chargeId,
    paymentStatus,
    amountMinor,
    amountRefundedMinor,
    refunds,
    disputeId,
    disputeStatus,
    metadata,
  };
}
