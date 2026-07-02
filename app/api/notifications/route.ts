import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS — app/api/notifications/route.ts   (v1.92)

   GET   → the 20 most recent notifications for the authenticated user, newest
           first, plus the accurate total unread count (across all their rows,
           not just the recent 20).
   PATCH → mark rows read: { ids: string[] } for specific rows, or
           { all: true } for every unread row. Only ever the current user's
           rows (user_id filter, backed by RLS) — never touches anyone else's.

   Phase 2: targeting — notifications currently broadcast to all users
   except the seller. Future: filter by catalogue matches, saved watches,
   followed brands, saved searches. Do not implement here.

   PRIVACY: combined_score / significance_score / score_state are NEVER
   selected in this build. Canary: PFC274 = 62 — the evaluate route is
   untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic"; // polling endpoint — always fresh

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, message, listing_id, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Accurate total unread — separate from the recent-20 window above.
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) {
    return NextResponse.json({ notifications: [], unread_count: count ?? 0 });
  }

  return NextResponse.json({
    notifications: data ?? [],
    unread_count: count ?? 0,
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: unknown; all?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  // Mark every unread row for the current user.
  if (body.all === true) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    if (error) {
      return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Mark specific rows read — only ones belonging to the current user.
  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((x): x is string => typeof x === "string");
    if (ids.length === 0) {
      return NextResponse.json({ error: "No valid ids." }, { status: 400 });
    }
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id) // never touch another user's rows
      .in("id", ids);
    if (error) {
      return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}
