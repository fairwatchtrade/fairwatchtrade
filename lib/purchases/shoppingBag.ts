import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { Lifecycle, PaymentTruth } from "@/lib/payments/paymentState";
import { publiclyDisplayablePhotos } from "@/lib/servicePhotoPrivacy";
import { bagDecisionFor, bagHeaderTruthFor, type BagHeaderTruth, type BagMemberState } from "@/lib/purchases/bagMembership";

/* ════════════════════════════════════════════════════════════════════════
   SHOPPING BAG RESOLVER — composition over authoritative truth, server-only
   (Accepted Purchase Continuity + Shopping Bag, 2026-09-11)

   One function, `resolveShoppingBag(buyerId)`, is the ONLY way a Shopping
   Bag comes into existence anywhere in FairWatchTrade: the header entrance,
   the Bag room, the Listing Detail doorway, the My Offers continuation and
   the Stripe return all ask it. There is no bag table to read instead.

   What it reads, and who owns each fact:
     transactions ................ accepted ownership, status, accepted
                                   amount + currency snapshot, watch identity
                                   snapshot (owned by accept_purchase_request)
     stripe_payment_attempts ..... the active attempt's three truth axes
                                   (owned by stripe_apply_event, webhook-fed)
     purchase_requests ........... the buyer's original note and the asking
                                   price/currency snapshot AT REQUEST TIME
     listings .................... current imagery and the public listing code
                                   (enhancement only; identity comes from the
                                   transaction snapshot so a later edit never
                                   rewrites the accepted deal)
     public_seller_profiles ...... the seller's display name, the same public
                                   view every buyer surface uses
     dealer_profiles ............. the seller's canonical slug, when a dealer

   Service role, deliberately: no client role may read stripe_payment_attempts
   (S1-C1), and the buyer's own rows are re-scoped here by buyer_id = the
   session-proven caller the route hands in. Nothing in the payload is a
   provider identifier — the same allowlist payment-state keeps.

   COULD-NOT-LOOK IS NOT NOTHING-FOUND: every read checks its error, and a
   failure anywhere returns { ok: false }. The header renders that as an
   unavailable Bag, never as no Bag (§7 of the order). `members: []` is
   returned ONLY after every read succeeded.
   ════════════════════════════════════════════════════════════════════════ */

export type BagMember = {
  transactionId: string;
  purchaseRequestId: string | null;
  listingId: string | null;
  state: BagMemberState;
  canPay: boolean;
  acceptedAt: string | null;
  /* the watch — transaction snapshot first, live listing only for what the
     snapshot never carried (image, public code) */
  brand: string | null;
  model: string | null;
  reference: string | null;
  publicCode: string | null;
  imageUrl: string | null;
  listingAvailableToBuyer: boolean;
  /* the seller, by the existing public identity convention */
  sellerId: string | null;
  sellerName: string;
  sellerHref: string | null;
  /* commercial truth — owned elsewhere, composed here */
  acceptedAmount: string | number;
  acceptedCurrency: string | null;
  askingAmount: string | number | null;
  askingCurrency: string | null;
  note: string | null;
  transactionStatus: string | null;
  payment: {
    lifecycle: Lifecycle;
    refundState: PaymentTruth["refundState"];
    refundedAmountMinor: number;
    disputeState: PaymentTruth["disputeState"];
    checkoutExpiresAt: string | null;
    updatedAt: string;
  } | null;
};

export type BagRead =
  | { ok: true; members: BagMember[]; /** transactions of this buyer that are NOT in the Bag (paid / post-payment) */ exited: string[] }
  | { ok: false; reason: string };

type TxnRow = {
  id: string;
  purchase_request_id: string | null;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  status: string | null;
  final_purchase_price: string | number;
  final_purchase_currency: string | null;
  listing_brand: string | null;
  listing_model: string | null;
  listing_reference: string | null;
  created_at: string | null;
};

/** The only attempt columns the resolver selects. No provider identifiers. */
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

type PhotoRow = { category?: string | null; photo?: { url?: string | null } | null };

function heroFrom(photos: unknown): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const visible = publiclyDisplayablePhotos(photos as PhotoRow[]);
  if (visible.length === 0) return null;
  const dial = visible.find((p) => p?.category === "Dial");
  return (dial ?? visible[0])?.photo?.url ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the buyer's Shopping Bag from authoritative truth.
 * `buyerId` must be the session-proven caller; this function does not
 * authenticate. `only` narrows to one transaction (Stripe return, deep link).
 */
