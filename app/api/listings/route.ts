import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runReviewTriageForListing } from "@/lib/reviewTriageService";
import {
  PROVIDER_IDENTITY_CONSISTENCY,
  PROVIDER_IMAGE_AUTHENTICITY,
  TRIGGERED_BY_UPLOAD,
  TRIGGERED_BY_RETRY,
  HOLD_RESULTS_PENDING,
  aggregateIntegrityForListing,
  buildPromotedEvidenceRows,
  isSystemReleasableHold,
  type IntegrityHoldReason,
} from "@/lib/integrity";
import {
  aubreyEnforcementEnabled,
  executeImageAuthenticityCheck,
} from "@/lib/imageAuthenticity";
import {
  executeIdentityConsistencyCheck,
  identityConsistencyEnabled,
} from "@/lib/identityConsistency";
import {
  ensureExactHashAttempts,
  type ExactHashMediaRow,
} from "@/lib/aubrey/listingPhotoExactHash";
import { parsePrice } from "@/lib/parsePrice";
import { formatMoney } from "@/lib/formatMoney";
import { sendListingLiveEmail } from "@/lib/listingLiveEmail";
import { sendSubmissionReceivedEmail } from "@/lib/listingDecisionEmail";
import { isSupportedCurrency } from "@/lib/supportedCurrencies";
import {
  isDefaultPresentation,
  sanitizePhotoPresentation,
} from "@/lib/photoPresentation";
import {
  requirementProfileFor,
  evaluatePublishAdmission,
  type AdmissionState,
} from "@/lib/admission/requirementProfile";
import {
  classifyRolexIdentifier,
  ROLEX_IDENTIFIER_STOP,
  ROLEX_IDENTIFIER_STOP_DETAIL,
} from "@/lib/admission/rolexIdentifier";
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
  /** Private Listing V1 — a message thread the caller participates in; the
      server derives the one authorized buyer from it. Never a buyer id. */
  privateThreadId?: string;
  brand?: string;
  customBrandFlag?: boolean;
  model?: string;
  reference?: string;
  year?: string;
  condition?: string;
  askingPrice?: string;
  // Money Truth Stage B — the amount's currency travels WITH the amount from
  // the seller flow's confirmed selector. Required whenever a price is given.
  askingCurrency?: string;
  provenanceNote?: string;
  significanceScore?: number | null;
  photos?: unknown[];
  photoPresentation?: unknown;
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

/* Money Truth Stage B — the local [^0-9.]-strip clone is retired. Amount and
   currency are parsed together through the governed lib/parsePrice contract,
   and they are written together or not at all (present-or-absent-together at
   the application layer; Stage D adds the database constraint). */
type MoneyTruth =
  | { ok: true; amount: number | null; raw: string | null; currency: string | null }
  | { ok: false; detail: string };

