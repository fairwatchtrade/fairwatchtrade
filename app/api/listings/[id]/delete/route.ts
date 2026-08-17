import { NextResponse, type NextRequest } from "next/server";
import { del } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/listings/[id]/delete — Stage 8. This one actually deletes.

   ORDER OF OPERATIONS, AND WHY IT IS THIS ORDER

     1. delete_listing_permanently()  — the whole database purge, atomically
     2. blob deletion                 — only URLs the function proved orphaned
     3. buyer notifications           — post-commit, from committed events
     4. seller receipt                — post-commit, from the returned truth

   Database first, storage second. If the process dies between them the
   listing is genuinely gone and some blobs are merely stranded — recoverable,
   invisible, and cheap. The reverse order would delete a seller's
   photographs and then fail to delete the listing that displays them, which
   is a broken product rather than a tidy-up job.

   ⚠ NOTHING AFTER STEP 1 MAY TURN THIS INTO A FAILURE RESPONSE. Once the
   function returns deleted:true the listing does not exist. Reporting that
   as an error would tell the seller to try again on something that is
   already gone.

   ⚠ BLOBS ARE DELETED ONLY FROM orphan_media. The function computes that set
   AFTER the row is gone, against surviving references, and this route must
   never widen it. Measured in production: three photo URLs are shared
   between different listings, so deleting a listing's own photo list would
   have destroyed a live published listing's photographs. Do not "simplify"
   this by reading the listing's photos here — the listing is gone by now,
   and the reason it is gone is the reason that would be wrong.

   TOCTOU lives in the function, not here. A blocked answer arrives as
   deleted:false with current blocker truth and zero mutation.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

const REASON_CODES = [
  "sold_in_store",
  "sold_elsewhere",
  "no_longer_for_sale",
  "listing_mistake",
  "other",
] as const;

type DeleteResult = {
  deleted?: boolean;
  reason?: string;
  eligibility?: unknown;
  public_code?: string | null;
  brand?: string | null;
  model?: string | null;
  reference?: string | null;
  requests_closed?: number;
  orphan_media?: string[];
  media_candidates?: number;
  purge_event_id?: string;
};

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

  let reasonCode = "";
  let reasonNote: string | null = null;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") {
      const b = body as { reasonCode?: unknown; reasonNote?: unknown };
      if (typeof b.reasonCode === "string") reasonCode = b.reasonCode.trim();
      if (typeof b.reasonNote === "string") {
        const n = b.reasonNote.trim();
        reasonNote = n === "" ? null : n.slice(0, 320);
      }
    }
  } catch {
    /* falls through to validation */
  }

  /* Delete is where the governed exit-reason vocabulary lives, so unlike
     Pause this one is required — "why did this watch leave for good" is a
     question worth asking at the irreversible moment. */
  if (!(REASON_CODES as readonly string[]).includes(reasonCode)) {
    return NextResponse.json(
      { error: "invalid_reason_code", detail: "Choose why you're deleting this listing." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("delete_listing_permanently", {
    p_listing_id: id,
    p_reason_code: reasonCode,
    p_reason_note: reasonNote,
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
        { error: "not_found", detail: "This listing isn't yours, or no longer exists." },
        { status: 404 }
      );
    }
    if (msg.includes("invalid_reason_code")) {
      return NextResponse.json(
        { error: "invalid_reason_code", detail: "That isn't a reason this listing can carry." },
        { status: 400 }
      );
    }
    console.error("[delete] delete_listing_permanently failed:", msg);
    return NextResponse.json(
      { error: "delete_failed", detail: "Could not delete this listing." },
      { status: 500 }
    );
  }

  const result = (data as DeleteResult | null) ?? {};

  /* Blocked at the destructive seam — the eligibility changed between the
     seller's confirmation and the lock. Nothing was mutated. */
  if (result.deleted !== true) {
    return NextResponse.json(
      { ok: false, blocked: true, eligibility: result.eligibility },
      { status: 409 }
    );
  }

  /* ── THE LISTING IS GONE FROM HERE DOWN ──────────────────────────────── */

  let mediaDeleted = 0;
  const mediaFailed: string[] = [];
  const orphans = Array.isArray(result.orphan_media) ? result.orphan_media : [];
  for (const url of orphans) {
    try {
      await del(url);
      mediaDeleted += 1;
    } catch (e) {
      /* A stranded blob is not a failed deletion. Logged so it can be swept
         later; never surfaced as an error to a seller whose listing is
         already gone. */
      mediaFailed.push(url);
      console.error("[delete] blob delete failed (stranded, not fatal):", url, e);
    }
  }

  let notificationsEmitted: number | null = null;
  try {
    const { data: emitted, error: emitError } = await supabase.rpc(
      "emit_listing_deletion_notifications",
      { p_listing_id: id }
    );
    if (emitError) {
      console.error("[delete] notification emission deferred:", emitError.message);
    } else {
      notificationsEmitted =
        (emitted as { notifications_emitted?: number } | null)?.notifications_emitted ?? 0;
    }
  } catch (e) {
    console.error("[delete] notification emission threw:", e);
  }

  return NextResponse.json(
    {
      ok: true,
      deleted: true,
      public_code: result.public_code ?? null,
      brand: result.brand ?? null,
      model: result.model ?? null,
      requests_closed: result.requests_closed ?? 0,
      media_candidates: result.media_candidates ?? 0,
      media_deleted: mediaDeleted,
      media_stranded: mediaFailed.length,
      notifications_emitted: notificationsEmitted,
      purge_event_id: result.purge_event_id ?? null,
    },
    { status: 200 }
  );
}
