import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/dealer-accelerator/import — Dealer Accelerator, Phase 1

   THE IMPORT SPINE. Admin-assisted, founder-initiated. Creates dealer-owned
   DRAFT listings on a selected existing dealer's behalf, then stops. It does
   not publish, does not enrich, does not certify — it accelerates creation and
   hands the resulting drafts to FairWatchTrade's normal lifecycle and
   enrichment systems. "Import once. Enrich forever."

   ── LIFECYCLE (locked) ─────────────────────────────────────────────────
     Founder/Admin initiates → supplies an existing dealer profile UUID →
     this route (service-role) creates dealer-owned rows as status='draft' →
     the dealer later reviews and submits each for review → admin publishes
     or rejects. One listing, one lifecycle: draft → pending_review →
     published | rejected. The imported row IS the listings row from creation;
     there is NO staging/mirror/parallel table.

   ── AUTHORIZATION (defense-in-depth, matches /api/admin/listings/[id]/status)
     Two independent things must hold:
       · The founder gate below — a HARDCODED literal in THIS file, not an
         imported shared constant. A non-founder is rejected here regardless
         of any UI.
       · The service-role write — reached ONLY after that gate. It bypasses
         RLS (listings_insert_own requires auth.uid() = seller_id, which would
         otherwise forbid creating a row owned by a DIFFERENT profile). The
         trusted client is the whole reason admin-assisted import is possible.

   ── TRUTH BOUNDARIES (locked) ──────────────────────────────────────────
     · status is ALWAYS 'draft'. Never published, never publicly visible,
       never fires the publish notification trigger.
     · Imported photos are stamped capture_source='dealer_import'. They are
       NEVER 'live_camera' and can NEVER earn In Hand Verified — that badge is
       granted only for live-camera capture sessions elsewhere, and nothing
       here sets in_hand_verified or verified_at.
     · No score is fabricated (significance/completeness/combined left null).
       No penalty for missing data; only a penalty for bad data. A field we
       cannot determine is left blank for the dealer to confirm — never guessed.

   ── ERROR MODEL ────────────────────────────────────────────────────────
     Row-level and partial-success. Each listing row is inserted independently;
     one bad row never rolls back the good ones. The response reports, per row:
     created (with any soft warnings) or failed (with a reason). A row missing
     brand or reference is a HARD failure (both are NOT NULL and structurally
     required). An unparseable asking price is a SOFT warning: the price is
     left blank and the draft is still created, because inserting a wrong price
     would force the dealer to undo it (Law 16) — worse than leaving it blank.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of any shared constant and of the other admin surfaces' own copies.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

// Bound the batch so a runaway/malformed payload can't attempt thousands of
// inserts in one call. Phase 1 is admin-assisted and deliberate.
const MAX_ROWS = 200;

/* ── Input contract (the ROUTE's payload — NOT the dealer-facing intake
      format, which is deferred). An intake adapter (CSV / pasted text / admin
      form) is what will eventually PRODUCE this shape. ── */
type ImportPhotoInput = {
  url?: unknown;
  pathname?: unknown;
  category?: unknown;
};

type ImportListingInput = {
  brand?: unknown;
  model?: unknown;
  reference?: unknown;
  year?: unknown;
  condition?: unknown;
  askingPrice?: unknown;
  provenanceNote?: unknown;
  description?: unknown;
  hasBracelet?: unknown;
  details?: unknown;
  photos?: unknown;
};

type ImportBody = {
  dealer_profile_id?: unknown;
  listings?: unknown;
};

/* ── The buyer-facing photo shape stored in listings.photos (jsonb), mirroring
      exactly what SellFlow/MobileWizard write: { photo:{url,pathname}, category,
      isWristShot }. category may be null for an imported photo we can't classify
      yet — no penalty for missing data. ── */
type StoredPhoto = {
  photo: { url: string; pathname: string | null };
  category: string | null;
  isWristShot: boolean;
};

/* ── A listing_media row for provenance tracking. category + storage_path +
      capture_source are NOT NULL in the schema, so we only create a media row
      for a photo that actually has a usable URL to serve as storage_path. ── */
