import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   ACTIVATE A PACKET REVISION — POST /api/admin/auctions/packets/[id]/activate

   The third and last act. Only an approved revision may be activated, and
   activation is what finally makes a packet selectable in the room.

   ── WHY ACTIVATION RETIRES ITS PREDECESSOR RATHER THAN EDITING IT ──────
   A packet may have exactly one active revision (a partial unique index
   enforces it). Activating revision 2 therefore retires revision 1 rather
   than mutating it — the older row keeps its descriptor, its hash and its
   attribution forever, because runs are bound to it by id and their
   provenance must stay readable after it stops being current.

   A run already created against the retired revision is untouched by this.
   Planning resolves by revision id, not by "whatever is active now", so a
   founder mid-review cannot have the mechanics moved underneath them.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ revisionId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  if (user.id !== ADMIN_USER_ID) return NextResponse.json({ error: "forbidden", detail: "Admin only." }, { status: 403 });

  const { revisionId } = await params;

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "server_misconfigured", detail: "Admin write channel unavailable." }, { status: 500 });
  }

  const { data: row } = await service
    .from("auction_operations_packet_revision")
    .select("id, packet_id, revision, approval_state, activation_state")
    .eq("id", revisionId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "unknown_revision", detail: "No such packet revision." }, { status: 404 });

  const r = row as { packet_id: string; approval_state: string; activation_state: string };
  if (r.approval_state !== "approved") {
    return NextResponse.json(
      { error: "not_approved", detail: "Only an explicitly approved revision can be activated." },
      { status: 409 }
    );
  }
  if (r.activation_state === "active") {
    return NextResponse.json({ error: "already_active", detail: "That revision is already active." }, { status: 409 });
  }

  /* Retire the incumbent first. Two statements rather than one because the
     unique index would otherwise reject the pair, and because retiring is a
     real transition worth recording rather than a side effect. */
  const { error: retireErr } = await service
    .from("auction_operations_packet_revision")
    .update({ activation_state: "retired", retired_at: new Date().toISOString() })
    .eq("packet_id", r.packet_id)
    .eq("activation_state", "active");
  if (retireErr) {
    return NextResponse.json({ error: "activation_failed", detail: retireErr.message }, { status: 500 });
  }

  const { error } = await service
    .from("auction_operations_packet_revision")
    .update({ activation_state: "active", activated_by: user.id, activated_at: new Date().toISOString() })
    .eq("id", revisionId);
  if (error) return NextResponse.json({ error: "activation_failed", detail: error.message }, { status: 500 });

  return NextResponse.json({ activated: revisionId, packetId: r.packet_id });
}