function resolveAskingMoney(rawPrice?: string, rawCurrency?: string): MoneyTruth {
  const priceText = typeof rawPrice === "string" ? rawPrice.trim() : "";
  if (priceText === "") {
    // No amount → no currency. An amount-less draft (e.g. price on request)
    // carries no money fact to protect.
    return { ok: true, amount: null, raw: null, currency: null };
  }
  if (!isSupportedCurrency(rawCurrency)) {
    return {
      ok: false,
      detail: "Choose the currency for your asking price before publishing.",
    };
  }
  const parsed = parsePrice(priceText, rawCurrency);
  if (!parsed.ok) return { ok: false, detail: parsed.message };
  return { ok: true, amount: parsed.amount, raw: parsed.raw, currency: rawCurrency };
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

type ListingStatus = "published" | "pending_review" | "private_active";

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

/* ── Identity Consistency attempts — the third provider on this seam.
      Mirrors ensureAuthenticityAttempts row-for-row (same correlation, same
      attempt numbering, same 23505 tolerance) with three deliberate
      differences: its own enablement flag; Dial-tagged photographs only
      (the packet's routing law — the tag chooses WHERE to look, the visible
      pixels alone decide WHAT is seen); and its unavailable rows can never
      hold a listing, because the gate's coverage requirement is
      image_authenticity-scoped by construction. Never throws. ── */
async function ensureIdentityConsistencyAttempts(params: {
  service: SupabaseClient;
  mediaMeta: MediaMetaEntry[];
  urlByPath: Map<string, string>;
  claimedBrand: string;
  triggeredBy: typeof TRIGGERED_BY_UPLOAD | typeof TRIGGERED_BY_RETRY;
}): Promise<void> {
  const { service, mediaMeta, urlByPath, claimedBrand, triggeredBy } = params;
  const pairs = mediaMeta.filter(
    (m) => m.capture_session_id && m.storage_path && m.category === "Dial"
  );
  if (pairs.length === 0 || !claimedBrand) return;

  try {
    const sessionIds = Array.from(new Set(pairs.map((m) => m.capture_session_id as string)));
    const { data: existing, error } = await service
      .from("listing_integrity_provider_results")
      .select("capture_session_id, storage_path, execution_status, is_active, attempt_number")
      .in("capture_session_id", sessionIds)
      .eq("provider", PROVIDER_IDENTITY_CONSISTENCY);
    if (error) {
      console.error("[identity] attempt-state read failed:", error.message);
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
          ? await executeIdentityConsistencyCheck({
              photoUrl: url,
              claimedBrand,
              category: m.category || null,
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
            attempt_number: (maxAttempt.get(key) ?? 0) + 1,
            triggered_by: triggeredBy,
            capture_session_id: m.capture_session_id,
            storage_path: m.storage_path,
            category: m.category || null,
            media_id: null,
            ...core,
          });
        if (insErr && (insErr as { code?: string }).code !== "23505") {
          console.error("[identity] provider result insert failed:", insErr.message);
        }
      })
    );
  } catch (e) {
    console.error("[identity] attempt execution failed:", e);
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
  media: { id: string; storage_path: string | null; capture_session_id: string | null }[];
  urlByPath: Map<string, string>;
  aubreyOn: boolean;
  email: {
    to: string | null | undefined;
    brand?: string;
    model?: string;
    reference?: string;
    /** Already-formatted, currency-aware price text (or the undisclosed state). */
    priceText: string;
  };
}): Promise<{ status: string; holdReason: string | null }> {
  const { service, listing, mediaMeta, media, urlByPath, aubreyOn } = params;
  const current = listing.integrity_hold_reason ?? null;

  if (listing.status !== "pending_review") {
    return { status: listing.status, holdReason: current };
  }
  if (!isSystemReleasableHold(current)) {
    return { status: listing.status, holdReason: current };
  }
  if (!service) return { status: listing.status, holdReason: current }; // can't verify → hold stands

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
    /* The system's objection is gone — so clear the WHY. It does NOT publish.
       Under the governed lifecycle only founder approval publishes, so a
       cleared hold hands the listing to the ordinary founder queue (NULL
       reason) rather than to buyers. The seller is told nothing new here and
       no live email fires: nothing went live. */
    const { error } = await service
      .from("listings")
      .update({ integrity_hold_reason: null })
      .eq("id", listing.id)
      .eq("status", "pending_review");
    if (error) console.error("[aubrey] hold clear failed:", error.message);
    return { status: "pending_review", holdReason: error ? current : null };
  }

  // Still held — if the newest truth upgraded the WHY (e.g. a finding
  // arrived between attempts), record it. Never downgrades finding_review.
  if (gate.holdReason && gate.holdReason !== current) {
    await service
      .from("listings")
      .update({ integrity_hold_reason: gate.holdReason })
      .eq("id", listing.id)
      .eq("status", "pending_review");
  }
  return { status: "pending_review", holdReason: gate.holdReason ?? current };
}

