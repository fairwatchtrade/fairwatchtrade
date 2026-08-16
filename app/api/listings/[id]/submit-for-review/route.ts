import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSubmissionReceivedEmail } from "@/lib/listingDecisionEmail";

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

   THE THREE ATTESTED ACTS (this route's only new responsibility)

   An imported submission now carries a body naming the acts the dealer
   performed. This route does not judge them — it forwards them and lets the
   function refuse, because a check that lives only here could be walked
   around by any other caller. The route's job is to turn the function's
   refusal back into a sentence a dealer can act on.

   The body is OPTIONAL by design. AccountDashboard submits ordinary manual
   drafts with no body at all and must keep working exactly as before; the
   function reads the acts only on the imported path.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

/* Human names for the act keys, so a refusal reads as English rather than
   as the wire format. Order follows the function's, which is fixed. */
const ACT_LABEL: Record<string, string> = {
  photographs: "the photographs",
  price: "the asking price",
  condition: "the condition",
};

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

  /* A missing, empty, or unparseable body is not an error here — it is an
     ordinary manual submission. Only the three known keys are forwarded, and
     only when literally true, so nothing else a caller invents reaches the
     function. */
  let attestedActs: Record<string, boolean> | null = null;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") {
      const acts = (body as { attestedActs?: unknown }).attestedActs;
      if (acts && typeof acts === "object") {
        const a = acts as Record<string, unknown>;
        attestedActs = {
          photographs: a.photographs === true,
          price: a.price === true,
          condition: a.condition === true,
        };
      }
    }
  } catch {
    /* no body, or not JSON — stays null */
  }

  const { data, error } = await supabase.rpc("submit_listing_for_review", {
    p_listing_id: id,
    p_attested_acts: attestedActs,
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
    if (msg.includes("attestation_incomplete")) {
      /* The function names exactly which acts were not asserted. Two
         different situations arrive here and they deserve different
         sentences:

         · none asserted — almost always an imported draft submitted from
           the ordinary Listings tab, which has no confirmations to make.
           Naming all three would be true and useless; the useful answer is
           where to go.
         · some asserted — a real incomplete attestation. Name the ones
           still outstanding. */
      const missing = (msg.split("attestation_incomplete:")[1] ?? "")
        .trim()
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k in ACT_LABEL);

      const detail =
        missing.length === 3 || missing.length === 0
          ? "Imported listings are submitted from Imported Drafts, where you confirm the photographs, price, and condition."
          : `Confirm ${missing.map((k) => ACT_LABEL[k]).join(" and ")} before submitting.`;

      return NextResponse.json(
        { error: "attestation_incomplete", detail, missing },
        { status: 409 }
      );
    }
    console.error("[submit-for-review] submit_listing_for_review failed:", msg);
    return NextResponse.json(
      { error: "submit_failed", detail: "Could not submit this listing for review." },
      { status: 500 }
    );
  }

  /* ── Submission receipt (resubmission path) ─────────────────────────────
     The RPC transitions ONLY draft/rejected → pending_review and 409s on
     anything else, so reaching this line is proof of a real new review
     event. That is the whole idempotency mechanism — a second call on an
     already-pending listing fails the transition above and never gets here,
     while a legitimate correct-and-resubmit cycle earns its own receipt.
     No delivery marker column was needed.

     The seller is read from the row rather than the session so the address
     always belongs to the listing's owner. Non-fatal by construction. */
  const { data: listing } = await supabase
    .from("listings")
    .select("brand, model, reference, public_code")
    .eq("id", id)
    .maybeSingle();

  await sendSubmissionReceivedEmail({
    to: user.email,
    brand: listing?.brand ?? null,
    model: listing?.model ?? null,
    reference: listing?.reference ?? null,
    publicCode: listing?.public_code ?? null,
  });

  return NextResponse.json({ ok: true, ...((data as object) ?? {}) }, { status: 200 });
}
