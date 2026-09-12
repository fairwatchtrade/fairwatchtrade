import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/wanted/[id]/peek — what the Sell Flow may know about a request

   The seller arriving at /sell?wanted=<id> needs exactly two things: that
   the request is real and open, and what watch it is for. This route
   returns those and nothing else.

   IT DELIBERATELY RETURNS NO IDENTITY. The Sell Flow's thread-seeded
   sibling can name the buyer because a correspondence already exists
   between those two people. Here it does not: the collector has published
   demand, not a relationship. So the private-listing header speaks about
   the WATCH ("for this collector"), and the binding happens server-side
   from the request id — the seller never learns who they are listing for
   until normal transaction and Communications rules disclose it.

   Budget, note, and requester are absent from the response by
   construction — this route does not select them.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (!id) {
    return NextResponse.json({ error: "bad_request", detail: "Missing request id." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "server_misconfigured", detail: "Unavailable." }, { status: 500 });
  }

  const { data, error } = await service
    .from("wanted_requests")
    .select(
      "id, requester_id, status, display_identity, brand, model_text, reference_text, min_condition, documentation, must_have, preferred, private_listing_ok"
    )
    .eq("id", id)
    .maybeSingle();

  /* LS-4 (2026-09-12): could-not-look is not not-found. This read used to
     discard its error, so a database failure arrived at the seller as an
     authoritative "No such request." — the one answer that tells them to
     stop looking. A failed read is the server's problem and says so; only
     a SUCCESSFUL read that found nothing may say the request is not there. */
  if (error) {
    console.error("[wanted:peek] read failed:", error.message);
    return NextResponse.json(
      { error: "read_failed", detail: "This request could not be opened just now. Nothing has changed." },
      { status: 503 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not_found", detail: "No such request." }, { status: 404 });
  }
  if (data.requester_id === user.id) {
    return NextResponse.json(
      { error: "own_request", detail: "This is your own Wanted request." },
      { status: 409 }
    );
  }
  if (data.status !== "active" && data.status !== "answered") {
    return NextResponse.json(
      { error: "not_open", detail: `This request is ${data.status} and is not accepting answers.` },
      { status: 409 }
    );
  }

  /* requester_id was needed for the own-request check and stops here. */
  return NextResponse.json(
    {
      request: {
        id: data.id,
        status: data.status,
        display_identity: data.display_identity,
        brand: data.brand,
        model_text: data.model_text,
        reference_text: data.reference_text,
        min_condition: data.min_condition,
        documentation: data.documentation,
        must_have: data.must_have,
        preferred: data.preferred,
        private_listing_ok: data.private_listing_ok,
      },
    },
    { status: 200 }
  );
}
