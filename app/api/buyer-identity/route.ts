import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveBuyerIdentities } from "@/lib/buyerDisplayIdentity";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/buyer-identity?ids=<uuid>,<uuid> — governed display identity for
   the buyers of the caller's own purchase requests
   (Purchase Request Buyer Identity Correction, 2026-09-11)

   Scope is the whole point. The caller may name ONLY people who have made
   a purchase request to them: the session client reads the caller's
   purchase_requests under RLS and the requested ids are intersected with
   those buyer ids. Anything else is silently not answered — never a 404
   that would confirm an id exists.

   Answers, per admitted id: a usable name, or null for TRUE ABSENCE after
   the whole governed chain. A read failure is 503 — could-not-look is its
   own answer and the room renders it as unavailable, never as the generic
   label.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 200;

export async function GET(request: NextRequest) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("ids") ?? "";
  const requested = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => UUID.test(s)))].slice(0, MAX_IDS);
  if (requested.length === 0) return NextResponse.json({ ok: true, identities: {} });

  /* Entitlement: the buyers of the caller's own requests, read under RLS. */
  const { data: rows, error: prErr } = await session
    .from("purchase_requests")
    .select("buyer_id")
    .eq("seller_id", user.id)
    .in("buyer_id", requested);
  if (prErr) {
    console.error("[buyer-identity] entitlement read failed:", prErr.message);
    return NextResponse.json({ error: "identity_unavailable" }, { status: 503 });
  }
  const admitted = [...new Set((rows ?? []).map((r) => r.buyer_id as string).filter(Boolean))];
  if (admitted.length === 0) return NextResponse.json({ ok: true, identities: {} });

  let db;
  try {
    db = createServiceClient();
  } catch (e) {
    console.error("[buyer-identity] service client unavailable:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "identity_unavailable" }, { status: 503 });
  }

  try {
    const names = await resolveBuyerIdentities(db, admitted);
    const identities: Record<string, string | null> = {};
    for (const id of admitted) identities[id] = names.get(id) ?? null;
    return NextResponse.json({ ok: true, identities });
  } catch (e) {
    console.error("[buyer-identity] resolution failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "identity_unavailable" }, { status: 503 });
  }
}
