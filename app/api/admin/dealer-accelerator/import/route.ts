import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/dealer-accelerator/import — Dealer Accelerator, Phase 1

   THE IMPORT SPINE. Admin-assisted, founder-initiated. Creates dealer-owned
   DRAFT listings on a selected existing dealer's behalf, then stops. It does
   not publish, does not enrich, does not certify — it accelerates creation and
   hands the resulting drafts to FairWatchTrade's normal lifecycle. "Import
   once. Enrich forever."

   ── FLIGHT 2A — ATOMIC INTEGRITY (locked) ──────────────────────────────
     Each listing is created by ONE call to the SECURITY DEFINER RPC
     public.dealer_import_one_listing(p_dealer_profile_id, p_listing, p_photos).
     For a single listing, the listings row + listings.photos payload + EVERY
     declared dealer_import listing_media row commit together, or nothing
     commits. This closes the confirmed markerless-import bypass: a dealer
     import can NEVER survive without its trusted dealer_import provenance, so
     it can never be reclassified as a manual listing and skip the imported
     availability/attestation ceremony. The old "insert listing, then best-
     effort media (soft warning)" path is GONE — there is no fallback.

   ── AUTHORIZATION (defense-in-depth, matches /api/admin/listings/[id]/status)
     Two independent things must hold, UNCHANGED by Flight 2A:
       · The founder gate below — a HARDCODED literal in THIS file, not an
         imported shared constant. A non-founder is rejected here regardless
         of any UI.
       · The service-role write — reached ONLY after that gate. The RPC is
         EXECUTE-granted to service_role only (revoked from PUBLIC/anon/
         authenticated); it is NOT a public dealer submission endpoint.

   ── TRUTH BOUNDARIES (locked, enforced inside the RPC) ──────────────────
     · status is ALWAYS 'draft'. Never published.
     · Imported photos are stamped capture_source='dealer_import'. Never
       'live_camera'; never earn In Hand Verified; in_hand_verified/verified_at
       are never set.
     · No score is fabricated (significance/completeness/combined left null).
       No caller-supplied scoring or trust state.

   ── ERROR MODEL (Flight 2A) ─────────────────────────────────────────────
     Per-listing, cross-listing partial success. Each row is one RPC call whose
     truthful outcome is one of:
       IMPORTED                    — the row and all its media committed.
       REJECTED_BEFORE_MUTATION    — a validation failure; nothing was written.
       ROLLED_BACK_MEDIA_FAILURE   — media insert failed; the whole row rolled
                                     back (deterministic SQLSTATE 'DIM01').
       ROLLED_BACK_DATABASE_ERROR  — any other DB failure; the whole row rolled
                                     back. No markerless soft success can occur.
     A rolled-back row NEVER returns a listing id and NEVER claims a write.

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

/* Truthful per-listing classification. Field normalization, photo validation,
   and atomicity all live inside the RPC — the route only classifies outcomes. */
type RowOk = {
  ok: true;
  index: number;
  result: "IMPORTED";
  listing_id: string;
  brand: string;
  reference: string;
  warnings: string[];
};
type RowFail = {
  ok: false;
  index: number;
  result:
    | "REJECTED_BEFORE_MUTATION"
    | "ROLLED_BACK_MEDIA_FAILURE"
    | "ROLLED_BACK_DATABASE_ERROR";
  reason: string;
  brand: string | null;
  reference: string | null;
};
type RowResult = RowOk | RowFail;

type RpcReturn = {
  result?: unknown;
  listing_id?: unknown;
  reason?: unknown;
  warnings?: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(request: NextRequest) {
  /* 1 · authenticate + founder gate (session client, independent). UNCHANGED. */
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

  /* 3 · trusted client (reached only after the founder gate). It is the caller
        the RPC's EXECUTE grant is scoped to; the RPC itself re-validates the
        dealer and enforces atomicity. */
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

  /* 4 · fast dealer-existence pre-check (whole-batch fail). listings.seller_id
        has no FK; the RPC also validates this per row (authoritative), but a
        bogus dealer id should reject the batch before any RPC call. */
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

  /* 5 · per-row: ONE atomic RPC call per listing. Cross-listing partial success
        is preserved; a single listing can never survive partially. There is no
        direct listing/media insert fallback anywhere in this path. */
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (typeof raw !== "object" || raw === null) {
      results.push({
        ok: false,
        index: i,
        result: "REJECTED_BEFORE_MUTATION",
        reason: "invalid_listing_payload",
        brand: null,
        reference: null,
      });
      continue;
    }
    const r = raw as ImportListingInput;
    const brandEcho = str(r.brand) || null;
    const referenceEcho = str(r.reference) || null;

    // Pass the row through verbatim; the RPC owns trimming, price parsing,
    // photo validation, and the single validated photo set used for BOTH
    // listings.photos and the dealer_import media rows.
    const p_listing = {
      brand: r.brand,
      model: r.model,
      reference: r.reference,
      year: r.year,
      condition: r.condition,
      askingPrice: r.askingPrice,
      provenanceNote: r.provenanceNote,
      description: r.description,
      hasBracelet: r.hasBracelet,
      details: r.details ?? {},
    };
    const p_photos = Array.isArray(r.photos) ? r.photos : null;

    const { data, error } = await service.rpc("dealer_import_one_listing", {
      p_dealer_profile_id: dealerId,
      p_listing,
      p_photos,
    });

    if (error) {
      // A raised RPC = a rolled-back transaction. No listing survives. Classify
      // by the deterministic media SQLSTATE; sanitize everything else.
      const isMedia = error.code === "DIM01";
      results.push({
        ok: false,
        index: i,
        result: isMedia ? "ROLLED_BACK_MEDIA_FAILURE" : "ROLLED_BACK_DATABASE_ERROR",
        reason: isMedia ? "dealer_import_media_insert_failed" : "database_error",
        brand: brandEcho,
        reference: referenceEcho,
      });
      continue;
    }

    const d = (data ?? {}) as RpcReturn;
    if (d.result === "IMPORTED" && typeof d.listing_id === "string") {
      results.push({
        ok: true,
        index: i,
        result: "IMPORTED",
        listing_id: d.listing_id,
        brand: str(r.brand),
        reference: str(r.reference),
        warnings: Array.isArray(d.warnings) ? (d.warnings as string[]) : [],
      });
    } else {
      // REJECTED_BEFORE_MUTATION (validation) — nothing was written.
      results.push({
        ok: false,
        index: i,
        result: "REJECTED_BEFORE_MUTATION",
        reason: typeof d.reason === "string" ? d.reason : "rejected_before_mutation",
        brand: brandEcho,
        reference: referenceEcho,
      });
    }
  }

  const created = results.filter((x): x is RowOk => x.ok);
  const failed = results.filter((x): x is RowFail => !x.ok);

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
