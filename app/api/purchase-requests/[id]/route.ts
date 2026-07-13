import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ────────────────────────────────────────────────────────────────────────
   PURCHASE REQUEST STATUS — PATCH /api/purchase-requests/[id]  (v2.6)

   THIS is the current, correct version — verified against the live
   Flight B migration (superseded status + accept_purchase_request()
   function + partial unique index) applied earlier tonight. If an older
   v2.4 or v2.5 copy of this file is found anywhere else in the repo
   (including, notably, sitting in the FLAT app/api/purchase-requests/
   folder where it does not belong), it is stale — this is the one to keep.

   Accept goes through accept_purchase_request(), a single atomic Postgres
   function (SECURITY INVOKER — RLS stays fully enforced during its
   execution as a second layer beneath its own explicit checks). That
   function, in one transaction:
     · locks every purchase_request row for the listing (via FOR UPDATE)
       so two concurrent accept attempts on different pending offers for
       the same listing serialize rather than race
     · verifies caller = seller, request still pending, no sibling already
       accepted
     · marks the target request 'accepted'
     · marks every sibling still-pending request 'superseded' — NOT
       'declined'. Locked distinction: 'declined' implies the seller
       evaluated and rejected that specific offer; 'superseded' means it
       lost only because a different offer was accepted.
     · inserts exactly one transactions row
   The partial unique index (one accepted request per listing) is the
   final, unbypassable backstop even if this function had a bug.

   Decline remains exactly what it was — an individual, single-row
   transition. No transaction, no effect on sibling offers, listing stays
   available, and the buyer may submit again (the flat route's exclusivity
   rule only blocks a second PENDING request, not a resubmission after
   decline/supersession).
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

  /* ── ACCEPT — single RPC call, all-or-nothing ───────────────────── */
  if (body.status === "accepted") {
    const { data, error } = await supabase.rpc("accept_purchase_request", {
      p_request_id: id,
    });

    if (error) {
      const msg = error.message || "";
      if (msg.includes("not_found")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (msg.includes("not_allowed")) {
        return NextResponse.json({ error: "not_allowed" }, { status: 403 });
      }
      if (msg.includes("already_resolved")) {
        return NextResponse.json(
          { error: "already_resolved", detail: msg },
          { status: 409 }
        );
      }
      if (msg.includes("listing_already_accepted")) {
        return NextResponse.json(
          {
            error: "listing_already_accepted",
            detail: "Another offer on this listing was already accepted.",
          },
          { status: 409 }
        );
      }
      console.error("[purchase-requests] accept_purchase_request failed:", msg);
      return NextResponse.json({ error: "accept_failed" }, { status: 500 });
    }

    return NextResponse.json({ status: "accepted", result: data });
  }

  /* ── DECLINE — unchanged individual transition, stamps updated_at so
        "resolved offers, newest resolution first" has a real timestamp
        to sort on ── */
  const { data: request, error: fetchError } = await supabase
    .from("purchase_requests")
    .select("id, seller_id, status")
    .eq("id", id)
    .single();

  if (fetchError || !request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

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
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "declined" });
}
