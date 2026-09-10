import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getSandboxConnectedAccount, PAYMENT_ENVIRONMENT } from "@/lib/payments/stripe/client";
import {
  buildCheckoutParams,
  checkoutIdempotencyKey,
  checkoutRequestOptions,
  returnUrls,
} from "@/lib/payments/stripe/checkout";
import { toMinorUnits } from "@/lib/payments/money";
import { canStartCheckout, type Lifecycle, type PaymentTruth } from "@/lib/payments/paymentState";
import { CANONICAL_ORIGIN } from "@/lib/seo/routeMetadata";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/stripe/checkout — start (or resume) paying an accepted purchase
   (Stripe Step 1 of 4, 2026-09-10)

   The browser sends ONE thing: the FairWatchTrade transaction id. Everything
   commercial is re-read here from the transaction row the acceptance RPC
   wrote: who the buyer is, the accepted amount, the currency snapshotted
   beside it, the watch. A body that also carries an amount, a currency, a
   seller account or a "paid" flag is ignored; those fields have no authority
   and never did.

   Idempotency: one durable payment attempt per Checkout, and Stripe is asked
   with `fwt:stripe:checkout:<transaction>:<attempt>`. A double click reuses
   the still-open session; an expired or canceled one yields a NEW attempt
   while the old one stays as history, deactivated, never overwritten.

   Sandbox only, cards only, automatic capture, one controlled connected
   account. See app/api/stripe/README.md.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYABLE_TRANSACTION_STATUSES = new Set(["pending", "payment_pending"]);

type TransactionRow = {
  id: string;
  buyer_id: string | null;
  seller_id: string | null;
  status: string | null;
  final_purchase_price: string | number;
  final_purchase_currency: string | null;
  listing_brand: string | null;
  listing_model: string | null;
  listing_reference: string | null;
};

type AttemptRow = {
  id: string;
  lifecycle: Lifecycle;
  amount_minor: number;
  refund_state: PaymentTruth["refundState"];
  refunded_amount_minor: number;
  dispute_state: PaymentTruth["disputeState"];
  dispute_provider_status: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
};

const refuse = (error: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...(extra ?? {}) }, { status });

