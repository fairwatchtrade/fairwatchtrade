import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CLOSE_REASONS,
  DOCUMENTATION_LEVELS,
  displayIdentity,
  type DocumentationLevel,
} from "@/lib/wanted";

/* ════════════════════════════════════════════════════════════════════════
   /api/wanted/[id] — edit and lifecycle for ONE own request

   PATCH  edit fields, or move state: activate / pause / resume / close
   DELETE remove a request the collector never activated

   Session client only, exactly as /api/wanted: RLS scopes every write to
   requester_id = auth.uid(), so a wrong id affects zero rows rather than
   someone else's demand.

   ── PAUSE AND CLOSE MEAN DIFFERENT THINGS AND BOTH KEEP HISTORY ───────
   Pause stops seller visibility and routing; the request and its answers
   survive untouched and resume returns it to the queue. Close means the
   collector is no longer seeking — also preserved, never deleted, with an
   optional reason that is theirs alone (no seller ever sees it).

   Delete exists only for a request that was never activated. Once demand
   has been visible to sellers and possibly answered, it is history, and
   history is preserved rather than erased.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null;

function criteriaList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, 120);
    if (s && !out.some((e) => e.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= 12) break;
  }
  return out;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ error: "bad_request", detail: "Missing request id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }

  // Current state decides which transitions are legal.
  const { data: current, error: readErr } = await supabase
    .from("wanted_requests")
    .select("id, status, brand, model_text, reference_text")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: "read_failed", detail: readErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "not_found", detail: "No such request." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  const nowIso = new Date().toISOString();

  /* ── Lifecycle ─────────────────────────────────────────────────────── */
  const action = typeof body.action === "string" ? body.action : null;
  if (action) {
    if (current.status === "closed") {
      return NextResponse.json(
        { error: "already_closed", detail: "This request is closed. Create a new one to start looking again." },
        { status: 409 }
      );
    }
    if (action === "activate") {
      if (current.status !== "draft" && current.status !== "paused") {
        return NextResponse.json(
          { error: "invalid_transition", detail: `A ${current.status} request is already live.` },
          { status: 409 }
        );
      }
      patch.status = "active";
      patch.activated_at = nowIso;
    } else if (action === "pause") {
      if (current.status !== "active" && current.status !== "answered") {
        return NextResponse.json(
          { error: "invalid_transition", detail: "Only a live request can be paused." },
          { status: 409 }
        );
      }
      patch.status = "paused";
    } else if (action === "resume") {
      if (current.status !== "paused") {
        return NextResponse.json(
          { error: "invalid_transition", detail: "Only a paused request can be resumed." },
          { status: 409 }
        );
      }
      /* Resume returns it to the queue. If answers already exist the
         request is 'answered' again — answering never closed it. */
      const { count } = await supabase
        .from("wanted_request_answers")
        .select("id", { count: "exact", head: true })
        .eq("wanted_request_id", id);
      patch.status = (count ?? 0) > 0 ? "answered" : "active";
    } else if (action === "close") {
      const reason = str(body.closeReason, 40);
      const valid = reason && (CLOSE_REASONS as readonly { value: string }[]).some((r) => r.value === reason);
      patch.status = "closed";
      patch.closed_at = nowIso;
      patch.close_reason = valid ? reason : null;
    } else {
      return NextResponse.json({ error: "unknown_action", detail: `Unknown action "${action}".` }, { status: 400 });
    }
  }

  /* ── Field edits ───────────────────────────────────────────────────── */
  if (!action) {
    if (current.status === "closed") {
      return NextResponse.json(
        { error: "already_closed", detail: "A closed request is history and is not edited." },
        { status: 409 }
      );
    }
    const brand = str(body.brand, 120);
    const modelText = "modelText" in body ? str(body.modelText, 160) : (current.model_text as string | null);
    const referenceText =
      "referenceText" in body ? str(body.referenceText, 80) : (current.reference_text as string | null);

    if (brand !== null || "modelText" in body || "referenceText" in body) {
      const nextBrand = brand ?? (current.brand as string);
      patch.brand = nextBrand;
      patch.model_text = modelText;
      patch.reference_text = referenceText;
      patch.display_identity = displayIdentity({ brand: nextBrand, modelText, referenceText });
    }

    if ("minCondition" in body) patch.min_condition = str(body.minCondition, 60);
    if ("collectorNote" in body) patch.collector_note = str(body.collectorNote, 500);
    if ("mustHave" in body) patch.must_have = criteriaList(body.mustHave);
    if ("preferred" in body) patch.preferred = criteriaList(body.preferred);
    if ("privateListingOk" in body) patch.private_listing_ok = body.privateListingOk !== false;
    if ("documentation" in body) {
      patch.documentation = ((DOCUMENTATION_LEVELS as readonly string[]).includes(String(body.documentation))
        ? body.documentation
        : "any") as DocumentationLevel;
    }

    if ("targetPrice" in body || "maxPrice" in body || "currency" in body) {
      const num = (v: unknown): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
      };
      const target = num(body.targetPrice);
      const max = num(body.maxPrice);
      const currency = str(body.currency, 8);
      if ((target !== null || max !== null) && !currency) {
        return NextResponse.json(
          { error: "bad_budget", detail: "A currency is required with a budget." },
          { status: 400 }
        );
      }
      if (target !== null && max !== null && target > max) {
        return NextResponse.json(
          { error: "bad_budget", detail: "The target cannot be above the maximum." },
          { status: 400 }
        );
      }
      patch.target_price = target;
      patch.max_price = max;
      patch.currency = target === null && max === null ? null : currency;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_do", detail: "No change was requested." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("wanted_requests")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[wanted] update failed:", error.message);
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found", detail: "No such request." }, { status: 404 });
  }

  return NextResponse.json({ request: data }, { status: 200 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  const { data: current } = await supabase
    .from("wanted_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: "not_found", detail: "No such request." }, { status: 404 });
  }
  /* Demand that sellers could see is history. Close it; do not erase it. */
  if (current.status !== "draft") {
    return NextResponse.json(
      {
        error: "not_deletable",
        detail: "This request has been live. Close it instead — its history is kept.",
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("wanted_requests").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
