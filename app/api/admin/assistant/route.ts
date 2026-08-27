import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  executeListingStatusTransition,
} from "@/lib/listingStatusTransition";

/* ════════════════════════════════════════════════════════════════════════
   FOUNDER ASSISTANT — app/api/admin/assistant/route.ts   (v6.84)

   The server side of the Persistent Admin Assistant V1. The founder asks in
   words inside Founder Review; the Assistant proposes an exact plan; the
   founder confirms; the Assistant executes through the SAME governed
   machinery a click would have used — lib/listingStatusTransition — with
   executedVia 'assistant' HARDCODED at the one call site below.

   PRINCIPAL: the Assistant is not its own principal. It holds no credential
   and gains no privilege. Every request here carries the founder's live
   session, gated by the same defense-in-depth literal the status route uses.

   THE ALLOWLIST (Bucket B) contains exactly ONE operation:
   approve_listings. Everything else the founder might ask for is out of
   scope in this release and the Assistant says so. The receipt table's
   CHECK refuses to record anything else, so widening the allowlist is a
   migration, never a drive-by.

   ONE GOVERNED CALL PER LISTING. N listings are N independent calls, each
   validated and recorded on its own — no batching inside the machinery, no
   multi-id transition. That is what makes a partial result real rather
   than asserted: three approvals and one refusal are three receipts of
   success and one truthful failure, not a rolled-back batch.

   ROOM MEMORY IS NOT PERSISTED. assistant_work_sessions carries the
   conversation and at most one pending plan — never listing statuses,
   queue contents, or counts. Every turn re-reads the working set from
   production; resume revalidates any pending plan against production and
   reports what changed. A remembered room is a room that no longer exists.

   THE WORKING SET (founder ruling §11.1): the currently open Founder
   Review record plus the pending-review queue. No filtered grid, no list
   surface, no invented UI state. The Assistant may only name listings from
   that set, and only propose ones that are genuinely pending_review; a
   proposal is resolved server-side against the set — a code or id the
   model produces on its own is never obeyed.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const MODEL = "claude-sonnet-4-6"; // match /api/validate-reference

export const runtime = "nodejs";
/* Confirm executes N independent governed calls, each of which may run the
   post-publication Dossier worker — the 60s the status route needs for one
   listing is not enough headroom for several. */
export const maxDuration = 300;

const MESSAGE_MAX = 2000; // founder input bound per turn
const STORED_TURNS_MAX = 60; // conversation kept in the session
const MODEL_TURNS_MAX = 20; // conversation shown to the model per turn
const QUEUE_LIMIT = 50; // pending-review queue slice per re-read

type AssistantTurn = { role: "founder" | "assistant"; text: string; at: string };
type PlanItem = {
  listing_id: string;
  code: string;
  brand: string | null;
  model: string | null;
  reference: string | null;
};
type PendingPlan = { id: string; items: PlanItem[]; created_at: string };
type SessionContext = {
  messages?: AssistantTurn[];
  pending_plan?: PendingPlan | null;
};
type WorkingEntry = {
  id: string;
  code: string;
  brand: string | null;
  model: string | null;
  reference: string | null;
  status: string;
  open: boolean;
};

/* ── the founder gate, shared by every verb in this file ─────────────── */
async function gateFounder(): Promise<
  { ok: true; uid: string } | { ok: false; res: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "not_authenticated", detail: "Sign in required." },
        { status: 401 }
      ),
    };
  }
  if (user.id !== ADMIN_USER_ID) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "forbidden", detail: "Admin only." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, uid: user.id };
}

/* ── the working set: the open record + the pending-review queue, read
      from production NOW. This is the only listing truth any turn sees. ── */
