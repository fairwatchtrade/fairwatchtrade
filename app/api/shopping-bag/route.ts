import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveShoppingBag } from "@/lib/purchases/shoppingBag";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/shopping-bag — the signed-in buyer's Shopping Bag, resolved
   (Accepted Purchase Continuity + Shopping Bag, 2026-09-11)

   The session client identifies the caller; the resolver (service role,
   server-only) composes the Bag from transaction + payment truth for THAT
   buyer id and nobody else's. The browser sends no membership, no ids of
   its own, and cannot author a member.

   Answers:
     200 { ok: true, members, count, exited }   — a successful read; count is
                                                  exactly members.length, and
                                                  zero here is proven zero
     503 { error: "bag_unavailable" }           — could not establish the Bag;
                                                  the header shows it as
                                                  unavailable, never as none
     401                                        — no session

   `?transactionId=` narrows to one purchase (deep links, Stripe return).

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const only = request.nextUrl.searchParams.get("transactionId");
  if (only && !UUID.test(only)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const read = await resolveShoppingBag(user.id, { only });
  if (!read.ok) return NextResponse.json({ error: "bag_unavailable" }, { status: 503 });

  return NextResponse.json({ ok: true, members: read.members, count: read.members.length, exited: read.exited });
}
