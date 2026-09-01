/* ════════════════════════════════════════════════════════════════════════
   RESUBMIT A RETURNED LISTING — POST /api/listings/resubmit

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Sending a corrected listing back to review is just publishing again."

   It is not. Publishing INSERTS, and an insert mints a new public_code and a
   new physical_watch_id — so re-publishing a watch the founder handed back
   would put a SECOND listing on the site for an object already on it. That is
   the duplicate-listing defect this whole round trip exists to end.

   This route UPDATES the listing the seller was already given back, and sends
   that same row to review. Same public code, same physical watch, same history.

   ── THE BINDING IS DERIVED, NEVER ACCEPTED ─────────────────────────────
   The caller sends a DRAFT id, not a listing id. The listing is read from
   `listing_drafts.listing_id` server-side, through the seller's own session so
   RLS scopes the draft to its owner. A client therefore cannot name a listing
   it does not own, or nominate someone else's watch for correction — the same
   posture the canonical resolver takes when it refuses to obey the browser's
   identity claim.

   ── WHY THE WRITE IS SERVICE-ROLE ──────────────────────────────────────
   Not for convenience. The v2.21 column grant lets `authenticated` UPDATE
   eleven columns — and asking_price_raw, asking_currency, vault_reference_id
   and photo_presentation are not among them. A seller-side write would land an
   amount without its raw text or its currency, splitting the Money Truth pair
   the create route exists to keep whole, and would leave canonical identity
   pointing at reference text the seller has since changed. So the row is
   written with the trusted client AFTER this route establishes ownership
   itself, exactly as the founder transition does.

   The status transition is NOT done here. submit_listing_for_review owns it,
   runs as the seller, re-checks ownership in its own transaction and handles
   both draft → pending_review and rejected → pending_review. Then the ordinary
   triage seam runs, which is where the founder's outstanding decision stops an
   automatic republish.

   PFC274 = 62 — nothing here evaluates anything.
   ════════════════════════════════════════════════════════════════════════ */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveCanonicalForPersistence } from "@/lib/identity/canonicalReferenceResolver";
