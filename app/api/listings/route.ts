import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isPromotableFinding,
  findingRequiresReview,
} from "@/lib/integrity";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings  — publish a listing

   Reads the authenticated seller from the Supabase session (NOT from the
   request body), parses the asking price, snapshots scoring state, inserts
   the row. Returns { id } on success, or { error, detail } on failure.

   ── v2.2 additions (all ADDITIVE) ──────────────────────────────────────
   1. IDEMPOTENCY — publish_request_id.
   2. LISTING_MEDIA — server-side writes only.
   3. IN HAND VERIFIED — server-authoritative badge.

   ── v2.3 · Integrity Engine persistence wiring ─────────────────────────
   Provider results are written at photo-review time (pre-publish, keyed by
   capture_session_id + storage_path). This route now:

     a. DECIDES INITIAL STATUS BEFORE INSERT. It aggregates the pre-publish
        provider results for this listing's photos and inserts the listing
        ONCE with the correct lifecycle status already set — 'published' when
        nothing is review-worthy, 'pending_review' when any accepted finding
        requires review. No insert-then-correct window.

     b. Runs a SINGLE idempotent post-insert orchestration, shared by the
        fresh-publish and retry paths:
          · insert missing listing_media rows (by storage_path)
          · backfill provider_results.media_id where still null (by cs + sp)
          · promote accepted findings into listing_integrity_evidence,
            idempotently (ON CONFLICT (provider_result_id) DO NOTHING)

     c. RESUMES unfinished work on retry. A retry with an existing
        publish_request_id does NOT recalculate the gate or status — it re-runs
        the same idempotent orchestration, finishing whichever post-insert
        steps a prior crashed attempt left undone, and never re-sends email.

   Correlation identity (chain ruling): aggregation and backfill key off each
   media_meta entry's OWN capture_session_id + storage_path — never the
   top-level capture_session_id, which badge forfeiture may null while the
   per-photo entries retain the truthful correlation data.

   Fail-open vs. don't-fabricate-clean: if integrity infrastructure is
   unreachable (service-role client cannot be constructed, or the aggregation
   read errors), the seller is NEVER blocked — the listing still publishes —
   but it publishes as 'pending_review' (a human will look), never silently
   stamped clean. Config failure is loud in the log.

   NOTE (interim, until the blur-serial provider-row update ships): for the two
   serial categories (Caseback, Non-Crown Side) WHEN a blur swap actually
   occurs, the provider row still carries the pre-blur storage_path while
   media_meta carries the blurred path, so that one photo's finding will not
   correlate here yet — it fails open (published) rather than crashing. The
   blur-serial patch closes this gap.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Light shape — mirrors ListingDraft without importing it server-side.
type PublishBody = {
  brand?: string;
  customBrandFlag?: boolean;
  model?: string;
  reference?: string;
  year?: string;
  condition?: string;
  askingPrice?: string;
  provenanceNote?: string;
  significanceScore?: number | null;
  photos?: unknown[];
  hasBracelet?: boolean;
  details?: Record<string, unknown>;
  description?: string;
  descriptionPassedAI?: boolean | null;
  scoreState?: Record<string, unknown>;
  // ── v2.2 additive fields (mobile wizard) ──
  publish_request_id?: string;
  capture_session_id?: string | null;
  device_session_token?: string;
  sale_state?: string | null;
  media_meta?: unknown[];
  source?: string;
};

type MediaMetaEntry = {
  category: string;
  storage_path: string;
  capture_session_id: string | null;
  sequence_index: number;
  original_hash: string;
  privacy_review_requested: boolean;
};

function parsePrice(raw?: string): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

/* ── v2.2 helpers ─────────────────────────────────────────────────────── */

const SESSION_WINDOW_MS = 2 * 60 * 60 * 1000; // mirror of the session API's expiry

const SALE_STATES = ["bracelet", "strap", "head_only", "other"] as const;
type SaleStateValue = (typeof SALE_STATES)[number];

/** The wizard's mandatory capture set per sale state — the badge's bar. */
function badgeMandatoryCategories(saleState: SaleStateValue): string[] {
  const base = [
    "Dial",
    "Caseback",
    "Crown Side",
    "Non-Crown Side",
    "Full watch, strap/bracelet extended",
  ];
  if (saleState === "bracelet" || saleState === "strap") {
    base.push("Clasp/Pin Buckle");
  }
  return base;
}

