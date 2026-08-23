import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runIntegrityProviderPass } from "@/lib/integrity/providerPass";
import {
  composeCurationSummary,
  curationCompleteMessage,
  type ProviderOutcome,
} from "@/lib/curationReview";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings/[id]/curation-request — "Double-check this listing"

   A signed-in collector asks FairWatchTrade to re-run the governed listing
   review. This is the COLLECTOR's door; the founder recheck route keeps its
   own hardcoded admin gate and is never reachable from a browser here. Both
   doors call one shared seam (lib/integrity/providerPass) so there is one
   review machine, not two.

   ── IT CANNOT PUBLISH, AND CANNOT UN-PUBLISH ───────────────────────────
   There is no listing-status write in this file or in the seam it calls.
   Publication has exactly one door — the governed approval route (v6.34) —
   and Curation Review is POST-publication commentary that adjudicates
   nothing about marketplace admission.

   ── WHAT A COLLECTOR MAY LEARN ─────────────────────────────────────────
   Only the composed public-safe summary is persisted for the listing to
   render. Raw provider rows stay internal; this route never returns them.

   ── FAIL-OPEN NOTIFICATION ─────────────────────────────────────────────
   The bell is best-effort. A notification failure must never fail a review
   that actually completed — the existing discipline, preserved.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const maxDuration = 60;

/** The lifecycle states whose detail page the public can actually open. A
    review may only be requested for a listing the requester can see. */
const VIEWABLE = ["published", "reserved", "private_active"];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1 · the requester is whoever is actually signed in. No impersonation,
  //     no client-supplied identity.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated", detail: "Sign in to request a review." },
      { status: 401 }
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Review channel unavailable." },
      { status: 500 }
    );
  }

  // 2 · the listing must exist and be one the collector can actually view.
  const { data: listing, error: listingErr } = await service
    .from("listings")
    .select("id, status, brand, photos, public_code, private_buyer_id")
    .eq("id", id)
    .maybeSingle();
  if (listingErr) {
    return NextResponse.json({ error: "read_failed", detail: listingErr.message }, { status: 500 });
  }
  if (!listing || !VIEWABLE.includes(listing.status as string)) {
    return NextResponse.json(
      { error: "not_reviewable", detail: "This listing is not currently open for review." },
      { status: 404 }
    );
  }
  /* A private listing is visible to exactly one buyer; only that buyer may
     ask for its review. */
  if (
    listing.status === "private_active" &&
    listing.private_buyer_id &&
    listing.private_buyer_id !== user.id
  ) {
    return NextResponse.json(
      { error: "not_reviewable", detail: "This listing is not currently open for review." },
      { status: 404 }
    );
  }

  // 3 · one active request per collector per listing — the same structural
  //     precedent purchase requests use. The partial unique index is the
  //     real guard; this read makes the refusal legible.
  const { data: existing } = await service
    .from("listing_curation_requests")
    .select("id, status")
    .eq("listing_id", id)
    .eq("requester_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { ok: true, state: "pending", detail: "A review of this listing is already underway." },
      { status: 200 }
    );
  }

  const { data: created, error: createErr } = await service
    .from("listing_curation_requests")
    .insert({ listing_id: id, requester_id: user.id, status: "pending" })
    .select("id")
    .maybeSingle();
  if (createErr || !created) {
    // 23505 = the dedupe index fired between the read and the write.
    if ((createErr as { code?: string } | null)?.code === "23505") {
      return NextResponse.json(
        { ok: true, state: "pending", detail: "A review of this listing is already underway." },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: "request_failed", detail: createErr?.message ?? "Could not record the request." },
      { status: 500 }
    );
  }

  // 4 · the governed pass — the SAME machinery the founder recheck runs,
  //     recorded in the audit trail as collector-triggered.
  const { data: media } = await service
    .from("listing_media")
    .select("id, storage_path, capture_session_id, category, capture_source")
    .eq("listing_id", id);
  const targets = (media ?? []).filter((m) => m.capture_source !== "dealer_import");

  if (targets.length > 0) {
    await runIntegrityProviderPass({
      service,
      listingId: id,
      claimedBrand: typeof listing.brand === "string" ? listing.brand : "",
      photos: listing.photos,
      targets,
      triggeredBy: "collector_requested",
    });
  }

  // 5 · reduce the pass to what a collector may be told.
  const { data: rows } = await service
    .from("listing_integrity_provider_results")
    .select("provider, classification, execution_status, is_active, category")
    .in("media_id", targets.map((m) => m.id));

  const summary = composeCurationSummary({
    outcomes: (rows ?? []) as ProviderOutcome[],
    updated: new Date().toISOString(),
  });

  const { error: completeErr } = await service
    .from("listing_curation_requests")
    .update({ status: "completed", summary, completed_at: new Date().toISOString() })
    .eq("id", created.id);
  if (completeErr) {
    // The pass ran; the record did not close. Leave it pending honestly.
    console.error("[curation] completion write failed:", completeErr.message);
    return NextResponse.json(
      { ok: true, state: "pending", detail: "The review is still finishing." },
      { status: 200 }
    );
  }

  // 6 · the bell — best effort, never allowed to fail the completed review.
  try {
    await service.from("notifications").insert({
      user_id: user.id,
      type: "curation_review_complete",
      message: curationCompleteMessage(
        typeof listing.public_code === "string" ? listing.public_code : null
      ),
      listing_id: id,
      dedupe_key: `curation:${created.id}`,
    });
  } catch (e) {
    console.error("[curation] notification failed (review still complete):", e);
  }

  return NextResponse.json({ ok: true, state: "completed", summary }, { status: 200 });
}
