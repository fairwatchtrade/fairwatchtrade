import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC WATCH INDEX — the governed administrative path for suppression
   app/api/admin/public-watch-index/suppressions/route.ts   (Phase 1)

   Governing authority:
   docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md §8.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "This route enforces suppression."

   It does not. It carries FOUNDER AUTHORITY to the one database writer that
   does. The enforcement lives in two places that are not this file: the
   database, where every client role is denied the table structurally and the
   writers are service_role-only, and the projection, which reads live
   suppressions on every single call so no refresh or rebuild can outrun one.
   Deleting this route would remove the founder's way to act; it would not
   un-suppress anything.

   AUTHORITY SPLIT, matching the v8.31 dealer-admission precedent:
     · this route proves the caller is the founder, on the server, against
       the session — never a request field;
     · public.public_watch_index_suppress() and
       public.public_watch_index_reverse_suppression() are the only writers,
       reachable by service_role alone.

   NOT A PUBLIC ENDPOINT. No public Watch Index endpoint is authorized in
   Phase 1 and none is created here. This is founder-only administration, and
   it never returns index records.

   WHAT IT NEVER PUBLISHES. Actor, reason, time and scope are recorded and are
   readable HERE, by the founder, because this is the internal decision
   record. Nothing in the public projection ever carries them.

   RE-ADMISSION IS TWO ACTS. A reversal through this route is one half. The
   projection still has to pass a live eligibility check afterwards, and it
   recomputes from the governed gates — a reversal never re-admits anything
   by itself.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const ASSERTIONS = [
  "all",
  "available_now",
  "public_listing_history",
  "approved_public_reference_knowledge",
  "market_evidence",
] as const;

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

/** The founder's own view of the internal decision record. Never public. */
export async function GET(request: NextRequest) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;

  const referenceId = (request.nextUrl.searchParams.get("vaultReferenceId") ?? "").trim();
  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  let query = service
    .from("public_watch_index_suppressions")
    .select(
      "id, vault_reference_id, contribution_listing_id, assertion, reason, actor_uid, created_at, reversed_at, reversed_by, reversal_reason"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (referenceId !== "") {
    if (!UUID.test(referenceId)) {
      return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }
    query = query.eq("vault_reference_id", referenceId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 500 });
  return NextResponse.json({ suppressions: data ?? [] });
}

/**
 * Two actions, one route, chosen by `action`:
 *   suppress — record a new suppression over a scope
 *   reverse  — lift a live suppression (half of re-admission)
 *
 * The actor is ALWAYS the authenticated founder from the session. There is no
 * request field through which a caller can name a different actor, so the
 * decision record cannot be attributed to someone who did not make it.
 */
export async function POST(request: NextRequest) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;
  const founderId = gate.user.id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 1 || reason.length > 2000) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  if (action === "suppress") {
    const vaultReferenceId = typeof body.vaultReferenceId === "string" ? body.vaultReferenceId.trim() : "";
    const assertion = typeof body.assertion === "string" ? body.assertion : "";
    const contributionRaw =
      typeof body.contributionListingId === "string" ? body.contributionListingId.trim() : "";

    if (!UUID.test(vaultReferenceId)) {
      return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }
    if (!(ASSERTIONS as readonly string[]).includes(assertion)) {
      return NextResponse.json({ error: "invalid_assertion" }, { status: 400 });
    }
    if (contributionRaw !== "" && !UUID.test(contributionRaw)) {
      return NextResponse.json({ error: "invalid_contribution" }, { status: 400 });
    }

    const { data, error } = await service.rpc("public_watch_index_suppress", {
      p_vault_reference_id: vaultReferenceId,
      p_assertion: assertion,
      p_reason: reason,
      p_actor_uid: founderId,
      p_contribution_listing_id: contributionRaw === "" ? null : contributionRaw,
    });
    if (error) {
      const known = ["unknown_reference", "already_suppressed", "reason_required", "actor_required", "reference_required"];
      const code = known.find((k) => error.message.includes(k));
      return NextResponse.json(
        { error: code ?? "suppress_failed" },
        { status: code === "already_suppressed" ? 409 : code ? 400 : 500 }
      );
    }
    return NextResponse.json({ suppression: data }, { status: 201 });
  }

  if (action === "reverse") {
    const suppressionId = typeof body.suppressionId === "string" ? body.suppressionId.trim() : "";
    if (!UUID.test(suppressionId)) {
      return NextResponse.json({ error: "invalid_suppression" }, { status: 400 });
    }
    const { data, error } = await service.rpc("public_watch_index_reverse_suppression", {
      p_suppression_id: suppressionId,
      p_actor_uid: founderId,
      p_reason: reason,
    });
    if (error) {
      const code = error.message.includes("not_live_suppression") ? "not_live_suppression" : null;
      return NextResponse.json({ error: code ?? "reverse_failed" }, { status: code ? 409 : 500 });
    }
    /* Reversal is HALF of re-admission. The contribution returns only if the
       projection's live eligibility check also passes on its next read. */
    return NextResponse.json({
      suppression: data,
      note: "Reversal recorded. Re-admission still requires a successful eligibility check at projection time.",
    });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