import { listingWatchColumns, resolveAskingMoney } from "@/lib/listingWriteColumns";
import { runReviewTriageForListing } from "@/lib/reviewTriageService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The only statuses a returned listing can legitimately be corrected from. */
const CORRECTABLE = ["draft", "rejected"] as const;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not read the request." },
      { status: 400 }
    );
  }

  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) {
    return NextResponse.json(
      { error: "bad_request", detail: "No draft was named." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated", detail: "Sign in to submit this listing." },
      { status: 401 }
    );
  }

  /* The seller's own session: RLS scopes listing_drafts to its owner, so a
     draft that is not theirs simply is not found. */
  const { data: draft, error: draftErr } = await supabase
    .from("listing_drafts")
    .select("id, listing_id")
    .eq("id", draftId)
    .maybeSingle();
  if (draftErr) {
    return NextResponse.json(
      { error: "read_failed", detail: draftErr.message },
      { status: 500 }
    );
  }
  if (!draft) {
    return NextResponse.json(
      { error: "not_found", detail: "That saved listing could not be found." },
      { status: 404 }
    );
  }

  const listingId = (draft.listing_id as string | null) ?? null;
  if (!listingId) {
    /* An ordinary new listing. It has no row to correct, and creating one is
       the create route's job — not something this route should quietly do. */
    return NextResponse.json(
      {
        error: "not_a_returned_listing",
        detail:
          "This saved listing is a new watch rather than one returned for changes. Publish it from Review instead.",
      },
      { status: 409 }
    );
  }

  const service = createServiceClient();

  const { data: listing, error: listingErr } = await service
    .from("listings")
    .select("id, seller_id, status")
    .eq("id", listingId)
    .maybeSingle();
  if (listingErr) {
    return NextResponse.json(
      { error: "read_failed", detail: listingErr.message },
      { status: 500 }
    );
  }
  if (!listing) {
    return NextResponse.json(
      { error: "not_found", detail: "That listing no longer exists." },
      { status: 404 }
    );
  }

  /* Ownership is established HERE, because the write below uses the trusted
     client and therefore carries no RLS of its own. */
  if (listing.seller_id !== user.id) {
    return NextResponse.json(
      { error: "not_allowed", detail: "That listing is not yours." },
      { status: 403 }
    );
  }
  if (!CORRECTABLE.includes(listing.status as (typeof CORRECTABLE)[number])) {
    return NextResponse.json(
      {
        error: "not_correctable",
        detail: `This listing is "${listing.status}" and is not currently yours to change.`,
      },
      { status: 409 }
    );
  }

  const money = resolveAskingMoney(
    typeof body.askingPrice === "string" ? body.askingPrice : undefined,
    typeof body.askingCurrency === "string" ? body.askingCurrency : undefined
  );
  if (!money.ok) {
    return NextResponse.json(
      { error: "invalid_amount", detail: money.detail },
      { status: 400 }
    );
  }

  /* Re-resolved from the reference the seller actually submitted, never taken
     from the browser. Editing the reference on a returned listing must move
     the canonical link with it, or the row would keep pointing at the watch it
     used to claim to be. Enrichment, not a gate: an unresolved link is honest. */
  const canonical = await resolveCanonicalForPersistence(
    {
      brand: typeof body.brand === "string" ? body.brand : "",
      model: typeof body.model === "string" ? body.model : "",
      reference: typeof body.reference === "string" ? body.reference : "",
    },
    body.vaultReferenceId
  );

  /* Conditional on status, so a founder adjudicating between the read above
     and this write wins the race and this updates nothing — the same
     discipline the triage seam uses. */
  const { data: updated, error: updateErr } = await service
    .from("listings")
    .update(listingWatchColumns(body, money, canonical.vaultReferenceId))
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .in("status", [...CORRECTABLE])
    .select("id, status, public_code")
    .maybeSingle();
  if (updateErr) {
    return NextResponse.json(
      { error: "update_failed", detail: updateErr.message },
      { status: 500 }
    );
  }
  if (!updated) {
    return NextResponse.json(
      {
        error: "not_correctable",
        detail: "This listing changed while you were working on it. Reopen it and try again.",
      },
      { status: 409 }
    );
  }

  /* The transition belongs to the governed function, which runs as the seller
     and re-checks ownership inside its own transaction. Deliberately not a
     status write here: publication law and submission law each have exactly
     one home, and this route is not either of them. */
  const { error: submitErr } = await supabase.rpc("submit_listing_for_review", {
    p_listing_id: listingId,
    p_attested_acts: null,
  });
  if (submitErr) {
    /* The corrections are saved and the listing is still the seller's to
       resubmit; only the transition failed. Say exactly that rather than
       implying their edits were lost. */
    return NextResponse.json(
      {
        error: "submit_failed",
        detail: submitErr.message,
        savedButNotSubmitted: true,
      },
      { status: 409 }
    );
  }

  /* The draft has done its job. Closing it idempotently keeps a corrected
     watch from sitting in Saved Listings as if it were still unfinished —
     the same close the create path performs after publishing. */
  await supabase.rpc("listing_draft_mark_published", {
    p_draft_id: draftId,
    p_listing_id: listingId,
  });

  /* The ordinary automatic seam. It is also where an outstanding founder
     decision now stops a resubmission from republishing itself. Non-fatal:
     a triage failure leaves the listing in review, which is where a person
     already looks. */
  try {
    await runReviewTriageForListing(listingId);
  } catch (e) {
    console.error("[resubmit] triage failed:", e);
  }

  const { data: after } = await service
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    listingId,
    publicCode: updated.public_code,
    status: after?.status ?? "pending_review",
  });
}