export async function resolveShoppingBag(
  buyerId: string,
  options: { only?: string | null; db?: SupabaseClient } = {}
): Promise<BagRead> {
  if (!UUID.test(buyerId)) return { ok: false, reason: "bad_buyer" };
  if (options.only && !UUID.test(options.only)) return { ok: false, reason: "bad_transaction" };

  let db: SupabaseClient;
  try {
    db = options.db ?? createServiceClient();
  } catch (e) {
    console.error("[shopping-bag] service client unavailable:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "service_unavailable" };
  }

  /* 1 · the buyer's transactions — accepted ownership */
  let q = db
    .from("transactions")
    .select(
      "id, purchase_request_id, listing_id, buyer_id, seller_id, status, final_purchase_price, final_purchase_currency, listing_brand, listing_model, listing_reference, created_at"
    )
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });
  if (options.only) q = q.eq("id", options.only);
  const { data: txnRows, error: txnErr } = await q;
  if (txnErr) {
    console.error("[shopping-bag] transaction read failed:", txnErr.message);
    return { ok: false, reason: "transaction_read_failed" };
  }
  const txns = (txnRows ?? []) as TxnRow[];
  if (txns.length === 0) return { ok: true, members: [], exited: [] };

  const txnIds = txns.map((t) => t.id);
  const requestIds = txns.map((t) => t.purchase_request_id).filter((x): x is string => !!x);
  const listingIds = [...new Set(txns.map((t) => t.listing_id).filter((x): x is string => !!x))];
  const sellerIds = [...new Set(txns.map((t) => t.seller_id).filter((x): x is string => !!x))];

  /* 2 · the active provider attempt per transaction (webhook-written truth) */
  const { data: attRows, error: attErr } = await db
    .from("stripe_payment_attempts")
    .select(SAFE_ATTEMPT_COLUMNS)
    .in("transaction_id", txnIds)
    .eq("is_active", true);
  if (attErr) {
    console.error("[shopping-bag] attempt read failed:", attErr.message);
    return { ok: false, reason: "payment_read_failed" };
  }
  const attemptByTxn = new Map(((attRows ?? []) as SafeAttemptRow[]).map((a) => [a.transaction_id, a]));

  /* 3 · the request snapshot: note + asking context at request time */
  const requestById = new Map<string, { notes: string | null; listing_price: string | number | null; listing_currency: string | null }>();
  if (requestIds.length > 0) {
    const { data: prRows, error: prErr } = await db
      .from("purchase_requests")
      .select("id, notes, listing_price, listing_currency")
      .in("id", requestIds);
    if (prErr) {
      console.error("[shopping-bag] request read failed:", prErr.message);
      return { ok: false, reason: "request_read_failed" };
    }
    for (const r of (prRows ?? []) as { id: string; notes: string | null; listing_price: string | number | null; listing_currency: string | null }[]) {
      requestById.set(r.id, r);
    }
  }

  /* 4 · the live listing: imagery and public code only (enhancement) */
  const listingById = new Map<string, { public_code: string | null; photos: unknown; seller_id: string | null }>();
  if (listingIds.length > 0) {
    const { data: lRows, error: lErr } = await db.from("listings").select("id, public_code, photos, seller_id").in("id", listingIds);
    if (lErr) {
      console.error("[shopping-bag] listing read failed:", lErr.message);
      return { ok: false, reason: "listing_read_failed" };
    }
    for (const l of (lRows ?? []) as { id: string; public_code: string | null; photos: unknown; seller_id: string | null }[]) listingById.set(l.id, l);
  }

  /* 5 · the seller: public display name + canonical dealer slug */
  const sellerName = new Map<string, string>();
  const sellerSlug = new Map<string, string>();
  if (sellerIds.length > 0) {
    const [{ data: profs, error: pErr }, { data: dealers, error: dErr }] = await Promise.all([
      db.from("public_seller_profiles").select("id, display_name").in("id", sellerIds),
      db.from("dealer_profiles").select("seller_id, slug").in("seller_id", sellerIds),
    ]);
    if (pErr) {
      console.error("[shopping-bag] seller profile read failed:", pErr.message);
      return { ok: false, reason: "seller_read_failed" };
    }
    if (dErr) {
      console.error("[shopping-bag] dealer profile read failed:", dErr.message);
      return { ok: false, reason: "seller_read_failed" };
    }
    for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
      const n = p.display_name?.trim();
      if (n) sellerName.set(p.id, n);
    }
    for (const d of (dealers ?? []) as { seller_id: string; slug: string | null }[]) if (d.slug) sellerSlug.set(d.seller_id, d.slug);
  }

  /* 6 · the pure decision, per transaction */
  const members: BagMember[] = [];
  const exited: string[] = [];
  for (const t of txns) {
    const a = attemptByTxn.get(t.id) ?? null;
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
    const decision = bagDecisionFor(t.status, truth);
    if (!decision.member) {
      exited.push(t.id);
      continue;
    }
    const pr = t.purchase_request_id ? requestById.get(t.purchase_request_id) ?? null : null;
    const listing = t.listing_id ? listingById.get(t.listing_id) ?? null : null;
    const sid = t.seller_id;
    members.push({
      transactionId: t.id,
      purchaseRequestId: t.purchase_request_id,
      listingId: t.listing_id,
      state: decision.state,
      canPay: decision.canPay,
      acceptedAt: t.created_at,
      brand: t.listing_brand,
      model: t.listing_model,
      reference: t.listing_reference,
      publicCode: listing?.public_code ?? null,
      imageUrl: listing ? heroFrom(listing.photos) : null,
      listingAvailableToBuyer: !!listing,
      sellerId: sid,
      sellerName: (sid && sellerName.get(sid)) || "FairWatchTrade Seller",
      sellerHref: sid ? `/sellers/${sellerSlug.get(sid) || sid}` : null,
      acceptedAmount: t.final_purchase_price,
      acceptedCurrency: t.final_purchase_currency,
      askingAmount: pr?.listing_price ?? null,
      askingCurrency: pr?.listing_currency ?? null,
      note: pr?.notes?.trim() ? pr.notes.trim() : null,
      transactionStatus: t.status,
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
    });
  }
  return { ok: true, members, exited };
}

/** The header's truth for this buyer: none / members(count) / unavailable. */
export async function resolveBagHeaderTruth(buyerId: string): Promise<BagHeaderTruth> {
  const read = await resolveShoppingBag(buyerId);
  return bagHeaderTruthFor(read.ok ? { ok: true, memberCount: read.members.length } : { ok: false });
}

/** Whether ONE transaction of this buyer is a current Bag member. `null`
    means the answer could not be established (never "not a member"). */
export async function isBagMember(buyerId: string, transactionId: string): Promise<boolean | null> {
  const read = await resolveShoppingBag(buyerId, { only: transactionId });
  if (!read.ok) return null;
  return read.members.some((m) => m.transactionId === transactionId);
}
