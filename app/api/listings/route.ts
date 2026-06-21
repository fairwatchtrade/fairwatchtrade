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
   ════════════════════════════════════════════════════════════════════════ */

// Light shape — mirrors ListingDraft without importing it server-side, so a
// future field rename in the draft can't silently break this route's build.
type PublishBody = {
  brand?: string;
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
};

function parsePrice(raw?: string): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
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

  const row = {
    seller_id: user.id,
    status: "published",
    brand: body.brand,
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

  const { data, error } = await supabase
    .from("listings")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "insert_failed", detail: error.message },
      { status: 500 }
    );
  }

  // PENDING: Resend seller-confirmation email fires here once the email
  // layer lands — we now have user.email available to send to.

  return NextResponse.json({ id: data.id }, { status: 201 });
}
