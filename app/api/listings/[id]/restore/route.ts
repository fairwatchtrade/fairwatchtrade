import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings/[id]/restore — put a removed listing back in the queue

   The governed inverse of Remove, and the reason Remove is now allowed to
   call itself reversible. A thin wrapper over public.restore_listing(),
   following the same shape as the remove route beside it: the function owns
   the transition, this route owns the translation of its refusals.

   IT DOES NOT PUBLISH. A restored listing lands in 'pending_review' — back
   in the market PIPELINE, not back on the market. Reaching Browse still
   requires the founder's explicit recorded approval through the one
   publication door, exactly as it did the first time. Any route that put a
   listing straight back to 'published' would be a second publication writer,
   which is the defect the publication gate exists to prevent.

   IT DOES NOT REOPEN PURCHASE REQUESTS. Requests cancelled by the removal
   stay cancelled, and the response says how many, so the surface above can
   tell the truth rather than imply a restoration that did not happen.
   Re-creating them would be the platform inventing buyer intent.

   NO NOTIFICATIONS. Removal rings buyers because something was taken from
   them mid-conversation. A restore to review takes nothing from anyone and
   promises nobody anything — the listing is not public and may never be
   again. There is nothing honest to announce yet.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing listing id." },
      { status: 400 }
    );
  }

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

  let note: string | null = null;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") {
      const b = body as { note?: unknown };
      if (typeof b.note === "string") {
        const trimmed = b.note.trim();
        note = trimmed === "" ? null : trimmed.slice(0, 320);
      }
    }
  } catch {
    /* A note is optional; a body is not required at all. */
  }

  const { data, error } = await supabase.rpc("restore_listing", {
    p_listing_id: id,
    p_note: note,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("not_authenticated")) {
      return NextResponse.json(
        { error: "not_authenticated", detail: "Sign in required." },
        { status: 401 }
      );
    }
    if (msg.includes("not_found")) {
      return NextResponse.json(
        { error: "not_found", detail: `No listing with id ${id}.` },
        { status: 404 }
      );
    }
    if (msg.includes("not_allowed")) {
      return NextResponse.json(
        { error: "forbidden", detail: "This listing isn't yours." },
        { status: 403 }
      );
    }
    if (msg.includes("not_removed")) {
      const current = msg.split("not_removed:")[1]?.trim() || "unknown";
      return NextResponse.json(
        {
          error: "not_removed",
          detail:
            current === "pending_review"
              ? "This listing is already back in review."
              : `Only a listing that's off the market can be restored. This one is ${current}.`,
          status: current,
        },
        { status: 409 }
      );
    }
    console.error("[restore] restore_listing failed:", msg);
    return NextResponse.json(
      { error: "restore_failed", detail: "Could not restore this listing." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ...((data as object) ?? {}) }, { status: 200 });
}
