import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveActivePacketRevision,
  toRegisteredPacket,
} from "@/lib/auction-operations/packetCatalog";
import { birthOrReuseRun, listRecentRuns } from "@/lib/auction-operations/runStore";

/* ════════════════════════════════════════════════════════════════════════
   /api/admin/auctions/results/runs — run birth and run recovery

   GET   Current & Recent Runs — the bounded recovery projection.
   POST  START PLANNING for a registered-fetch packet: births ONE governed
         run bound to the exact active revision, BEFORE any long planning,
         and returns it immediately. The room then calls /plan { runId }.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The run is created when planning starts, so show a spinner until
      planning returns."

   The run is durable the moment it is inserted, and an operator who
   reloads mid-planning must be able to find it. Registered-fetch planning
   used to mint the run INSIDE the long /plan request, which meant nothing
   visible existed until planning finished or failed. Birth is now its own
   fast act, and planning is a second call against the run that already
   exists.

   ── R1: ONE LIVE RUN PER EXACT REVISION, ENFORCED BY THE DATABASE ────
   Two START presses that land together must not mint two live runs. A
   read-then-insert cannot promise that; the partial unique index
   (migration 20260902220000) can. birthOrReuseRun() attempts the insert,
   and if PostgreSQL refuses it, recovers the winner and returns it with
   reusedExisting: true. The browser's disabled button is UX, not authority.

   ── THE BROWSER AUTHORS NOTHING BUT A PACKET ID ───────────────────────
   Adapter, revision, descriptor hash, schema version, source URLs and run
   state all come from the server catalog row. A staged-upload packet is
   refused here by name: its run is born by /uploads, which must bind before
   any token is issued.

   ── RECOVERY IS INSPECTION, NOT A DASHBOARD ───────────────────────────
   GET returns a fixed, newest-first, bounded list with a strict projection:
   no plan bytes, no storage paths, no source hashes, no evidence content.
   packetLabel is catalog-owned (R3). revisionBound is derived server-side
   from packet_revision_id IS NOT NULL (R2) — a legacy NULL-bound run is
   inspection-only in the room and is never rebound to today's revision.

   TWO INDEPENDENT GATES, same shape as every Auction Operations route.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const maxDuration = 60;

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

async function founderGate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, deny: NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 }) };
  }
  if (user.id !== ADMIN_USER_ID) {
    return { user: null, deny: NextResponse.json({ error: "forbidden", detail: "Admin only." }, { status: 403 }) };
  }
  return { user, deny: null };
}

export async function GET() {
  const gate = await founderGate();
  if (gate.deny) return gate.deny;

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[auction-ops] runs — trusted client unavailable:", e);
    return NextResponse.json({ error: "server_misconfigured", detail: "Admin read channel unavailable." }, { status: 500 });
  }

  try {
    const runs = await listRecentRuns(service);
    return NextResponse.json({ runs }, { status: 200 });
  } catch (e) {
    console.error("[auction-ops] recent runs read failed:", e);
    return NextResponse.json({ error: "runs_unavailable", detail: "Recent runs could not be read." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await founderGate();
  if (gate.deny) return gate.deny;
  const user = gate.user!;

  let body: { packetId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[auction-ops] run birth — trusted client unavailable:", e);
    return NextResponse.json({ error: "server_misconfigured", detail: "Admin write channel unavailable." }, { status: 500 });
  }

  /* The browser names a packet; the SERVER decides what that packet is. */
  const revision = await resolveActivePacketRevision(service, body.packetId);
  if (!revision) {
    return NextResponse.json(
      { error: "unregistered_packet", detail: "Only registered, active packets can begin governed planning." },
      { status: 400 }
    );
  }
  const packet = toRegisteredPacket(revision);
  if (packet.uploads.some((u) => u.required)) {
    return NextResponse.json(
      {
        error: "staged_packet_use_uploads",
        detail: "This packet requires staged source files. Its run is born by the upload step, which binds the revision before any token is issued.",
      },
      { status: 400 }
    );
  }

  try {
    const { run, reusedExisting } = await birthOrReuseRun(service, {
      adapter: packet.adapter,
      packetId: packet.packetId,
      createdBy: user.id,
      packetRevisionId: revision.id,
      packetRevision: revision.revision,
      descriptorSha256: revision.descriptor_sha256,
      adapterSchemaVersion: revision.adapter_schema_version,
    });
    return NextResponse.json(
      {
        runId: run.id,
        adapter: run.adapter_id,
        packetId: run.packet_id,
        state: run.state,
        createdAt: run.created_at,
        reusedExisting,
      },
      { status: reusedExisting ? 200 : 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/^run_birth_contended/.test(message)) {
      return NextResponse.json(
        { error: "run_birth_contended", detail: "Another run for this exact packet revision was live at every attempt. Reload Recent Runs and open it." },
        { status: 409 }
      );
    }
    console.error("[auction-ops] run birth failed:", message);
    return NextResponse.json({ error: "run_birth_failed", detail: "The governed run could not be created." }, { status: 500 });
  }
}
