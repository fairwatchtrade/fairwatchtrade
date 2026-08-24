import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { composeWatchPassport } from "@/lib/passport/watchPassport";

/* ════════════════════════════════════════════════════════════════════════
   GET /api/admin/passport/[beadId] — founder-only Passport read

   ── ACCESS CONTROL IS LOAD-BEARING, AND IT LIVES HERE ──────────────────
   Not in navigation, not in a hidden link, not in a page that simply is not
   linked anywhere. THIS seam refuses.

   Being the seller, the buyer, the current owner, a prior owner, a listing
   participant, or merely signed in confers NOTHING. There is exactly one
   uid that gets a Passport in V1, and every other caller — authenticated or
   anonymous — gets the same refusal.

   That matters because a Passport aggregates across identity beliefs and
   can surface private listing episodes. A route that leaked to "the owner"
   would be leaking one person's private episode to whoever currently holds
   the watch.

   ── PURE READ ──────────────────────────────────────────────────────────
   This route writes nothing. There is no Passport table to write to, and
   composing a Passport causes zero database mutations. If the output is
   wrong, the fix is in the governed source, never here.

   ── WHAT THE PAYLOAD MAY NOT CARRY ─────────────────────────────────────
   No raw identifier value, no equality token, no value fragment, no
   equality relationship, no masked reveal. The composition returns
   presence/type/source-class only, and the payload is exactly what the
   composition returns — there is no richer internal object being filtered
   down on the way out, because a filter is a thing that can be forgotten.

   No public Passport route exists. No collector route exists. No SEO or
   canonical Passport page exists. Public exposure is a later round.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ beadId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Anonymous and authenticated-non-founder are refused identically and
     with the same shape — the response must not become an oracle for
     whether a given bead exists. */
  if (!user || user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { beadId } = await params;
  const passport = await composeWatchPassport(beadId);
  if (!passport) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(passport);
}
