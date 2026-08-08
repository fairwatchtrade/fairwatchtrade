import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { materializeOneItem, BridgeError } from "@/lib/dealer/materializationBridge";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/dealer-accelerator/materialize — EVIDENCE → DRAFT

   Ignition for the materialization bridge. One call, one item, always: the
   body names a single source item by its stable key and there is no batch,
   limit, or "all" parameter to reach for. A broad run is twelve deliberate
   calls, not one careless flag.

   · Node.js runtime, never edge — the bridge streams photograph bytes
   · founder gate: HARDCODED literal in THIS file, matching the spine's
     discipline — a non-founder is rejected regardless of any UI
   · no service-role credential enters any client bundle; the trusted client
     lives inside the bridge module, server-side only

   mode:
     "assess"      — read the evidence, apply mechanical discovered → ready
                     or → blocked, and stop. No bytes move. No draft exists.
     "materialize" — the same assessment, then republish the photographs and
                     create the draft.

   What this route can never do, by construction: publish, submit for review,
   notify anyone, or create a listing owned by anyone but the dealer the
   evidence belongs to. The seller is carried through the spine's own chain
   and is not a parameter here.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of any shared constant and of the other admin surfaces' own copies.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MaterializeBody {
  source_id?: string;
  source_item_key?: string;
  mode?: "assess" | "materialize";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: MaterializeBody;
  try {
    body = (await request.json()) as MaterializeBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const sourceId = (body.source_id ?? "").trim();
  const sourceItemKey = (body.source_item_key ?? "").trim();
  const mode = body.mode ?? "assess"; // the safe default: never materialize by omission

  if (!UUID_RE.test(sourceId)) {
    return NextResponse.json({ error: "source_id_required" }, { status: 400 });
  }
  if (sourceItemKey === "" || sourceItemKey.length > 400) {
    return NextResponse.json({ error: "source_item_key_required" }, { status: 400 });
  }
  if (mode !== "assess" && mode !== "materialize") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }

  try {
    const report = await materializeOneItem({
      sourceId,
      sourceItemKey,
      actorUserId: user.id,
      mode,
    });
    return NextResponse.json({ report }, { status: report.outcome === "BLOCKED" ? 409 : 200 });
  } catch (e) {
    // A refusal the bridge can name is returned verbatim: the exact blocker is
    // more useful than a tidy generic failure.
    const detail = e instanceof BridgeError || e instanceof Error ? e.message : "materialization_failed";
    return NextResponse.json({ error: "materialization_failed", detail }, { status: 500 });
  }
}