async function readWorkingSet(
  service: ReturnType<typeof createServiceClient>,
  openListingId: string | null
): Promise<WorkingEntry[]> {
  const entries = new Map<string, WorkingEntry>();

  const { data: queue } = await service
    .from("listings")
    .select("id, public_code, brand, model, reference, status")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true })
    .limit(QUEUE_LIMIT);
  for (const row of queue ?? []) {
    entries.set(row.id as string, {
      id: row.id as string,
      code: (row.public_code as string | null) ?? "",
      brand: (row.brand as string | null) ?? null,
      model: (row.model as string | null) ?? null,
      reference: (row.reference as string | null) ?? null,
      status: (row.status as string) ?? "",
      open: false,
    });
  }

  if (openListingId) {
    const { data: open } = await service
      .from("listings")
      .select("id, public_code, brand, model, reference, status")
      .eq("id", openListingId)
      .maybeSingle();
    if (open) {
      entries.set(open.id as string, {
        id: open.id as string,
        code: (open.public_code as string | null) ?? "",
        brand: (open.brand as string | null) ?? null,
        model: (open.model as string | null) ?? null,
        reference: (open.reference as string | null) ?? null,
        status: (open.status as string) ?? "",
        open: true,
      });
    }
  }

  return [...entries.values()];
}

function describeEntry(e: WorkingEntry): string {
  const name = [e.brand, e.model, e.reference].filter(Boolean).join(" ");
  return `${e.code || e.id}${name ? ` — ${name}` : ""}`;
}

/* ── conversation storage ─────────────────────────────────────────────── */
function contextOf(raw: unknown): SessionContext {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as SessionContext)
    : {};
}
function turnsOf(ctx: SessionContext): AssistantTurn[] {
  return Array.isArray(ctx.messages) ? ctx.messages : [];
}

/* ── the model call: one narrow capability, JSON in, JSON out ─────────── */
const SYSTEM_PROMPT = `You are the Founder Assistant inside FairWatchTrade's Founder Review room. You work only on the founder's explicit instructions, inside the founder's own session.

You have exactly ONE capability in this release: proposing an approval plan for listings the founder identifies. Anything else — rejections, clarifications, edits, notes, searches, settings, opinions on watches, or work outside Founder Review — is out of scope: say so briefly and plainly, and do not improvise a workaround.

THE WORKING SET in each message is the complete set of listings you may name: the currently open record plus the pending-review queue, read from production this turn. Never invent a listing, never recall one from an earlier turn — earlier turns may be stale. Only the working set in the LATEST message is current truth.

Propose approval ONLY for listings the founder has explicitly identified, and only when they appear in the working set with status pending_review. If the founder is ambiguous, ask instead of guessing. You propose; you never execute — execution happens only after the founder confirms the exact plan shown to them.

Respond with ONLY a JSON object — no prose outside it, no markdown fences:
{"reply": string, "propose_approve": string[]}
- reply: what you say to the founder. Courteous, concise, plain. Never claim anything was executed.
- propose_approve: FairWatchTrade public codes, taken verbatim from the working set, for the approval plan — or [] when there is nothing to propose.`;

