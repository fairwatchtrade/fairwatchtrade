import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   WIZARD SESSION — app/api/wizard-session/route.ts   (v2.2)

   The In Hand Verified session ledger. One row per guided capture session:
   device-bound (device_session_token, held in localStorage per the GPT
   ruling), seller-bound (derived from auth — NEVER trusted from the client),
   and time-bound (2 hours of inactivity → expired).

   POST   → create a session. Body: { listing_id?, device_session_token }.
            Returns { capture_session_id, expires_at }.
   PATCH  → heartbeat + step advance. Body: { capture_session_id,
            device_session_token, current_step?, status? }.
            Updates last_activity_at; may mark completed/paused.
   GET    → validity check. Query: ?capture_session_id=…&device_session_token=…
            Returns { valid, current_step, status, expires_at }.

   Expiry is lazy: any read/write that finds last_activity_at older than
   2 hours marks the row expired and reports it. Expiry only ends BADGE
   eligibility — the draft survival invariant means the listing draft is
   never touched by anything in this file. Sessions expire; drafts endure.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

const INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 hours

type SessionRow = {
  id: string;
  listing_id: string | null;
  seller_id: string;
  current_step: string;
  capture_session_id: string;
  device_session_token: string;
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
  status: string;
};

function expiresAt(lastActivityIso: string): string {
  return new Date(new Date(lastActivityIso).getTime() + INACTIVITY_MS).toISOString();
}

function isStale(lastActivityIso: string): boolean {
  return Date.now() - new Date(lastActivityIso).getTime() > INACTIVITY_MS;
}

/* ── POST — create ─────────────────────────────────────────────────────── */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { listing_id?: unknown; device_session_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  const deviceToken =
    typeof body.device_session_token === "string" ? body.device_session_token.trim() : "";
  if (!deviceToken) {
    return NextResponse.json({ error: "Missing device token." }, { status: 400 });
  }
  const listingId = typeof body.listing_id === "string" ? body.listing_id : null;

  const captureSessionId = crypto.randomUUID();

  const { data, error } = await supabase
    .from("mobile_wizard_sessions")
    .insert({
      listing_id: listingId,
      seller_id: user.id, // derived from auth — client-supplied seller ids are ignored
      capture_session_id: captureSessionId,
      device_session_token: deviceToken,
      current_step: "identity",
      status: "active",
    })
    .select("capture_session_id, last_activity_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not start the session." }, { status: 500 });
  }

  return NextResponse.json({
    capture_session_id: data.capture_session_id,
    expires_at: expiresAt(data.last_activity_at),
  });
}

/* ── Shared fetch + ownership + device + staleness gate ───────────────── */
async function loadSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  captureSessionId: string,
  deviceToken: string
): Promise<
  | { ok: true; row: SessionRow }
  | { ok: false; status: number; error: string; expired?: boolean }
> {
  const { data, error } = await supabase
    .from("mobile_wizard_sessions")
    .select("*")
    .eq("capture_session_id", captureSessionId)
    .single();

  if (error || !data) {
    return { ok: false, status: 404, error: "Session not found." };
  }
  const row = data as SessionRow;

  // RLS already scopes to the owner; this is belt-and-braces.
  if (row.seller_id !== userId) {
    return { ok: false, status: 403, error: "Not your session." };
  }
  // Badge is device-bound: a different browser/device can read the DRAFT
  // (cross-device), but this session — and its badge — belongs to one device.
  if (row.device_session_token !== deviceToken) {
    return { ok: false, status: 403, error: "Session belongs to another device." };
  }

  // Lazy expiry — inactivity beyond the window ends badge eligibility only.
  if (row.status === "active" && isStale(row.last_activity_at)) {
    await supabase
      .from("mobile_wizard_sessions")
      .update({ status: "expired" })
      .eq("id", row.id);
    return { ok: false, status: 410, error: "Session expired.", expired: true };
  }

  return { ok: true, row };
}

/* ── PATCH — heartbeat / step advance / status transition ─────────────── */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    capture_session_id?: unknown;
    device_session_token?: unknown;
    current_step?: unknown;
    status?: unknown;
    listing_id?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  const captureSessionId =
    typeof body.capture_session_id === "string" ? body.capture_session_id : "";
  const deviceToken =
    typeof body.device_session_token === "string" ? body.device_session_token : "";
  if (!captureSessionId || !deviceToken) {
    return NextResponse.json({ error: "Missing session identifiers." }, { status: 400 });
  }

  const gate = await loadSession(supabase, user.id, captureSessionId, deviceToken);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error, expired: gate.expired ?? false },
      { status: gate.status }
    );
  }

  const update: Record<string, unknown> = { last_activity_at: new Date().toISOString() };

  if (typeof body.current_step === "string" && body.current_step.trim() !== "") {
    update.current_step = body.current_step.trim();
  }
  // Late listing link — the session may be created before the draft exists.
  if (typeof body.listing_id === "string" && body.listing_id && !gate.row.listing_id) {
    update.listing_id = body.listing_id;
  }
  if (typeof body.status === "string") {
    const allowed = ["active", "paused", "completed"];
    if (allowed.includes(body.status)) {
      update.status = body.status;
      if (body.status === "completed") update.completed_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from("mobile_wizard_sessions")
    .update(update)
    .eq("id", gate.row.id)
    .select("current_step, status, last_activity_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }

  return NextResponse.json({
    valid: data.status === "active",
    current_step: data.current_step,
    status: data.status,
    expires_at: expiresAt(data.last_activity_at),
  });
}

/* ── GET — validate ────────────────────────────────────────────────────── */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const captureSessionId = url.searchParams.get("capture_session_id") ?? "";
  const deviceToken = url.searchParams.get("device_session_token") ?? "";
  if (!captureSessionId || !deviceToken) {
    return NextResponse.json({ error: "Missing session identifiers." }, { status: 400 });
  }

  const gate = await loadSession(supabase, user.id, captureSessionId, deviceToken);
  if (!gate.ok) {
    return NextResponse.json(
      { valid: false, error: gate.error, expired: gate.expired ?? false },
      { status: gate.status }
    );
  }

  return NextResponse.json({
    valid: gate.row.status === "active",
    current_step: gate.row.current_step,
    status: gate.row.status,
    expires_at: expiresAt(gate.row.last_activity_at),
  });
}
