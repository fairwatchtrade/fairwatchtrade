import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canStartCheckout, type Lifecycle, type PaymentTruth } from "@/lib/payments/paymentState";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/stripe/payment-state — the buyer's own accepted purchases and
   the public-safe payment truth about each (Stripe Step 1 of 4, 2026-09-10;
   correction S1-C1)

   Two clients, deliberately:
     · the SESSION client identifies the caller and reads their transactions
       under RLS — FairWatchTrade's own commercial rows, already theirs;
     · the SERVICE client reads the provider payment record, because no
       client role may read stripe_payment_attempts at all (S1-C1). The
       route then returns an ALLOWLIST: lifecycle, refund state, dispute
       state, expiry, timestamp. checkout_url, the connected account id,
       PaymentIntent / Charge ids, the idempotency key and raw provider
       status never leave the server.

   `?transactionId=` narrows to one purchase (the return-from-Stripe
   anchor). Without it, every purchase this account is the buyer of.

   Nothing here is a payment authority. `canPay` is a courtesy computed from
   the same rule the checkout route enforces; the checkout route re-checks.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYABLE_TRANSACTION_STATUSES = new Set(["pending", "payment_pending"]);

type TxnRow = {
  id: string;
  status: string | null;
  final_purchase_price: string | number;
  final_purchase_currency: string | null;
  listing_id: string | null;
  listing_brand: string | null;
  listing_model: string | null;
  listing_reference: string | null;
  created_at: string | null;
};

/** The only attempt columns this route ever selects. Provider-operational
    identifiers are not in this list on purpose. */
const SAFE_ATTEMPT_COLUMNS =
  "transaction_id, lifecycle, amount_minor, refund_state, refunded_amount_minor, dispute_state, checkout_expires_at, updated_at";

type SafeAttemptRow = {
  transaction_id: string;
  lifecycle: Lifecycle;
  amount_minor: number;
  refund_state: PaymentTruth["refundState"];
  refunded_amount_minor: number;
  dispute_state: PaymentTruth["disputeState"];
  checkout_expires_at: string | null;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const only = request.nextUrl.searchParams.get("transactionId");
  if (only && !UUID.test(only)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let q = session
    .from("transactions")
    .select("id, status, final_purchase_price, final_purchase_currency, listing_id, listing_brand, listing_model, listing_reference, created_at")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });
  if (only) q = q.eq("id", only);
  const { data: txns, error } = await q;
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 500 });

  const rows = (txns ?? []) as TxnRow[];
  const ids = rows.map((t) => t.id);

  /* Server-only read of the provider record, scoped to the transactions the
     session client just proved are this buyer's. */
  const attempts: SafeAttemptRow[] = [];
  if (ids.length > 0) {
    const db = createServiceClient();
    const { data: atts } = await db
      .from("stripe_payment_attempts")
      .select(SAFE_ATTEMPT_COLUMNS)
      .in("transaction_id", ids)
      .eq("is_active", true);
    for (const a of (atts ?? []) as SafeAttemptRow[]) attempts.push(a);
  }
  const byTxn = new Map(attempts.map((a) => [a.transaction_id, a]));

  const purchases = rows.map((t) => {
    const a = byTxn.get(t.id) ?? null;
    const truth: PaymentTruth | null = a
      ? {
          lifecycle: a.lifecycle,
          amountMinor: Number(a.amount_minor),
          refundState: a.refund_state,
          refundedAmountMinor: Number(a.refunded_amount_minor),
          disputeState: a.dispute_state,
          disputeProviderStatus: null,
        }
      : null;
    const canPay =
      PAYABLE_TRANSACTION_STATUSES.has(t.status ?? "") && !!t.final_purchase_currency && canStartCheckout(truth);
    return {
      transactionId: t.id,
      transactionStatus: t.status,
      listingId: t.listing_id,
      brand: t.listing_brand,
      model: t.listing_model,
      reference: t.listing_reference,
      amount: t.final_purchase_price,
      currency: t.final_purchase_currency,
      acceptedAt: t.created_at,
      payment: a
        ? {
            lifecycle: a.lifecycle,
            refundState: a.refund_state,
            refundedAmountMinor: Number(a.refunded_amount_minor),
            disputeState: a.dispute_state,
            checkoutExpiresAt: a.checkout_expires_at,
            updatedAt: a.updated_at,
          }
        : null,
      canPay,
    };
  });

  return NextResponse.json({ ok: true, purchases });
}
