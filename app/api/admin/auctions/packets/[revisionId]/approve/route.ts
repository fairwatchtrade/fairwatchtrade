import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   APPROVE A PACKET REVISION — POST /api/admin/auctions/packets/[id]/approve

   Its own route, and that is the design rather than an accident of file
   layout. Structural validation is a machine saying the descriptor parses.
   Approval is a person saying this packet may exist. Collapsing them into
   one call would make the second free, and a free approval is not one.

   This route approves. It does NOT activate — activation is a third act
   with a third route, so nothing selectable was ever reached in a single
   request. The database agrees: the birth trigger forbids an insert that
   arrives approved, and the freeze trigger forbids editing the mechanics
   once approval has landed.
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
    .select("id, packet_id, revision, validation_state, approval_state")
    .eq("id", revisionId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "unknown_revision", detail: "No such packet revision." }, { status: 404 });

  const r = row as { validation_state: string; approval_state: string };
  if (r.validation_state !== "validated") {
    return NextResponse.json(
      { error: "not_validated", detail: "A revision is approved after it validates, never before." },
      { status: 409 }
    );
  }
  if (r.approval_state === "approved") {
    return NextResponse.json({ error: "already_approved", detail: "That revision is already approved." }, { status: 409 });
  }

  const { error } = await service
    .from("auction_operations_packet_revision")
    .update({ approval_state: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", revisionId);
  if (error) return NextResponse.json({ error: "approval_failed", detail: error.message }, { status: 500 });

  return NextResponse.json({ approved: revisionId, nextStep: "activate" });
}
