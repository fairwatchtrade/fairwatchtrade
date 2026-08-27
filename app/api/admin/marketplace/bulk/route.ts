import { NextResponse, type NextRequest } from "next/server";
import { del } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  removeConsequenceLines,
  removeRefusalSentence,
  type RemovePreview,
} from "@/lib/listingRemovePreview";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/marketplace/bulk — dealer/account-scale operations

   Two ops, two phases. Nothing destructive happens from a preview.

     op: 'remove'  — take listings off the market (governed Pause)
     op: 'delete'  — permanently delete listings (governed Stage 8 purge)

     mode: 'preview' — compute the candidate set, split eligible vs blocked
           with blocker categories from runtime truth, mutate NOTHING.
     mode: 'execute' — act on an EXPLICIT confirmed id list (never "all of a
           seller" implicitly), one governed RPC call per listing, and
           return per-operation truth. Partial failure is reported row by
           row, never summarized into a lie.

   THE MUTATIONS GO THROUGH THE SESSION CLIENT, NOT THE SERVICE CLIENT.
   remove_listing() and delete_listing_permanently() are the ONLY doors for
   these transitions; both authenticate auth.uid() and, since the Marketplace
   Control migration, admit exactly one principal besides the owner — the
   founder. Calling them as the founder's session records the true actor and
   the true admin closure cause. The service client holds no EXECUTE on the
   delete function by design, and this route must never acquire a parallel
   path around either RPC.

   The route's own founder gate is defense-in-depth (hardcoded literal in
   THIS file, independent of the page and of the RPCs' internal gates).

   Clients keep execute batches small (the room sends ≤25 ids per call) so a
   batch always completes well inside the function window; eligibility is
   re-checked inside each RPC's own lock regardless (TOCTOU lives there).

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const OPS = ["remove", "delete"] as const;
type Op = (typeof OPS)[number];
const MODES = ["preview", "execute"] as const;
type Mode = (typeof MODES)[number];

/* The governed exit-reason vocabulary (Stage 8). Required for delete —
   "why did this watch leave for good" — optional for remove (Pause law). */
const REASON_CODES = [
  "sold_in_store",
  "sold_elsewhere",
  "no_longer_for_sale",
  "listing_mistake",
  "other",
] as const;

const BLOCK_LABEL: Record<string, string> = {
  draft: "Draft — was never public, nothing to take off the market",
  removed: "Already off the market",
  rejected: "Rejected — historical decision, not live inventory",
  private_active: "Private listing — operated by the private listing machinery, not this room",
};

const EXECUTE_CAP = 25;
const PREVIEW_CAP = 500;

type CandidateRow = {
  id: string;
  public_code: string | null;
  brand: string;
  model: string | null;
  reference: string;
  status: string;
  seller_id: string;
};

export async function POST(request: NextRequest) {
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

  let body: {
    op?: unknown;
    mode?: unknown;
    sellerId?: unknown;
    listingIds?: unknown;
    reasonCode?: unknown;
    reasonNote?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not parse request body." },
      { status: 400 }
    );
  }

  const op = typeof body.op === "string" && (OPS as readonly string[]).includes(body.op)
    ? (body.op as Op)
    : null;
  const mode =
    typeof body.mode === "string" && (MODES as readonly string[]).includes(body.mode)
      ? (body.mode as Mode)
      : null;
  if (!op || !mode) {
    return NextResponse.json(
      { error: "bad_request", detail: "op must be remove|delete and mode preview|execute." },
      { status: 400 }
    );
  }

  const sellerId = typeof body.sellerId === "string" && body.sellerId ? body.sellerId : null;
  const listingIds = Array.isArray(body.listingIds)
    ? (body.listingIds.filter((v) => typeof v === "string") as string[])
    : null;

  const reasonCode =
    typeof body.reasonCode === "string" && body.reasonCode ? body.reasonCode : null;
  const reasonNote =
    typeof body.reasonNote === "string" && body.reasonNote.trim()
      ? body.reasonNote.trim().slice(0, 320)
      : null;
  if (reasonCode && !(REASON_CODES as readonly string[]).includes(reasonCode)) {
    return NextResponse.json(
      { error: "invalid_reason_code", detail: "That isn't a reason a listing can carry." },
      { status: 400 }
    );
  }
  if (op === "delete" && mode === "execute" && !reasonCode) {
    return NextResponse.json(
      {
        error: "reason_required",
        detail: "Permanent deletion records why the watch left for good — choose a reason.",
      },
      { status: 400 }
    );
  }

  /* Candidate truth is read with the trusted client (the founder gate above
     has passed); mutations below still go through the governed RPCs. */
  let db;
  try {
    db = createServiceClient();
  } catch (e) {
    console.error("[marketplace-control] bulk — trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin read channel unavailable." },
      { status: 500 }
    );
  }

  let candidates: CandidateRow[] = [];
  if (listingIds && listingIds.length > 0) {
    const { data, error } = await db
      .from("listings")
      .select("id, public_code, brand, model, reference, status, seller_id")
      .in("id", listingIds.slice(0, PREVIEW_CAP));
    if (error) {
      return NextResponse.json({ error: "read_failed", detail: error.message }, { status: 500 });
    }
    candidates = (Array.isArray(data) ? data : []) as CandidateRow[];
  } else if (sellerId) {
    const { data, error } = await db
      .from("listings")
      .select("id, public_code, brand, model, reference, status, seller_id")
      .eq("seller_id", sellerId)
      .limit(PREVIEW_CAP);
    if (error) {
      return NextResponse.json({ error: "read_failed", detail: error.message }, { status: 500 });
    }
    candidates = (Array.isArray(data) ? data : []) as CandidateRow[];
  } else {
    return NextResponse.json(
      { error: "bad_request", detail: "Provide sellerId or listingIds." },
      { status: 400 }
    );
  }

  /* ── PREVIEW: eligible vs blocked, categories from runtime truth ─────── */
  if (mode === "preview") {
    if (op === "remove") {
      /* v6.89 — the GOVERNED preview answers, per listing. This branch used
         to split on status alone, which could say WHETHER a listing was
         removable but never what removing it would cost: the founder
         confirmed a removal without being told how many buyers were about to
         lose a pending request. public.listing_remove_preview() is the one
         source of that truth and the Assistant reads the same function, so
         the room and the Assistant cannot describe one removal two ways. */
      const eligible: Array<
        CandidateRow & { preview: RemovePreview; consequences: string[] }
      > = [];
      const blocked: Array<CandidateRow & { blockers: string[] }> = [];
      for (const c of candidates) {
        const { data, error } = await supabase.rpc("listing_remove_preview", {
          p_listing_id: c.id,
        });
        if (error) {
          blocked.push({ ...c, blockers: [`Preview failed: ${error.message}`] });
          continue;
        }
        const preview = data as RemovePreview | null;
        if (!preview) {
          blocked.push({ ...c, blockers: ["Preview returned nothing."] });
          continue;
        }
        if (preview.removable) {
          eligible.push({ ...c, preview, consequences: removeConsequenceLines(preview) });
        } else {
          /* The room's own wording for a status it already explains well,
             falling back to the shared refusal sentence for anything else. */
          blocked.push({
            ...c,
            blockers: [BLOCK_LABEL[c.status] ?? removeRefusalSentence(preview)],
          });
        }
      }
      return NextResponse.json(
        { op, candidates: candidates.length, eligible, blocked },
        { status: 200 }
      );
    }

    // op === "delete" — the canonical eligibility function answers, per listing.
    const eligible: CandidateRow[] = [];
    const blocked: Array<CandidateRow & { blockers: string[] }> = [];
    for (const c of candidates) {
      const { data, error } = await supabase.rpc("listing_delete_eligibility", {
        p_listing_id: c.id,
      });
      if (error) {
        blocked.push({ ...c, blockers: [`Eligibility check failed: ${error.message}`] });
        continue;
      }
      const elig = data as {
        eligible_for_permanent_delete?: boolean;
        blockers?: Array<{ code?: string; count?: number; states?: string }>;
      } | null;
      if (elig?.eligible_for_permanent_delete === true) {
        eligible.push(c);
      } else {
        const labels = (elig?.blockers ?? []).map((b) => {
          if (b.code === "accepted_purchase_request")
            return `Accepted purchase request (${b.count ?? 1}) — a live obligation between two people`;
          if (b.code === "active_transaction")
            return `Active transaction (${b.count ?? 1}${b.states ? `: ${b.states}` : ""})`;
          if (b.code === "active_wizard_session")
            return `Active mobile capture session (${b.count ?? 1})`;
          return b.code ?? "Blocked";
        });
        blocked.push({ ...c, blockers: labels.length ? labels : ["Blocked"] });
      }
    }
    return NextResponse.json(
      { op, candidates: candidates.length, eligible, blocked },
      { status: 200 }
    );
  }

  /* ── EXECUTE: explicit confirmed ids only, one governed call per row ─── */
  if (!listingIds || listingIds.length === 0) {
    return NextResponse.json(
      {
        error: "explicit_ids_required",
        detail: "Execute acts only on the explicitly confirmed listing ids from the preview.",
      },
      { status: 400 }
    );
  }
  if (listingIds.length > EXECUTE_CAP) {
    return NextResponse.json(
      {
        error: "batch_too_large",
        detail: `Execute at most ${EXECUTE_CAP} listings per call; send the confirmed set in batches.`,
      },
      { status: 400 }
    );
  }

  const results: Array<{
    id: string;
    ok: boolean;
    blocked?: boolean;
    error?: string;
    requests_closed?: number;
    media_deleted?: number;
    media_stranded?: number;
  }> = [];

  for (const c of candidates) {
    try {
      if (op === "remove") {
        const { data, error } = await supabase.rpc("remove_listing", {
          p_listing_id: c.id,
          p_reason_code: reasonCode,
          p_reason_note: reasonNote,
        });
        if (error) {
          results.push({ id: c.id, ok: false, error: error.message });
          continue;
        }
        const committed = (data as { requests_cancelled?: number } | null) ?? {};
        // Buyer bells derive from committed events; a bell problem never
        // rolls back a removal.
        try {
          await supabase.rpc("emit_listing_removal_notifications", { p_listing_id: c.id });
        } catch (e) {
          console.error("[marketplace-control] bulk remove — bells deferred:", c.id, e);
        }
        results.push({ id: c.id, ok: true, requests_closed: committed.requests_cancelled ?? 0 });
      } else {
        const { data, error } = await supabase.rpc("delete_listing_permanently", {
          p_listing_id: c.id,
          p_reason_code: reasonCode,
          p_reason_note: reasonNote,
        });
        if (error) {
          results.push({ id: c.id, ok: false, error: error.message });
          continue;
        }
        const result = (data as {
          deleted?: boolean;
          orphan_media?: string[];
          requests_closed?: number;
        } | null) ?? {};
        if (result.deleted !== true) {
          // Blocked at the destructive seam, inside the lock. Nothing mutated.
          results.push({ id: c.id, ok: false, blocked: true });
          continue;
        }
        /* THE LISTING IS GONE FROM HERE DOWN — nothing below may report
           this row as a failure. Orphan blobs only, computed by the purge
           against surviving references. */
        let mediaDeleted = 0;
        let mediaStranded = 0;
        for (const url of Array.isArray(result.orphan_media) ? result.orphan_media : []) {
          try {
            await del(url);
            mediaDeleted += 1;
          } catch (e) {
            mediaStranded += 1;
            console.error("[marketplace-control] blob delete stranded (not fatal):", url, e);
          }
        }
        try {
          await supabase.rpc("emit_listing_deletion_notifications", { p_listing_id: c.id });
        } catch (e) {
          console.error("[marketplace-control] bulk delete — bells deferred:", c.id, e);
        }
        results.push({
          id: c.id,
          ok: true,
          requests_closed: result.requests_closed ?? 0,
          media_deleted: mediaDeleted,
          media_stranded: mediaStranded,
        });
      }
    } catch (e) {
      results.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : "failed" });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  return NextResponse.json(
    {
      op,
      executed: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    },
    { status: 200 }
  );
}
