import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDiscoveryClient } from "@/lib/discovery/publicDiscovery";
import { projectReference } from "@/lib/publicWatchIndex/projectionSource";
import { presentationShorthand } from "@/lib/publicWatchIndex/projection";

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC WATCH INDEX — founder-only diagnostic caller  (P8, Part A)
   app/api/admin/public-watch-index/diagnostic/route.ts

   Governing authority:
   docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "This is the Watch Index endpoint, just gated for now."

   It is not, and it must never quietly become one. This is an INSPECTION
   window onto the internal projection: it exists so the founder can see what
   the four assertions actually say about real references BEFORE any public
   release is authorized. The public contract, its transport, its coverage
   disclosure and its release permission are all separate future acts.

   The one thing that makes it a diagnostic rather than a preview: it returns
   the projection's own record, unchanged, plus the internal coverage notes.
   It adds no field the public contract excludes merely because the route is
   private (§7's exclusion list is not relaxed by privacy), and it invents no
   view of its own.

   WHAT IT DELIBERATELY DOES NOT RETURN: tokens or secrets, raw seller or
   buyer data, correspondence, evidence packets, private storage paths, or
   any hidden identifier not needed to diagnose. It cannot leak knowledge
   content because the projection never reads any, and it cannot leak seller
   identity because the record type has no field for it.

   EXACT IDENTITY WINS. A caller may pass the canonical reference id, or the
   exact reference TEXT — which must match exactly one row or the request is
   refused. There is no fuzzy, nearby or best-effort matching here: returning
   a neighbouring reference as though it were the requested one is the exact
   failure the Exact Identifier law forbids.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireFounder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "not_authenticated" }, { status: 401 }) };
  if (user.id !== ADMIN_USER_ID) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

/**
 * GET ?vaultReferenceId=<uuid>
 * GET ?reference=<exact reference text>
 *
 * Returns the composed projection for that one canonical reference, exactly
 * as the internal machinery produces it, plus the internal coverage notes
 * that explain what each assessment does and does not span.
 */
export async function GET(request: NextRequest) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;

  const params = request.nextUrl.searchParams;
  const idParam = (params.get("vaultReferenceId") ?? "").trim();
  const textParam = (params.get("reference") ?? "").trim();

  let vaultReferenceId = "";

  if (idParam !== "") {
    if (!UUID.test(idParam)) {
      return NextResponse.json({ error: "invalid_reference_id" }, { status: 400 });
    }
    vaultReferenceId = idParam;
  } else if (textParam !== "") {
    /* Exact text, resolved to exactly one row or refused. An ambiguous
       reference string is an honest refusal, never a pick. */
    let db;
    try {
      db = createDiscoveryClient();
    } catch {
      return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
    const { data, error } = await db
      .from("vault_references")
      .select("id")
      .eq("reference", textParam)
      .limit(2);
    if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
    const rows = (data ?? []) as { id: string }[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "no_exact_match", reference: textParam }, { status: 404 });
    }
    if (rows.length > 1) {
      return NextResponse.json(
        { error: "ambiguous_reference", reference: textParam },
        { status: 409 }
      );
    }
    vaultReferenceId = rows[0].id;
  } else {
    return NextResponse.json({ error: "reference_required" }, { status: 400 });
  }

  let result;
  try {
    result = await projectReference(vaultReferenceId);
  } catch (e) {
    console.error("[public-watch-index] diagnostic projection failed:", e);
    return NextResponse.json({ error: "projection_failed" }, { status: 500 });
  }

  if (!result.record) {
    /* No public identity to describe: absent, or not Galaxy-visible. This
       says nothing about whether internal records exist (§13). */
    return NextResponse.json({
      vaultReferenceId,
      record: null,
      note: "No public reference identity to describe. This is an inclusion floor, not a statement about internal records.",
      coverageNotes: result.coverageNotes,
    });
  }

  return NextResponse.json({
    vaultReferenceId,
    record: result.record,
    /* The one permitted human shorthand, computed by the projection's own
       rule rather than by this route. Null is a legitimate answer. */
    presentationShorthand: presentationShorthand(result.record),
    coverageNotes: result.coverageNotes,
    diagnostic: {
      surface: "internal founder diagnostic",
      publicRelease: "not authorized; no public endpoint exists",
    },
  });
}
