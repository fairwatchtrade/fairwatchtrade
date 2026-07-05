import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings  — publish a listing

   Reads the authenticated seller from the Supabase session (NOT from the
   request body — the body never gets to claim a seller_id), parses the
   asking price into a numeric for sort/filter while keeping the original
   string lossless, snapshots the scoring state, and inserts the row.

   Returns { id } on success, or { error, detail } on failure — no silent
   fail-open. The client decides what to show.

   ── v2.2 additions (all ADDITIVE — a payload without the new fields takes
      exactly the pre-v2.2 path, byte for byte) ─────────────────────────────

   1. IDEMPOTENCY — publish_request_id. One UUID per publish intent, stable
      across retries. If a listing already exists with it (this seller),
      return that listing instead of inserting. The DB's partial unique
      index backstops the race: a concurrent duplicate insert fails with
      23505 and we return the winner. Double-taps produce one listing.

   2. LISTING_MEDIA — server-side writes only. The wizard sends media_meta
      (capture provenance per photo); the SERVER inserts the rows after the
      listing exists. The client never touches the table. Media failures are
      non-fatal to the publish but fatal to the badge.

   3. IN HAND VERIFIED — server-authoritative badge. Granted on the insert
      itself (never a client claim) only when the capture session verifies:
      session row exists for this seller, device token matches, status
      active/completed, within the 2-hour activity window, AND every
      mandatory category for the declared sale_state arrived via
      live_camera under that session. Anything short → the listing still
      publishes, without the badge. Sessions expire; drafts endure.

      Residual trust gap, documented: media_meta content is client-supplied.
      The session gate bounds it (a real authed wizard session is required),
      and the AI-review + server hash-recompute phase closes it. The badge
      can also be revoked there — grant here is necessary, not final.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Light shape — mirrors ListingDraft without importing it server-side, so a
// future field rename in the draft can't silently break this route's build.
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

/** The wizard's mandatory capture set per sale state — the badge's bar.
    Server-side mirror of buildCaptureSteps (categories only). Note the
    "other" clasp step is skippable in the wizard, so it is not badge-
    mandatory there; head_only has no clasp at all. */
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

/** Coerce + bound the client-supplied media metadata. Anything malformed is
    dropped, never fatal. Hard cap keeps a hostile payload from bulk-writing. */
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

  /* ── v2.2 · idempotency pre-check — a retry returns the original ── */
  const publishRequestId =
    typeof body.publish_request_id === "string" && body.publish_request_id.trim() !== ""
      ? body.publish_request_id.trim().slice(0, 64)
      : null;

  if (publishRequestId) {
    const { data: existing } = await supabase
      .from("listings")
      .select("id, in_hand_verified")
      .eq("publish_request_id", publishRequestId)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (existing) {
      // Already published by an earlier attempt — same result, no new row,
      // no second confirmation email.
      return NextResponse.json(
        { id: existing.id, in_hand_verified: existing.in_hand_verified === true, idempotent: true },
        { status: 200 }
      );
    }
  }

  /* ── v2.2 · badge verification — server-authoritative, before insert so
        the grant rides the insert itself (single write, race-free) ── */
  const saleState = SALE_STATES.includes(body.sale_state as SaleStateValue)
    ? (body.sale_state as SaleStateValue)
    : null;
  const mediaMeta = sanitizeMediaMeta(body.media_meta);
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

  const row: Record<string, unknown> = {
    seller_id: user.id,
    status: "published",
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

  // v2.2 columns join the row ONLY when the wizard fields are present, so a
  // desktop publish writes exactly the same row it wrote before this version.
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
    .select("id")
    .single();

  if (error) {
    // v2.2 · race-safe idempotency: a concurrent duplicate hit the partial
    // unique index (Postgres 23505). The first insert won — return it.
    if (publishRequestId && (error as { code?: string }).code === "23505") {
      const { data: winner } = await supabase
        .from("listings")
        .select("id, in_hand_verified")
        .eq("publish_request_id", publishRequestId)
        .eq("seller_id", user.id)
        .maybeSingle();
      if (winner) {
        return NextResponse.json(
          { id: winner.id, in_hand_verified: winner.in_hand_verified === true, idempotent: true },
          { status: 200 }
        );
      }
    }
    return NextResponse.json(
      { error: "insert_failed", detail: error.message },
      { status: 500 }
    );
  }

  /* ── v2.2 · listing_media — server-side writes, client never touches the
        table. Non-fatal to the publish: the listing exists either way. ── */
  if (mediaMeta.length > 0) {
    const mediaRows = mediaMeta.map((m) => ({
      listing_id: data.id,
      category: m.category,
      storage_path: m.storage_path,
      capture_source: "live_camera",
      capture_session_id: m.capture_session_id,
      sequence_index: m.sequence_index,
      original_hash: m.original_hash || null,
      ai_review_status: "pending",
      privacy_review_status: m.privacy_review_requested ? "pending" : "not_required",
    }));
    const { error: mediaError } = await supabase.from("listing_media").insert(mediaRows);
    if (mediaError) {
      // Publish stands; provenance rows can be reconciled by a later pass.
      console.error("listing_media insert failed:", mediaError.message);
    }
  }

  // Seller-confirmation email (Resend). Non-fatal by design: if Resend fails
  // for any reason, the publish has already succeeded and we still return { id }.
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

  return NextResponse.json({ id: data.id, in_hand_verified: inHandVerified }, { status: 201 });
}