/* The live email now lives in lib/listingLiveEmail.ts — publication moved to
   founder approval (v3.53), so the adjudication route needs the same one. */

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
  /** Aubrey Flight 1 — from route orchestration context only, never client
      data: 'system_upload' on the fresh-publish path, 'retry' on the
      idempotent resume paths. */
  exactHashTriggeredBy: typeof TRIGGERED_BY_UPLOAD | typeof TRIGGERED_BY_RETRY;
}): Promise<ExactHashMediaRow[]> {
  const { listingId, mediaMeta, session, service, captureSource, exactHashTriggeredBy } =
    params;
  if (mediaMeta.length === 0) return [];

  // 1 · listing_media — idempotent insert by storage_path within this listing.
  //     (capture_source + category ride along as the authoritative fields the
  //     Aubrey exact-hash helper requires — database-derived, never payload.)
  const { data: existingMedia, error: existingErr } = await session
    .from("listing_media")
    .select("id, listing_id, storage_path, capture_session_id, capture_source, category")
    .eq("listing_id", listingId);

  if (existingErr) {
    console.error("listing_media read failed:", existingErr.message);
  }

  const existingPaths = new Set((existingMedia ?? []).map((r) => r.storage_path));
  const toInsert = mediaMeta.filter((m) => !existingPaths.has(m.storage_path));

  let insertedMedia: ExactHashMediaRow[] = [];
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
      .select("id, listing_id, storage_path, capture_session_id, capture_source, category");
    if (mediaError) {
      console.error("listing_media insert failed:", mediaError.message);
    } else {
      insertedMedia = (data ?? []) as ExactHashMediaRow[];
    }
  }

  const allMedia = [
    ...((existingMedia ?? []) as ExactHashMediaRow[]),
    ...insertedMedia,
  ];

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

  // 2b · Aubrey Flight 1 — exact retained-byte hash evidence, AFTER the
  //      authoritative media rows exist and BEFORE the evidence-promotion
  //      read so completed observations can be promoted in the same pass.
  //      Inert by construction: never consulted by decideInitialStatus,
  //      aggregateIntegrityForListing, regateHeldListing, or any listing
  //      update, and not conditional on AUBREY_ENFORCEMENT.
  await ensureExactHashAttempts({
    service,
    media: allMedia,
    triggeredBy: exactHashTriggeredBy,
  });

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

  // Step 2 · cause identity is assigned inside the shared builder, so the
  // publish path and the founder recheck path can never drift apart.
  const evidenceRows = await buildPromotedEvidenceRows({
    service,
    listingId,
    results: results ?? [],
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

  /* ── Private Listing V1 (v5.98) — the conversation-led buyer seam ────────
        The client may name a MESSAGE THREAD, never a buyer. The server
        derives the buyer from the thread's participants and requires the
        caller to be the other one — so a forged id, a stranger's thread, or
        a retyped email can never target a buyer the seller has no
        relationship with. RLS on message_threads independently hides foreign
        threads, so the read below returns nothing unless the caller is a
        real participant. */
  let privateBuyerId: string | null = null;
  const privateThreadId =
    typeof body.privateThreadId === "string" ? body.privateThreadId.trim() : "";
  if (privateThreadId) {
    const { data: thread } = await supabase
      .from("message_threads")
      .select("id, participant_a_id, participant_b_id")
      .eq("id", privateThreadId)
      .maybeSingle();
    const isParticipant =
      !!thread &&
      (thread.participant_a_id === user.id || thread.participant_b_id === user.id);
    const counterpart = !thread
      ? null
      : thread.participant_a_id === user.id
        ? thread.participant_b_id
        : thread.participant_a_id;
    if (!isParticipant || !counterpart || counterpart === user.id) {
      return NextResponse.json(
        {
          error: "invalid_private_thread",
          detail:
            "This private listing must start from one of your own buyer conversations.",
        },
        { status: 400 }
      );
    }
    privateBuyerId = counterpart;
  }

  /* ── Money Truth Stage B — one governed resolution, used everywhere below.
        Amount and currency are accepted together or not at all; ambiguous or
        symbol-laden notation is refused with the parser's own reason. The
        email renders through formatMoney (never a bare $), and a failed parse
        on a RETRY only affects the email text, never the resume itself. ── */
  const money = resolveAskingMoney(body.askingPrice, body.askingCurrency);
  const emailPriceText = money.ok
    ? formatMoney(money.amount, money.currency)
    : formatMoney(null, null);

  const mediaMeta = sanitizeMediaMeta(body.media_meta);
  const hasCorrelatableMedia = mediaMeta.some((m) => m.capture_session_id && m.storage_path);

  /* ── v2.24 · capture source — allowlisted from the top-level source field.
        A client can only ever claim the two self-serve origins; dealer_import
        is unreachable from here (and RLS independently forbids it). ── */
  const captureSource: "live_camera" | "desktop_upload" =
    body.source === "desktop_sell" ? "desktop_upload" : "live_camera";

  /* ── v2.24 · storage_path → public URL map, for Aubrey execution. The
        payload's photos array already carries both halves of the pair. ── */
  const urlByPath = new Map<string, string>();
  for (const p of (body.photos ?? []) as { photo?: { url?: unknown; pathname?: unknown } }[]) {
    const url = typeof p?.photo?.url === "string" ? p.photo.url : "";
    const pathname = typeof p?.photo?.pathname === "string" ? p.photo.pathname : "";
    if (url && pathname) urlByPath.set(pathname, url);
  }

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
        exactHashTriggeredBy: TRIGGERED_BY_RETRY,
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
          priceText: emailPriceText,
        },
      });
      return NextResponse.json(
        {
          id: existing.id,
          in_hand_verified: existing.in_hand_verified === true,
          status: regated.status,
          held: regated.status === "pending_review" && regated.holdReason !== null,
          idempotent: true,
        },
        { status: 200 }
      );
    }
  }

  /* ── Money Truth Stage B — fresh publishes only reach the insert with a
        governed amount+currency pair (or neither). A retry above is exempt:
        the listing already exists and must stay resumable. ── */
  if (!money.ok) {
    return NextResponse.json(
      { error: "invalid_amount", detail: money.detail },
      { status: 400 }
    );
  }

  /* ── Brand admission — server-side publication gates (Rolex Admission
        Design Gate v1). The SAME shared gate logic the Review step renders
        decides here: the server never trusts that the client corridor was
        walked. Non-profile brands skip this entirely; a retry above is
        exempt because its listing already exists and must stay resumable.
        PFC274 = 62 — the evaluate route is untouched. ── */
  const admissionProfile = requirementProfileFor(body.brand);
  if (admissionProfile) {
    /* ── Rolex identifier (Style-number ruling 2026-08-06) — the SAME
          deterministic classification the client corridor runs, applied
          here without trusting that it ran. A bare canonical reference is
          admitted directly; a recognized composite Style is preserved
          verbatim as documentary evidence while the listing's public
          identity becomes its deterministically derived canonical
          reference; an unsupported structure is refused with the governed
          humble copy — never a claim that the value is unknown to Rolex.
          Identifier recognition NEVER satisfies the documentation gates
          evaluated below. ── */
    const identifier = classifyRolexIdentifier(body.reference);
    if (identifier.kind === "unsupported") {
      return NextResponse.json(
        {
          error: "admission_requirements",
          detail: `${ROLEX_IDENTIFIER_STOP} ${ROLEX_IDENTIFIER_STOP_DETAIL}`,
        },
        { status: 400 }
      );
    }
    if (identifier.kind === "style") {
      body.reference = identifier.reference;
      const detailsWithStyle = (body.details ?? {}) as Record<string, unknown>;
      detailsWithStyle.admission = {
        ...((detailsWithStyle.admission as Record<string, unknown>) ?? {}),
        styleNumber: identifier.style,
      };
      body.details = detailsWithStyle;
    }
    const details = (body.details ?? {}) as Record<string, unknown>;
    const verdict = evaluatePublishAdmission(admissionProfile, {
      admission: details.admission as AdmissionState | undefined,
      includedWithWatch: Array.isArray(details.includedWithWatch)
        ? (details.includedWithWatch as string[])
        : [],
      documentation:
        typeof details.documentation === "string" ? details.documentation : undefined,
      description: typeof body.description === "string" ? body.description : "",
      provenanceNote:
        typeof body.provenanceNote === "string" ? body.provenanceNote : "",
      photoCategories: ((body.photos ?? []) as { category?: unknown }[])
        .map((p) => (typeof p?.category === "string" ? p.category : ""))
        .filter(Boolean),
    });
    if (!verdict.ok) {
      return NextResponse.json(
        { error: "admission_requirements", detail: verdict.detail },
        { status: 400 }
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

  /* ── Identity Consistency on the same seam — own flag, own question.
        Runs BEFORE the witness gate for the same reason Aubrey does: a
        completed contradiction becomes a finding_review hold in this very
        submission, which is exactly the seam the founder's controlled
        mismatch test proved undefended. Inert while the flag is off. ── */
  if (identityConsistencyEnabled() && hasCorrelatableMedia && service) {
    await ensureIdentityConsistencyAttempts({
      service,
      mediaMeta,
      urlByPath,
      claimedBrand: body.brand ?? "",
      triggeredBy: TRIGGERED_BY_UPLOAD,
    });
  }

  /* ── Submission is never publication (governed lifecycle, 2026-08-07) ─────
        A seller submits for review; a listing becomes public ONLY through the
        founder adjudication path in app/api/admin/listings/[id]/status. This
        route therefore always lands at 'pending_review' — the previous
        default of 'published' was the direct-publish defect: a clean integrity
        result put a listing straight into Browse with no human decision.

        The integrity gate is NOT removed, it is demoted from gatekeeper to
        witness: it no longer decides publication, it records WHY a listing
        needs attention (integrity_hold_reason). A NULL hold reason now means
        "nothing the system objects to" — the ordinary founder queue — which
        is exactly what NULL already meant for the dealer/founder path. ── */
  let initialStatus: ListingStatus = "pending_review";
  let holdReason: IntegrityHoldReason | null = null;
  if (hasCorrelatableMedia) {
    if (serviceUnavailable || !service) {
      holdReason = HOLD_RESULTS_PENDING; // can't verify → say so, don't fabricate clean
    } else {
      const gate = await aggregateIntegrityForListing({
        service,
        mediaMeta,
        requireAuthenticityCoverage: aubreyOn,
      });
      // gate.status 'published' means "the system has no objection", which is
      // now recorded as the absence of a hold reason, never as publication.
      holdReason = gate.holdReason;
    }
  }

  /* Private Listing V1 — activation is seller-direct (Product Law: Private
     Draft → Private Active needs no founder gate; nothing goes public), but
     the photograph trust rules are NOT weakened: an integrity hold sends the
     private submission into the same pending_review witness path every
     listing gets, and founder approval of a private-intended row lands back
     on 'private_active' (the admin status route knows), never 'published'. */
  if (privateBuyerId && !holdReason) {
    initialStatus = "private_active";
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
    // The governed pair, written together — plus the exact raw text the parser
    // accepted, so asking_price_raw can never drift from the canonical value
    // (it is re-derived from the same parse on every create).
    asking_price: money.amount,
    asking_price_raw: money.raw,
    asking_currency: money.currency,
    provenance_note: body.provenanceNote ?? null,
    significance_score: body.significanceScore ?? null,
    score_state: body.scoreState ?? {},
    photos: body.photos ?? [],
    has_bracelet: body.hasBracelet ?? false,
    details: body.details ?? {},
    description: body.description ?? null,
    description_passed_ai: body.descriptionPassedAI ?? null,
  };

  /* ── Hero framing ── re-sanitized here rather than trusted: the client value
        has crossed the network and the DB CHECK will refuse anything out of
        bounds, so a bad payload must become automatic framing, not a 500 on an
        otherwise valid publish. Default framing writes NULL instead of a
        centred object — "the seller chose nothing" and "the seller chose the
        centre" are the same picture, and NULL keeps that honest in the data. */
  const presentation = sanitizePhotoPresentation(body.photoPresentation);
  if (!isDefaultPresentation(presentation)) {
    row.photo_presentation = presentation;
  }

  // Private Listing V1 — the one authorized buyer rides the row itself; the
  // DB CHECK (private_active ⇒ buyer present) keeps state and relationship
  // one fact.
  if (privateBuyerId) {
    row.private_buyer_id = privateBuyerId;
  }

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
    .select("id, status, public_code")
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
          exactHashTriggeredBy: TRIGGERED_BY_RETRY,
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
            priceText: emailPriceText,
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
    exactHashTriggeredBy: TRIGGERED_BY_UPLOAD,
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
      priceText: emailPriceText,
      listingId: data.id,
    });
  }

  /* ── Founder Review Triage ───────────────────────────────────────────
     The evidence work above is finished, so this is the moment the listing
     can be triaged. ESCALATE is the overwhelmingly likely outcome and
     changes nothing; a governed PASS or FAIL disposes the listing here and
     keeps it out of Founder Review entirely.

     NON-FATAL BY CONSTRUCTION. The seller's submission has already
     succeeded; a triage failure must never turn that into an error. A
     listing that could not be triaged simply stays pending_review, which is
     where Founder Review already looks. */
  if (data.status === "pending_review") {
    try {
      await runReviewTriageForListing(data.id as string);
    } catch (e) {
      console.error("[triage] submission triage failed:", e);
    }
  }

  /* ── Submission receipt ─────────────────────────────────────────────────
     No silent review state: the seller is told immediately that we have the
     listing and that it is NOT public yet. This is a fresh insert, so it is
     inherently once-per-submission — a retry with the same publish_request_id
     returns from the idempotent branch far above and never reaches here. */
  if (data.status === "pending_review") {
    await sendSubmissionReceivedEmail({
      to: user.email,
      brand: body.brand,
      model: body.model,
      reference: body.reference,
      publicCode: (data as { public_code?: string | null }).public_code ?? null,
    });
  }

  /* `held` distinguishes "the system has something for a human to look at"
     from the ordinary review queue. Both are pending_review; only the first
     earns the authenticity-review wording. It is a boolean by design — which
     signal fired is never seller-facing. */
  return NextResponse.json(
    {
      id: data.id,
      in_hand_verified: inHandVerified,
      status: data.status,
      held: holdReason !== null,
    },
    { status: 201 }
  );
}
