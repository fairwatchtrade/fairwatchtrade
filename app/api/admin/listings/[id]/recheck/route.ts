import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  TRIGGERED_BY_ADMIN_RECHECK,
  aggregateIntegrityForListing,
  isSystemReleasableHold,
} from "@/lib/integrity";
import { aubreyEnforcementEnabled } from "@/lib/imageAuthenticity";
import { ensureCollectorDossierForListing } from "@/lib/dossier/collectorDossierService";
import { runIntegrityProviderPass } from "@/lib/integrity/providerPass";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/listings/[id]/recheck — founder re-run of The Aubrey Check

   EVIDENCE GATHERING, not adjudication — the status route stays the ONE
   adjudication path. This route re-executes the image-authenticity check
   for every media row of one listing (triggered_by 'admin_recheck',
   attempt_number incremented, prior active-completed rows deactivated
   first per the one-active-completed unique indexes), promotes any new
   accepted findings, and then applies the SAME release-only reconciliation
   as the publish retry: a system-releasable hold that now aggregates clean
   is released to published ("check succeeds on retry" — D-ruling); a
   finding_review hold, the NULL-reason dealer/founder queue, and published
   listings are never moved. No release email is sent from here — the
   founder is watching, and notify_on_listing_publish already fires.

   SHIPPED INERT: while AUBREY_ENFORCEMENT is off this returns 503
   provider_disabled before touching anything. No key exists, no call can
   be made, no thresholds are set — all by explicit ruling.

   TWO INDEPENDENT GATES, same as the status route: the page's founder
   check and this route's own hardcoded literal. Neither trusts the other.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const maxDuration = 60;

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1 · authenticate + authorize with the session client (independent gate).
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
  if (user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: "forbidden", detail: "Admin only." }, { status: 403 });
  }
  if (!id) {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing listing id." },
      { status: 400 }
    );
  }

  // 2 · inert while the enforcement flag is off — by ruling, nothing runs.
  if (!aubreyEnforcementEnabled()) {
    return NextResponse.json(
      {
        error: "provider_disabled",
        detail:
          "The Aubrey Check is not enforced (AUBREY_ENFORCEMENT is off). No check was run.",
      },
      { status: 503 }
    );
  }

  // 3 · trusted client — reached only after the gate above.
  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[aubrey] recheck — trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin write channel unavailable." },
      { status: 500 }
    );
  }

  const { data: listing, error: listingErr } = await service
    .from("listings")
    .select("id, status, integrity_hold_reason, photos, brand")
    .eq("id", id)
    .maybeSingle();
  if (listingErr) {
    return NextResponse.json({ error: "read_failed", detail: listingErr.message }, { status: 500 });
  }
  if (!listing) {
    return NextResponse.json(
      { error: "not_found", detail: `No listing with id ${id}.` },
      { status: 404 }
    );
  }

  const { data: media, error: mediaErr } = await service
    .from("listing_media")
    .select("id, storage_path, capture_session_id, category, capture_source")
    .eq("listing_id", id);
  if (mediaErr) {
    return NextResponse.json({ error: "read_failed", detail: mediaErr.message }, { status: 500 });
  }
  // Launch exclusion: original dealer-import source images get no Aubrey
  // execution (ninth artifact state). Everything else rechecks.
  const targets = (media ?? []).filter((m) => m.capture_source !== "dealer_import");
  if (targets.length === 0) {
    return NextResponse.json(
      { ok: true, rechecked: 0, status: listing.status, detail: "No recheckable media." },
      { status: 200 }
    );
  }

  // storage_path → public URL, from the listing's own photos array.
  const urlByPath = new Map<string, string>();
  for (const p of ((listing.photos ?? []) as { photo?: { url?: unknown; pathname?: unknown } }[])) {
    const url = typeof p?.photo?.url === "string" ? p.photo.url : "";
    const pathname = typeof p?.photo?.pathname === "string" ? p.photo.pathname : "";
    if (url && pathname) urlByPath.set(pathname, url);
  }

  /* 4/5 · providers + evidence promotion — the SHARED seam, so the founder
     recheck and the collector's "Double-check this listing" request run the
     identical machinery instead of two drifting copies. The seam contains no
     status write of any kind; reconciliation below stays here, where a
     founder is present. */
  const pass = await runIntegrityProviderPass({
    service,
    listingId: id,
    claimedBrand: typeof listing.brand === "string" ? listing.brand : "",
    photos: listing.photos,
    targets,
    triggeredBy: TRIGGERED_BY_ADMIN_RECHECK,
  });
  if (pass.error) {
    return NextResponse.json({ error: "read_failed", detail: pass.error }, { status: 500 });
  }
  const rechecked = pass.ran;

  // 6 · release-only reconciliation — identical rules to the publish retry.
  const gateMediaMeta = targets.map((m) => ({
    capture_session_id: m.capture_session_id,
    storage_path: m.storage_path ?? "",
  }));
  const gate = await aggregateIntegrityForListing({
    service,
    mediaMeta: gateMediaMeta,
    media: targets.map((m) => ({ id: m.id, storage_path: m.storage_path })),
    requireAuthenticityCoverage: true,
  });

  /* ── RECHECK NEVER PUBLISHES (publication-governance ruling) ──────────
        A recheck is evidence gathering. It may CLEAR the system's objection;
        it may not conclude the human review.

        This route used to release a cleared hold straight to 'published',
        which meant a listing could reach Browse because a provider stopped
        failing — no founder ever approved it. Clearing a hold and approving
        a listing are different acts, and only the governed approval route
        performs the second one.

        So a cleared hold now clears the REASON and stays pending_review: the
        listing leaves the system-hold state and joins the ordinary founder
        queue (NULL hold = nothing the system objects to), where Approve is a
        deliberate human decision. Nothing about the evidence, the promotion
        path, or the retry law changed. ── */
  /* Unchanged by this route now — an already-published listing being
     rechecked still reports published (and still refreshes its dossier);
     a held one stays pending_review. */
  const finalStatus = listing.status as string;
  if (
    listing.status === "pending_review" &&
    isSystemReleasableHold(listing.integrity_hold_reason ?? null)
  ) {
    if (gate.status === "published") {
      await service
        .from("listings")
        .update({ integrity_hold_reason: null })
        .eq("id", id)
        .eq("status", "pending_review");
    } else if (gate.holdReason && gate.holdReason !== listing.integrity_hold_reason) {
      await service
        .from("listings")
        .update({ integrity_hold_reason: gate.holdReason })
        .eq("id", id)
        .eq("status", "pending_review");
    }
  }

  let collectorDossier: string | null = null;
  if (finalStatus === "published") {
    try {
      collectorDossier = (await ensureCollectorDossierForListing(id)).state;
    } catch (error) {
      console.error("[collector-dossier] recheck-release worker failed:", error);
      collectorDossier = "failed";
    }
  }

  return NextResponse.json(
    { ok: true, rechecked, status: finalStatus, hold_reason: gate.holdReason, collector_dossier: collectorDossier },
    { status: 200 }
  );
}
