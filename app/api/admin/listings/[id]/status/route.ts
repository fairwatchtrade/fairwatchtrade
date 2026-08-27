import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeListingStatusTransition } from "@/lib/listingStatusTransition";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/listings/[id]/status — founder status change

   Sets a listing's status. Used by /admin/listings/[id] (status controls +
   Take Down). Curl-testable: an unauthenticated or non-founder request is
   rejected here, independent of the page — verify with a bare request, no UI.

   TWO INDEPENDENT GATES (defense-in-depth):
     · The page runs its own founder check before rendering the controls.
     · This route runs its OWN founder check, with the UID as a HARDCODED
       LITERAL in this file — not imported from a shared constant. Neither
       surface trusts the other; both must independently pass.

   ── v6.84 · THE BODY MOVED, THE ROUTE DID NOT CHANGE MEANING ────────────
   The entire transition machinery — validation, the publication gate, the
   status write, the review record, the decision event, the emails, the
   Dossier worker — now lives in lib/listingStatusTransition.ts, extracted
   verbatim so the Founder Assistant could become a second authorized caller
   without a second copy of the law (the same move the publication gate made
   to lib/listingPublicationGate at v6.34).

   THIS ROUTE ALWAYS EXECUTES AS 'direct'. The executedVia argument below is
   a HARDCODED LITERAL, and the request body is never consulted for it: a
   request that asserts executed_via anywhere in its body, headers, query,
   or cookies is recorded as 'direct' regardless, because nothing here reads
   it. That is the non-forgeability contract — do not "simplify" the signal
   into a request parameter; a parameter can be forged by anything holding
   the founder's session, which is exactly the principal the column exists
   to distinguish.

   This route stays the ONE HTTP adjudication door, one listing per call.
   There is no batch form and no multi-id endpoint — N listings are N calls,
   which is what keeps partial results real rather than asserted.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1 · authenticate + authorize with the session client (independent gate).
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

  // 2 · parse the body. Validation lives in the shared machinery so both
  //     authorized callers are held to the identical rules.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not parse request body." },
      { status: 400 }
    );
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "bad_request", detail: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  // 3 · the ONE transition machinery. 'direct' is hardcoded — never read
  //     from the request. See the header comment before changing this.
  const outcome = await executeListingStatusTransition({
    listingId: id,
    actorUid: user.id,
    executedVia: "direct",
    input: body as Record<string, unknown>,
  });

  return NextResponse.json(outcome.body, { status: outcome.httpStatus });
}
