import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runReviewTriageForListing } from "@/lib/reviewTriageService";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/listings/[id]/triage — run Founder Review Triage on one
   listing, on purpose.

   TRIAGE ALREADY RUNS AUTOMATICALLY at submission. This route exists for the
   founder who wants to re-run it after evidence changed — the same reason
   the recheck route exists — and it is deliberately the ONLY human-reachable
   door into the disposition seam.

   THE BODY IS IGNORED. There is no status field, no outcome field, no
   override. A caller cannot ask for an outcome; they can only ask for the
   policy to be evaluated, and the policy decides. That is what keeps this
   from becoming a general-purpose status write dressed as an admin action.

   TWO INDEPENDENT GATES, same shape as the status and recheck routes: the
   page's founder check and this route's own hardcoded literal. Neither
   trusts the other. The seam itself performs no authorization — it is
   server-only and reached solely after a gate that already passed.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const maxDuration = 60;

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  if (!id) {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing listing id." },
      { status: 400 }
    );
  }

  const result = await runReviewTriageForListing(id);
  return NextResponse.json(result, { status: 200 });
}
