import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings/[id]/submit-for-review — Dealer Accelerator Flight 2B

   v2.21: this route is now a THIN WRAPPER over the canonical Postgres
   function public.submit_listing_for_review() (SECURITY DEFINER, locked
   search_path, EXECUTE granted to authenticated only). The function owns
   the entire transition in ONE atomic transaction:

     · caller must be authenticated and own the listing
     · draft → pending_review AND rejected → pending_review (resubmission)
     · origin determined INTERNALLY from trusted listing_media provenance
       (capture_source = 'dealer_import' — unforgeable by client sessions)
     · IMPORTED listings only: details.availability must be 'In Stock',
       and the 13-field length-prefixed commercial-truth fingerprint is
       computed and stamped (dealer_attested_at/by/fingerprint) atomically
       with the transition
     · ordinary manual drafts pass through with NO provenance requirement,
       NO availability gate, NO attestation — they no longer receive any
       'not_imported' rejection
     · rejection_reason is cleared on resubmission for BOTH origins
     · FOR UPDATE row lock replaces the old read-then-compare-and-set —
       strictly stronger race safety than the v2.8 wrapper this replaces

   WHY DEFINER, NOT THE SESSION CLIENT: the v2.21 column-grant audit
   removed dealer UPDATE access to status and the attestation columns, so
   no client-session write can perform this transition at all. The DEFINER
   function is the only door, and it carries its own explicit checks.

   Error mapping mirrors app/api/purchase-requests/[id]/route.ts — the
   repo's established RPC-wrapper pattern.

   NO NOTIFICATION SIDE EFFECT — unchanged: notify_on_listing_publish()
   acts only when NEW.status = 'published'. Submission stays silent.

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

  const { data, error } = await supabase.rpc("submit_listing_for_review", {
    p_listing_id: id,
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
    if (msg.includes("invalid_transition")) {
      const current = msg.split("invalid_transition:")[1]?.trim() || "unknown";
      return NextResponse.json(
        {
          error: "invalid_transition",
          detail: `Only a draft or returned listing can be submitted for review. This listing is ${current}.`,
          status: current,
        },
        { status: 409 }
      );
    }
    if (msg.includes("not_available_for_submission")) {
      return NextResponse.json(
        {
          error: "not_available_for_submission",
          detail:
            "Availability must be confirmed as In Stock before an imported listing can be submitted.",
        },
        { status: 409 }
      );
    }
    console.error("[submit-for-review] submit_listing_for_review failed:", msg);
    return NextResponse.json(
      { error: "submit_failed", detail: "Could not submit this listing for review." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ...((data as object) ?? {}) }, { status: 200 });
}