export async function POST(request: NextRequest) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return refuse("unauthenticated", 401);

  let body: { transactionId?: unknown };
  try {
    body = (await request.json()) as { transactionId?: unknown };
  } catch {
    return refuse("bad_request", 400);
  }
  const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  if (!UUID.test(transactionId)) return refuse("bad_request", 400);

  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    console.error("[stripe:checkout] provider not configured:", e instanceof Error ? e.message : e);
    return refuse("stripe_not_configured", 503);
  }

  const db = createServiceClient();

  /* 1 · fresh-read the authoritative transaction */
  const { data: txn, error: txnErr } = await db
    .from("transactions")
    .select("id, buyer_id, seller_id, status, final_purchase_price, final_purchase_currency, listing_brand, listing_model, listing_reference")
    .eq("id", transactionId)
    .maybeSingle();
  if (txnErr) {
    console.error("[stripe:checkout] transaction read failed:", txnErr.message);
    return refuse("transaction_read_failed", 500);
  }
  const transaction = txn as TransactionRow | null;
  if (!transaction) return refuse("transaction_not_found", 404);

  /* 2 · the caller must be the transaction's buyer */
  if (transaction.buyer_id !== user.id) return refuse("not_transaction_buyer", 403);

  /* 3 · the transaction must be in a state that can start Step 1 payment */
  if (!PAYABLE_TRANSACTION_STATUSES.has(transaction.status ?? "")) {
    return refuse("transaction_not_payment_eligible", 409, { transactionStatus: transaction.status });
  }

  /* 4 · currency from the transaction snapshot, never the listing; never assumed */
  const currency = transaction.final_purchase_currency;
  if (!currency) return refuse("transaction_currency_missing", 409);
  const { data: cur, error: curErr } = await db
    .from("supported_currencies")
    .select("code, exponent, active")
    .eq("code", currency)
    .maybeSingle();
  if (curErr) {
    // S1-C2: a failed lookup is not "unsupported"; it is could-not-look.
    console.error("[stripe:checkout] currency read failed:", curErr.message);
    return refuse("payment_state_unavailable", 503);
  }
  if (!cur || cur.active !== true) return refuse("currency_unsupported", 409, { currency });

  /* 5 · governed minor units */
  let amountMinor: number;
  try {
    amountMinor = toMinorUnits(transaction.final_purchase_price, Number(cur.exponent));
  } catch (e) {
    return refuse("amount_not_representable", 409, { detail: e instanceof Error ? e.message : "unknown" });
  }

  /* 6 · the controlled Step 1 connected account, from server configuration */
  const connectedAccount = getSandboxConnectedAccount();
  if (!connectedAccount) return refuse("connected_account_unavailable", 503);

  /* 7 · existing active attempt: reuse an open session, refuse a locked one,
         retire a dead one */
  const { data: activeRow, error: activeErr } = await db
    .from("stripe_payment_attempts")
    .select("id, lifecycle, amount_minor, refund_state, refunded_amount_minor, dispute_state, dispute_provider_status, checkout_url, checkout_expires_at")
    .eq("transaction_id", transaction.id)
    .eq("is_active", true)
    .maybeSingle();
  if (activeErr) {
    /* S1-C2: if FairWatchTrade cannot see whether an attempt already exists,
       it must not start another one on the assumption that none does. */
    console.error("[stripe:checkout] active attempt read failed:", activeErr.message);
    return refuse("payment_state_unavailable", 503);
  }
  const active = activeRow as AttemptRow | null;
  if (active) {
    const truth: PaymentTruth = {
      lifecycle: active.lifecycle,
      amountMinor: Number(active.amount_minor),
      refundState: active.refund_state,
      refundedAmountMinor: Number(active.refunded_amount_minor),
      disputeState: active.dispute_state,
      disputeProviderStatus: active.dispute_provider_status,
    };
    if (!canStartCheckout(truth)) return refuse("payment_locked", 409, { lifecycle: active.lifecycle });
    const stillOpen =
      active.lifecycle === "checkout_created" &&
      active.checkout_url &&
      active.checkout_expires_at &&
      new Date(active.checkout_expires_at).getTime() > Date.now() + 60_000;
    if (stillOpen) {
      console.log(`[stripe:checkout] reuse attempt=${active.id} txn=${transaction.id}`);
      return NextResponse.json({ ok: true, url: active.checkout_url, attemptId: active.id, transactionId: transaction.id, reused: true });
    }
    await db
      .from("stripe_payment_attempts")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", active.id);
  }

  /* 8 · a new durable attempt, before Stripe is asked anything */
  const attemptId = crypto.randomUUID();
  const { error: insErr } = await db.from("stripe_payment_attempts").insert({
    id: attemptId,
    transaction_id: transaction.id,
    provider: "stripe",
    environment: PAYMENT_ENVIRONMENT,
    stripe_account_id: connectedAccount,
    amount_minor: amountMinor,
    currency: cur.code,
    lifecycle: "pending",
    idempotency_key: checkoutIdempotencyKey(transaction.id, attemptId),
    is_active: true,
  });
  if (insErr) {
    console.error("[stripe:checkout] attempt insert failed:", insErr.message);
    return refuse("attempt_create_failed", 500);
  }

  /* 9 · ask Stripe, idempotently, in the connected account's context */
  const origin = CANONICAL_ORIGIN;
  const description = [transaction.listing_brand, transaction.listing_model, transaction.listing_reference ? `Ref. ${transaction.listing_reference}` : null]
    .filter(Boolean)
    .join(" ");
  const { successUrl, cancelUrl } = returnUrls(origin, transaction.id);
  const params = buildCheckoutParams({
    transactionId: transaction.id,
    attemptId,
    amountMinor,
    currency: cur.code,
    description: description || "FairWatchTrade purchase",
    successUrl,
    cancelUrl,
  });

  try {
    const sessionObj = await stripe.checkout.sessions.create(params, checkoutRequestOptions(transaction.id, attemptId, connectedAccount));
    await db
      .from("stripe_payment_attempts")
      .update({
        checkout_session_id: sessionObj.id,
        checkout_url: sessionObj.url,
        checkout_expires_at: sessionObj.expires_at ? new Date(sessionObj.expires_at * 1000).toISOString() : null,
        payment_intent_id: typeof sessionObj.payment_intent === "string" ? sessionObj.payment_intent : sessionObj.payment_intent?.id ?? null,
        lifecycle: "checkout_created",
        provider_status: sessionObj.status ?? "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attemptId);
    console.log(`[stripe:checkout] created attempt=${attemptId} txn=${transaction.id} account=${connectedAccount} session=${sessionObj.id}`);
    return NextResponse.json({ ok: true, url: sessionObj.url, attemptId, transactionId: transaction.id, reused: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(`[stripe:checkout] session create failed attempt=${attemptId}:`, msg);
    await db
      .from("stripe_payment_attempts")
      .update({ lifecycle: "failed", provider_status: "checkout_create_failed", updated_at: new Date().toISOString() })
      .eq("id", attemptId);
    return refuse("checkout_creation_failed", 502);
  }
}