async function callModel(
  turns: AssistantTurn[],
  workingSet: WorkingEntry[],
  founderText: string
): Promise<{ reply: string; propose: string[] } | null> {
  const setLines = workingSet.length
    ? workingSet
        .map(
          (e) =>
            `- ${e.code || e.id} · status ${e.status}${e.open ? " · OPEN RECORD" : ""} · ${
              [e.brand, e.model, e.reference].filter(Boolean).join(" ") || "(no name recorded)"
            }`
        )
        .join("\n")
    : "(empty — nothing is open and the pending-review queue has no records)";

  const messages = [
    ...turns.slice(-MODEL_TURNS_MAX).map((t) => ({
      role: t.role === "founder" ? ("user" as const) : ("assistant" as const),
      content: t.text,
    })),
    {
      role: "user" as const,
      content: `WORKING SET (read from production for this turn):\n${setLines}\n\nFOUNDER: ${founderText}`,
    },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const text: string = (data.content ?? [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("")
      .trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as { reply?: unknown; propose_approve?: unknown };

    const reply =
      typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, MESSAGE_MAX) : "";
    const propose = Array.isArray(parsed.propose_approve)
      ? parsed.propose_approve.filter((c): c is string => typeof c === "string")
      : [];
    if (!reply) return null;
    return { reply, propose };
  } catch {
    // A failed or off-script model turn stores nothing and executes nothing.
    return null;
  }
}

/* ── session persistence helper ───────────────────────────────────────── */
async function saveContext(
  service: ReturnType<typeof createServiceClient>,
  sessionId: string,
  ctx: SessionContext
): Promise<boolean> {
  const { error } = await service
    .from("assistant_work_sessions")
    .update({ context: ctx, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) {
    console.error("[assistant] session save failed:", error.message);
    return false;
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════════════
   GET — resume. Returns the latest open session, with any pending plan
   revalidated against production. The report states current truth — it is
   built from the re-read, never from anything the session remembered.
   ════════════════════════════════════════════════════════════════════════ */
export async function GET() {
  const gate = await gateFounder();
  if (!gate.ok) return gate.res;

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[assistant] trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Assistant channel unavailable." },
      { status: 500 }
    );
  }

  const { data: session } = await service
    .from("assistant_work_sessions")
    .select("id, context, updated_at")
    .eq("owner_uid", gate.uid)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return NextResponse.json({ session: null });

  const ctx = contextOf(session.context);
  const plan = ctx.pending_plan ?? null;

  let resumeReport =
    "Session resumed. The room is re-read from production on every turn — nothing here is remembered state.";

  if (plan && plan.items.length > 0) {
    const { data: rows } = await service
      .from("listings")
      .select("id, status")
      .in(
        "id",
        plan.items.map((i) => i.listing_id)
      );
    const byId = new Map((rows ?? []).map((r) => [r.id as string, r.status as string]));
    const lines = plan.items.map((i) => {
      const now = byId.get(i.listing_id);
      if (now === "pending_review") return `· ${i.code} — still awaiting review.`;
      if (!now) return `· ${i.code} — no longer exists.`;
      return `· ${i.code} — the room changed underneath the plan: status is now "${now}".`;
    });
    resumeReport += `\nA plan is pending confirmation:\n${lines.join("\n")}`;
  }

  return NextResponse.json({
    session: {
      id: session.id,
      messages: turnsOf(ctx).slice(-STORED_TURNS_MAX),
      pending_plan: plan,
    },
    resume_report: resumeReport,
  });
}

/* ════════════════════════════════════════════════════════════════════════
   POST — message | confirm | cancel_plan | close.
   ════════════════════════════════════════════════════════════════════════ */
export async function POST(request: NextRequest) {
  const gate = await gateFounder();
  if (!gate.ok) return gate.res;

  let body: {
    action?: unknown;
    session_id?: unknown;
    listing_id?: unknown;
    text?: unknown;
    plan_id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not parse request body." },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "";
  const sessionId = typeof body.session_id === "string" ? body.session_id : null;

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[assistant] trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Assistant channel unavailable." },
      { status: 500 }
    );
  }

  /* ── load (or create, for 'message') the founder's open session ──────── */
  async function loadSession(id: string) {
    const { data } = await service
      .from("assistant_work_sessions")
      .select("id, context, status")
      .eq("id", id)
      .eq("owner_uid", gate.ok ? gate.uid : "")
      .eq("status", "open")
      .maybeSingle();
    return data ?? null;
  }

  /* ═════ message ═══════════════════════════════════════════════════════ */
  if (action === "message") {
    const text =
      typeof body.text === "string" ? body.text.trim().slice(0, MESSAGE_MAX) : "";
    if (!text) {
      return NextResponse.json(
        { error: "bad_request", detail: "A message is required." },
        { status: 400 }
      );
    }
    const openListingId =
      typeof body.listing_id === "string" && body.listing_id ? body.listing_id : null;

    let session = sessionId ? await loadSession(sessionId) : null;
    if (!session) {
      const { data: created, error: createErr } = await service
        .from("assistant_work_sessions")
        .insert({ owner_uid: gate.uid })
        .select("id, context, status")
        .single();
      if (createErr || !created) {
        return NextResponse.json(
          { error: "session_failed", detail: "Could not open a work session." },
          { status: 500 }
        );
      }
      session = created;
    }

    const ctx = contextOf(session.context);
    const turns = turnsOf(ctx);

    /* Production truth for this turn — never remembered state. */
    const workingSet = await readWorkingSet(service, openListingId);

    const modelOut = await callModel(turns, workingSet, text);
    if (!modelOut) {
      // Nothing is stored and nothing executes on a failed turn.
      return NextResponse.json(
        {
          error: "assistant_unavailable",
          detail: "The Assistant could not process that. Nothing was recorded or executed — try again.",
        },
        { status: 502 }
      );
    }

    /* Resolve proposals SERVER-SIDE against the working set. A code the
       model produced that is not a pending_review member of the set is
       dropped — the model is never obeyed, only interpreted. */
    const byCode = new Map(
      workingSet.filter((e) => e.code).map((e) => [e.code.toUpperCase(), e])
    );
    const resolved: PlanItem[] = [];
    const dropped: string[] = [];
    for (const rawCode of modelOut.propose) {
      const entry = byCode.get(rawCode.trim().toUpperCase());
      if (entry && entry.status === "pending_review") {
        if (!resolved.some((i) => i.listing_id === entry.id)) {
          resolved.push({
            listing_id: entry.id,
            code: entry.code,
            brand: entry.brand,
            model: entry.model,
            reference: entry.reference,
          });
        }
      } else {
        dropped.push(rawCode.trim());
      }
    }

    let reply = modelOut.reply;
    if (dropped.length > 0) {
      reply += `\n(Not currently approvable from the working set, so not in any plan: ${dropped.join(", ")}.)`;
    }

    const pendingPlan: PendingPlan | null =
      resolved.length > 0
        ? { id: randomUUID(), items: resolved, created_at: new Date().toISOString() }
        : (ctx.pending_plan ?? null);

    const now = new Date().toISOString();
    const nextCtx: SessionContext = {
      messages: [
        ...turns,
        { role: "founder" as const, text, at: now },
        { role: "assistant" as const, text: reply, at: now },
      ].slice(-STORED_TURNS_MAX),
      pending_plan: pendingPlan,
    };
    const saved = await saveContext(service, session.id as string, nextCtx);
    if (!saved) {
      return NextResponse.json(
        { error: "session_failed", detail: "The turn could not be recorded. Nothing was executed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      session_id: session.id,
      reply,
      plan: resolved.length > 0 ? pendingPlan : null,
    });
  }

  /* ═════ confirm — the authorization moment ════════════════════════════ */
  if (action === "confirm") {
    const planId = typeof body.plan_id === "string" ? body.plan_id : "";
    if (!sessionId || !planId) {
      return NextResponse.json(
        { error: "bad_request", detail: "session_id and plan_id are required." },
        { status: 400 }
      );
    }
    const session = await loadSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "not_found", detail: "No open session with that id." },
        { status: 404 }
      );
    }
    const ctx = contextOf(session.context);
    const plan = ctx.pending_plan ?? null;
    if (!plan || plan.id !== planId || plan.items.length === 0) {
      return NextResponse.json(
        {
          error: "no_matching_plan",
          detail: "That plan is no longer pending — ask the Assistant again.",
        },
        { status: 409 }
      );
    }

    /* Re-read production BEFORE executing: the plan was proposed against a
       room that may have changed. Listings that moved are refused
       truthfully, not silently skipped and not forced through. */
    const { data: rows } = await service
      .from("listings")
      .select("id, status")
      .in(
        "id",
        plan.items.map((i) => i.listing_id)
      );
    const statusById = new Map((rows ?? []).map((r) => [r.id as string, r.status as string]));

    const succeeded: { listing_id: string; code: string; status: string }[] = [];
    const failed: { listing_id: string; code: string; error: string; detail: string }[] = [];

    for (const item of plan.items) {
      const now = statusById.get(item.listing_id);
      if (!now) {
        failed.push({
          listing_id: item.listing_id,
          code: item.code,
          error: "not_found",
          detail: "The listing no longer exists.",
        });
        continue;
      }
      if (now !== "pending_review") {
        failed.push({
          listing_id: item.listing_id,
          code: item.code,
          error: "not_in_review",
          detail: `The room changed: status is now "${now}".`,
        });
        continue;
      }
      /* ONE governed call per listing — the same machinery a click uses,
         with the execution signal hardcoded HERE and nowhere else. */
      const outcome = await executeListingStatusTransition({
        listingId: item.listing_id,
        actorUid: gate.uid,
        executedVia: "assistant",
        input: { status: "published", review_action: "approve" },
      });
      if (outcome.httpStatus === 200) {
        succeeded.push({
          listing_id: item.listing_id,
          code: item.code,
          status: String(outcome.body.status ?? "published"),
        });
      } else {
        failed.push({
          listing_id: item.listing_id,
          code: item.code,
          error: String(outcome.body.error ?? "failed"),
          detail: String(outcome.body.detail ?? `Refused (${outcome.httpStatus}).`),
        });
      }
    }

    /* The receipt — append-only, IDs stored, counts always derived. */
    const { data: receipt, error: receiptErr } = await service
      .from("assistant_operation_receipts")
      .insert({
        session_id: session.id,
        operation: "approve_listings",
        authorized_by: gate.uid,
        requested_listing_ids: plan.items.map((i) => i.listing_id),
        succeeded_listing_ids: succeeded.map((s) => s.listing_id),
        failed_listings: failed,
      })
      .select("id")
      .maybeSingle();
    if (receiptErr) {
      console.error("[assistant] receipt insert failed:", receiptErr.message);
    }

    /* The account is composed HERE from what actually happened — never by
       the model, so it cannot narrate an execution that did not occur. */
    const lines: string[] = [];
    for (const s of succeeded) {
      lines.push(
        s.status === "private_active"
          ? `✓ ${s.code} — approved and released privately to its authorized buyer.`
          : `✓ ${s.code} — approved and published.`
      );
    }
    for (const f of failed) {
      lines.push(`✗ ${f.code} — ${f.detail}`);
    }
    lines.push(
      receipt?.id
        ? `Receipt ${receipt.id}.`
        : "The receipt could not be written — the results above still happened exactly as stated."
    );
    const account = `Executed approve_listings on ${plan.items.length} listing(s): ${succeeded.length} succeeded, ${failed.length} did not.\n${lines.join("\n")}`;

    const now = new Date().toISOString();
    const nextCtx: SessionContext = {
      messages: [...turnsOf(ctx), { role: "assistant" as const, text: account, at: now }].slice(
        -STORED_TURNS_MAX
      ),
      pending_plan: null,
    };
    await saveContext(service, session.id as string, nextCtx);

    return NextResponse.json({
      session_id: session.id,
      reply: account,
      results: { succeeded, failed },
      receipt_id: receipt?.id ?? null,
    });
  }

  /* ═════ cancel_plan ═══════════════════════════════════════════════════ */
  if (action === "cancel_plan") {
    if (!sessionId) {
      return NextResponse.json(
        { error: "bad_request", detail: "session_id is required." },
        { status: 400 }
      );
    }
    const session = await loadSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "not_found", detail: "No open session with that id." },
        { status: 404 }
      );
    }
    const ctx = contextOf(session.context);
    const now = new Date().toISOString();
    const reply = "Plan cancelled — nothing was executed.";
    const nextCtx: SessionContext = {
      messages: [...turnsOf(ctx), { role: "assistant" as const, text: reply, at: now }].slice(
        -STORED_TURNS_MAX
      ),
      pending_plan: null,
    };
    await saveContext(service, session.id as string, nextCtx);
    return NextResponse.json({ session_id: session.id, reply });
  }

  /* ═════ close ═════════════════════════════════════════════════════════ */
  if (action === "close") {
    if (!sessionId) {
      return NextResponse.json(
        { error: "bad_request", detail: "session_id is required." },
        { status: 400 }
      );
    }
    const { error } = await service
      .from("assistant_work_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("owner_uid", gate.uid)
      .eq("status", "open");
    if (error) {
      return NextResponse.json(
        { error: "close_failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    {
      error: "invalid_action",
      detail: "action must be one of: message, confirm, cancel_plan, close.",
    },
    { status: 400 }
  );
}
