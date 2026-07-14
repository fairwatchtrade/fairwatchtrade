import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings/[id]/submit-for-review — Dealer Accelerator Flight 2A

   The seller/dealer's own submission action. Moves exactly ONE transition:

       draft → pending_review

   and nothing else. This is deliberately NOT a general status-change
   endpoint. Admin adjudication (pending_review → published | rejected) lives
   in app/api/admin/listings/[id]/status/route.ts, is founder-gated, and is
   untouched by this route. Dealer submission and admin adjudication are
   separate lifecycle actions, with different actors and different
   permissions — they do not share a route, and neither weakens the other.

   ── WHY THE SESSION CLIENT, NOT THE TRUSTED CLIENT ─────────────────────
   Flight 1's import route needed the service-role client because it creates
   rows owned by a DIFFERENT profile, which listings_insert_own structurally
   forbids. This route does the opposite: the actor IS the owner. Verified
   against the live policy — listings_update_own is
   USING (auth.uid() = seller_id) with no separate WITH CHECK, so Postgres
   reuses that expression for the new row too. That means RLS already:
     · permits an owner to update their own listing, and
     · forbids reassigning seller_id away from themselves.
   So the ordinary session client is sufficient, and is therefore correct —
   reaching for the RLS-bypassing client where the ordinary one does the job
   would hand this route more authority than its purpose requires.

   The explicit ownership + status checks below are defense in depth, matching
   the project's standing "never rely on implicit scoping alone" convention.
   RLS is the wall; these checks are the lock on the door.

   ── RACE SAFETY ────────────────────────────────────────────────────────
   The UPDATE carries .eq("status", "draft") as a compare-and-set guard. If
   the row stopped being a draft between the read and the write (a second tab,
   or an admin acting concurrently), zero rows match and the route reports the
   conflict honestly rather than reporting a success that didn't happen.

   ── NO NOTIFICATION SIDE EFFECT ────────────────────────────────────────
   Verified against the live trigger: on_listing_published fires
   AFTER INSERT OR UPDATE OF status, but notify_on_listing_publish() acts only
   `if NEW.status = 'published'`. A draft → pending_review transition
   therefore notifies no one. Submission stays silent, exactly as intended.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
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

  // Read the current row. RLS (listings_select_public_or_own) already lets an
  // owner read their own non-published listing, so a draft is visible here to
  // its owner and to nobody else who isn't the founder or the public.
  const { data: listing, error: readErr } = await supabase
    .from("listings")
    .select("id, seller_id, status")
    .eq("id", id)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json(
      { error: "read_failed", detail: readErr.message },
      { status: 500 }
    );
  }
  if (!listing) {
    return NextResponse.json(
      { error: "not_found", detail: `No listing with id ${id}.` },
      { status: 404 }
    );
  }

  // Defense in depth — RLS enforces this on the UPDATE regardless, but an
  // explicit check gives an honest 403 instead of a silent zero-row update.
  if (listing.seller_id !== user.id) {
    return NextResponse.json(
      { error: "forbidden", detail: "This listing isn't yours." },
      { status: 403 }
    );
  }

  // The single permitted transition. Anything else is a conflict, reported
  // with the actual current status so the caller can say something true.
  if (listing.status !== "draft") {
    return NextResponse.json(
      {
        error: "invalid_transition",
        detail: `Only a draft can be submitted for review. This listing is ${listing.status}.`,
        status: listing.status,
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("listings")
    .update({ status: "pending_review" })
    .eq("id", id)
    .eq("status", "draft") // compare-and-set: only transition if still a draft
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "update_failed", detail: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    // Zero rows matched: the row stopped being a draft between read and write.
    // Never report a success that didn't happen.
    return NextResponse.json(
      {
        error: "conflict",
        detail: "This listing changed while you were submitting it. Refresh and try again.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status }, { status: 200 });
}
