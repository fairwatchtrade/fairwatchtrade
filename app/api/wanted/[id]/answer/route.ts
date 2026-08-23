import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { compareListingToWanted, type DocumentationLevel } from "@/lib/wanted";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/wanted/[id]/answer — a seller answers with a governed listing

   GET  ?listingId=…  the truthful compatibility preview, before sending
   POST                send the answer

   ── WHY THIS ROUTE READS THE REQUEST WITH THE TRUSTED CLIENT ──────────
   The comparison needs the collector's ceiling, and the seller has no
   access to it — correctly. So the server reads the request with the
   service client, computes the verdict, and returns ONLY the verdict: the
   three-word budget fit and which named criteria met or failed. The
   numbers never enter the response body, the criteria_report, the
   notification, or any log this route writes. That asymmetry is the whole
   design: FWT may use the exact budget internally for matching; the seller
   may not see it.

   ── THE SELLER MUST OWN THE LISTING, AND THE DATABASE AGREES ──────────
   Ownership is checked here AND the answer insert carries seller_id =
   the authenticated user. A seller cannot answer with someone else's watch.

   ── DEDUPE IS A CONSTRAINT ────────────────────────────────────────────
   wanted_request_answers_one_per_listing refuses a second answer from the
   same listing. A double-submit returns 409 from the database, not from a
   disabled button.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type WantedRow = {
  id: string;
  requester_id: string;
  status: string;
  display_identity: string;
  min_condition: string | null;
  documentation: DocumentationLevel;
  must_have: string[];
  preferred: string[];
  private_listing_ok: boolean;
  target_price: number | null;
  max_price: number | null;
  currency: string | null;
};

type ListingRow = {
  id: string;
  seller_id: string;
  status: string;
  brand: string;
  model: string | null;
  reference: string | null;
  condition: string | null;
  description: string | null;
  details: unknown;
  asking_price: number | null;
  asking_currency: string | null;
  private_buyer_id: string | null;
  public_code: string | null;
};

/** The haystack a must-have phrase is tested against: everything the
    listing actually says about itself. Never the seller's intentions. */
function listingText(l: ListingRow): string {
  const details = l.details && typeof l.details === "object" ? (l.details as Record<string, unknown>) : {};
  const detailValues = Object.values(details)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map(String);
  return [l.brand, l.model, l.reference, l.condition, l.description, ...detailValues]
    .filter(Boolean)
    .join(" \n ");
}

function documentationFlags(l: ListingRow): { hasPapers: boolean | null; hasFullSet: boolean | null } {
  const details = l.details && typeof l.details === "object" ? (l.details as Record<string, unknown>) : {};
  const included = details.includedWithWatch;
  if (!Array.isArray(included)) return { hasPapers: null, hasFullSet: null };
  const items = included.filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase());
  const papers = items.some((v) => v.includes("paper") || v.includes("certificate") || v.includes("warranty"));
  const box = items.some((v) => v.includes("box") || v.includes("case"));
  return { hasPapers: papers, hasFullSet: papers && box };
}

async function loadPair(
  wantedId: string,
  listingId: string,
  sellerId: string
): Promise<
  | { error: string; detail: string; status: number }
  | { wanted: WantedRow; listing: ListingRow }
> {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return { error: "server_misconfigured", detail: "Comparison channel unavailable.", status: 500 };
  }

  /* The trusted read of the request. Its private fields are used to compute
     a verdict inside this process and are never returned. */
  const { data: wanted } = await service
    .from("wanted_requests")
    .select(
      "id, requester_id, status, display_identity, min_condition, documentation, must_have, preferred, private_listing_ok, target_price, max_price, currency"
    )
    .eq("id", wantedId)
    .maybeSingle();
  if (!wanted) return { error: "not_found", detail: "No such request.", status: 404 };

  const w = wanted as WantedRow;
  if (w.requester_id === sellerId) {
    return { error: "own_request", detail: "This is your own request.", status: 409 };
  }
  if (w.status !== "active" && w.status !== "answered") {
    return {
      error: "not_open",
      detail: `This request is ${w.status} and is not accepting answers.`,
      status: 409,
    };
  }

  /* The seller's own listing — ownership is a filter, not a hope. */
  const { data: listing } = await service
    .from("listings")
    .select(
      "id, seller_id, status, brand, model, reference, condition, description, details, asking_price, asking_currency, private_buyer_id, public_code"
    )
    .eq("id", listingId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!listing) {
    return { error: "listing_not_found", detail: "That listing is not yours, or does not exist.", status: 404 };
  }

  return { wanted: w, listing: listing as ListingRow };
}

