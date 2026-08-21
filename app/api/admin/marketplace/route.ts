import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchMarketplacePayload, parseMcQuery } from "@/lib/marketplaceControlData";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/admin/marketplace — the Marketplace Control ledger read

   Server-side search / lifecycle filtering / sorting / pagination for the
   founder operations room. The room never loads the retained listing
   universe into the browser; every interaction is one bounded query here.

   TWO INDEPENDENT GATES (defense-in-depth, same shape as the status route):
   the page runs its own founder check before rendering; this route runs its
   OWN, with the UID as a hardcoded literal in this file. Identity is proved
   by the session client; only past that gate does the trusted client read —
   the v3.74 pattern. listings_select_public_or_own is never widened.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

  let db;
  try {
    db = createServiceClient();
  } catch (e) {
    console.error("[marketplace-control] trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin read channel unavailable." },
      { status: 500 }
    );
  }

  try {
    const query = parseMcQuery(request.nextUrl.searchParams);
    const payload = await fetchMarketplacePayload(db, query);
    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    console.error("[marketplace-control] ledger read failed:", e);
    return NextResponse.json(
      { error: "read_failed", detail: "Could not read the marketplace ledger." },
      { status: 500 }
    );
  }
}
