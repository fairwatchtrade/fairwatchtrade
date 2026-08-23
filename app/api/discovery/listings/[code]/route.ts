import { NextResponse } from "next/server";
import {
  DISCOVERY_HEADERS,
  createDiscoveryClient,
  findExact,
  toRecord,
} from "@/lib/discovery/publicDiscovery";

/* ════════════════════════════════════════════════════════════════════════
   /api/discovery/listings/[code] — one canonical listing  (v6.44)

   The address an agent keeps. When an assistant surfaced a FairWatchTrade
   watch last month and the collector asks about it again today, this is where
   it re-reads current truth rather than repeating what it remembered. Price
   moved, the watch sold, the seller added papers — the answer changes here
   because there is no cached copy anywhere to disagree with the listing.

   A 404 is a real answer. A listing that has left public inventory — sold,
   reserved, withdrawn, removed, turned private — stops being admitted by the
   read model, so this returns not-found with a plain sentence and no
   metadata. An assistant that asks gets told the watch is gone instead of
   confidently recommending it. That is what "agent-readable inventory must be
   current inventory truth" costs, and it is the whole reason this route
   exists alongside the search.

   ACCEPTS EITHER IDENTITY. The FairWatchTrade listing code (the thing a
   collector can read aloud) or the canonical listing id from the URL an agent
   already holds. Both resolve to the same one object.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: DISCOVERY_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const identifier = (code ?? "").trim().slice(0, 120);

  if (identifier === "") {
    return NextResponse.json(
      { error: "missing_identifier", message: "No listing identifier was given." },
      { status: 400, headers: DISCOVERY_HEADERS }
    );
  }

  let supabase;
  try {
    supabase = createDiscoveryClient();
  } catch {
    return NextResponse.json(
      { error: "discovery_unavailable", message: "Public discovery is temporarily unavailable." },
      { status: 503, headers: DISCOVERY_HEADERS }
    );
  }

  try {
    let rows;
    if (UUID.test(identifier)) {
      const { data, error } = await supabase
        .from("public_discovery_listings")
        .select("*")
        .eq("id", identifier)
        .limit(1);
      if (error) throw new Error(error.message);
      rows = data ?? [];
    } else {
      rows = await findExact(supabase, { identifier, kind: "listing_code" });
    }

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: "not_found",
          message:
            "No public FairWatchTrade listing with that identifier is currently available. " +
            "It may never have existed, or it may no longer be on the public marketplace.",
          listing_code: identifier,
        },
        { status: 404, headers: DISCOVERY_HEADERS }
      );
    }

    return NextResponse.json(
      { listing: toRecord(rows[0] as never) },
      { headers: DISCOVERY_HEADERS }
    );
  } catch (err) {
    console.error("[discovery] listing lookup failed", err);
    return NextResponse.json(
      { error: "discovery_failed", message: "Public discovery could not complete that lookup." },
      { status: 500, headers: DISCOVERY_HEADERS }
    );
  }
}
