import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isPromotableFinding,
  PROVIDER_IMAGE_AUTHENTICITY,
  TRIGGERED_BY_UPLOAD,
  TRIGGERED_BY_RETRY,
  HOLD_RESULTS_PENDING,
  aggregateIntegrityForListing,
  isSystemReleasableHold,
  type IntegrityHoldReason,
} from "@/lib/integrity";
import {
  aubreyEnforcementEnabled,
  executeImageAuthenticityCheck,
} from "@/lib/imageAuthenticity";
import { put } from "@vercel/blob";
import { createHash } from "crypto";
import { blurSerialBuffer, isSerialSensitiveCategory } from "@/lib/serialBlur";
import type { SupabaseClient } from "@supabase/supabase-js";

// sharp (via lib/serialBlur, used at publish for server-authoritative serial
// blur) is a native module — this route must run on the Node runtime.
export const runtime = "nodejs";

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

     c. RESUMES unfinished work on retry, re-running the same idempotent
        orchestration to finish whichever post-insert steps a prior crashed
        attempt left undone.

   ── v2.24 · The Aubrey Check foundation (rulings locked 2026-07-17) ─────
     · DESKTOP CORRELATION — /sell now sends media_meta + source
       "desktop_sell" with a desk_-prefixed capture session id, so desktop
       photos get the same honest listing_media correlation as mobile
       (capture_source 'desktop_upload'). No more "clean by absence".
     · HOLD REASONS — a pending_review decided here also records WHY in
       listings.integrity_hold_reason (finding_review / results_pending /
       provider_unavailable). NULL means the dealer/founder queue — the
       system never touches those.
     · RETRY RE-GATES (supersedes the v2.2 never-re-gate rule, by ruling):
       an idempotent retry re-runs missing Aubrey checks, re-aggregates the
       NEWEST integrity truth across both correlation states, and may
       RELEASE a system-releasable hold to published. Release-only: it
       never demotes published, never releases finding_review or the
       NULL-reason founder queue. The original row is never duplicated.
     · AUBREY EXECUTION — server-side, in-request, before the gate, via
       lib/imageAuthenticity.ts. INERT until AUBREY_ENFORCEMENT='on' (and
       thresholds exist): while off, no provider rows are written and the
       coverage requirement is skipped — pre-Aubrey behavior exactly.
     · EMAIL HONESTY FIX — the "your listing is live" email previously
       fired even when the insert landed at pending_review. It now sends
       ONLY when the listing is actually published (fresh publish at
       'published', or a retry releasing the hold).

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

/** storage_path → public URL, from the payload's photos array (both halves of
    the pair travel together). Rebuilt after server-side serial blur so Aubrey
    execution and the gate see the final canonical assets. */
function buildUrlByPath(photos: unknown[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of (photos ?? []) as { photo?: { url?: unknown; pathname?: unknown } }[]) {
    const url = typeof p?.photo?.url === "string" ? p.photo.url : "";
    const pathname = typeof p?.photo?.pathname === "string" ? p.photo.pathname : "";
    if (url && pathname) map.set(pathname, url);
  }
  return map;
}

/* ── Mobile Wizard 2A · server-authoritative serial-photo privacy blur.

   Canonical publication authority belongs to the SERVER. For every
   serial-sensitive photo (Caseback / Non-Crown Side) the server applies the
   established positional blur (lib/serialBlur — the same transform the client
   preview uses) to WHATEVER the client submitted, and makes the processed
   asset canonical, before any write. It never trusts that the client blurred:
   a raced, unprocessed original is blurred here regardless.

   Deterministic blob name = sha256(submitted pathname + category), no random
   suffix, overwrite allowed — so the same submitted asset always resolves to
   the same canonical URL. Repeated / concurrent publishes converge on one
   stable blob: no duplicate artifacts, stable canonical URL across retries.

   Mutates each serial photo's `photo` and the matching `mediaMeta` entry IN
   PLACE to the processed url/path. Returns processed/failed counts. Any
   failure means the caller must NOT publish (no raw serial-sensitive
   original is ever accepted as canonical — never a raw fallback). ── */
