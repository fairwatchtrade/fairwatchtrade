import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ────────────────────────────────────────────────────────────────────────
   PURCHASE REQUEST STATUS — PATCH /api/purchase-requests/[id]  (v2.5)

   Seller accepts or declines a pending purchase request. Server verifies the
   authenticated user IS the seller_id on THIS request before allowing the
   status change — never trusts a client-supplied seller identity, same
   principle as the POST route.

   On accept: inserts a `pending` row into `transactions` (rail: null — rail
   selection is a separate future flight). final_purchase_price is set to the
   request's proposed_purchase_price — this bundle has no counter-offer step,
   so acceptance means accepting the proposed number as-is. No payment
   processing happens here; zero dollars move.

   v2.5 — TWO FIXES, both discovered during Purchase Request Phase 1
   verification, neither a route-logic change to the accept/decline path
   itself:

   1. RLS. purchase_requests and transactions both had row-level security
      ENABLED with ZERO policies since creation — meaning this route's own
      SELECT above would have returned nothing for a real seller (silent
      404 "not_found" on every real accept/decline attempt) and the INSERT
      below would have been rejected outright for a real buyer's original
      POST. Fixed via an additive migration (5 policies, buyer/seller-owns-
      own-row, matching this route's own existing identity checks) — no
      route code changed by that fix; this route was already written
      assuming exactly this database-level permission existed.

   2. UNCHECKED TRANSACTION INSERT (fixed here). The transactions insert on
      accept was previously fire-and-forget — its error was never read. Under
      the RLS gap above, it would have failed on every accept, silently: the
      seller sees "accepted," the buyer sees "accepted," and no transaction
      record exists anywhere. Now the insert's result is checked; a failure
      is logged server-side and surfaced to the caller via
      `transactionCreated: false` rather than swallowed. The status update
      itself is NOT rolled back on a transaction-insert failure — an
      automatic rollback would need its own compensating-write correctness
      guarantees (a real transactional RPC, which is schema/migration work,
      not in scope here). Surfacing the failure so a human can reconcile is
      the honest fix for this flight; true atomicity is a future flight if
      this ever actually fires in practice.
   ──────────────────────────────────────────────────────────────────────── */

type PatchBody = {
  status?: "accepted" | "declined";
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (body.status !== "accepted" && body.status !== "declined") {
    return NextResponse.json(
      { error: "invalid_status", detail: "status must be 'accepted' or 'declined'." },
      { status: 400 }
    );
  }

  const { data: request, error: fetchError } = await supabase
    .from("purchase_requests")
    .select("id, listing_id, buyer_id, seller_id, proposed_purchase_price, status")
    .eq("id", id)
    .single();

  if (fetchError || !request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Only the seller on THIS request can accept/decline it.
  if (request.seller_id !== user.id) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  if (request.status !== "pending") {
    return NextResponse.json(
      { error: "already_resolved", detail: `This request is already ${request.status}.` },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabase
    .from("purchase_requests")
    .update({ status: body.status })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // v2.5: checked, not fire-and-forget. A failure here previously vanished
  // silently — the request showed "accepted" while no transaction row ever
  // existed. Now logged loudly and surfaced via transactionCreated: false.
  let transactionCreated = true;
  if (body.status === "accepted") {
    const { error: txError } = await supabase.from("transactions").insert({
      purchase_request_id: request.id,
      listing_id: request.listing_id,
      buyer_id: request.buyer_id,
      seller_id: request.seller_id,
      final_purchase_price: request.proposed_purchase_price,
      rail: null,
      status: "pending",
    });
    if (txError) {
      console.error(
        `[purchase-requests] transaction insert failed after accept (request ${request.id}):`,
        txError.message
      );
      transactionCreated = false;
    }
  }

  return NextResponse.json({ status: body.status, transactionCreated });
}
