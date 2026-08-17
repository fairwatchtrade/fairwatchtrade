import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings/[id]/remove — the seller takes a watch off the market

   A thin wrapper over public.remove_listing(), following the same shape as
   submit-for-review: the function owns the transition, this route owns the
   translation of its refusals into sentences a seller can act on.

   TWO CALLS, AND THE ORDER IS THE POINT

     1. remove_listing()                     — persists truth, rings nothing
     2. emit_listing_removal_notifications() — reads what committed, rings

   They are separate so that a notification problem can never roll back a
   removal. Once step 1 returns, the watch IS off the market and the buyers'
   requests ARE closed with their cause recorded; step 2 is a derived read
   that can be repeated safely by anyone, at any later time, without double-
   ringing — its exactly-once identity is a unique key on committed event
   rows, not anything this route holds in memory.

   So a failure in step 2 is reported, never escalated. The seller's action
   succeeded; the bells can be re-derived. Returning 500 here would tell the
   seller their removal failed when it did not, and would invite a retry that
   the RPC would correctly refuse with already_removed.

   ⚠ THE RESPONSE DELIBERATELY DOES NOT DRIVE NOTIFICATIONS. closed_requests
   is returned for the confirmation copy and for observability only. Nothing
   about correct bell behaviour depends on this route receiving it.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

/* The five the CHECK constraint and the RPC both accept. Validated here so an
   obvious mistake reads as a sentence instead of a raised exception, and
   validated there so no other caller can walk around it. */
const REASON_CODES = [
  "sold_in_store",
  "sold_elsewhere",
  "no_longer_for_sale",
  "listing_mistake",
  "other",
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing listing id." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated", detail: "Sign in required." },
      { status: 401 }
    );
  }

  let reasonCode = "";
  let reasonNote: string | null = null;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") {
      const b = body as { reasonCode?: unknown; reasonNote?: unknown };
      if (typeof b.reasonCode === "string") reasonCode = b.reasonCode.trim();
      if (typeof b.reasonNote === "string") {
        const note = b.reasonNote.trim();
        reasonNote = note === "" ? null : note.slice(0, 320);
      }
    }
  } catch {
    /* falls through to the reason check below */
  }

  if (!(REASON_CODES as readonly string[]).includes(reasonCode)) {
    return NextResponse.json(
      { error: "invalid_reason_code", detail: "Choose why you're removing this listing." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("remove_listing", {
    p_listing_id: id,
    p_reason_code: reasonCode,
    p_reason_note: reasonNote,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("not_authenticated")) {
      return NextResponse.json(
        { error: "not_authenticated", detail: "Sign in required." },
        { status: 401 }
      );
    }
    if (msg.includes("not_found")) {
      return NextResponse.json(
        { error: "not_found", detail: `No listing with id ${id}.` },
        { status: 404 }
      );
    }
    if (msg.includes("not_allowed")) {
      return NextResponse.json(
        { error: "forbidden", detail: "This listing isn't yours." },
        { status: 403 }
      );
    }
    if (msg.includes("already_removed")) {
      return NextResponse.json(
        {
          error: "already_removed",
          detail: "This listing is already off the market.",
        },
        { status: 409 }
      );
    }
    if (msg.includes("not_removable")) {
      const current = msg.split("not_removable:")[1]?.trim() || "unknown";
      const detail =
        current === "draft"
          ? "A draft was never published, so there's nothing to remove it from."
          : current === "removed"
            ? "This listing is already off the market."
            : `Only a listing that's on the market can be removed. This one is ${current}.`;
      return NextResponse.json(
        { error: "not_removable", detail, status: current },
        { status: 409 }
      );
    }
    if (msg.includes("invalid_reason_code")) {
      return NextResponse.json(
        { error: "invalid_reason_code", detail: "Choose why you're removing this listing." },
        { status: 400 }
      );
    }
    console.error("[remove] remove_listing failed:", msg);
    return NextResponse.json(
      { error: "remove_failed", detail: "Could not remove this listing." },
      { status: 500 }
    );
  }

  /* Truth is committed from here down. Nothing below may turn this into a
     failure response. */
  let notificationsEmitted: number | null = null;
  try {
    const { data: emitted, error: emitError } = await supabase.rpc(
      "emit_listing_removal_notifications",
      { p_listing_id: id }
    );
    if (emitError) {
      console.error("[remove] notification emission deferred:", emitError.message);
    } else {
      notificationsEmitted =
        (emitted as { notifications_emitted?: number } | null)?.notifications_emitted ?? 0;
    }
  } catch (e) {
    console.error("[remove] notification emission threw:", e);
  }

  return NextResponse.json(
    {
      ok: true,
      ...((data as object) ?? {}),
      notifications_emitted: notificationsEmitted,
    },
    { status: 200 }
  );
}
