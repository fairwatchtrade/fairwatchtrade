import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInventorySource } from "@/lib/dealer/sourceDiscovery";
import { forecastPreparation } from "@/lib/dealer/dealerPath";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/dealer-accelerator/check-website

   "Does this website publish inventory we can prepare?" — asked before the
   dealer commits to anything, and answered without writing a single row.

   Ignition only: the resolver owns the discovery convention, the pinned
   fetch layer owns the network boundary, and the preflight owns what a
   valid manifest is. This file owns the gate and the shape of the answer.

   · Node.js runtime, never edge — the pinned-connection defense needs it.
   · Any authenticated seller may ask. The question is about a website, not
     about their account, and answering it grants nothing.
   · Idempotent and side-effect free, so a dealer may check as often as
     they like while getting an address right.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: { website?: string };
  try {
    body = (await request.json()) as { website?: string };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const website = (body.website ?? "").trim();
  if (website === "") {
    return NextResponse.json({ ok: false, failure: "website_blank" }, { status: 200 });
  }
  // Length bound before any parsing or network work.
  if (website.length > 2000) {
    return NextResponse.json({ ok: false, failure: "website_unparseable" }, { status: 200 });
  }

  const resolved = await resolveInventorySource(website);

  // A source that cannot be resolved is an ANSWER, not a server error. The
  // 200 is deliberate: the request succeeded, and the product has something
  // specific and true to tell the dealer.
  if (!resolved.ok) {
    return NextResponse.json(
      {
        ok: false,
        failure: resolved.failure,
        manifestReason: resolved.manifestReason ?? null,
        manifestLine: resolved.manifestLine ?? null,
      },
      { status: 200 }
    );
  }

  const forecast = await forecastPreparation(user.id, resolved);

  return NextResponse.json({
    ok: true,
    website: {
      hostname: resolved.hostname,
      locator: resolved.sourceLocator,
      snapshot: resolved.declaredVersion,
    },
    forecast,
    photographCount: resolved.photographCount,
  });
}