function reportFor(w: WantedRow, l: ListingRow) {
  const flags = documentationFlags(l);
  return compareListingToWanted(
    {
      minCondition: w.min_condition,
      documentation: w.documentation,
      mustHave: w.must_have ?? [],
      preferred: w.preferred ?? [],
      // Requester-private: consumed here, never emitted.
      ceiling: w.max_price ?? w.target_price,
      currency: w.currency,
    },
    {
      condition: l.condition,
      text: listingText(l),
      hasPapers: flags.hasPapers,
      hasFullSet: flags.hasFullSet,
      price: l.asking_price,
      currency: l.asking_currency,
    }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  const listingId = request.nextUrl.searchParams.get("listingId") ?? "";
  if (!listingId) {
    return NextResponse.json({ error: "bad_request", detail: "listingId is required." }, { status: 400 });
  }

  const loaded = await loadPair(id, listingId, user.id);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error, detail: loaded.detail }, { status: loaded.status });
  }

  // The verdict only — no ceiling, no target, no requester.
  return NextResponse.json({ report: reportFor(loaded.wanted, loaded.listing) }, { status: 200 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  let body: { listingId?: unknown; kind?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  const kind =
    body.kind === "new_listing" || body.kind === "private_listing" ? body.kind : "existing_listing";
  if (!listingId) {
    return NextResponse.json({ error: "bad_request", detail: "listingId is required." }, { status: 400 });
  }

  const loaded = await loadPair(id, listingId, user.id);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error, detail: loaded.detail }, { status: loaded.status });
  }
  const { wanted, listing } = loaded;

  /* A listing answers a request only from a state the collector can act on.
     A rejected or removed listing is not an answer. */
  const ANSWERABLE = ["draft", "pending_review", "published", "private_active"];
  if (!ANSWERABLE.includes(listing.status)) {
    return NextResponse.json(
      { error: "listing_not_answerable", detail: `A ${listing.status} listing cannot answer a request.` },
      { status: 409 }
    );
  }
  /* A private listing may answer only the buyer it is bound to. */
  if (listing.private_buyer_id && listing.private_buyer_id !== wanted.requester_id) {
    return NextResponse.json(
      { error: "private_buyer_mismatch", detail: "That private listing is bound to a different buyer." },
      { status: 409 }
    );
  }

  const report = reportFor(wanted, listing);

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "server_misconfigured", detail: "Write channel unavailable." }, { status: 500 });
  }

  const { data: answer, error } = await service
    .from("wanted_request_answers")
    .insert({
      wanted_request_id: wanted.id,
      listing_id: listing.id,
      seller_id: user.id,
      kind,
      /* The frozen verdict the collector was shown. Contains the coarse fit
         and the named criteria — never a price. */
      criteria_report: report,
    })
    .select("id, state, created_at")
    .maybeSingle();

  if (error) {
    // 23505 — the dedupe constraint doing its job.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "already_answered", detail: "You have already answered this request with that listing." },
        { status: 409 }
      );
    }
    console.error("[wanted] answer insert failed:", error.message);
    return NextResponse.json({ error: "answer_failed", detail: error.message }, { status: 500 });
  }

  /* Answering never closes a request — it moves 'active' to 'answered' and
     leaves everything else alone. A paused or closed request never reaches
     here (loadPair refuses it). */
  if (wanted.status === "active") {
    await service.from("wanted_requests").update({ status: "answered" }).eq("id", wanted.id);
  }

  /* Collector notification — dedupe key bound to the answer, so a retry or
     a double submit can never produce a second bell. Carries the listing,
     never the seller's identity beyond what the listing itself shows. */
  await service.from("notifications").insert({
    user_id: wanted.requester_id,
    type: "wanted_answer",
    message: `A listing has answered your Wanted request — ${wanted.display_identity}.`,
    listing_id: listing.id,
    dedupe_key: `wanted_answer:${answer?.id ?? `${wanted.id}:${listing.id}`}`,
  });

  return NextResponse.json({ answer, report }, { status: 201 });
}
