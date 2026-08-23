import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  PROVIDER_IDENTITY_CONSISTENCY,
  PROVIDER_IMAGE_AUTHENTICITY,
  TRIGGERED_BY_ADMIN_RECHECK,
  aggregateIntegrityForListing,
  buildPromotedEvidenceRows,
  isSystemReleasableHold,
} from "@/lib/integrity";
import {
  executeIdentityConsistencyCheck,
  identityConsistencyEnabled,
} from "@/lib/identityConsistency";
import {
  aubreyEnforcementEnabled,
  executeImageAuthenticityCheck,
} from "@/lib/imageAuthenticity";
import { ensureCollectorDossierForListing } from "@/lib/dossier/collectorDossierService";

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

  // 4 · per media row: deactivate the prior active-completed Aubrey row
  //     (both correlation states), then insert the new attempt media-keyed.
  const mediaIds = targets.map((m) => m.id);
  const { data: prior, error: priorErr } = await service
    .from("listing_integrity_provider_results")
    .select("id, media_id, capture_session_id, storage_path, attempt_number, execution_status, is_active")
    .eq("provider", PROVIDER_IMAGE_AUTHENTICITY)
    .or(
      `media_id.in.(${mediaIds.join(",")}),and(media_id.is.null,storage_path.in.(${targets
        .map((m) => `"${m.storage_path}"`)
        .join(",")}))`
    );
  if (priorErr) {
    return NextResponse.json({ error: "read_failed", detail: priorErr.message }, { status: 500 });
  }

  const maxAttemptByMedia = new Map<string, number>();
  const toDeactivate: string[] = [];
  for (const row of prior ?? []) {
    const target = targets.find(
      (m) =>
        row.media_id === m.id ||
        (row.media_id === null &&
          row.capture_session_id === m.capture_session_id &&
          row.storage_path === m.storage_path)
    );
    if (!target) continue;
    maxAttemptByMedia.set(
      target.id,
      Math.max(maxAttemptByMedia.get(target.id) ?? 0, row.attempt_number ?? 0)
    );
    if (row.execution_status === "completed" && row.is_active === true) {
      toDeactivate.push(row.id);
    }
  }

  if (toDeactivate.length > 0) {
    const { error: deactErr } = await service
      .from("listing_integrity_provider_results")
      .update({ is_active: false })
      .in("id", toDeactivate);
    if (deactErr) {
      return NextResponse.json(
        { error: "deactivate_failed", detail: deactErr.message },
        { status: 500 }
      );
    }
  }

  let rechecked = 0;
  await Promise.allSettled(
    targets.map(async (m) => {
      const url = m.storage_path ? urlByPath.get(m.storage_path) : undefined;
      const core = url
        ? await executeImageAuthenticityCheck(url)
        : {
            execution_status: "unavailable" as const,
            classification: null,
            is_active: true,
            completed_at: null,
            reason: null,
            detail: { note: "photo_url_missing" },
          };
      const { error: insErr } = await service.from("listing_integrity_provider_results").insert({
        provider: PROVIDER_IMAGE_AUTHENTICITY,
        attempt_number: (maxAttemptByMedia.get(m.id) ?? 0) + 1,
        triggered_by: TRIGGERED_BY_ADMIN_RECHECK,
        capture_session_id: m.capture_session_id,
        storage_path: m.storage_path,
        category: m.category ?? null,
        media_id: m.id,
        ...core,
      });
      if (insErr && (insErr as { code?: string }).code !== "23505") {
        console.error("[aubrey] recheck insert failed:", insErr.message);
      } else {
        rechecked += 1;
      }
    })
  );

  /* ── 4b · Identity Consistency recheck — same deactivate-then-attempt
        shape as the Aubrey pass above, scoped to its own provider rows and
        to Dial-tagged media only (the packet's routing law). Gated on its
        own flag: while off, a founder recheck re-runs provenance exactly as
        before and identity writes nothing. Promotion in step 5 is already
        provider-agnostic, so a contradiction recorded here promotes with no
        further wiring. ── */
  if (identityConsistencyEnabled()) {
    const claimedBrand = typeof listing.brand === "string" ? listing.brand : "";
    const idTargets = targets.filter((m) => m.category === "Dial");
    if (claimedBrand && idTargets.length > 0) {
      const idIds = idTargets.map((m) => m.id);
      const { data: idPrior, error: idPriorErr } = await service
        .from("listing_integrity_provider_results")
        .select("id, media_id, capture_session_id, storage_path, attempt_number, execution_status, is_active")
        .eq("provider", PROVIDER_IDENTITY_CONSISTENCY)
        .or(
          `media_id.in.(${idIds.join(",")}),and(media_id.is.null,storage_path.in.(${idTargets
            .map((m) => `"${m.storage_path}"`)
            .join(",")}))`
        );
      if (idPriorErr) {
        console.error("[identity] recheck prior read failed:", idPriorErr.message);
      } else {
        const idMaxAttempt = new Map<string, number>();
        const idDeactivate: string[] = [];
        for (const row of idPrior ?? []) {
          const target = idTargets.find(
            (m) =>
              row.media_id === m.id ||
              (row.media_id === null &&
                row.capture_session_id === m.capture_session_id &&
                row.storage_path === m.storage_path)
          );
          if (!target) continue;
          idMaxAttempt.set(
            target.id,
            Math.max(idMaxAttempt.get(target.id) ?? 0, row.attempt_number ?? 0)
          );
          if (row.execution_status === "completed" && row.is_active === true) {
            idDeactivate.push(row.id);
          }
        }
        if (idDeactivate.length > 0) {
          const { error: idDeactErr } = await service
            .from("listing_integrity_provider_results")
            .update({ is_active: false })
            .in("id", idDeactivate);
          if (idDeactErr) {
            console.error("[identity] recheck deactivate failed:", idDeactErr.message);
          }
        }
        await Promise.allSettled(
          idTargets.map(async (m) => {
            const url = m.storage_path ? urlByPath.get(m.storage_path) : undefined;
            const core = url
              ? await executeIdentityConsistencyCheck({
                  photoUrl: url,
                  claimedBrand,
                  category: m.category ?? null,
                })
              : {
                  execution_status: "unavailable" as const,
                  classification: null,
                  is_active: true,
                  completed_at: null,
                  reason: null,
                  detail: { note: "photo_url_missing" },
                };
            const { error: insErr } = await service
              .from("listing_integrity_provider_results")
              .insert({
                provider: PROVIDER_IDENTITY_CONSISTENCY,
                attempt_number: (idMaxAttempt.get(m.id) ?? 0) + 1,
                triggered_by: TRIGGERED_BY_ADMIN_RECHECK,
                capture_session_id: m.capture_session_id,
                storage_path: m.storage_path,
                category: m.category ?? null,
                media_id: m.id,
                ...core,
              });
            if (insErr && (insErr as { code?: string }).code !== "23505") {
              console.error("[identity] recheck insert failed:", insErr.message);
            }
          })
        );
      }
    }
  }

  // 5 · promote new accepted findings (idempotent by provider_result_id).
  const { data: results, error: resultsErr } = await service
    .from("listing_integrity_provider_results")
    .select("id, provider, classification, execution_status, is_active, detail, reason")
    .in("media_id", mediaIds);
  if (!resultsErr) {
    // Step 2 · the same shared builder the publish path uses, so a recheck
    // promotion carries cause identity exactly as a first publish does.
    const evidenceRows = await buildPromotedEvidenceRows({
      service,
      listingId: id,
      results: results ?? [],
    });
    if (evidenceRows.length > 0) {
      const { error: evErr } = await service
        .from("listing_integrity_evidence")
        .upsert(evidenceRows, { onConflict: "provider_result_id", ignoreDuplicates: true });
      if (evErr) console.error("[aubrey] recheck evidence promotion failed:", evErr.message);
    }
  }

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