type MediaInsertRow = {
  listing_id: string;
  category: string;
  storage_path: string;
  capture_source: "dealer_import";
  ai_review_status: "pending";
  privacy_review_status: "pending";
  sequence_index: number;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

/* ── Normalize one row's photos into the stored jsonb shape. A photo with no
      usable url is dropped (nothing to display or serve). category is kept when
      present, else null. Returns both the jsonb array and the subset that has a
      url usable as a listing_media storage_path. ── */
function normalizePhotos(raw: unknown): {
  stored: StoredPhoto[];
  media: Omit<MediaInsertRow, "listing_id">[];
} {
  if (!Array.isArray(raw)) return { stored: [], media: [] };
  const stored: StoredPhoto[] = [];
  const media: Omit<MediaInsertRow, "listing_id">[] = [];
  for (const item of raw.slice(0, 40)) {
    if (typeof item !== "object" || item === null) continue;
    const p = item as ImportPhotoInput;
    const url = str(p.url);
    if (!url) continue; // no url → nothing to store or serve
    const pathname = str(p.pathname) || null;
    const category = str(p.category) || null;
    stored.push({ photo: { url, pathname }, category, isWristShot: false });
    // listing_media.storage_path + category are NOT NULL. Use the url as the
    // storage_path (dealer-hosted or already-uploaded), and a neutral category
    // label when the import didn't classify the shot.
    media.push({
      category: category ?? "Uncategorized",
      storage_path: url,
      capture_source: "dealer_import",
      ai_review_status: "pending",
      privacy_review_status: "pending",
      sequence_index: media.length,
    });
  }
  return { stored, media };
}

type RowResult =
  | {
      ok: true;
      index: number;
      listing_id: string;
      brand: string;
      reference: string;
      warnings: string[];
    }
  | { ok: false; index: number; brand: string | null; reference: string | null; error: string };

export async function POST(request: NextRequest) {
  /* 1 · authenticate + founder gate (session client, independent). */
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

  /* 2 · parse body. */
  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not parse request body." },
      { status: 400 }
    );
  }

  const dealerId = str(body.dealer_profile_id);
  if (!dealerId) {
    return NextResponse.json(
      { error: "missing_dealer", detail: "dealer_profile_id is required." },
      { status: 400 }
    );
  }

  const rows = Array.isArray(body.listings) ? body.listings : null;
  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "missing_listings", detail: "listings must be a non-empty array." },
      { status: 400 }
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: "too_many_rows", detail: `A single import is limited to ${MAX_ROWS} rows.` },
      { status: 400 }
    );
  }

  /* 3 · trusted client (bypasses RLS; reached only after the founder gate). */
  let service: SupabaseClient;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[dealer-import] trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin write channel unavailable." },
      { status: 500 }
    );
  }

  /* 4 · validate the dealer profile EXISTS. listings.seller_id has no FK, so
        the DB will not reject a bogus UUID — an unvalidated id would create
        orphaned listings owned by nobody. This check is the guard. */
  const { data: dealer, error: dealerErr } = await service
    .from("profiles")
    .select("id")
    .eq("id", dealerId)
    .maybeSingle();

  if (dealerErr) {
    return NextResponse.json(
      { error: "dealer_lookup_failed", detail: dealerErr.message },
      { status: 500 }
    );
  }
  if (!dealer) {
    return NextResponse.json(
      { error: "dealer_not_found", detail: `No profile with id ${dealerId}.` },
      { status: 404 }
    );
  }

  /* 5 · per-row insert. Independent inserts → partial success. */
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (typeof raw !== "object" || raw === null) {
      results.push({ ok: false, index: i, brand: null, reference: null, error: "row_not_object" });
      continue;
    }
    const r = raw as ImportListingInput;
    const brand = str(r.brand);
    const reference = str(r.reference);

    // Hard requirements: both are NOT NULL and structurally required.
    if (!brand || !reference) {
      results.push({
        ok: false,
        index: i,
        brand: brand || null,
        reference: reference || null,
        error: "missing_brand_or_reference",
      });
      continue;
    }

    const warnings: string[] = [];

    // Soft: unparseable price → leave blank, still create, warn. Preserve the
    // dealer's original string in asking_price_raw when present (honest record
    // of what they supplied, even if we couldn't parse a number from it).
    const askingRaw = str(r.askingPrice);
    const askingPrice = parsePrice(r.askingPrice);
    if (askingRaw && askingPrice === null) {
      warnings.push("asking_price_unparseable_left_blank");
    }

    const { stored, media } = normalizePhotos(r.photos);

    const details =
      typeof r.details === "object" && r.details !== null
        ? (r.details as Record<string, unknown>)
        : {};

    const listingRow: Record<string, unknown> = {
      seller_id: dealerId, // the DEALER owns it immediately — not the founder
      status: "draft", // ALWAYS draft
      brand,
      reference,
      model: str(r.model) || null,
      year: str(r.year) || null,
      condition: str(r.condition) || null,
      asking_price: askingPrice,
      asking_price_raw: askingRaw || null,
      provenance_note: str(r.provenanceNote) || null,
      description: str(r.description) || null,
      has_bracelet: r.hasBracelet === true,
      details,
      photos: stored,
      // Deliberately NOT set: significance_score / completeness_score /
      // combined_score / score_state (no fabricated scoring), in_hand_verified /
      // verified_at (imports never earn the badge), publish_request_id.
    };

    const { data: inserted, error: insErr } = await service
      .from("listings")
      .insert(listingRow)
      .select("id")
      .single();

    if (insErr || !inserted) {
      results.push({
        ok: false,
        index: i,
        brand,
        reference,
        error: insErr ? `insert_failed: ${insErr.message}` : "insert_failed",
      });
      continue;
    }

    const listingId = inserted.id as string;

    // Provenance media rows — only where photographs exist. Non-fatal to the
    // listing: a media failure warns but does not undo a created draft.
    if (media.length > 0) {
      const mediaRows: MediaInsertRow[] = media.map((m) => ({ ...m, listing_id: listingId }));
      const { error: mediaErr } = await service.from("listing_media").insert(mediaRows);
      if (mediaErr) {
        warnings.push(`listing_media_insert_failed: ${mediaErr.message}`);
      }
    }

    results.push({ ok: true, index: i, listing_id: listingId, brand, reference, warnings });
  }

  const created = results.filter((x): x is Extract<RowResult, { ok: true }> => x.ok);
  const failed = results.filter((x): x is Extract<RowResult, { ok: false }> => !x.ok);

  return NextResponse.json(
    {
      ok: failed.length === 0,
      dealer_profile_id: dealerId,
      summary: { total: rows.length, created: created.length, failed: failed.length },
      created,
      failed,
    },
    { status: failed.length === 0 ? 201 : 207 } // 207 Multi-Status on partial success
  );
}
