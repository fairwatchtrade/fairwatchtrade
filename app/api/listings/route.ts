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

  return NextResponse.json({ id: data.id }, { status: 201 });
}
