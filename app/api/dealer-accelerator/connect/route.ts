import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { connectInventorySource, forecastPreparation } from "@/lib/dealer/dealerPath";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/dealer-accelerator/connect

   The dealer's own authorization. This is the seam that used to require the
   founder: the source is recorded as authorized BY THE DEALER, with their
   attestation stored verbatim beside the evidence of domain control that
   made self-service defensible.

   Nothing is retrieved for preparation here and no batch is created. This
   records permission; starting the work is a separate, deliberate act.
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

  let body: { website?: string; attested?: boolean };
  try {
    body = (await request.json()) as { website?: string; attested?: boolean };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const website = (body.website ?? "").trim();
  if (website === "" || website.length > 2000) {
    return NextResponse.json({ ok: false, failure: "website_unparseable" }, { status: 200 });
  }

  // The attestation is checked server-side, not merely enforced by a
  // disabled button. A client that omits it is refused.
  if (body.attested !== true) {
    return NextResponse.json({ ok: false, failure: "attestation_required" }, { status: 200 });
  }

  const outcome = await connectInventorySource({
    userId: user.id,
    website,
    attested: true,
  });

  if (!outcome.ok) {
    const status = outcome.failure === "source_write_failed" ? 500 : 200;
    return NextResponse.json(
      {
        ok: false,
        failure: outcome.failure,
        manifestReason: "manifestReason" in outcome ? outcome.manifestReason ?? null : null,
        manifestLine: "manifestLine" in outcome ? outcome.manifestLine ?? null : null,
      },
      { status }
    );
  }

  const forecast = await forecastPreparation(user.id, outcome.resolved);

  return NextResponse.json({
    ok: true,
    status: outcome.status,
    sourceId: outcome.sourceId,
    website: {
      hostname: outcome.resolved.hostname,
      locator: outcome.resolved.sourceLocator,
      snapshot: outcome.resolved.declaredVersion,
    },
    forecast,
  });
}
