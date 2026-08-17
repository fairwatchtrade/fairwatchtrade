import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDealerAcceleratorState } from "@/lib/dealer/dealerPath";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/dealer-accelerator/state

   The room's single source of truth: the dealer's connected source, their
   current run, what needs attention, and how many imported drafts exist.

   Every number is counted from the rows that mean it. There is no stored
   tally and no progress estimate — a run that has prepared four of
   thirteen watches says four because four drafts exist.

   GET writes nothing, including no opportunistic run advancement. Reading
   your own progress must never be the thing that changes it.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const state = await buildDealerAcceleratorState(user.id);
    return NextResponse.json({ ok: true, state });
  } catch (e) {
    // Fail visibly. A room that renders "nothing here" because a read threw
    // would tell a dealer their inventory vanished.
    return NextResponse.json(
      { error: "state_unavailable", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
