import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/wanted/seller — the Seller Workspace queue

   ONE LINE OF REAL WORK, and that is the point. Everything that makes this
   safe happens inside wanted_requests_for_seller(): the seller holds no row
   access to wanted_requests, so the projection is the only door, and it
   returns no budget number, no requester identity, and no private note.

   That means this route CANNOT leak those fields by selecting the wrong
   columns — there are no columns to select. If a future change needs a new
   seller-visible field, it is added to the database function deliberately,
   in a migration, where the omission of the private ones is visible.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("wanted_requests_for_seller");
  if (error) {
    console.error("[wanted] seller queue failed:", error.message);
    return NextResponse.json({ error: "read_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] }, { status: 200 });
}
