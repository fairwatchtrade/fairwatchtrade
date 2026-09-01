import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   ACTIVATE A PACKET REVISION — POST /api/admin/auctions/packets/[id]/activate

   The third and last act. Only an approved revision may be activated, and
   activation is what finally makes a packet selectable in the room.

   ── THE SWITCH IS ONE TRANSACTION, NOT TWO REQUESTS ────────────────────
   This route first retired the incumbent and then activated the target as
   two independent database calls. Between them lay a window in which the
   retirement had committed and the activation had not, and in that window
   the packet had NO active revision — it vanished from the room. A dropped
   connection at the wrong instant was enough.

   Both writes now happen inside one function, under a deterministic lock
   over the packet's revisions, so either the whole switch commits or
   nothing changes. This route resolves the founder and calls it; it no
   longer sequences the writes itself, because sequencing them from here is
   what created the window.

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

  /* One call, one transaction. The eligibility checks live INSIDE the
     function, re-read under its lock — checking them here first and acting
     afterwards would just be a smaller version of the same window.

     The actor is the session-resolved founder uid, passed as an argument.
     It is never read from the request body: a caller-supplied actor would
     make the attribution a claim rather than a fact. */
  const { data, error } = await service.rpc("auction_operations_activate_packet_revision", {
    p_revision_id: revisionId,
    p_actor: user.id,
  });

  if (error) {
    const message = error.message ?? "";
    if (/unknown_revision/.test(message)) {
      return NextResponse.json({ error: "unknown_revision", detail: "No such packet revision." }, { status: 404 });
    }
    if (/not_approved/.test(message)) {
      return NextResponse.json(
        { error: "not_approved", detail: "Only an explicitly approved revision can be activated." },
        { status: 409 }
      );
    }
    if (/already_active/.test(message)) {
      return NextResponse.json({ error: "already_active", detail: "That revision is already active." }, { status: 409 });
    }
    /* Anything else rolled the whole switch back. The previously active
       revision is still active, which is the correct failure: unchanged. */
    return NextResponse.json({ error: "activation_failed", detail: message }, { status: 500 });
  }

  const result = (data ?? {}) as { activated?: string; retired?: string | null; packet_id?: string };
  return NextResponse.json({
    activated: result.activated ?? revisionId,
    retired: result.retired ?? null,
    packetId: result.packet_id ?? null,
  });
}
