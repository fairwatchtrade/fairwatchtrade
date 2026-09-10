import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC WATCH INDEX — the governed administrative path for approving
   reference knowledge for public representation.  (P6)
   app/api/admin/public-watch-index/reference-knowledge/route.ts

   Governing authority:
   docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md §3.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Approving reference knowledge means publishing what we know."

   It does not. This route grants PERMISSION TO STATE, and it is the only
   human path to that permission. It never reads, writes, generates or
   returns knowledge content — the content lives elsewhere, under its own
   rules, and FairWatchTrade may hold plenty of it for a reference that has
   no approval at all. Approving is an explicit act about one exact canonical
   reference, never a derivation from what exists.

   AUTHORITY SPLIT, matching v8.31 dealer admission and the suppression path:
     · this route proves the caller is the founder, on the server, against
       the session — never a request field;
     · public.public_watch_index_approve_reference_knowledge() and
       public.public_watch_index_revoke_reference_knowledge() are the only
       writers, reachable by service_role alone.

   THE ACTOR IS ALWAYS THE SESSION FOUNDER. There is no request field through
   which a caller can name a different one, so an approval cannot be
   attributed to someone who did not make it, and no ordinary user can
   approve their own reference knowledge for public use.

   NOT A PUBLIC ENDPOINT, and not a Watch Index endpoint. It returns approval
   records to the founder and never an index record.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

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

/** The founder's own view of the approval record, live and revoked. Never
    public, and it carries no knowledge content. */
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
    .from("public_watch_index_reference_knowledge_approval")
    .select(
      "id, vault_reference_id, public_destination, approved_by, approved_at, reason, is_current, revoked_at, revoked_by, revoked_reason"
    )
    .order("approved_at", { ascending: false })
    .limit(200);
  if (referenceId !== "") {
    if (!UUID.test(referenceId)) {
      return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }
    query = query.eq("vault_reference_id", referenceId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 500 });
  return NextResponse.json({ approvals: data ?? [] });
}

/**
 * Two actions, chosen by `action`:
 *   approve — grant public-representation authority for one canonical reference
 *   revoke  — withdraw it
 *
 * Revocation takes effect on the projection's next read, because the
 * projection resolves the assertion from this authority every time. Nothing
 * re-creates an approval automatically, so a rebuild cannot resurrect a
 * withdrawn one from a knowledge row that still exists.
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
  const vaultReferenceId =
    typeof body.vaultReferenceId === "string" ? body.vaultReferenceId.trim() : "";

  if (!UUID.test(vaultReferenceId)) {
    return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
  }
  if (reason.length < 1 || reason.length > 2000) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  if (action === "approve") {
    /* The destination is optional by contract (section 7: "approved
       destination when one exists"). A URL is never invented to complete an
       approval, and a non-https one is refused rather than stored. */
    const destinationRaw =
      typeof body.publicDestination === "string" ? body.publicDestination.trim() : "";
    if (destinationRaw !== "" && !destinationRaw.startsWith("https://")) {
      return NextResponse.json({ error: "invalid_destination" }, { status: 400 });
    }

    const { data, error } = await service.rpc("public_watch_index_approve_reference_knowledge", {
      p_vault_reference_id: vaultReferenceId,
      p_actor_uid: founderId,
      p_reason: reason,
      p_public_destination: destinationRaw === "" ? null : destinationRaw,
    });
    if (error) {
      const known = ["unknown_reference", "already_approved", "reason_required", "actor_required"];
      const code = known.find((k) => error.message.includes(k));
      return NextResponse.json(
        { error: code ?? "approve_failed" },
        { status: code === "already_approved" ? 409 : code ? 400 : 500 }
      );
    }
    return NextResponse.json({ approval: data }, { status: 201 });
  }

  if (action === "revoke") {
    const { data, error } = await service.rpc("public_watch_index_revoke_reference_knowledge", {
      p_vault_reference_id: vaultReferenceId,
      p_actor_uid: founderId,
      p_reason: reason,
    });
    if (error) {
      const code = error.message.includes("no_live_approval") ? "no_live_approval" : null;
      return NextResponse.json({ error: code ?? "revoke_failed" }, { status: code ? 409 : 500 });
    }
    return NextResponse.json({
      approval: data,
      note: "Authority withdrawn. The positive assertion disappears on the projection's next read; internal knowledge is untouched.",
    });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
