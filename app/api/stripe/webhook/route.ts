import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getWebhookSecret } from "@/lib/payments/stripe/client";
import { normalizeEvent, verifyStripeEvent } from "@/lib/payments/stripe/events";
import { transitionFor, type Lifecycle, type PaymentTruth, type TruthPatch } from "@/lib/payments/paymentState";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/stripe/webhook — the only thing that may confirm a payment
   (Stripe Step 1 of 4, 2026-09-10)

   The redirect tells FairWatchTrade where the collector came from. THIS
   route tells FairWatchTrade what happened. Nothing else advances payment
   truth: not a success_url landing, not a query parameter, not a client
   POST.

   Order of operations, and why:
     1. Read the RAW body and verify the signature over it. Parsing first
        would silently break the HMAC.
     2. Normalize the provider shape (lib/payments/stripe/events.ts) into a
        transport-free event; carry the connected-account context. Direct
        charges on the controlled account arrive WITH `event.account`, and
        the endpoint must be subscribed to Connected-accounts events in the
        Stripe Dashboard for that to happen at all (README).
     3. Resolve the payment attempt: correlation metadata first (the ids we
        put on the session and the intent), then session id, intent id,
        charge id.
     4. Decide the transition purely (lib/payments/paymentState.ts).
     5. Hand event + attempt + expected prior lifecycle + patch to ONE
        atomic database function, stripe_apply_event(): record once,
        transition once, mark result. A replayed event is a `duplicate`;
        a racing one is `stale`; neither double-applies.

   A 2xx is returned for anything recorded, including ignored and
   unresolved events, because Stripe would otherwise retry forever. A 400
   is returned only for a bad signature, a 500 only when the database
   refused to record, which is exactly when a retry should happen.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AttemptRow = {
  id: string;
  transaction_id: string;
  lifecycle: Lifecycle;
  amount_minor: number;
  refund_state: PaymentTruth["refundState"];
  refunded_amount_minor: number;
  dispute_state: PaymentTruth["disputeState"];
  dispute_provider_status: string | null;
};

const ATTEMPT_COLUMNS =
  "id, transaction_id, lifecycle, amount_minor, refund_state, refunded_amount_minor, dispute_state, dispute_provider_status";

function patchToRow(patch: TruthPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.lifecycle) row.lifecycle = patch.lifecycle;
  if (patch.refundState) row.refund_state = patch.refundState;
  if (patch.refundedAmountMinor != null) row.refunded_amount_minor = patch.refundedAmountMinor;
  if (patch.disputeState) row.dispute_state = patch.disputeState;
  if ("disputeProviderStatus" in patch) row.dispute_provider_status = patch.disputeProviderStatus;
  if (patch.disputeId) row.dispute_id = patch.disputeId;
  if (patch.paymentIntentId) row.payment_intent_id = patch.paymentIntentId;
  if (patch.chargeId) row.charge_id = patch.chargeId;
  if (patch.providerStatus) row.provider_status = patch.providerStatus;
  if (patch.refunds) row.refunds = patch.refunds;
  return row;
}

export async function POST(request: NextRequest) {
  /* 1 · raw bytes, then the signature over them */
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = verifyStripeEvent(getStripe(), rawBody, signature, getWebhookSecret());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg === "stripe_not_configured" || msg === "stripe_webhook_not_configured" || msg === "stripe_live_key_refused") {
      console.error("[stripe:webhook] not configured:", msg);
      return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
    }
    console.error("[stripe:webhook] signature refused:", msg.slice(0, 120));
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  /* 2 · provider shape → FairWatchTrade shape */
  const ev = normalizeEvent(event);
  const db = createServiceClient();

  /* 3 · resolve the payment attempt. S1-C2: a lookup that FAILS is not a
         lookup that found nothing. Recording such an event as "unresolved"
         and answering 2xx would tell Stripe never to retry a message we
         never actually examined, so a failed lookup answers 500 and Stripe
         brings the event back. */
  const lookups: Array<[string, string] | null> = [
    ev.metadata.fwt_payment_attempt_id && UUID.test(ev.metadata.fwt_payment_attempt_id) ? ["id", ev.metadata.fwt_payment_attempt_id] : null,
    ev.checkoutSessionId ? ["checkout_session_id", ev.checkoutSessionId] : null,
    ev.paymentIntentId ? ["payment_intent_id", ev.paymentIntentId] : null,
    ev.chargeId ? ["charge_id", ev.chargeId] : null,
  ];
  let attempt: AttemptRow | null = null;
  for (const lookup of lookups) {
    if (!lookup || attempt) continue;
    const [column, value] = lookup;
    const { data, error: lookupErr } = await db
      .from("stripe_payment_attempts")
      .select(ATTEMPT_COLUMNS)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    if (lookupErr) {
      console.error(`[stripe:webhook] attempt lookup by ${column} failed event=${ev.eventId}:`, lookupErr.message);
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
    }
    attempt = (data as AttemptRow | null) ?? null;
  }

  /* 4 · decide, purely */
  let note = "";
  let patch: Record<string, unknown> | null = null;
  let expected: string | null = null;
  if (attempt) {
    if (ev.livemode) {
      note = "livemode event refused in sandbox step";
    } else {
      const truth: PaymentTruth = {
        lifecycle: attempt.lifecycle,
        amountMinor: Number(attempt.amount_minor),
        refundState: attempt.refund_state,
        refundedAmountMinor: Number(attempt.refunded_amount_minor),
        disputeState: attempt.dispute_state,
        disputeProviderStatus: attempt.dispute_provider_status,
      };
      const t = transitionFor(truth, ev);
      if (t.kind === "apply") {
        patch = patchToRow(t.patch);
        note = t.note;
      } else {
        note = t.reason;
      }
      expected = attempt.lifecycle;
    }
  } else {
    note = "no payment attempt matched";
  }

  /* 5 · one atomic write */
  const { data: result, error } = await db.rpc("stripe_apply_event", {
    p_event: {
      event_id: ev.eventId,
      stripe_account_id: ev.account,
      event_type: ev.type,
      livemode: ev.livemode,
      object_type: ev.objectType,
      object_id: ev.objectId,
      provider_created_at: new Date(ev.created * 1000).toISOString(),
      note,
      payload: event,
    },
    p_attempt_id: attempt?.id ?? null,
    p_expected_lifecycle: expected,
    p_patch: patch,
  });

  if (error) {
    console.error(`[stripe:webhook] record failed event=${ev.eventId} type=${ev.type}:`, error.message);
    return NextResponse.json({ error: "record_failed" }, { status: 500 });
  }

  const outcome = (result as { result?: string } | null)?.result ?? "unknown";
  console.log(
    `[stripe:webhook] event=${ev.eventId} type=${ev.type} account=${ev.account ?? "platform"} attempt=${attempt?.id ?? "-"} txn=${attempt?.transaction_id ?? "-"} result=${outcome}${note ? ` note=${note}` : ""}`
  );
  return NextResponse.json({ received: true, result: outcome });
}
