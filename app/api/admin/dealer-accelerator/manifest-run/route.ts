import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runManifestSlice } from "@/lib/dealer/manifestAdapter";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/dealer-accelerator/manifest-run — FLIGHT 3 IGNITION

   The thin founder-triggered route of contract v7 §12: authenticate
   founder → validate bounded invocation → call the adapter slice service →
   return truthful progress. Ignition, not middleware — the adapter module
   owns every law; this file owns nothing but the gate and the shape of the
   request. Cron, a queue consumer, or a CLI could call the same module
   later without contract change.

   · Node.js runtime, never edge (§15's pinned-connection strategy needs it)
   · founder gate: HARDCODED literal in THIS file, matching the import
     spine's discipline — a non-founder is rejected regardless of any UI
   · no service-role credential enters any client bundle; the service
     client lives server-side only
   · cancel: { action: "cancel", batch_id } → truthful cancellation via the
     idempotent request function (§10); repeated requests converge,
     terminal batches reject loudly
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

interface RunBody {
  action?: "run" | "cancel";
  source_id?: string;
  declared_manifest_version?: string;
  manifest_url?: string;
  batch_limit?: number;
  batch_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let body: RunBody;
  try {
    body = (await request.json()) as RunBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.action === "cancel") {
    if (!body.batch_id || !UUID_RE.test(body.batch_id)) {
      return NextResponse.json({ error: "batch_id_required" }, { status: 400 });
    }
    const db = createServiceClient();
    const { data, error } = await db.rpc("dealer_accelerator_request_batch_cancellation", {
      p_batch_id: body.batch_id,
      p_actor_kind: "founder",
      p_actor_user_id: user.id,
      p_reason_code: "founder_cancellation",
    });
    if (error) {
      // terminal batches reject truthfully — surface the exact refusal
      return NextResponse.json({ error: "cancellation_refused", detail: error.message }, { status: 409 });
    }
    return NextResponse.json({ batch: { id: (data as { id: string }).id, status: (data as { status: string }).status } });
  }

  // ── bounded run invocation ──
  const sourceId = body.source_id ?? "";
  const declared = (body.declared_manifest_version ?? "").trim();
  const url = (body.manifest_url ?? "").trim();
  const limit = body.batch_limit ?? 0;
  if (!UUID_RE.test(sourceId)) {
    return NextResponse.json({ error: "source_id_required" }, { status: 400 });
  }
  if (declared === "" || declared.length > 200) {
    return NextResponse.json({ error: "declared_manifest_version_required" }, { status: 400 });
  }
  if (!url.startsWith("https://")) {
    return NextResponse.json({ error: "manifest_url_must_be_https" }, { status: 400 });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    return NextResponse.json({ error: "batch_limit_out_of_range" }, { status: 400 });
  }

  try {
    const report = await runManifestSlice({
      sourceId,
      declaredManifestVersion: declared,
      manifestUrl: url,
      batchLimit: limit,
      actorUserId: user.id,
    });
    return NextResponse.json({ report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "adapter_failure";
    return NextResponse.json({ error: "slice_failed", detail: msg }, { status: 500 });
  }
}
