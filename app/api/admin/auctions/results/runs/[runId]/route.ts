import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRun } from "@/lib/auction-operations/runStore";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/admin/auctions/results/runs/[runId] — durable run status

   The read seam the room polls: state, summary, contradictions, progress,
   and the exact error a refusal recorded. The full plan body is not
   returned — the summary and hash are what the founder reviews, and the
   hash is what they approve. Leaving and reloading loses nothing; the run
   is the durable truth, not the browser tab.

   TWO INDEPENDENT GATES, same shape as the admin status route.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const maxDuration = 60;

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

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
  if (!runId) {
    return NextResponse.json({ error: "bad_request", detail: "Missing run id." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[auction-ops] run read — trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin read channel unavailable." },
      { status: 500 }
    );
  }

  const run = await getRun(service, runId);
  if (!run) {
    return NextResponse.json({ error: "not_found", detail: "No such run." }, { status: 404 });
  }

  return NextResponse.json(
    {
      runId: run.id,
      adapter: run.adapter_id,
      packetId: run.packet_id,
      state: run.state,
      planSha256: run.plan_sha256,
      summary: run.summary,
      contradictions: run.contradictions,
      progress: run.progress,
      lastErrorCode: run.last_error_code,
      lastErrorDetail: run.last_error_detail,
      createdAt: run.created_at,
      approvedAt: run.approved_at,
      appliedAt: run.applied_at,
    },
    { status: 200 }
  );
}
