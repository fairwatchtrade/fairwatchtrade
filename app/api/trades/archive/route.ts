import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/trades/archive — file a finished trade out of MY Active view
   (Account Workspace archive, 2026-09-12)

   The browser sends two things and neither is authority: which record, and
   whether to archive or restore. Everything that decides whether that is
   allowed — who is asking, whether they are a party to the trade, whether
   the record's CURRENT lifecycle is finished — is derived inside
   `trade_archive_set()`, which is the only writer of the preference table.

   A participant id in the body would be ignored; a status in the body
   would be ignored; another user's archive flag is unreachable. There is
   nothing to forge here because nothing is accepted.

   Archive changes no commercial truth and is invisible to the counterparty.
   Both directions are idempotent: archiving twice is archived, restoring
   something already visible is a no-op, and neither is an error.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  let body: { recordKind?: unknown; recordId?: unknown; archived?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }

  const recordKind = body.recordKind === "deal" || body.recordKind === "offer" ? body.recordKind : null;
  const recordId = typeof body.recordId === "string" ? body.recordId.trim() : "";
  if (!recordKind || !UUID.test(recordId) || typeof body.archived !== "boolean") {
    return NextResponse.json({ error: "bad_request", detail: "A trade record and an archive intent are required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("trade_archive_set", {
    p_record_kind: recordKind,
    p_record_id: recordId,
    p_archived: body.archived,
  });

  if (error) {
    const msg = error.message || "";
    /* A trade this caller is not part of and a trade that does not exist
       get one answer, so the refusal cannot be used to discover trades. */
    if (msg.includes("not_found")) {
      return NextResponse.json({ error: "not_found", detail: "No such trade." }, { status: 404 });
    }
    if (msg.includes("not_eligible")) {
      return NextResponse.json(
        { error: "not_eligible", detail: "This trade is still in progress. It can be archived once it is complete or cancelled." },
        { status: 409 }
      );
    }
    console.error("[trades:archive] failed:", msg);
    return NextResponse.json({ error: "archive_failed", detail: "That could not be saved just now." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data }, { status: 200 });
}
