import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/listings/[id]/status — founder status change

   Sets a listing's status. Used by /admin/listings/[id] (status controls +
   Take Down). Curl-testable: an unauthenticated or non-founder request is
   rejected here, independent of the page — verify with a bare request, no UI.

   TWO INDEPENDENT GATES (defense-in-depth):
     · The page runs its own founder check before rendering the controls.
     · This route runs its OWN founder check, with the UID as a HARDCODED
       LITERAL in this file — not imported from a shared constant. Neither
       surface trusts the other; both must independently pass.

   WHY THE TRUSTED CLIENT FOR THE WRITE:
     RLS (listings_update_own) scopes the session client's UPDATE to
     auth.uid() = seller_id. A founder editing another seller's listing would
     silently affect ZERO rows — no error, no change. The service client
     bypasses RLS and is reached ONLY after the admin gate below. There is no
     CHECK constraint on listings.status, so this route also validates the
     value against the four allowed statuses — it is the guard.

   No schema changes. No new tables. Status change only — never destroys a row.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const ALLOWED_STATUSES = ["draft", "published", "rejected", "pending_review"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1 · authenticate + authorize with the session client (independent gate).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated", detail: "Sign in required." },
      { status: 401 }
    );
  }
  if (user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: "forbidden", detail: "Admin only." }, { status: 403 });
  }

  // 2 · parse + validate the requested status.
  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not parse request body." },
      { status: 400 }
    );
  }

  const status = typeof body.status === "string" ? body.status : "";
  if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: "invalid_status", detail: `status must be one of: ${ALLOWED_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }
  if (!id) {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing listing id." },
      { status: 400 }
    );
  }

  // 3 · perform the update with the trusted client (bypasses RLS; reached only
  //     after the admin gate above).
  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[admin] status update — trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin write channel unavailable." },
      { status: 500 }
    );
  }

  const { data, error } = await service
    .from("listings")
    .update({ status: status as AllowedStatus })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "not_found", detail: `No listing with id ${id}.` },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status }, { status: 200 });
}
