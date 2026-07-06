import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ────────────────────────────────────────────────────────────────────────
   PURCHASE REQUEST STATUS — PATCH /api/purchase-requests/[id]  (v2.4a)

   Seller accepts or declines a pending purchase request. Server verifies the
   authenticated user IS the seller_id on THIS request before allowing the
   status change — never trusts a client-supplied seller identity, same
   principle as the POST route.

   On accept: inserts a `pending` row into `transactions` (rail: null — rail
   selection is a separate future flight). final_purchase_price is set to the
   request's proposed_purchase_price — this bundle has no counter-offer step,
   so acceptance means accepting the proposed number as-is. No payment
   processing happens here; zero dollars move.

   This is the API half of Surface 5 only. The AccountDashboard.tsx UI that
   calls this endpoint is still blocked pending the fresh file from disk —
   this route doesn't depend on that file at all, so it's shipped now.
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

  if (body.status === "accepted") {
    await supabase.from("transactions").insert({
      purchase_request_id: request.id,
      listing_id: request.listing_id,
      buyer_id: request.buyer_id,
      seller_id: request.seller_id,
      final_purchase_price: request.proposed_purchase_price,
      rail: null,
      status: "pending",
    });
  }

  return NextResponse.json({ status: body.status });
}