/** Coerce + bound the client-supplied media metadata. */
function sanitizeMediaMeta(raw: unknown[] | undefined): MediaMetaEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: MediaMetaEntry[] = [];
  for (const item of raw.slice(0, 24)) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const category = typeof r.category === "string" ? r.category.slice(0, 64) : "";
    const storagePath = typeof r.storage_path === "string" ? r.storage_path.slice(0, 512) : "";
    if (!category || !storagePath) continue;
    out.push({
      category,
      storage_path: storagePath,
      capture_session_id:
        typeof r.capture_session_id === "string" ? r.capture_session_id.slice(0, 64) : null,
      sequence_index:
        typeof r.sequence_index === "number" && Number.isFinite(r.sequence_index)
          ? Math.max(0, Math.floor(r.sequence_index))
          : out.length,
      original_hash: typeof r.original_hash === "string" ? r.original_hash.slice(0, 128) : "",
      privacy_review_requested: r.privacy_review_requested === true,
    });
  }
  return out;
}

type ListingStatus = "published" | "pending_review";

/* ── v2.3 · status decision — pre-insert aggregation over pre-publish rows.

   Returns:
     'published'      — a successful read found no review-worthy finding
     'pending_review' — a review-worthy finding exists, OR the read errored
                        (can't verify ⇒ hold, don't fabricate clean)

   Keys off each media entry's OWN capture_session_id + storage_path. Only
   considers rows still on the pre-publish path (media_id IS NULL). ── */
async function decideInitialStatus(
  service: SupabaseClient,
  mediaMeta: MediaMetaEntry[]
): Promise<ListingStatus> {
  const pairs = mediaMeta.filter((m) => m.capture_session_id && m.storage_path);
  if (pairs.length === 0) return "published"; // nothing correlatable → clean by absence

  const sessionIds = Array.from(new Set(pairs.map((m) => m.capture_session_id as string)));
  const wanted = new Set(pairs.map((m) => `${m.capture_session_id}|${m.storage_path}`));

  const { data, error } = await service
    .from("listing_integrity_provider_results")
    .select("capture_session_id, storage_path, execution_status, classification, is_active, detail")
    .in("capture_session_id", sessionIds)
    .is("media_id", null);

  if (error) {
    console.error("[integrity] status aggregation read failed — holding for review:", error.message);
    return "pending_review"; // can't verify → hold, never fabricate clean
  }

  for (const row of data ?? []) {
    if (!wanted.has(`${row.capture_session_id}|${row.storage_path}`)) continue;
    if (isPromotableFinding(row) && findingRequiresReview(row.classification)) {
      return "pending_review";
    }
  }
  return "published";
}

/* ── v2.3 · the single idempotent post-insert orchestration.

   Shared by fresh-publish and retry. Every step is safe to re-run:
     1. listing_media — insert only rows whose storage_path isn't already present
     2. media_id backfill — update provider rows only where media_id IS NULL
     3. evidence promotion — upsert with ignoreDuplicates (ON CONFLICT DO NOTHING)

   `service` may be null (integrity infra unavailable): listing_media still
   gets written via the session client; integrity steps 2–3 are skipped. ── */
