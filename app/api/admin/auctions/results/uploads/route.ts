import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { STAGING_BUCKET } from "@/lib/auction-operations/registry";
import {
  resolveActivePacketRevision,
  toRegisteredPacket,
} from "@/lib/auction-operations/packetCatalog";
import { createRun, updateRun } from "@/lib/auction-operations/runStore";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/auctions/results/uploads — signed staging uploads

   Issues create-only signed upload tokens for the source files a REGISTERED
   packet requires, under a fresh run id in the private staging bucket. The
   browser then uploads directly to Supabase Storage — auction PDFs never
   travel through a Vercel Function body (4.5 MB ceiling), and this process
   never sees the bytes at all.

   THE BROWSER CHOOSES NOTHING BUT THE PACKET. Paths are server-generated
   under runs/<runId>/<kind>; manifests are repo-held; a packet with no
   required uploads has no business here and is refused. Unknown
   adapter/packet combinations do not exist to this route.

   TWO INDEPENDENT GATES, same shape as the admin status route: the page's
   founder check and this route's own hardcoded literal.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const maxDuration = 60;

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

  let body: { adapter?: unknown; packetId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[auction-ops] uploads — trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin write channel unavailable." },
      { status: 500 }
    );
  }

  /* Upload slots resolve from the exact active revision, so what may be
     staged is governed data rather than anything the browser asserted. */
  const revision = await resolveActivePacketRevision(service, body.packetId);
  if (!revision) {
    return NextResponse.json(
      { error: "unregistered_packet", detail: "Only registered source packets can be staged." },
      { status: 400 }
    );
  }
  const packet = toRegisteredPacket(revision);
  if (packet.uploads.length === 0) {
    return NextResponse.json(
      {
        error: "no_uploads_required",
        detail: "This packet's sources are fetched from its registered URLs — generate the plan directly.",
      },
      { status: 400 }
    );
  }

  const run = await createRun(service, {
    adapter: packet.adapter,
    packetId: packet.packetId,
    createdBy: user.id,
    state: "uploading",
  });

  const uploads = [];
  for (const spec of packet.uploads) {
    const path = `runs/${run.id}/${spec.kind}`;
    const { data, error } = await service.storage
      .from(STAGING_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[auction-ops] signed upload url failed:", error?.message);
      return NextResponse.json(
        { error: "staging_unavailable", detail: "The staging bucket refused a signed upload." },
        { status: 500 }
      );
    }
    uploads.push({
      kind: spec.kind,
      label: spec.label,
      required: spec.required,
      maxBytes: spec.maxBytes,
      path: data.path,
      token: data.token,
    });
  }

  /* The run itself records where each kind lives — deterministic
     server-chosen paths. The browser never names a storage path; the plan
     route later checks which staged objects actually exist. */
  await updateRun(service, run.id, {
    input_paths: Object.fromEntries(uploads.map((u) => [u.kind, u.path])),
  });

  return NextResponse.json(
    { runId: run.id, bucket: STAGING_BUCKET, uploads },
    { status: 200 }
  );
}
