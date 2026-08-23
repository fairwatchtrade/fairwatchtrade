import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePacket } from "@/lib/auction-operations/registry";
import { generatePlanForRun } from "@/lib/auction-operations/planEngine";
import { createRun, getRun, markFailed, updateRun } from "@/lib/auction-operations/runStore";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/auctions/results/plan — deterministic plan generation

   ZERO AUCTION EVIDENCE WRITES. Planning acquires the registered inputs
   (staged founder files or the packet's pinned URLs), verifies every hash
   and semantic gate, inspects live database truth, and persists one
   deterministic plan with its SHA-256 on the run. The founder reviews that
   summary; nothing has changed in the evidence layer when this returns.

   Two entry shapes:
     { runId }              plan a run whose sources were just staged
     { adapter, packetId }  no-upload packets (Monaco 38/40/41) — the run
                            is created here, state 'planning'

   Contradictions are a REFUSAL, not a footnote: a plan that carries any is
   persisted for review but Apply will not accept it.

   TWO INDEPENDENT GATES, same shape as the admin status route.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const maxDuration = 300;

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export async function POST(request: NextRequest) {
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

  let body: { runId?: unknown; adapter?: unknown; packetId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[auction-ops] plan — trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin write channel unavailable." },
      { status: 500 }
    );
  }

  // Resolve the run: staged (by id) or fresh for a no-upload packet.
  let run;
  if (typeof body.runId === "string" && body.runId) {
    run = await getRun(service, body.runId);
    if (!run) {
      return NextResponse.json({ error: "not_found", detail: "No such run." }, { status: 404 });
    }
    if (run.state !== "uploading" && run.state !== "planning" && run.state !== "failed") {
      return NextResponse.json(
        { error: "invalid_state", detail: `A ${run.state} run cannot be re-planned.` },
        { status: 409 }
      );
    }
  } else {
    const packet = resolvePacket(body.adapter, body.packetId);
    if (!packet) {
      return NextResponse.json(
        { error: "unregistered_packet", detail: "Only registered source packets can be planned." },
        { status: 400 }
      );
    }
    if (packet.uploads.some((u) => u.required)) {
      return NextResponse.json(
        { error: "missing_source", detail: "This packet requires staged source files — start with the upload step." },
        { status: 400 }
      );
    }
    run = await createRun(service, {
      adapter: packet.adapter,
      packetId: packet.packetId,
      createdBy: user.id,
      state: "planning",
    });
  }

  const packet = resolvePacket(run.adapter_id, run.packet_id);
  if (!packet) {
    await markFailed(service, run.id, "unregistered_packet", "run references an unknown packet");
    return NextResponse.json(
      { error: "unregistered_packet", detail: "This run references a packet that is no longer registered." },
      { status: 409 }
    );
  }

  await updateRun(service, run.id, { state: "planning", last_error_code: null, last_error_detail: null });

  try {
    const generated = await generatePlanForRun(service, run, packet);
    await updateRun(service, run.id, {
      state: "planned",
      plan_bytes: generated.planBytes,
      plan_sha256: generated.planSha256,
      summary: generated.summary,
      contradictions: generated.contradictions,
      source_hashes: generated.sourceHashes,
      progress: {},
    });
    return NextResponse.json(
      {
        runId: run.id,
        adapter: run.adapter_id,
        packetId: run.packet_id,
        state: "planned",
        planSha256: generated.planSha256,
        summary: generated.summary,
        contradictions: generated.contradictions,
      },
      { status: 200 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // The refusal vocabulary travels in the message prefix where the engine
    // set one; everything else is a parse/verification failure.
    const code = /^([a-z_]+):/.exec(message)?.[1] ?? "plan_failed";
    console.error("[auction-ops] plan generation refused:", message);
    await markFailed(service, run.id, code, message);
    return NextResponse.json(
      { runId: run.id, error: code, detail: message, state: "failed" },
      { status: 422 }
    );
  }
}
