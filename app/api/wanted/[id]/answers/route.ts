import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   /api/wanted/[id]/answers — what answered the collector's request

   GET    the answer cards, with the governed listing each one carries
   PATCH  move one answer's state (viewed / declined / pursuing / closed)

   Session client throughout. RLS on wanted_request_answers already scopes
   reads to the requester of the parent request (or the answering seller),
   and the update policy admits only the requester — so this route states
   the intent and the database enforces the boundary.

   AN ANSWER IS ALWAYS A LISTING. The card carries watch identity, listing
   type, price and the frozen criteria verdict; there is no message body
   here because a freeform response path does not exist before a governed
   listing does. "Message in context" is the ordinary listing-bound
   Communications thread, which needs nothing from this route.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANSWER_STATES = ["unread", "viewed", "declined", "pursuing", "closed"];

export async function GET(
  _request: NextRequest,
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

  /* Ownership is proved by reading the parent under own-row RLS: a request
     that is not the caller's simply is not there. */
  const { data: own } = await supabase
    .from("wanted_requests")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!own) {
    return NextResponse.json({ error: "not_found", detail: "No such request." }, { status: 404 });
  }

  const { data: answers, error } = await supabase
    .from("wanted_request_answers")
    .select("id, listing_id, kind, state, criteria_report, created_at")
    .eq("wanted_request_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "read_failed", detail: error.message }, { status: 500 });
  }

  const rows = answers ?? [];
  const listingIds = rows.map((a) => a.listing_id as string);

  /* The listings behind the answers. A private listing is readable by its
     authorized buyer, a published one by anyone — the existing listing
     policies decide, and an answer whose listing the collector may not yet
     see simply carries no listing detail rather than leaking one. */
  const byId = new Map<string, Record<string, unknown>>();
  if (listingIds.length > 0) {
    const { data: listings } = await supabase
      .from("listings")
      .select(
        "id, public_code, brand, model, reference, condition, asking_price, asking_currency, status, photos, seller_id"
      )
      .in("id", listingIds);
    for (const l of listings ?? []) byId.set(l.id as string, l);
  }

  /* Seller display names — the same public profile view every listing
     surface uses. Nothing private is introduced by an answer. */
  const sellerIds = [
    ...new Set(
      [...byId.values()].map((l) => l.seller_id as string).filter((v): v is string => !!v)
    ),
  ];
  const nameById = new Map<string, string>();
  if (sellerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_seller_profiles")
      .select("id, display_name")
      .in("id", sellerIds);
    for (const p of profiles ?? []) {
      nameById.set(p.id as string, (p.display_name as string | null) ?? "FairWatchTrade seller");
    }
  }

  return NextResponse.json(
    {
      answers: rows.map((a) => {
        const listing = byId.get(a.listing_id as string);
        return {
          id: a.id,
          kind: a.kind,
          state: a.state,
          criteria_report: a.criteria_report,
          created_at: a.created_at,
          listing: listing
            ? {
                id: listing.id,
                public_code: listing.public_code,
                brand: listing.brand,
                model: listing.model,
                reference: listing.reference,
                condition: listing.condition,
                asking_price: listing.asking_price,
                asking_currency: listing.asking_currency,
                status: listing.status,
                photos: listing.photos,
                seller_name: nameById.get(listing.seller_id as string) ?? "FairWatchTrade seller",
              }
            : null,
        };
      }),
    },
    { status: 200 }
  );
}

export async function PATCH(
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

  let body: { answerId?: unknown; state?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }
  const answerId = typeof body.answerId === "string" ? body.answerId : "";
  const state = typeof body.state === "string" ? body.state : "";
  if (!answerId || !ANSWER_STATES.includes(state)) {
    return NextResponse.json(
      { error: "bad_request", detail: `state must be one of: ${ANSWER_STATES.join(", ")}.` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("wanted_request_answers")
    .update({ state })
    .eq("id", answerId)
    .eq("wanted_request_id", id)
    .select("id, state")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found", detail: "No such answer." }, { status: 404 });
  }
  return NextResponse.json({ answer: data }, { status: 200 });
}
