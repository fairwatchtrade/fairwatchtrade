/* ════════════════════════════════════════════════════════════════════════
   INTERNAL API — Collector Dossier artifact regeneration (founder-only)

   Runs the EXISTING idempotent publish/republish worker
   (ensureCollectorDossierForListing) for one listing, on demand. This is
   the same code path a publish walks — claim → build view model → real
   renderer → versioned blob artifact → mark_ready — invoked here so a
   founder approval's pending/template-v2 re-queue can be completed without
   waiting for the next natural publish event.

   NOT a second publication door: this route cannot approve anything and
   cannot change article or listing state. It only asks the proven worker
   to materialize whatever the governed tables already say should be
   served. If nothing is pending, the worker returns the current ready
   state untouched.

   Auth: the established single-admin gate; non-admins get 404, no hint.
   Node runtime required (Chromium).
   ──────────────────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureCollectorDossierForListing } from "@/lib/dossier/collectorDossierService";

// Same gate as /admin/vault-review and the draft-preview route.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 }); // no hint
  }

  const { listingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const state = await ensureCollectorDossierForListing(listingId);
    return NextResponse.json(
      { ok: true, ...state },
      { status: 200, headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (err) {
    console.error("[collector-dossier] founder regeneration failed:", err);
    return NextResponse.json({ error: "regeneration_failed" }, { status: 500 });
  }
}