async function applyServerSerialBlur(
  photos: { photo?: { url?: unknown; pathname?: unknown }; category?: unknown }[],
  mediaMeta: MediaMetaEntry[]
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (const p of photos) {
    const category = typeof p?.category === "string" ? p.category : "";
    if (!isSerialSensitiveCategory(category)) continue;

    const photo = p.photo;
    const url = photo && typeof photo.url === "string" ? photo.url : "";
    const oldPath = photo && typeof photo.pathname === "string" ? photo.pathname : "";
    if (!photo || !url) {
      failed++;
      continue;
    }

    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`);
      const source = Buffer.from(await imgRes.arrayBuffer());

      const result = await blurSerialBuffer(source, category);
      // A serial-sensitive category always resolves a blur region; null means
      // the image could not be sized — treat as failure, never publish raw.
      if (!result) throw new Error("no_blur_region");

      const name =
        "listings/serial/" +
        createHash("sha256").update(`${oldPath}|${category}`).digest("hex").slice(0, 32) +
        ".jpg";
      const blob = await put(name, result.buffer, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "image/jpeg",
      });

      photo.url = blob.url;
      photo.pathname = blob.pathname;
      for (const m of mediaMeta) {
        if (m.storage_path === oldPath) m.storage_path = blob.pathname;
      }
      processed++;
    } catch (e) {
      console.error("[2a] server serial blur failed for a photo:", e);
      failed++;
    }
  }

  return { processed, failed };
}

type ListingStatus = "published" | "pending_review";

/* ── v2.24 · Aubrey execution — run the image-authenticity check for every
      correlatable photo that doesn't yet have an active completed result,
      writing one provider row per attempt (unique per correlation +
      provider + attempt_number, so double-fires 23505 harmlessly).

   Only reachable when AUBREY_ENFORCEMENT is on — the caller gates, and the
   provider module hard-guards besides. Failures produce honest
   'unavailable'/'invalid_response' rows: the gate then HOLDS the listing
   (coverage unmet) without accusing anyone. Never throws: an unexpected
   error here must not block a publish — the coverage gate is the net. ── */
async function ensureAuthenticityAttempts(params: {
  service: SupabaseClient;
  mediaMeta: MediaMetaEntry[];
  urlByPath: Map<string, string>;
  triggeredBy: typeof TRIGGERED_BY_UPLOAD | typeof TRIGGERED_BY_RETRY;
}): Promise<void> {
  const { service, mediaMeta, urlByPath, triggeredBy } = params;
  const pairs = mediaMeta.filter((m) => m.capture_session_id && m.storage_path);
  if (pairs.length === 0) return;

  try {
    const sessionIds = Array.from(new Set(pairs.map((m) => m.capture_session_id as string)));
    const { data: existing, error } = await service
      .from("listing_integrity_provider_results")
      .select("capture_session_id, storage_path, execution_status, is_active, attempt_number")
      .in("capture_session_id", sessionIds)
      .eq("provider", PROVIDER_IMAGE_AUTHENTICITY);
    if (error) {
      console.error("[aubrey] attempt-state read failed — gate will hold:", error.message);
      return;
    }

    const covered = new Set<string>();
    const maxAttempt = new Map<string, number>();
    for (const row of existing ?? []) {
      const key = `${row.capture_session_id}|${row.storage_path}`;
      if (row.execution_status === "completed" && row.is_active === true) covered.add(key);
      maxAttempt.set(key, Math.max(maxAttempt.get(key) ?? 0, row.attempt_number ?? 0));
    }

    const toRun = pairs.filter(
      (m) => !covered.has(`${m.capture_session_id}|${m.storage_path}`)
    );
    if (toRun.length === 0) return;

    await Promise.allSettled(
      toRun.map(async (m) => {
        const key = `${m.capture_session_id}|${m.storage_path}`;
        const url = urlByPath.get(m.storage_path);
        const core = url
          ? await executeImageAuthenticityCheck(url)
          : // No URL for this path in the payload — record the honest miss.
            { execution_status: "unavailable" as const, classification: null, is_active: true, completed_at: null, reason: null, detail: { note: "photo_url_missing" } };
        const { error: insErr } = await service
          .from("listing_integrity_provider_results")
          .insert({
            provider: PROVIDER_IMAGE_AUTHENTICITY,
            attempt_number: (maxAttempt.get(key) ?? 0) + 1,
            triggered_by: triggeredBy,
            capture_session_id: m.capture_session_id,
            storage_path: m.storage_path,
            category: m.category || null,
            media_id: null,
            ...core,
          });
        if (insErr && (insErr as { code?: string }).code !== "23505") {
          console.error("[aubrey] provider result insert failed:", insErr.message);
        }
      })
    );
  } catch (e) {
    console.error("[aubrey] attempt execution failed — gate will hold:", e);
  }
}

/* ── v2.24 · retry re-gate — RELEASE-ONLY reconciliation for a retried
      publish. Uses the newest integrity truth across BOTH correlation
      states. Moves exactly one kind of listing: pending_review with a
      system-releasable hold (results_pending / provider_unavailable) that
      now aggregates clean+complete → published. It never demotes published,
      never releases finding_review, and never touches the NULL-reason
      dealer/founder queue. The status write is service-client (authenticated
      UPDATE excludes status by column grant) and guarded on status so a
      concurrent founder action is never clobbered. ── */
async function regateHeldListing(params: {
  service: SupabaseClient | null;
  listing: { id: string; status: string; integrity_hold_reason?: string | null };
  mediaMeta: MediaMetaEntry[];
  media: { id: string; storage_path: string; capture_session_id: string | null }[];
  urlByPath: Map<string, string>;
  aubreyOn: boolean;
  email: {
    to: string | null | undefined;
    brand?: string;
    model?: string;
    reference?: string;
    askingPrice: number | null;
  };
}): Promise<{ status: string }> {
  const { service, listing, mediaMeta, media, urlByPath, aubreyOn, email } = params;

  if (listing.status !== "pending_review") return { status: listing.status };
  if (!isSystemReleasableHold(listing.integrity_hold_reason ?? null)) {
    return { status: listing.status };
  }
  if (!service) return { status: listing.status }; // can't verify → hold stands

  if (aubreyOn) {
    await ensureAuthenticityAttempts({
      service,
      mediaMeta,
      urlByPath,
      triggeredBy: TRIGGERED_BY_RETRY,
    });
  }

  const gate = await aggregateIntegrityForListing({
    service,
    mediaMeta,
    media,
    requireAuthenticityCoverage: aubreyOn,
  });

  if (gate.status === "published") {
    const { data: released, error } = await service
      .from("listings")
      .update({ status: "published", integrity_hold_reason: null })
      .eq("id", listing.id)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();
    if (error || !released) {
      if (error) console.error("[aubrey] hold release failed:", error.message);
      return { status: listing.status };
    }
    await sendListingLiveEmail({
      to: email.to,
      brand: email.brand ?? "",
      model: email.model,
      reference: email.reference ?? "",
      askingPrice: email.askingPrice,
      listingId: listing.id,
    });
    return { status: "published" };
  }

  // Still held — if the newest truth upgraded the WHY (e.g. a finding
  // arrived between attempts), record it. Never downgrades finding_review.
  if (gate.holdReason && gate.holdReason !== (listing.integrity_hold_reason ?? null)) {
    await service
      .from("listings")
      .update({ integrity_hold_reason: gate.holdReason })
      .eq("id", listing.id)
      .eq("status", "pending_review");
  }
  return { status: "pending_review" };
}

/* ── v2.24 · the one live-listing email, extracted so the fresh-publish and
      retry-release paths share it. Non-fatal by construction. ── */
async function sendListingLiveEmail(params: {
  to: string | null | undefined;
  brand?: string;
  model?: string | null;
  reference?: string;
  askingPrice: number | null;
  listingId: string;
}): Promise<void> {
  const { to, brand, model, reference, askingPrice, listingId } = params;
  if (!to) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "FairWatchTrade <hello@fairwatchtrade.com>",
      to,
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
              ${brand ?? ""}${model ? " " + model : ""}
            </p>
            <p style="color: #8A8F9E; font-size: 0.8rem; margin: 0 0 0.25rem;">
              Ref. ${reference ?? ""}
            </p>
            <p style="color: #E8E4DC; font-size: 1rem; font-weight: 600; margin: 0.5rem 0 0;">
              $${Number(askingPrice).toLocaleString()}
            </p>
          </div>
          <a href="https://fairwatchtrade.com/listings/${listingId}"
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
    // Email failure is non-fatal — the listing is already live.
  });
}

/* ── v2.3 · the single idempotent post-insert orchestration.

   Shared by fresh-publish and retry. Every step is safe to re-run:
     1. listing_media — insert only rows whose storage_path isn't already present
     2. media_id backfill — update provider rows only where media_id IS NULL
     3. evidence promotion — upsert with ignoreDuplicates (ON CONFLICT DO NOTHING)

   `service` may be null (integrity infra unavailable): listing_media still
   gets written via the session client; integrity steps 2–3 are skipped.

   v2.24: capture_source is now caller-supplied ('live_camera' for the
   mobile wizard, 'desktop_upload' for /sell — allowlisted in POST, so a
   client can never claim 'dealer_import'; RLS independently forbids it),
   and the listing's media rows are returned so the retry re-gate can
   aggregate the post-backfill correlation state without a second read. ── */
async function completePublishOrchestration(params: {
  listingId: string;
  mediaMeta: MediaMetaEntry[];
  session: SupabaseClient;
  service: SupabaseClient | null;
  captureSource: "live_camera" | "desktop_upload";
}): Promise<{ id: string; storage_path: string; capture_session_id: string | null }[]> {
  const { listingId, mediaMeta, session, service, captureSource } = params;
  if (mediaMeta.length === 0) return [];

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
      capture_source: captureSource,
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

  const allMedia = [...(existingMedia ?? []), ...insertedMedia];

  // Integrity steps require the trusted client — skip cleanly if unavailable.
  if (!service) return allMedia;

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
  if (mediaIds.length === 0) return allMedia;

  const { data: results, error: resultsErr } = await service
    .from("listing_integrity_provider_results")
    .select("id, provider, classification, execution_status, is_active, detail, reason")
    .in("media_id", mediaIds);

  if (resultsErr) {
    console.error("[integrity] evidence source read failed:", resultsErr.message);
    return allMedia;
  }

  const evidenceRows = (results ?? [])
    .filter(isPromotableFinding)
    .map((r) => {
      // v2.24 · the schema's purpose-built evidence columns, populated from
      // the Aubrey detail shape when present (null for other providers).
      const d = (r.detail ?? {}) as Record<string, unknown>;
      return {
        listing_id: listingId,
        provider_result_id: r.id,
        provider: r.provider,
        classification: r.classification,
        reason: r.reason ?? null,
        detail: r.detail ?? null,
        matched_source_url:
          typeof d.matched_source_url === "string" ? d.matched_source_url : null,
        confidence: typeof d.best_score === "number" ? d.best_score : null,
      };
    });

  if (evidenceRows.length > 0) {
    const { error: evErr } = await service
      .from("listing_integrity_evidence")
      .upsert(evidenceRows, { onConflict: "provider_result_id", ignoreDuplicates: true });
    if (evErr) {
      console.error("[integrity] evidence promotion failed:", evErr.message);
    }
  }

  return allMedia;
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

  /* ── v2.24 · capture source — allowlisted from the top-level source field.
        A client can only ever claim the two self-serve origins; dealer_import
        is unreachable from here (and RLS independently forbids it). ── */
  const captureSource: "live_camera" | "desktop_upload" =
    body.source === "desktop_sell" ? "desktop_upload" : "live_camera";

  /* ── v2.24 · storage_path → public URL map, for Aubrey execution. Rebuilt
        after the 2A server-side serial blur so it reflects the final
        canonical assets. ── */
  let urlByPath = buildUrlByPath(body.photos);

  const aubreyOn = aubreyEnforcementEnabled();

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
      .select("id, in_hand_verified, status, integrity_hold_reason")
      .eq("publish_request_id", publishRequestId)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (existing) {
      // Resume unfinished orchestration, then RE-GATE against the newest
      // integrity truth (v2.24 ruling — supersedes the never-re-gate rule).
      // Release-only: a system-releasable hold that aggregates clean now
      // publishes; nothing else moves. Never duplicates, never re-sends the
      // live email unless this retry is the moment of actual release.
      const media = await completePublishOrchestration({
        listingId: existing.id,
        mediaMeta,
        session: supabase,
        service,
        captureSource,
      });
      const regated = await regateHeldListing({
        service,
        listing: existing,
        mediaMeta,
        media,
        urlByPath,
        aubreyOn,
        email: {
          to: user.email,
          brand: body.brand,
          model: body.model,
          reference: body.reference,
          askingPrice: parsePrice(body.askingPrice),
        },
      });
      return NextResponse.json(
        {
          id: existing.id,
          in_hand_verified: existing.in_hand_verified === true,
          status: regated.status,
          idempotent: true,
        },
        { status: 200 }
      );
    }
  }

  /* ── Mobile Wizard 2A · server-authoritative serial-photo privacy barrier.
        FRESH PATH ONLY — any idempotent resume already returned above. Every
        Caseback / Non-Crown Side photo is blurred server-side and the
        processed asset becomes canonical BEFORE badge / gate / insert /
        listing_media. A single failure blocks publication: no raw
        serial-sensitive original is ever written, no seller work discarded,
        and the stable publish_request_id keeps the retry idempotent. ── */
  {
    const blurOutcome = await applyServerSerialBlur(
      (body.photos ?? []) as {
        photo?: { url?: unknown; pathname?: unknown };
        category?: unknown;
      }[],
      mediaMeta
    );
    if (blurOutcome.failed > 0) {
      return NextResponse.json(
        {
          error: "serial_blur_incomplete",
          detail:
            "We couldn't finish privacy protection on one of your photos. Your listing isn't lost — please try publishing again in a moment.",
        },
        { status: 422 }
      );
    }
    // Rebuild the path→url map from the now-final canonical assets so Aubrey
    // execution and the integrity gate evaluate the processed images.
    urlByPath = buildUrlByPath(body.photos);
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

  /* ── v2.24 · Aubrey execution BEFORE the gate — enforcement-gated. While
        AUBREY_ENFORCEMENT is off this is dead code: no rows, no calls. ── */
  if (aubreyOn && hasCorrelatableMedia && service) {
    await ensureAuthenticityAttempts({
      service,
      mediaMeta,
      urlByPath,
      triggeredBy: TRIGGERED_BY_UPLOAD,
    });
  }

  /* ── v2.3/v2.24 · decide initial lifecycle status BEFORE insert — the one
        shared gate, plus the WHY (integrity_hold_reason) for pending_review. ── */
  let initialStatus: ListingStatus = "published";
  let holdReason: IntegrityHoldReason | null = null;
  if (hasCorrelatableMedia) {
    if (serviceUnavailable || !service) {
      initialStatus = "pending_review"; // can't verify → hold, don't fabricate clean
      holdReason = HOLD_RESULTS_PENDING;
    } else {
      const gate = await aggregateIntegrityForListing({
        service,
        mediaMeta,
        requireAuthenticityCoverage: aubreyOn,
      });
      initialStatus = gate.status;
      holdReason = gate.holdReason;
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
  // v2.24 · the WHY of a pending_review joins the row only when held here.
  if (holdReason) {
    row.integrity_hold_reason = holdReason;
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
        .select("id, in_hand_verified, status, integrity_hold_reason")
        .eq("publish_request_id", publishRequestId)
        .eq("seller_id", user.id)
        .maybeSingle();
      if (winner) {
        const media = await completePublishOrchestration({
          listingId: winner.id,
          mediaMeta,
          session: supabase,
          service,
          captureSource,
        });
        const regated = await regateHeldListing({
          service,
          listing: winner,
          mediaMeta,
          media,
          urlByPath,
          aubreyOn,
          email: {
            to: user.email,
            brand: body.brand,
            model: body.model,
            reference: body.reference,
            askingPrice: parsePrice(body.askingPrice),
          },
        });
        return NextResponse.json(
          {
            id: winner.id,
            in_hand_verified: winner.in_hand_verified === true,
            status: regated.status,
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
    captureSource,
  });

  /* ── v2.24 · email honesty — "your listing is live" sends ONLY when it is.
        A held listing gets no email; the retry-release path sends it at the
        moment of actual release instead. ── */
  if (data.status === "published") {
    await sendListingLiveEmail({
      to: user.email,
      brand: body.brand,
      model: body.model,
      reference: body.reference,
      askingPrice: parsePrice(body.askingPrice),
      listingId: data.id,
    });
  }

  return NextResponse.json(
    { id: data.id, in_hand_verified: inHandVerified, status: data.status },
    { status: 201 }
  );
}
