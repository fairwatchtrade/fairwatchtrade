import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canStartCheckout, type Lifecycle, type PaymentTruth } from "@/lib/payments/paymentState";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/stripe/payment-state — the buyer's own accepted purchases and
   what Stripe has confirmed about each (Stripe Step 1 of 4, 2026-09-10)

   Read-only, on the SESSION client, so RLS decides what this account may
   see: its own transactions and the payment attempts hanging off them. The
   route composes; it never re-derives payment truth from anything the
   browser said, and it never reads the provider.

   `?transactionId=` narrows to one purchase (the return-from-Stripe anchor).
   Without it, every purchase this account is the buyer of, newest first.

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

type AttemptRow = {
  id: string;
  transaction_id: string;
  lifecycle: Lifecycle;
  amount_minor: number;
  currency: string;
  refund_state: PaymentTruth["refundState"];
  refunded_amount_minor: number;
  dispute_state: PaymentTruth["disputeState"];
  dispute_provider_status: string | null;
  checkout_expires_at: string | null;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const only = request.nextUrl.searchParams.get("transactionId");
  if (only && !UUID.test(only)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let q = supabase
    .from("transactions")
    .select("id, status, final_purchase_price, final_purchase_currency, listing_id, listing_brand, listing_model, listing_reference, created_at")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });
  if (only) q = q.eq("id", only);
  const { data: txns, error } = await q;
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 500 });

  const rows = (txns ?? []) as TxnRow[];
  const ids = rows.map((t) => t.id);
  const attempts: AttemptRow[] = [];
  if (ids.length > 0) {
    const { data: atts } = await supabase
      .from("stripe_payment_attempts")
      .select("id, transaction_id, lifecycle, amount_minor, currency, refund_state, refunded_amount_minor, dispute_state, dispute_provider_status, checkout_expires_at, updated_at")
      .in("transaction_id", ids)
      .eq("is_active", true);
    for (const a of (atts ?? []) as AttemptRow[]) attempts.push(a);
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
          disputeProviderStatus: a.dispute_provider_status,
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
            attemptId: a.id,
            lifecycle: a.lifecycle,
            refundState: a.refund_state,
            refundedAmountMinor: Number(a.refunded_amount_minor),
            disputeState: a.dispute_state,
            disputeProviderStatus: a.dispute_provider_status,
            checkoutExpiresAt: a.checkout_expires_at,
            updatedAt: a.updated_at,
          }
        : null,
      canPay,
    };
  });

  return NextResponse.json({ ok: true, purchases });
}
