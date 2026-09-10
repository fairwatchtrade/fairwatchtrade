import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC WATCH INDEX — founder path for P7 correction / withdrawal
   (P8, Part B)
   app/api/admin/public-watch-index/episode-reference/route.ts

   Governing authority:
   docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md §§2, 5, 6.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "This route decides which reference a historical episode belonged to."

   It decides nothing. It carries FOUNDER AUTHORITY to two functions that
   already exist and already hold every rule:
   public_watch_index_correct_episode_reference() appends and supersedes,
   public_watch_index_withdraw_episode_reference() removes an exact-reference
   claim without touching the publication event. Neither semantic is
   reimplemented here, because a load-bearing rule expressed twice is a rule
   that will drift.

   CAPABILITY ONLY. Creating this path does not authorize correcting any real
   historical episode. The thirteen pre-P7 public episodes stay untouched
   until a governed human decision with actual evidence says otherwise, and
   this route will not act on one by itself.

   THE ACTOR IS ALWAYS THE SESSION FOUNDER. There is no request field through
   which a caller can name a different one, so a correction cannot be
   attributed to someone who did not make it.

   WHAT IT PRESERVES BY DELEGATING: correction refuses a non-public episode;
   seller-text equality can never block a valid governed correction, because
   no text is consulted at all; the superseded association stays auditable;
   and a live suppression keeps following its contribution across any
   reassociation, because suppression is applied by the projection, not here.

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

/** Parse a durable publication episode id: a positive integer, nothing else. */
function episodeIdOf(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d{1,15}$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

/** The founder's own view of the association chain — current and retired. */
export async function GET(request: NextRequest) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;

  const params = request.nextUrl.searchParams;
  const episodeId = episodeIdOf(params.get("episodeId") ?? "");
  const referenceId = (params.get("vaultReferenceId") ?? "").trim();

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  let query = service
    .from("public_watch_index_episode_reference")
    .select(
      "id, episode_id, vault_reference_id, established_via, recorded_at, recorded_by, reason, supersedes_id, is_current, retired_at, retired_by, retired_kind, retired_reason"
    )
    .order("recorded_at", { ascending: false })
    .limit(200);

  if (episodeId !== null) {
    query = query.eq("episode_id", episodeId);
  } else if (referenceId !== "") {
    if (!UUID.test(referenceId)) {
      return NextResponse.json({ error: "invalid_reference_id" }, { status: 400 });
    }
    query = query.eq("vault_reference_id", referenceId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 500 });
  return NextResponse.json({ associations: data ?? [] });
}

/**
 * POST { action: "correct" | "withdraw", episodeId, reason, vaultReferenceId? }
 *
 * correct  — requires the exact canonical reference id the episode belonged to
 * withdraw — removes the exact-reference claim; no reference id is meaningful
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
  const episodeId = episodeIdOf(body.episodeId);

  if (episodeId === null) {
    return NextResponse.json({ error: "invalid_episode" }, { status: 400 });
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

  if (action === "correct") {
    const vaultReferenceId =
      typeof body.vaultReferenceId === "string" ? body.vaultReferenceId.trim() : "";
    if (!UUID.test(vaultReferenceId)) {
      return NextResponse.json({ error: "invalid_reference_id" }, { status: 400 });
    }

    const { data, error } = await service.rpc("public_watch_index_correct_episode_reference", {
      p_episode_id: episodeId,
      p_vault_reference_id: vaultReferenceId,
      p_actor_uid: founderId,
      p_reason: reason,
    });
    if (error) {
      const known = [
        "unknown_public_episode",
        "unknown_reference",
        "already_associated",
        "reason_required",
        "actor_required",
      ];
      const code = known.find((k) => error.message.includes(k));
      return NextResponse.json(
        { error: code ?? "correct_failed" },
        { status: code === "already_associated" ? 409 : code ? 400 : 500 }
      );
    }
    return NextResponse.json(
      {
        association: data,
        note: "Correction recorded. The prior association is retired as superseded and stays auditable; the publication episode itself is unchanged.",
      },
      { status: 201 }
    );
  }

  if (action === "withdraw") {
    const { data, error } = await service.rpc("public_watch_index_withdraw_episode_reference", {
      p_episode_id: episodeId,
      p_actor_uid: founderId,
      p_reason: reason,
    });
    if (error) {
      const code = error.message.includes("no_current_association")
        ? "no_current_association"
        : null;
      return NextResponse.json({ error: code ?? "withdraw_failed" }, { status: code ? 409 : 500 });
    }
    return NextResponse.json({
      association: data,
      note: "Exact-reference claim withdrawn. The publication event is untouched; this is an evidence statement, not a suppression.",
    });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