async function completePublishOrchestration(params: {
  listingId: string;
  mediaMeta: MediaMetaEntry[];
  session: SupabaseClient;
  service: SupabaseClient | null;
}): Promise<void> {
  const { listingId, mediaMeta, session, service } = params;
  if (mediaMeta.length === 0) return;

  // 1 · listing_media — idempotent insert by storage_path within this listing.
  const { data: existingMedia, error: existingErr } = await session
    .from("listing_media")
    .select("id, storage_path, capture_session_id")
    .eq("listing_id", listingId);

  if (existingErr) {
    console.error("listing_media read failed:", existingErr.message);
  }

  const existingPaths = new Set((existingMedia ?? []).map((r) => r.storage_path));
  const toInsert = mediaMeta.filter((m) => !existingPaths.has(m.storage_path));

  let insertedMedia: { id: string; storage_path: string; capture_session_id: string | null }[] = [];
  if (toInsert.length > 0) {
    const mediaRows = toInsert.map((m) => ({
      listing_id: listingId,
      category: m.category,
      storage_path: m.storage_path,
      capture_source: "live_camera",
      capture_session_id: m.capture_session_id,
      sequence_index: m.sequence_index,
      original_hash: m.original_hash || null,
      ai_review_status: "pending", // vocabulary unchanged per ruling
      privacy_review_status: m.privacy_review_requested ? "pending" : "not_required",
    }));
    const { data, error: mediaError } = await session
      .from("listing_media")
      .insert(mediaRows)
      .select("id, storage_path, capture_session_id");
    if (mediaError) {
      console.error("listing_media insert failed:", mediaError.message);
    } else {
      insertedMedia = data ?? [];
    }
  }

  // Integrity steps require the trusted client — skip cleanly if unavailable.
  if (!service) return;

  const allMedia = [...(existingMedia ?? []), ...insertedMedia];

  // 2 · media_id backfill — hand correlation from the pre-publish index to the
  //     post-publish one. Only touches rows still lacking a media_id.
  for (const media of allMedia) {
    if (!media.capture_session_id || !media.storage_path) continue;
    const { error } = await service
      .from("listing_integrity_provider_results")
      .update({ media_id: media.id })
      .is("media_id", null)
      .eq("capture_session_id", media.capture_session_id)
      .eq("storage_path", media.storage_path);
    if (error) {
      console.error("[integrity] media_id backfill failed:", error.message);
    }
  }

  // 3 · evidence promotion — accepted findings only, idempotent by unique
  //     (provider_result_id). Selects by the now-backfilled media_ids.
  const mediaIds = allMedia.map((m) => m.id);
  if (mediaIds.length === 0) return;

  const { data: results, error: resultsErr } = await service
    .from("listing_integrity_provider_results")
    .select("id, provider, classification, execution_status, is_active, detail, reason")
    .in("media_id", mediaIds);

  if (resultsErr) {
    console.error("[integrity] evidence source read failed:", resultsErr.message);
    return;
  }

  const evidenceRows = (results ?? [])
    .filter(isPromotableFinding)
    .map((r) => ({
      listing_id: listingId,
      provider_result_id: r.id,
      provider: r.provider,
      classification: r.classification,
      reason: r.reason ?? null,
      detail: r.detail ?? null,
    }));

  if (evidenceRows.length > 0) {
    const { error: evErr } = await service
      .from("listing_integrity_evidence")
      .upsert(evidenceRows, { onConflict: "provider_result_id", ignoreDuplicates: true });
    if (evErr) {
      console.error("[integrity] evidence promotion failed:", evErr.message);
    }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "not_authenticated", detail: "Sign in before publishing a listing." },
      { status: 401 }
    );
  }

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not parse request body." },
      { status: 400 }
    );
  }

  if (!body.brand || !body.reference) {
    return NextResponse.json(
      { error: "missing_fields", detail: "Brand and reference are required." },
      { status: 400 }
    );
  }

  const mediaMeta = sanitizeMediaMeta(body.media_meta);
  const hasCorrelatableMedia = mediaMeta.some((m) => m.capture_session_id && m.storage_path);

  /* ── v2.3 · trusted client, constructed once, shared by both paths. Only
        needed when there is correlatable integrity media. A construction
        failure is loud but never blocks the publish. ── */
  let service: SupabaseClient | null = null;
  let serviceUnavailable = false;
  if (hasCorrelatableMedia) {
    try {
      service = createServiceClient();
    } catch (e) {
      console.error("[integrity] service client unavailable — will hold listing for review:", e);
      serviceUnavailable = true;
    }
  }

  /* ── v2.2 · idempotency pre-check — a retry RESUMES, it does not re-gate ── */
  const publishRequestId =
    typeof body.publish_request_id === "string" && body.publish_request_id.trim() !== ""
      ? body.publish_request_id.trim().slice(0, 64)
      : null;

  if (publishRequestId) {
    const { data: existing } = await supabase
      .from("listings")
      .select("id, in_hand_verified, status")
      .eq("publish_request_id", publishRequestId)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (existing) {
      // Resume unfinished orchestration from a prior attempt — preserve the
      // original status, never recalc the gate, never re-send email.
      await completePublishOrchestration({
        listingId: existing.id,
        mediaMeta,
        session: supabase,
        service,
      });
      return NextResponse.json(
        {
          id: existing.id,
          in_hand_verified: existing.in_hand_verified === true,
          status: existing.status,
          idempotent: true,
        },
        { status: 200 }
      );
    }
  }

  /* ── v2.2 · badge verification — server-authoritative, before insert ── */
  const saleState = SALE_STATES.includes(body.sale_state as SaleStateValue)
    ? (body.sale_state as SaleStateValue)
    : null;
  const captureSessionId =
    typeof body.capture_session_id === "string" && body.capture_session_id.trim() !== ""
      ? body.capture_session_id.trim()
      : null;
  const deviceToken =
    typeof body.device_session_token === "string" ? body.device_session_token : "";

  let inHandVerified = false;

  if (captureSessionId && deviceToken && saleState && mediaMeta.length > 0) {
    const { data: session } = await supabase
      .from("mobile_wizard_sessions")
      .select("seller_id, device_session_token, status, last_activity_at")
      .eq("capture_session_id", captureSessionId)
      .maybeSingle();

    const sessionOk =
      !!session &&
      session.seller_id === user.id &&
      session.device_session_token === deviceToken &&
      (session.status === "active" || session.status === "completed") &&
      Date.now() - new Date(session.last_activity_at).getTime() <= SESSION_WINDOW_MS;

    if (sessionOk) {
      const liveCats = new Set(
        mediaMeta
          .filter((m) => m.capture_session_id === captureSessionId)
          .map((m) => m.category)
      );
      inHandVerified = badgeMandatoryCategories(saleState).every((c) => liveCats.has(c));
    }
  }

  /* ── v2.3 · decide initial lifecycle status BEFORE insert ── */
  let initialStatus: ListingStatus = "published";
  if (hasCorrelatableMedia) {
    if (serviceUnavailable || !service) {
      initialStatus = "pending_review"; // can't verify → hold, don't fabricate clean
    } else {
      initialStatus = await decideInitialStatus(service, mediaMeta);
    }
  }

  const row: Record<string, unknown> = {
    seller_id: user.id,
    status: initialStatus,
    brand: body.brand,
    custom_brand_flag: body.customBrandFlag ?? false,
    model: body.model || null,
    reference: body.reference,
    year: body.year ?? null,
    condition: body.condition || null,
    asking_price: parsePrice(body.askingPrice),
    asking_price_raw: body.askingPrice ?? null,
    provenance_note: body.provenanceNote ?? null,
    significance_score: body.significanceScore ?? null,
    score_state: body.scoreState ?? {},
    photos: body.photos ?? [],
    has_bracelet: body.hasBracelet ?? false,
    details: body.details ?? {},
    description: body.description ?? null,
    description_passed_ai: body.descriptionPassedAI ?? null,
  };

  // v2.2 columns join the row ONLY when the wizard fields are present.
  if (publishRequestId) {
    row.publish_request_id = publishRequestId;
  }
  if (inHandVerified) {
    row.in_hand_verified = true;
    row.verified_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("listings")
    .insert(row)
    .select("id, status")
    .single();

  if (error) {
    // v2.2 · race-safe idempotency: a concurrent duplicate hit the partial
    // unique index (Postgres 23505). The first insert won — resume + return it.
    if (publishRequestId && (error as { code?: string }).code === "23505") {
      const { data: winner } = await supabase
        .from("listings")
        .select("id, in_hand_verified, status")
        .eq("publish_request_id", publishRequestId)
        .eq("seller_id", user.id)
        .maybeSingle();
      if (winner) {
        await completePublishOrchestration({
          listingId: winner.id,
          mediaMeta,
          session: supabase,
          service,
        });
        return NextResponse.json(
          {
            id: winner.id,
            in_hand_verified: winner.in_hand_verified === true,
            status: winner.status,
            idempotent: true,
          },
          { status: 200 }
        );
      }
    }
    return NextResponse.json(
      { error: "insert_failed", detail: error.message },
      { status: 500 }
    );
  }

  /* ── v2.3 · post-insert orchestration (fresh path). Writes listing_media,
        backfills media_id, promotes evidence — all idempotent. If integrity
        infra was unavailable, media still gets written; integrity steps skip. ── */
  await completePublishOrchestration({
    listingId: data.id,
    mediaMeta,
    session: supabase,
    service: serviceUnavailable ? null : service,
  });

  // Seller-confirmation email (Resend) — fresh publish only, non-fatal.
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "FairWatchTrade <hello@fairwatchtrade.com>",
      to: user.email,
      subject: "Your listing is live on FairWatchTrade",
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; background: #0D0F14; color: #E8E4DC; padding: 2rem;">
          <h1 style="font-family: Georgia, serif; font-weight: 300; color: #C9A84C; font-size: 1.8rem; margin-bottom: 0.5rem;">
            FairWatchTrade
          </h1>
          <p style="color: #B7BAC4; font-size: 0.9rem; margin-bottom: 1.5rem;">
            Your listing is now live on the marketplace.
          </p>
          <div style="border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
            <p style="color: #C9A84C; font-size: 1rem; font-weight: 500; margin: 0 0 0.25rem;">
              ${body.brand}${body.model ? " " + body.model : ""}
            </p>
            <p style="color: #8A8F9E; font-size: 0.8rem; margin: 0 0 0.25rem;">
              Ref. ${body.reference}
            </p>
            <p style="color: #E8E4DC; font-size: 1rem; font-weight: 600; margin: 0.5rem 0 0;">
              $${Number(row.asking_price).toLocaleString()}
            </p>
          </div>
          <a href="https://fairwatchtrade.com/listings/${data.id}"
             style="display: inline-block; background: #C9A84C; color: #0D0F14; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">
            View Your Listing
          </a>
          <p style="color: #8A8F9E; font-size: 0.75rem; margin-top: 2rem;">
            FairWatchTrade · Independent & boutique watchmakers only · 5% flat fee
          </p>
        </div>
      `,
    }),
  }).catch(() => {
    // Email failure is non-fatal — listing is already published.
  });

  return NextResponse.json(
    { id: data.id, in_hand_verified: inHandVerified, status: data.status },
    { status: 201 }
  );
}
