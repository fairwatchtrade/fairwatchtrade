import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   /api/admin/marketplace/prefs — per-admin presentation preferences

   GET  → the caller's stored Marketplace Control preferences (or {}).
   PUT  → replace them ({ prefs: {...} }).

   Presentation/query state ONLY (saved-view law): last-used view, saved
   Detailed views, column layout. Nothing here can touch a listing. Writes go
   through the SESSION client against admin_view_preferences, whose RLS is
   auth.uid() = user_id — the founder gate below is the room's door check,
   the row scope is the database's own law.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export const dynamic = "force-dynamic";

/* Bounded well under the column CHECK (64 KB) so an oversized write fails
   here as a sentence, not there as a constraint violation. */
const MAX_PREFS_BYTES = 32 * 1024;

async function requireFounder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      user: null,
      response: NextResponse.json(
        { error: "not_authenticated", detail: "Sign in required." },
        { status: 401 }
      ),
    };
  }
  if (user.id !== ADMIN_USER_ID) {
    return {
      supabase,
      user: null,
      response: NextResponse.json(
        { error: "forbidden", detail: "Admin only." },
        { status: 403 }
      ),
    };
  }
  return { supabase, user, response: null };
}

export async function GET() {
  const { supabase, user, response } = await requireFounder();
  if (!user) return response;

  const { data, error } = await supabase
    .from("admin_view_preferences")
    .select("prefs, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[marketplace-control] prefs read failed:", error.message);
    return NextResponse.json(
      { error: "read_failed", detail: "Could not read preferences." },
      { status: 500 }
    );
  }
  return NextResponse.json(
    { prefs: data?.prefs ?? {}, updated_at: data?.updated_at ?? null },
    { status: 200 }
  );
}

export async function PUT(request: NextRequest) {
  const { supabase, user, response } = await requireFounder();
  if (!user) return response;

  let prefs: unknown;
  try {
    const body = (await request.json()) as { prefs?: unknown };
    prefs = body?.prefs;
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not parse request body." },
      { status: 400 }
    );
  }
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
    return NextResponse.json(
      { error: "bad_request", detail: "prefs must be an object." },
      { status: 400 }
    );
  }
  if (JSON.stringify(prefs).length > MAX_PREFS_BYTES) {
    return NextResponse.json(
      { error: "prefs_too_large", detail: "Preferences exceed the stored bound." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("admin_view_preferences").upsert(
    {
      user_id: user.id,
      prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[marketplace-control] prefs write failed:", error.message);
    return NextResponse.json(
      { error: "write_failed", detail: "Could not save preferences." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
