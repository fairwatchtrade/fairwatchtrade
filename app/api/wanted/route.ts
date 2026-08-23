import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENTATION_LEVELS,
  displayIdentity,
  type DocumentationLevel,
} from "@/lib/wanted";

/* ════════════════════════════════════════════════════════════════════════
   /api/wanted — the collector's own Wanted requests

   GET   list the caller's requests (+ answer counts)
   POST  create one

   THE SESSION CLIENT DOES THE WORK ON PURPOSE. Every row here is
   own-row-only under RLS (wanted_requests_select/insert/update/delete_own),
   so the database enforces ownership rather than this route remembering to
   filter. No service client appears in this file: a collector managing
   their own demand needs no elevated channel, and not having one means a
   bug here cannot reach anyone else's rows.

   The budget lives in this payload because it is the OWNER writing it. It
   never travels the other direction — the seller-facing read is a separate
   SECURITY DEFINER projection that cannot return it.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTE_MAX = 500;
const CRITERIA_MAX = 12;
const CRITERION_LEN = 120;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null;

/** Bounded, de-duplicated, blank-free criteria list. */
function criteriaList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, CRITERION_LEN);
    if (s && !out.some((existing) => existing.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= CRITERIA_MAX) break;
  }
  return out;
}

/** Money is a pair or it is nothing — mirrors the database CHECK so the
    caller gets a sentence instead of a constraint violation. */
function money(body: Record<string, unknown>): {
  target_price: number | null;
  max_price: number | null;
  currency: string | null;
  error?: string;
} {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  const target = num(body.targetPrice);
  const max = num(body.maxPrice);
  const currency = str(body.currency, 8);
  if ((target !== null || max !== null) && !currency) {
    return { target_price: null, max_price: null, currency: null, error: "A currency is required with a budget." };
  }
  if (target !== null && max !== null && target > max) {
    return { target_price: null, max_price: null, currency: null, error: "The target cannot be above the maximum." };
  }
  return { target_price: target, max_price: max, currency: target === null && max === null ? null : currency };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wanted_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "read_failed", detail: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  /* Answer counts in one read rather than one per request. RLS already
     scopes these to answers on the caller's own requests. */
  const counts = new Map<string, number>();
  const unread = new Map<string, number>();
  if (rows.length > 0) {
    const { data: answers } = await supabase
      .from("wanted_request_answers")
      .select("wanted_request_id, state")
      .in("wanted_request_id", rows.map((r) => r.id as string));
    for (const a of answers ?? []) {
      const id = a.wanted_request_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (a.state === "unread") unread.set(id, (unread.get(id) ?? 0) + 1);
    }
  }

  return NextResponse.json(
    {
      requests: rows.map((r) => ({
        ...r,
        answer_count: counts.get(r.id as string) ?? 0,
        unread_answer_count: unread.get(r.id as string) ?? 0,
      })),
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }

  const brand = str(body.brand, 120);
  if (!brand) {
    return NextResponse.json(
      { error: "brand_required", detail: "Start with the maker — it is the one thing a Wanted request cannot do without." },
      { status: 400 }
    );
  }
  const modelText = str(body.modelText, 160);
  const referenceText = str(body.referenceText, 80);

  const m = money(body);
  if (m.error) {
    return NextResponse.json({ error: "bad_budget", detail: m.error }, { status: 400 });
  }

  const documentation = (
    (DOCUMENTATION_LEVELS as readonly string[]).includes(String(body.documentation))
      ? body.documentation
      : "any"
  ) as DocumentationLevel;

  /* draft vs active is the collector's call at creation: Review → Activate
     produces 'active'; saving for later produces 'draft'. Only 'active'
     is ever visible to a seller. */
  const status = body.activate === true ? "active" : "draft";

  const { data, error } = await supabase
    .from("wanted_requests")
    .insert({
      requester_id: user.id,
      status,
      brand,
      model_text: modelText,
      reference_text: referenceText,
      display_identity: displayIdentity({
        brand,
        modelText,
        referenceText,
      }),
      target_price: m.target_price,
      max_price: m.max_price,
      currency: m.currency,
      collector_note: str(body.collectorNote, NOTE_MAX),
      min_condition: str(body.minCondition, 60),
      documentation,
      must_have: criteriaList(body.mustHave),
      preferred: criteriaList(body.preferred),
      private_listing_ok: body.privateListingOk !== false,
      activated_at: status === "active" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[wanted] create failed:", error.message);
    return NextResponse.json({ error: "create_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}
