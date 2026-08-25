import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings/[id]/story-photo — the seller chooses, changes, or
   clears which of this listing's own photographs accompanies the narrative.

   A thin wrapper over public.set_listing_story_photo(), the same shape as
   submit-for-review and remove: the function owns the write and carries its
   own checks, this route owns turning its refusals into sentences a seller
   can act on.

   ⚠ THIS ROUTE IS THE ONLY POST-CREATION WRITER OF photo_presentation, and
   it is a wrapper rather than an update because `authenticated` holds no
   UPDATE grant on that column and listings_update_own would refuse a
   published row anyway. Do not "simplify" this into a supabase.update() —
   it will fail silently-shaped as a permissions error on exactly the rows
   this capability exists for.

   BODY

     { "pathname": "listings/dial-abc.jpg" }   choose or change
     { "pathname": null }                      clear, back to automatic
     {}                                        clear (same thing)

   A missing or unparseable body is a CLEAR, not a 400 — the wire has one
   optional field and the absent case has an obvious honest meaning.

   NOT AN EDIT ROUTE. It writes one key of one governed record. Nothing here
   may grow into a general listing editor; a second field belongs to a
   second named door with its own checks.

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

  let pathname: string | null = null;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") {
      const p = (body as { pathname?: unknown }).pathname;
      if (typeof p === "string" && p.trim() !== "") pathname = p.trim();
    }
  } catch {
    /* no body, or not JSON — stays null, which means clear */
  }

  const { data, error } = await supabase.rpc("set_listing_story_photo", {
    p_listing_id: id,
    p_pathname: pathname,
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
    if (msg.includes("photo_not_in_listing")) {
      /* Almost always a stale client: the seller deleted or replaced the
         photograph in another tab and pressed a thumbnail that no longer
         exists on the row. Say the true thing, not "invalid input". */
      return NextResponse.json(
        {
          error: "photo_not_in_listing",
          detail:
            "That photograph isn't on this listing. Reload the page and choose again.",
        },
        { status: 409 }
      );
    }
    console.error("[story-photo] set_listing_story_photo failed:", msg);
    return NextResponse.json(
      { error: "save_failed", detail: "Could not save the Story Photo." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, storyPathname: (data as { story_pathname?: string | null })?.story_pathname ?? null },
    { status: 200 }
  );
}
