import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { composeWatchPassport } from "@/lib/passport/watchPassport";
import { executeListingStatusTransition } from "@/lib/listingStatusTransition";
import {
  removeConsequenceLines,
  removeRefusalSentence,
  type RemovePreview,
} from "@/lib/listingRemovePreview";
import {
  resolveRoom,
  roomRefusalStatus,
  ROOM_SPEC,
  ROOM_LABEL,
  ROOM_OPERATION,
  ROOM_SUBJECT,
  ROOM_CONTROLS,
  type ImplementedRoom,
  type RoomResolution,
} from "@/lib/assistantRooms";
import {
  resolveRoomContext,
  describeContext,
  couldNotVerify,
  type RenderedRoomContext,
  type Reread,
} from "@/lib/assistantRoomContext";
import {
  listLiveThreads,
  getThread,
  startThread,
  activateThread,
  pauseThread,
  closeThread,
  handoffThread,
  threadAnchors,
  openLoops,
  createOpenLoop,
  disposeOpenLoop,
  addAnchor,
  needsReorientation,
  reorientationSentence,
  recordEvent,
  type OperationalThread,
} from "@/lib/assistantThread";
import {
  decideExecution,
  unreceiptedSentence,
  reconciledSentence,
  type ExistingReceipt,
  type OpenMarker,
} from "@/lib/assistantOperations";

/* ════════════════════════════════════════════════════════════════════════
   FOUNDER ASSISTANT — app/api/admin/assistant/route.ts   (v6.89)

   The server side of the Persistent Admin Assistant. The founder asks in
   words inside a room; the Assistant proposes an exact plan; the founder
   confirms; the Assistant executes through the SAME governed machinery a
   click would have used, with the execution signal hardcoded at the call
   site. V2 adds a second room without forking the spine: one gate, one
   session table, one propose → preview → confirm → execute → report loop.

   TWO ROOMS, TWO OPERATIONS, AND NOTHING ELSE:

     founder_review      → approve_listings  (V1, unchanged)
     marketplace_control → remove_listing    (V2, single listing only)

   Sessions are scoped to a room, so resuming in one never surfaces the
   other's conversation. The receipt table's CHECK refuses any operation
   outside that pair, and a separate CHECK refuses a remove_listing receipt
   carrying more than one id — no batch remove is a database property here,
   not a habit.

   PRINCIPAL: the Assistant is not its own principal. It holds no credential
   and gains no privilege. Every request carries the founder's live session,
   gated by the same defense-in-depth literal the governed routes use.

   THE EXECUTION SIGNAL IS NEVER A REQUEST FIELD:
     · approve → lib/listingStatusTransition with executedVia 'assistant'
       hardcoded at the one call site;
     · remove  → public.remove_listing_assistant(), whose EXECUTE is granted
       to service_role ALONE. A browser holding the founder's own session
       authenticates as `authenticated` and cannot reach that function at
       all, whatever it puts in its body. The direct product path calls
       public.remove_listing(), which can only ever record 'direct'.

   ONE GOVERNED CALL PER LISTING. No batching inside the machinery, no
   multi-id mutation. That is what makes a partial result real rather than
   asserted.

   ROOM MEMORY IS NOT PERSISTED. assistant_work_sessions carries the
   conversation and at most one pending plan — never listing statuses, queue
   contents, counts, or a stored preview. Every turn re-reads the working set
   from production; resume RECOMPUTES any pending plan's consequences against
   production rather than replaying what was shown when it was proposed. A
   remembered room is a room that no longer exists.

   THE ASSISTANT NEVER COMPOSES THE OUTCOME. What executed is reported from
   what actually returned, assembled in this file — the model is never asked
   to narrate a result, so it cannot narrate one that did not happen.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const MODEL = "claude-sonnet-4-6"; // match /api/validate-reference

export const runtime = "nodejs";
/* Confirm executes N independent governed calls, each of which may run the
   post-publication Dossier worker — the 60s a single transition needs is not
   enough headroom for several. */
export const maxDuration = 300;

const MESSAGE_MAX = 2000; // founder input bound per turn
const STORED_TURNS_MAX = 60; // conversation kept in the session
const MODEL_TURNS_MAX = 20; // conversation shown to the model per turn
const QUEUE_LIMIT = 50; // pending-review queue slice per re-read
const LEDGER_LIMIT = 40; // marketplace slice per re-read

/* Room identity is resolved by the canonical registry in lib/assistantRooms.
   This file no longer decides what a room is, and no longer has a code path
   capable of turning an unrecognized key into Founder Review. */
type Room = ImplementedRoom;

/* Which room may confirm which operation. A room absent from this map is
   Tier A and can confirm nothing — enforced here at the seam, not left to
   the prompt, because a prompt is guidance and a lookup is a property. */
const OPERATION_FOR_ROOM = ROOM_OPERATION;

/* The governed exit-reason vocabulary. Mirrored here for VALIDATION only —
   remove_listing_core() re-validates it and remains the authority. */
const REASON_CODES = [
  "sold_in_store",
  "sold_elsewhere",
  "no_longer_for_sale",
  "listing_mistake",
  "other",
] as const;

type AssistantTurn = { role: "founder" | "assistant"; text: string; at: string };
type PlanItem = {
  listing_id: string;
  code: string;
  brand: string | null;
  model: string | null;
  reference: string | null;
};
type PendingPlan = {
  id: string;
  operation: "approve_listings" | "remove_listing";
  items: PlanItem[];
  /** remove_listing only — the governed reason the founder gave. */
  reason_code?: string | null;
  reason_note?: string | null;
  created_at: string;
};
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
  /* Marketplace Control, selected listing only: the PRODUCT's own answer to
     "can this be taken off the market", never the model's inference from a
     status word. The governed rule admits published, reserved AND
     pending_review; a model guessing from the status name got that wrong in
     production and declined work the product allows. */
  removable?: boolean;
  refusal?: string | null;
  /* The room showed this record and production no longer produces it. Kept
     in the set and named, because a silently shorter list is a different
     room presented as this one. */
  missing?: boolean;
};

/* The refusal response for a room that did not resolve.

   It is returned BEFORE any session or thread read/write, so a room-key
   failure cannot create, resume, mutate, or close the founder's work — the
   preservation the sentence promises is structural, not a claim.

   `room` is deliberately absent from the body: echoing a room the product
   refused to establish is how a client starts trusting one. */
function roomRefusal(r: Exclude<RoomResolution, { state: "ok" }>): NextResponse {
  return NextResponse.json(
    {
      error: r.state,
      detail: r.sentence,
      received: r.state === "unsupported_room" ? r.room : r.received,
      work_preserved: true,
    },
    { status: roomRefusalStatus(r) }
  );
}

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

function entryFrom(row: Record<string, unknown>, open: boolean): WorkingEntry {
  return {
    id: row.id as string,
    code: (row.public_code as string | null) ?? "",
    brand: (row.brand as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    status: (row.status as string) ?? "",
    open,
  };
}

/* ── THE WORKING SET — what the room shows, re-read from production ──────

   The room supplies WHICH records are in front of the founder. Production
   supplies what those records currently mean. There is deliberately no
   branch here that builds a set the room did not pass: the previous
   Marketplace reader ran its own "newest 40" query and answered about a room
   the founder was not looking at.

   A record the room shows that production can no longer produce is reported
   as MISSING rather than dropped — a silently shorter list is a different
   room presented as this one.

   Any read failure returns COULD_NOT_VERIFY and the model is never called
   for a current-state claim. Could not look is not nothing found. */
async function readWorkingSet(
  service: ReturnType<typeof createServiceClient>,
  room: Room,
  ctx: RenderedRoomContext
): Promise<Reread<WorkingEntry[]>> {
  const ids = [
    ...new Set([...ctx.visibleIds, ...(ctx.selectedId ? [ctx.selectedId] : [])]),
  ].slice(0, QUEUE_LIMIT + LEDGER_LIMIT);

  if (ids.length === 0) return { state: "OK", value: [] };

  const { data, error } = await service
    .from("listings")
    .select("id, public_code, brand, model, reference, status")
    .in("id", ids);
  if (error) return couldNotVerify("listings", error.message);

  const byId = new Map((data ?? []).map((r) => [r.id as string, r]));
  const entries: WorkingEntry[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      entries.push({
        id,
        code: "",
        brand: null,
        model: null,
        reference: null,
        status: "",
        open: ctx.selectedId === id,
        missing: true,
      });
      continue;
    }
    entries.push(entryFrom(row, ctx.selectedId === id));
  }

  /* Marketplace Control only: the product's own removal verdict for the
     selected listing, from the same function the confirmation reads. If the
     verdict cannot be read, the turn refuses rather than letting the model
     infer eligibility from a status word. */
  if (room === "marketplace_control" && ctx.selectedId) {
    const entry = entries.find((e) => e.id === ctx.selectedId);
    if (entry && !entry.missing) {
      const p = await readRemovePreview(service, entry.id);
      if (!p) return couldNotVerify("listing_remove_preview", "preview unavailable for the selected listing");
      entry.removable = p.removable;
      entry.refusal = p.refusal;
    }
  }

  return { state: "OK", value: entries };
}

/* readMarketplaceSet is deliberately GONE. It ran an independent
   `order by updated_at desc limit 40` and called the result "here", so the
   Assistant answered about the newest listings in the database while the
   founder was looking at a filtered, searched, sorted, paginated page. There
   is now exactly one way for the server to learn what is on screen: the room
   passes it. Reintroducing a server-side room query would reintroduce the
   defect, which is why no such function exists to copy. */

/* ── FOUNDER REVIEW: the governed facts that answer the room's question ──

   "What is blocking this listing from a decision?" cannot be answered from
   identity and status. It needs the decision history, the integrity review
   that may be holding it, and whether a buyer is already waiting on it.

   Every source fails closed independently. A partial picture presented as a
   whole one is how an Assistant tells a founder a listing is clear when the
   thing holding it simply did not load. */
type ReviewFacts = {
  decisions: {
    decision: string;
    prior: string | null;
    resulting: string | null;
    at: string;
    via: string;
  }[];
  integrity: { status: string; resolved_at: string | null; notes: string | null } | null;
  requests: { status: string; created_at: string }[];
};

async function readReviewFacts(
  service: ReturnType<typeof createServiceClient>,
  listingId: string
): Promise<Reread<ReviewFacts>> {
  const [decisions, integrity, requests] = await Promise.all([
    service
      .from("listing_decision_events")
      .select("decision, prior_status, resulting_status, created_at, executed_via")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(10),
    service
      .from("listing_integrity_reviews")
      .select("status, resolved_at, admin_notes")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(1),
    service
      .from("purchase_requests")
      .select("status, created_at")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (decisions.error) return couldNotVerify("listing_decision_events", decisions.error.message);
  if (integrity.error) return couldNotVerify("listing_integrity_reviews", integrity.error.message);
  if (requests.error) return couldNotVerify("purchase_requests", requests.error.message);

  const review = (integrity.data ?? [])[0] as
    | { status: string; resolved_at: string | null; admin_notes: string | null }
    | undefined;

  return {
    state: "OK",
    value: {
      decisions: (decisions.data ?? []).map((d) => ({
        decision: String(d.decision ?? ""),
        prior: (d.prior_status as string | null) ?? null,
        resulting: (d.resulting_status as string | null) ?? null,
        at: String(d.created_at ?? ""),
        via: String(d.executed_via ?? "direct"),
      })),
      integrity: review
        ? { status: review.status, resolved_at: review.resolved_at, notes: review.admin_notes }
        : null,
      requests: (requests.data ?? []).map((r) => ({
        status: String(r.status ?? ""),
        created_at: String(r.created_at ?? ""),
      })),
    },
  };
}

function describeReviewFacts(f: ReviewFacts): string {
  const lines: string[] = [];
  lines.push(
    f.integrity
      ? `Integrity review: ${f.integrity.status}${
          f.integrity.resolved_at ? ` (resolved ${f.integrity.resolved_at})` : " — NOT resolved"
        }${f.integrity.notes ? ` · notes: ${f.integrity.notes.slice(0, 200)}` : ""}`
      : "Integrity review: none on record for this listing."
  );
  lines.push(
    f.decisions.length
      ? `Decision history (newest first): ${f.decisions
          .map((d) => `${d.decision} ${d.prior ?? "?"}→${d.resulting ?? "?"} via ${d.via}`)
          .join("; ")}`
      : "Decision history: no decision has ever been recorded for this listing."
  );
  const live = f.requests.filter((r) => r.status === "pending" || r.status === "accepted");
  lines.push(
    f.requests.length
      ? `Purchase requests: ${f.requests.length} on record, ${live.length} still live (${f.requests
          .map((r) => r.status)
          .join(", ")}).`
      : "Purchase requests: none."
  );
  return lines.join("\n");
}

/* ── WATCH PASSPORT: recomputed, never remembered ────────────────────────

   Passport is a pure projection with no table, no snapshot and no correction
   layer, so the authoritative reread IS a fresh composition from the
   governed bead. Nothing here is cached between turns.

   The current/history boundary is preserved in the description itself,
   because collapsing it is the one thing this room must never do: what FWT
   believes NOW and what it believed WHEN something happened are different
   facts, and an item reached through a belief since withdrawn stays labelled
   as the belief it was rather than being quietly re-read through today's. */
async function readPassportFacts(beadId: string): Promise<Reread<string>> {
  let p: Awaited<ReturnType<typeof composeWatchPassport>>;
  try {
    /* Composed exactly as the founder's own Passport page composes it — no
       client argument, so the Assistant and the page cannot drift onto two
       different readers of the same evidence. */
    p = await composeWatchPassport(beadId);
  } catch (e) {
    return couldNotVerify("watch_passport", e instanceof Error ? e.message : "composition failed");
  }
  if (!p) return couldNotVerify("watch_passport", `no physical-watch record for ${beadId}`);

  const lines: string[] = [];

  lines.push("CURRENT — what FairWatchTrade believes about this record NOW:");
  lines.push(
    `- Known to FairWatchTrade since ${p.knownToFwtSince ?? "unrecorded"}. This is the platform's knowledge boundary ONLY — never an origin, a manufacture date, or a first sale, and it is not a timeline event.`
  );
  lines.push(
    p.currentIdentity.conflicted
      ? "- Identity continuity is UNDER REVIEW: current decisions about this record contradict each other, so history from other records is NOT combined here. Nothing has been deleted."
      : p.currentIdentity.state === "RESOLVED"
        ? `- Currently resolved with ${Math.max(0, p.currentIdentity.members.length - 1)} other record(s) as one physical watch (generation ${p.currentIdentity.generation ?? "—"}).`
        : "- Not currently resolved with any other record."
  );

  lines.push("");
  lines.push(`HISTORICAL — ${p.timeline.length} recorded chapter(s), each read at the identity that applied AT THAT TIME:`);
  if (p.timeline.length === 0) {
    lines.push(
      "- None. FairWatchTrade holds no events for this watch, which is NOT evidence that none occurred."
    );
  } else {
    for (const item of p.timeline.slice(0, 25)) {
      lines.push(
        `- ${item.title} · ${item.effectiveAt ?? "undated"}${
          item.effectiveAtIsRecordedAt ? " (date RECORDED, not date it occurred)" : ""
        }${
          item.identityBasis === "historical_prior_resolution"
            ? " · READ UNDER A PRIOR IDENTITY CONCLUSION since withdrawn — present it as the belief it was, never as current truth"
            : ""
        }`
      );
    }
  }

  lines.push("");
  lines.push(
    p.identifierEvidence.length === 0
      ? "IDENTIFIER EVIDENCE: none recorded."
      : `IDENTIFIER EVIDENCE (presence and source class ONLY — never a value, a fragment, or an equality claim, and presence is NOT proof of authenticity): ${p.identifierEvidence
          .map((e) => `${e.observations}× ${e.identifierType} via ${e.sourceClass}`)
          .join("; ")}`
  );

  if (p.sourceGovernanceGaps.length > 0) {
    lines.push("");
    lines.push(`SOURCE GOVERNANCE GAPS — things that CANNOT be proven from durable evidence: ${p.sourceGovernanceGaps.join(" ")}`);
  }

  lines.push("");
  lines.push(`THIS PASSPORT MUST NEVER CLAIM: ${p.disclosures.join(" ")}`);

  return { state: "OK", value: lines.join("\n") };
}

/* ── the governed remove preview, read through the trusted client ─────── */
async function readRemovePreview(
  service: ReturnType<typeof createServiceClient>,
  listingId: string
): Promise<RemovePreview | null> {
  const { data, error } = await service.rpc("listing_remove_preview", {
    p_listing_id: listingId,
  });
  if (error || !data) return null;
  return data as RemovePreview;
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

/* ── ARRIVAL CONTRACT ─────────────────────────────────────────────────────

   When work arrives carrying an Operational Thread, the first substantive
   response must acknowledge where it came from, what governed object came
   with it, why the founder is here, whether current truth still supports
   that reason, and what is now in front of him.

   Reading `reason_for_moving` silently is explicitly not enough, so the note
   is composed HERE from thread facts joined against THIS TURN'S reread —
   never from remembered product state — and handed to the model as material
   it is instructed to use. The "does the reason still hold" clause is
   answered by whether the anchored object is present in the freshly re-read
   working set and what its status is now, which is a current fact rather
   than a recollection. */
function buildArrivalNote(
  thread: OperationalThread,
  room: Room,
  anchors: { object_type: string; object_id: string }[],
  loops: { obligation_type: string; founder_intent: string | null }[],
  workingSet: WorkingEntry[]
): string {
  const lines: string[] = [];
  lines.push(
    `ACTIVE OPERATIONAL THREAD — "${thread.title ?? "untitled work"}", started in ${
      ROOM_LABEL[thread.origin_room as keyof typeof ROOM_LABEL] ?? thread.origin_room
    }.`
  );
  if (thread.operational_intent) {
    lines.push(`What the founder set out to do: ${thread.operational_intent}`);
  }

  if (anchors.length === 0) {
    lines.push("No governed objects are anchored to this thread yet.");
  } else {
    lines.push("Objects this work carries, checked against what this room just re-read:");
    for (const a of anchors) {
      const here = workingSet.find((e) => e.id === a.object_id);
      if (!here) {
        lines.push(
          `- ${a.object_type} ${a.object_id} — NOT among the records this room is showing, so I cannot speak to its current state from here.`
        );
      } else if (here.missing) {
        lines.push(
          `- ${a.object_type} ${a.object_id} — the room is showing it but production no longer produces it.`
        );
      } else {
        lines.push(
          `- ${a.object_type} ${here.code || here.id} — current status ${here.status}. Say plainly whether that still matches why the founder came here.`
        );
      }
    }
  }

  if (loops.length > 0) {
    lines.push(
      `Unresolved obligations on this thread: ${loops
        .map((l) => l.obligation_type + (l.founder_intent ? ` (${l.founder_intent})` : ""))
        .join("; ")}.`
    );
  }

  lines.push(
    "ARRIVAL CONTRACT: your first substantive sentence must say where this work came from, what it carried, " +
      "why the founder is here, and whether current truth still supports that reason — including saying so plainly " +
      "if the reason no longer holds. Do not silently continue as though nothing moved."
  );
  return lines.join("\n");
}

/* ── WHO THE ASSISTANT IS, AND WHAT ROOM IT IS STANDING IN ───────────────

   Asked what model it runs on, the Assistant used to say the question was
   "outside what I can speak to here." That is not discretion — the founder
   is the only person who can reach this surface, he is asking about his own
   product, and a corporate non-answer is the wrong register in his own admin.

   The model name is INJECTED from the MODEL constant this file actually
   calls, so the statement cannot drift into a lie the way a hardcoded
   sentence would: change the constant and the self-description changes with
   it. Nothing here asserts a capability the room does not have — the DO
   sentence is generated from the same operation map the confirm seam
   enforces. */
function selfDescription(room: Room): string {
  const op = OPERATION_FOR_ROOM[room];
  const controls = ROOM_CONTROLS[room];
  return `WHO YOU ARE — if asked, answer plainly and immediately. Evasion here is a defect, not discretion.

You are the FairWatchTrade Founder Assistant, working inside the ${ROOM_LABEL[room]} room of FairWatchTrade's own admin. You are a language model — ${MODEL}, from Anthropic — running inside FairWatchTrade's product, not a general chatbot bolted on.

You hold no credential and no privilege of your own. Every request carries the founder's live signed-in session, and you act only on his explicit instruction.

WHAT YOU READ, every single turn: the rendered context this room passes you — literally what is on his screen right now — plus a fresh re-read of governed FairWatchTrade truth. You keep no memory of product state between turns, and you never answer a current-state question from an earlier turn.

WHAT YOU CAN ACTUALLY DO HERE: ${
    op
      ? `exactly one governed action — ${op} — and only after he confirms an exact plan you showed him first. Nothing else in this room, and nothing at all in other rooms.`
      : `nothing. This room has no governed action. You see and explain; you cannot approve, remove, edit or publish anything here, and you must never imply otherwise.`
  }

If he asks what model you are, who built you, what you can do, or how you work, tell him. Directly.

HOW "PLAINLY" WORKS HERE: it describes what you SAY, never how you format the response. Everything you say to the founder — including a direct answer about yourself — goes inside the "reply" field of the single JSON object described at the end of these instructions. Answering in bare prose breaks the room and loses his turn. Be direct in the words; be exact in the envelope.

WHEN HE ASKS FOR SOMETHING YOU CANNOT DO: say you cannot, then say who or what can — precisely. If the capability is a control in THIS room, name it and where it sits. If it belongs to another room, name that room. "That's outside what I can do here", "through whatever path the product exposes", and "likely outside this view" are failures: they are true and useless, and they send him hunting for something that may be on the screen in front of him. Not being able to perform an action is never a reason to be vague about where it lives.

${
  controls ??
  `THE CONTROLS IN THIS ROOM: you have not been briefed on this room's control semantics. If he asks what a control does, say exactly that — that nobody has given you this room's control meanings yet and it should be added — rather than calling it outside your working set. Never guess at what a control does.`
}`;
}

/* ── the model call: one narrow capability per room, JSON in, JSON out ── */
const REVIEW_PROMPT = `You are the Founder Assistant inside FairWatchTrade's Founder Review room. You work only on the founder's explicit instructions, inside the founder's own session.

You have exactly ONE capability in this release: proposing an approval plan for listings the founder identifies. Anything else — rejections, clarifications, edits, notes, searches, settings, opinions on watches, or work outside Founder Review — is out of scope: say so briefly and plainly, and do not improvise a workaround.

THE WORKING SET in each message is the complete set of listings you may name: the currently open record plus the pending-review queue, read from production this turn. Never invent a listing, never recall one from an earlier turn — earlier turns may be stale. Only the working set in the LATEST message is current truth.

Propose approval ONLY for listings the founder has explicitly identified, and only when they appear in the working set with status pending_review. If the founder is ambiguous, ask instead of guessing. You propose; you never execute — execution happens only after the founder confirms the exact plan shown to them.

Respond with ONLY a JSON object — no prose outside it, no markdown fences:
{"reply": string, "propose_approve": string[]}
- reply: what you say to the founder. Courteous, concise, plain. Never claim anything was executed.
- propose_approve: FairWatchTrade public codes, taken verbatim from the working set, for the approval plan — or [] when there is nothing to propose.`;

const MARKETPLACE_PROMPT = `You are the Founder Assistant inside FairWatchTrade's Marketplace Control room. You work only on the founder's explicit instructions, inside the founder's own session.

You can do two things. You can ANSWER questions about the listings in the working set — their status, why one needs attention, whether it can be taken off the market. And you have exactly ONE mutation capability: proposing that the SELECTED listing be taken off the market (removed).

Removing is not deleting. Removal takes a watch off the market and is reversible through the product's governed Restore path, which returns it to review for the founder's approval. You cannot delete anything, cannot restore anything, cannot approve anything, cannot act on more than one listing, and cannot act on any listing other than the one currently selected. If the founder asks for any of that, say plainly that it is outside what you can do here.

THE WORKING SET in each message is the complete set of listings you may name, read from production this turn. Exactly one may be marked SELECTED. Never invent a listing and never recall one from an earlier turn — only the latest working set is current truth.

The SELECTED listing carries REMOVABLE, which is the product's own governed verdict. Trust it exactly and never re-derive eligibility from the status word: a listing awaiting review can still be taken off the market, and only REMOVABLE decides. When REMOVABLE is yes, propose the removal the founder asked for. When it is no, say the reason it carries and propose nothing.

Propose a removal ONLY when the founder has clearly asked for this listing to come off the market. If they are ambiguous, or if they name a listing that is not the selected one, ask instead of guessing. When you propose, carry the founder's reason if they gave one, using exactly one of these codes: sold_in_store, sold_elsewhere, no_longer_for_sale, listing_mistake, other. Use null when they gave no reason — never invent one.

You propose; you never execute. Execution happens only after the founder confirms the exact plan shown to them, and the product — not you — states the consequences.

Respond with ONLY a JSON object — no prose outside it, no markdown fences:
{"reply": string, "propose_remove": {"code": string, "reason_code": string|null, "reason_note": string|null} | null}
- reply: what you say to the founder. Courteous, concise, plain. Never claim anything was executed, and never state consequence numbers yourself.
- propose_remove: the SELECTED listing's FairWatchTrade public code taken verbatim from the working set, or null when there is nothing to propose.`;

/* DEALER ACCELERATOR — Tier A. SEE, EXPLAIN, CONTINUE, and no DO at all.

   The refusal it must perform is a product behaviour, not a limitation to
   apologise for: this room is a doorway, adjudication happens in Founder
   Review, and a dealer waiting on a decision is helped by being told exactly
   where the decision lives rather than by an Assistant improvising one. */
const DEALER_PROMPT = `You are the Founder Assistant inside FairWatchTrade's Dealer Accelerator room. You work only on the founder's explicit instructions, inside the founder's own session.

This room is a DOORWAY, not a place decisions are made. You can answer questions about the imported drafts dealers have submitted and are waiting on, explain what each one is and how long it has been waiting, and help the founder decide what to attend to first.

You have NO governed action here. You cannot approve, reject, clarify, remove, edit, or publish anything in this room, and you must never imply that you did or could. If the founder asks for any of those, say plainly that this room does not perform that action, name Founder Review as where that decision legitimately happens, and offer to carry the work there so it arrives with the listing and the reason attached. Refusing well and pointing at the right room IS your job here — never invent a workaround and never pretend an action occurred.

THE WORKING SET in each message is the complete set of listings you may name, re-read from production this turn. Never invent a listing and never recall one from an earlier turn.

Respond with ONLY a JSON object — no prose outside it, no markdown fences:
{"reply": string, "propose_approve": [], "propose_remove": null}
- reply: what you say to the founder. Courteous, concise, plain. Never claim anything was executed.
- propose_approve and propose_remove: ALWAYS empty/null in this room. You have no action to propose.`;

/* WATCH PASSPORT — Tier A, and the one room where the boundary between what
   is believed NOW and what was believed THEN is the entire product. */
const PASSPORT_PROMPT = `You are the Founder Assistant inside FairWatchTrade's Watch Passport room. You work only on the founder's explicit instructions, inside the founder's own session.

The Passport is a biography of evidence FairWatchTrade actually has. You can explain what is currently believed about this physical watch, what happened to it, and — critically — the difference between those two things. You have NO action of any kind here: nothing to approve, remove, resolve, merge, correct, or publish. Say so plainly if asked, and never imply a change occurred.

THE BOUNDARY YOU MUST NEVER COLLAPSE: what FairWatchTrade believes NOW and what it believed WHEN an event was recorded are different facts. An item marked as read under a prior identity conclusion must be presented as the belief it was at that time — never quietly re-read through today's understanding, and never described as currently true.

NEVER CLAIM, even if asked directly: complete ownership history, chain of custody, anything before FWT first knew the object, manufacturer provenance, authentication, authenticity, service history without durable object-level evidence, original sale or owner, or verified serial continuity. FWT records begin at its knowledge boundary, and empty history is NOT evidence of no history.

Identifier evidence is presence and source class only. Never state, guess, reconstruct, or compare an identifier VALUE or fragment, and never say that identifier evidence proves authenticity.

If the record shows identity continuity under review, say that history from other records is deliberately NOT combined and that nothing has been deleted.

Respond with ONLY a JSON object — no prose outside it, no markdown fences:
{"reply": string, "propose_approve": [], "propose_remove": null}
- reply: what you say to the founder. Courteous, concise, plain. Never claim anything was executed.
- propose_approve and propose_remove: ALWAYS empty/null. This room has no action.`;

type ModelOut = {
  reply: string;
  proposeApprove: string[];
  proposeRemove: { code: string; reason_code: string | null; reason_note: string | null } | null;
};

async function callModel(
  room: Room,
  turns: AssistantTurn[],
  workingSet: WorkingEntry[],
  founderText: string,
  roomContext: RenderedRoomContext,
  arrival: string | null,
  roomFacts: string | null
): Promise<ModelOut | null> {
  const setLines = workingSet.length
    ? workingSet
        .map((e) =>
          e.missing
            ? `- ${e.id} · ON SCREEN BUT NO LONGER IN PRODUCTION — the room is showing a record that no longer exists`
            : `- ${e.code || e.id} · status ${e.status}${
                e.open ? (room === "marketplace_control" ? " · SELECTED" : " · OPEN RECORD") : ""
              }${
                e.removable === undefined
                  ? ""
                  : e.removable
                    ? " · REMOVABLE: yes"
                    : ` · REMOVABLE: no (${e.refusal ?? "not removable"})`
              } · ${
                [e.brand, e.model, e.reference].filter(Boolean).join(" ") || "(no name recorded)"
              }`
        )
        .join("\n")
    : "(the room reports nothing on screen right now)";

  /* The room's own orientation, passed from what it renders. The model is
     told explicitly that this — not a database slice — is "here", because
     the failure being repaired was an Assistant confidently describing a
     different working set than the founder's screen. */
  const hereLines = `THIS ROOM RIGHT NOW (passed from the page the founder is looking at):\n${describeContext(
    roomContext
  )}`;

  /* Needs Attention arrives WITH its reasons, computed by the room. The
     model is told to report them rather than infer why a listing is flagged
     from its status word — a model guessing eligibility from a status has
     already been wrong in production once. */
  const byId = new Map(workingSet.map((e) => [e.id, e]));
  const attentionLines = Object.entries(roomContext.attention)
    .map(([id, reasons]) => {
      const e = byId.get(id);
      return `- ${e?.code || id}: ${reasons.join("; ")}`;
    })
    .join("\n");

  const messages = [
    ...turns.slice(-MODEL_TURNS_MAX).map((t) => ({
      role: t.role === "founder" ? ("user" as const) : ("assistant" as const),
      content: t.text,
    })),
    {
      role: "user" as const,
      content:
        (arrival ? `${arrival}\n\n` : "") +
        `${hereLines}\n\nWORKING SET (the records above, re-read from production for this turn):\n${setLines}` +
        (attentionLines ? `\n\nNEEDS ATTENTION — the room's own reasons, not inferred from status:\n${attentionLines}` : "") +
        (roomFacts ? `\n\nGOVERNED REVIEW FACTS (re-read from production this turn):\n${roomFacts}` : "") +
        `\n\nROOM-NATIVE QUESTION this room exists to answer: ${ROOM_SPEC[room].nativeQuestion}` +
        `\n\nFOUNDER: ${founderText}`,
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
        /* Identity and room knowledge first, then the room's narrow
           capability contract. Both halves are room-derived, so a new room
           gets a truthful self-description without anyone remembering to
           write one. */
        system: `${selfDescription(room)}\n\n---\n\n${
          room === "marketplace_control"
            ? MARKETPLACE_PROMPT
            : room === "dealer_accelerator"
              ? DEALER_PROMPT
              : room === "watch_passport"
                ? PASSPORT_PROMPT
                : REVIEW_PROMPT
        }`,
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

    /* ── A malformed envelope must not cost the founder his turn ──────────
       The room speaks JSON so that a PROPOSAL can never be improvised — the
       plan is resolved server-side from named codes, never from prose. But
       when the model answers a plain question in plain words, the parse
       throws and the founder gets "could not process that" for saying
       hello. That happened live, caused by an instruction to answer
       directly colliding with the envelope contract.

       So: unparseable output degrades to a REPLY ONLY. The words reach the
       founder; the proposal fields stay empty, which is the safe direction —
       a turn we could not parse can never carry a plan, and therefore can
       never lead to an execution. Nothing is lost except the ability to
       propose, which unparsed output was never entitled to. */
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(clean);
    } catch {
      const salvaged = clean.slice(0, MESSAGE_MAX).trim();
      if (!salvaged) return null;
      console.warn("[assistant] non-JSON model turn salvaged as reply-only");
      return { reply: salvaged, proposeApprove: [], proposeRemove: null };
    }

    const parsed = parsedRaw as {
      reply?: unknown;
      propose_approve?: unknown;
      propose_remove?: unknown;
    };

    const reply =
      typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, MESSAGE_MAX) : "";
    if (!reply) return null;

    const proposeApprove = Array.isArray(parsed.propose_approve)
      ? parsed.propose_approve.filter((c): c is string => typeof c === "string")
      : [];

    let proposeRemove: ModelOut["proposeRemove"] = null;
    if (
      parsed.propose_remove &&
      typeof parsed.propose_remove === "object" &&
      !Array.isArray(parsed.propose_remove)
    ) {
      const pr = parsed.propose_remove as {
        code?: unknown;
        reason_code?: unknown;
        reason_note?: unknown;
      };
      if (typeof pr.code === "string" && pr.code.trim()) {
        proposeRemove = {
          code: pr.code.trim(),
          /* An off-vocabulary reason becomes no reason. The Assistant may
             carry the founder's words; it may not mint a governed code. */
          reason_code:
            typeof pr.reason_code === "string" &&
            (REASON_CODES as readonly string[]).includes(pr.reason_code)
              ? pr.reason_code
              : null,
          reason_note:
            typeof pr.reason_note === "string" && pr.reason_note.trim()
              ? pr.reason_note.trim().slice(0, 320)
              : null,
        };
      }
    }

    return { reply, proposeApprove, proposeRemove };
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
   GET — resume. Returns the room's latest open session, with any pending
   plan REVALIDATED against production. The report is built from that
   re-read, never from anything the session remembered.
   ════════════════════════════════════════════════════════════════════════ */
export async function GET(request: NextRequest) {
  const gate = await gateFounder();
  if (!gate.ok) return gate.res;

  const resolved = resolveRoom(request.nextUrl.searchParams.get("room"));
  if (resolved.state !== "ok") return roomRefusal(resolved);
  const room = resolved.room;

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
    .eq("room", room)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  /* The founder's live work, offered for DELIBERATE selection. Returning the
     list is not resuming anything: nothing here is auto-attached, because
     entering a room is navigation and navigation does not move work. */
  const liveThreads = await listLiveThreads(service, gate.uid);
  const threadSurface = await Promise.all(
    liveThreads.map(async (t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      origin_room: t.origin_room,
      current_room: t.current_room,
      last_activity_at: t.last_activity_at,
      open_loops: (await openLoops(service, t.id, true)).length,
      anchors: (await threadAnchors(service, t.id)).length,
      needs_reorientation: needsReorientation(t),
    }))
  );

  if (!session) {
    return NextResponse.json({
      session: null,
      room,
      native_question: ROOM_SPEC[room].nativeQuestion,
      threads: threadSurface,
    });
  }

  const ctx = contextOf(session.context);
  const plan = ctx.pending_plan ?? null;

  let resumeReport =
    "Session resumed. The room is re-read from production on every turn — nothing here is remembered state.";
  let planPreview: RemovePreview | null = null;
  let planConsequences: string[] = [];

  if (plan && plan.items.length > 0) {
    const { data: rows } = await service
      .from("listings")
      .select("id, status")
      .in(
        "id",
        plan.items.map((i) => i.listing_id)
      );
    const byId = new Map((rows ?? []).map((r) => [r.id as string, r.status as string]));

    if (plan.operation === "remove_listing") {
      const item = plan.items[0];
      const now = byId.get(item.listing_id);
      /* Recomputed, not replayed: the consequence lines a resumed session
         shows are produced by a fresh call to the governed preview. */
      planPreview = await readRemovePreview(service, item.listing_id);
      if (planPreview) planConsequences = removeConsequenceLines(planPreview);
      const line = !now
        ? `· ${item.code} — no longer exists.`
        : planPreview && !planPreview.removable
          ? `· ${item.code} — the room changed underneath the plan: ${removeRefusalSentence(planPreview)}`
          : `· ${item.code} — still on the market (${now}), ready to take off.`;
      resumeReport += `\nA removal is pending confirmation:\n${line}`;
    } else {
      const lines = plan.items.map((i) => {
        const now = byId.get(i.listing_id);
        if (now === "pending_review") return `· ${i.code} — still awaiting review.`;
        if (!now) return `· ${i.code} — no longer exists.`;
        return `· ${i.code} — the room changed underneath the plan: status is now "${now}".`;
      });
      resumeReport += `\nA plan is pending confirmation:\n${lines.join("\n")}`;
    }
  }

  return NextResponse.json({
    room,
    native_question: ROOM_SPEC[room].nativeQuestion,
    threads: threadSurface,
    session: {
      id: session.id,
      messages: turnsOf(ctx).slice(-STORED_TURNS_MAX),
      pending_plan: plan,
      plan_preview: planPreview,
      plan_consequences: planConsequences,
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
    room?: unknown;
    session_id?: unknown;
    listing_id?: unknown;
    text?: unknown;
    plan_id?: unknown;
    /* Round H: the room passes what the founder is looking at. There is no
       server-side path that can build this. */
    room_context?: unknown;
    /* Thread selection is always explicit — never inferred from recency. */
    thread_id?: unknown;
    title?: unknown;
    intent?: unknown;
    to_room?: unknown;
    reason?: unknown;
    loop_id?: unknown;
    obligation_type?: unknown;
    disposition?: unknown;
    loop_state?: unknown;
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
  /* Resolved before the trusted client is even created, so no refusal path
     can touch a session. */
  const resolved = resolveRoom(body.room);
  if (resolved.state !== "ok") return roomRefusal(resolved);
  const room = resolved.room;
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

  /* ── load the founder's open session, scoped to this room ───────────── */
  async function loadSession(id: string) {
    const { data } = await service
      .from("assistant_work_sessions")
      .select("id, context, status, room")
      .eq("id", id)
      .eq("owner_uid", gate.ok ? gate.uid : "")
      .eq("room", room)
      .eq("status", "open")
      .maybeSingle();
    return data ?? null;
  }

  /* ═════ OPERATIONAL THREAD CONTROL ════════════════════════════════════
     Start / resume / switch / pause / close, all deliberate. Nothing here
     selects a thread on the founder's behalf, and none of these actions
     touches product state — they move the WORK, not the watches. */

  if (action === "thread_list") {
    const threads = await listLiveThreads(service, gate.uid);
    const withLoops = await Promise.all(
      threads.map(async (t) => ({
        ...t,
        open_loops: (await openLoops(service, t.id, true)).length,
        anchors: (await threadAnchors(service, t.id)).length,
        needs_reorientation: needsReorientation(t),
      }))
    );
    return NextResponse.json({ room, threads: withLoops });
  }

  if (action === "thread_start") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { error: "bad_request", detail: "Give this work a short name so you can find it later." },
        { status: 400 }
      );
    }
    const intent = typeof body.intent === "string" ? body.intent : null;
    const t = await startThread(service, { ownerUid: gate.uid, room, title, intent });
    if (!t) {
      return NextResponse.json(
        { error: "thread_failed", detail: "That thread could not be started. Nothing was changed." },
        { status: 500 }
      );
    }
    return NextResponse.json({ room, thread: t });
  }

  if (action === "thread_resume") {
    const id = typeof body.thread_id === "string" ? body.thread_id : "";
    if (!id) {
      return NextResponse.json({ error: "bad_request", detail: "thread_id is required." }, { status: 400 });
    }
    const switchedFrom = typeof body.session_id === "string" ? null : null;
    const t = await activateThread(service, {
      ownerUid: gate.uid,
      threadId: id,
      room,
      switchedFrom,
    });
    if (!t) {
      return NextResponse.json(
        {
          error: "thread_not_resumable",
          detail:
            "That thread could not be resumed here — it may be closed. Nothing else was started in its place.",
        },
        { status: 409 }
      );
    }
    const anchors = await threadAnchors(service, t.id);
    const loops = await openLoops(service, t.id, true);
    return NextResponse.json({
      room,
      thread: t,
      anchors,
      open_loops: loops,
      reorientation: needsReorientation(t) ? reorientationSentence(t) : null,
    });
  }

  if (action === "thread_pause") {
    const id = typeof body.thread_id === "string" ? body.thread_id : "";
    if (!id) {
      return NextResponse.json({ error: "bad_request", detail: "thread_id is required." }, { status: 400 });
    }
    const ok = await pauseThread(service, gate.uid, id);
    return ok
      ? NextResponse.json({ room, paused: true })
      : NextResponse.json({ error: "pause_failed", detail: "That thread could not be paused." }, { status: 500 });
  }

  if (action === "thread_close") {
    const id = typeof body.thread_id === "string" ? body.thread_id : "";
    if (!id) {
      return NextResponse.json({ error: "bad_request", detail: "thread_id is required." }, { status: 400 });
    }
    const res = await closeThread(service, gate.uid, id);
    if (res.state === "BLOCKED_BY_OPEN_LOOPS") {
      return NextResponse.json(
        { error: "open_loops_block_closure", detail: res.sentence, open_loops: res.loops },
        { status: 409 }
      );
    }
    if (res.state === "FAILED") {
      return NextResponse.json({ error: "close_failed", detail: res.detail }, { status: 500 });
    }
    return NextResponse.json({ room, closed: true });
  }

  if (action === "thread_handoff") {
    const id = typeof body.thread_id === "string" ? body.thread_id : "";
    const to = typeof body.to_room === "string" ? body.to_room : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!id || !to || !reason) {
      return NextResponse.json(
        { error: "bad_request", detail: "thread_id, to_room and reason are required." },
        { status: 400 }
      );
    }
    const res = await handoffThread(service, {
      ownerUid: gate.uid,
      threadId: id,
      from: room,
      to: to as never,
      reason,
    });
    if (res.state !== "HANDED_OFF") {
      return NextResponse.json(
        { error: res.state.toLowerCase(), detail: res.sentence, work_preserved: true },
        { status: res.state === "DESTINATION_UNSUPPORTED" ? 501 : 500 }
      );
    }
    return NextResponse.json({ room, thread: res.thread, handed_off_to: to });
  }

  if (action === "loop_create") {
    const id = typeof body.thread_id === "string" ? body.thread_id : "";
    const obligation = typeof body.obligation_type === "string" ? body.obligation_type.trim() : "";
    if (!id || !obligation) {
      return NextResponse.json(
        { error: "bad_request", detail: "thread_id and obligation_type are required." },
        { status: 400 }
      );
    }
    const loop = await createOpenLoop(service, {
      ownerUid: gate.uid,
      threadId: id,
      obligationType: obligation,
      intent: typeof body.intent === "string" ? body.intent : null,
      room,
    });
    return loop
      ? NextResponse.json({ room, open_loop: loop })
      : NextResponse.json({ error: "loop_failed", detail: "That obligation could not be recorded." }, { status: 500 });
  }

  if (action === "loop_dispose") {
    const id = typeof body.thread_id === "string" ? body.thread_id : "";
    const loopId = typeof body.loop_id === "string" ? body.loop_id : "";
    const state = body.loop_state === "DISMISSED" ? "DISMISSED" : "RESOLVED";
    const disposition = typeof body.disposition === "string" ? body.disposition.trim() : "";
    if (!id || !loopId || !disposition) {
      return NextResponse.json(
        {
          error: "bad_request",
          detail:
            "thread_id, loop_id and a disposition are required — an obligation is never closed without saying why.",
        },
        { status: 400 }
      );
    }
    const ok = await disposeOpenLoop(service, {
      ownerUid: gate.uid,
      threadId: id,
      loopId,
      state,
      disposition,
    });
    return ok
      ? NextResponse.json({ room, disposed: true, state })
      : NextResponse.json(
          { error: "dispose_failed", detail: "That obligation could not be dispositioned." },
          { status: 500 }
        );
  }

  if (action === "anchor_add") {
    const id = typeof body.thread_id === "string" ? body.thread_id : "";
    const objectId = typeof body.listing_id === "string" ? body.listing_id : "";
    if (!id || !objectId) {
      return NextResponse.json(
        { error: "bad_request", detail: "thread_id and listing_id are required." },
        { status: 400 }
      );
    }
    const anchor = await addAnchor(service, {
      ownerUid: gate.uid,
      threadId: id,
      objectType: "listing",
      objectId,
      room,
    });
    return anchor
      ? NextResponse.json({ room, anchor })
      : NextResponse.json({ error: "anchor_failed", detail: "That object could not be anchored." }, { status: 500 });
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
    /* ── ROUND H: "here" comes from the room, or the turn refuses ──────── */
    const ctxResolution = resolveRoomContext(body.room_context, room);
    if (ctxResolution.state !== "ok") {
      return NextResponse.json(
        {
          error: "missing_room_context",
          detail: ctxResolution.sentence,
          diagnostic: ctxResolution.detail,
          work_preserved: true,
        },
        { status: 400 }
      );
    }
    const roomContext = ctxResolution.context;
    const openListingId = roomContext.selectedId;

    /* ── Thread: chosen, never inferred ─────────────────────────────────
       A thread participates in this turn only because the founder selected
       it or handed work here. Absence of a thread is an ordinary turn, not
       a reason to resurrect the most recent one. */
    const requestedThreadId =
      typeof body.thread_id === "string" && body.thread_id ? body.thread_id : null;
    const thread: OperationalThread | null = requestedThreadId
      ? await getThread(service, gate.uid, requestedThreadId)
      : null;
    if (requestedThreadId && !thread) {
      return NextResponse.json(
        {
          error: "thread_not_found",
          detail:
            "That operational thread could not be read, so I haven't started a different one in its place. Nothing was changed.",
        },
        { status: 404 }
      );
    }

    let session = sessionId ? await loadSession(sessionId) : null;
    if (!session) {
      const { data: created, error: createErr } = await service
        .from("assistant_work_sessions")
        .insert({ owner_uid: gate.uid, room })
        .select("id, context, status, room")
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

    /* ── ROUND I: authoritative reread, or refusal ──────────────────────
       A failed reread never degrades into thread memory, prior turns, or
       cached labels. The model is not called at all, so it cannot narrate a
       current-state answer the product could not verify.

       Rooms whose subject is not a listing skip the listings reread
       entirely — sending a bead id to the listings table would report the
       founder's own record as missing. */
    const reread: Reread<WorkingEntry[]> =
      ROOM_SUBJECT[room] === "listing"
        ? await readWorkingSet(service, room, roomContext)
        : { state: "OK", value: [] };
    if (reread.state === "COULD_NOT_VERIFY") {
      const now = new Date().toISOString();
      const nextCtx: SessionContext = {
        messages: [
          ...turns,
          { role: "founder" as const, text, at: now },
          { role: "assistant" as const, text: reread.sentence, at: now },
        ].slice(-STORED_TURNS_MAX),
        pending_plan: ctx.pending_plan ?? null,
      };
      await saveContext(service, session.id as string, nextCtx);
      return NextResponse.json({
        session_id: session.id,
        room,
        thread_id: thread?.id ?? null,
        reply: reread.sentence,
        current_truth: "COULD_NOT_VERIFY",
        failed_source: reread.source,
        plan: null,
        preview: null,
        consequences: [],
      });
    }
    const workingSet = reread.value;

    /* Founder Review's room-native question is "what is blocking this listing
       from a decision?", which identity and status cannot answer. These are
       the governed sources that can, and they fail closed with the same
       refusal rather than letting a half-loaded picture read as a clear one. */
    let roomFacts: string | null = null;
    if (room === "founder_review" && openListingId) {
      const facts = await readReviewFacts(service, openListingId);
      if (facts.state === "COULD_NOT_VERIFY") {
        const now = new Date().toISOString();
        await saveContext(service, session.id as string, {
          messages: [
            ...turns,
            { role: "founder" as const, text, at: now },
            { role: "assistant" as const, text: facts.sentence, at: now },
          ].slice(-STORED_TURNS_MAX),
          pending_plan: ctx.pending_plan ?? null,
        });
        return NextResponse.json({
          session_id: session.id,
          room,
          thread_id: thread?.id ?? null,
          reply: facts.sentence,
          current_truth: "COULD_NOT_VERIFY",
          failed_source: facts.source,
          plan: null,
          preview: null,
          consequences: [],
        });
      }
      roomFacts = describeReviewFacts(facts.value);
    }

    /* Watch Passport: the reread IS the projection, recomposed this turn. */
    if (room === "watch_passport") {
      const beadId = roomContext.selectedId ?? roomContext.visibleIds[0] ?? null;
      if (!beadId) {
        return NextResponse.json(
          {
            error: "missing_room_context",
            detail:
              "This page didn't tell me which watch record it is showing, so I'm not going to answer about one.",
            work_preserved: true,
          },
          { status: 400 }
        );
      }
      const facts = await readPassportFacts(beadId);
      if (facts.state === "COULD_NOT_VERIFY") {
        const now = new Date().toISOString();
        await saveContext(service, session.id as string, {
          messages: [
            ...turns,
            { role: "founder" as const, text, at: now },
            { role: "assistant" as const, text: facts.sentence, at: now },
          ].slice(-STORED_TURNS_MAX),
          pending_plan: ctx.pending_plan ?? null,
        });
        return NextResponse.json({
          session_id: session.id,
          room,
          thread_id: thread?.id ?? null,
          reply: facts.sentence,
          current_truth: "COULD_NOT_VERIFY",
          failed_source: facts.source,
          plan: null,
          preview: null,
          consequences: [],
        });
      }
      roomFacts = facts.value;
    }

    /* Arrival Contract: when work has just been handed into this room, the
       first substantive response names where it came from, what it carried,
       why, and whether current truth still supports that reason. */
    let arrival: string | null = null;
    if (thread) {
      const anchors = await threadAnchors(service, thread.id);
      const loops = await openLoops(service, thread.id, true);
      arrival = buildArrivalNote(thread, room, anchors, loops, workingSet);
      if (needsReorientation(thread)) {
        arrival = `${reorientationSentence(thread)}\n${arrival}`;
      }
    }

    const modelOut = await callModel(room, turns, workingSet, text, roomContext, arrival, roomFacts);
    if (!modelOut) {
      // Nothing is stored and nothing executes on a failed turn.
      return NextResponse.json(
        {
          error: "assistant_unavailable",
          detail:
            "The Assistant could not process that. Nothing was recorded or executed — try again.",
        },
        { status: 502 }
      );
    }

    const byCode = new Map(
      workingSet.filter((e) => e.code).map((e) => [e.code.toUpperCase(), e])
    );

    let reply = modelOut.reply;
    let pendingPlan: PendingPlan | null = ctx.pending_plan ?? null;
    let preview: RemovePreview | null = null;
    let consequences: string[] = [];

    if (!OPERATION_FOR_ROOM[room]) {
      /* Tier A: no plan can form here, whatever the model returned. The
         prompt already says so; this makes it true even if it did not. */
      pendingPlan = null;
      if (modelOut.proposeApprove.length > 0 || modelOut.proposeRemove) {
        reply += `\n(${ROOM_LABEL[room]} performs no governed action, so nothing was proposed. That decision belongs in Founder Review.)`;
      }
    } else if (room === "marketplace_control") {
      /* ── SINGLE SELECTED LISTING, RESOLVED SERVER-SIDE ────────────────
         The model's code is interpreted, never obeyed: it must resolve to
         the listing the founder actually has selected, and the governed
         preview must agree that it is removable. A proposal naming anything
         else is dropped with the reason said out loud. */
      const proposal = modelOut.proposeRemove;
      if (proposal) {
        const entry = byCode.get(proposal.code.toUpperCase());
        if (!entry) {
          reply += `\n(I could not match "${proposal.code}" to a listing in this room, so nothing is proposed.)`;
        } else if (!openListingId || entry.id !== openListingId) {
          reply += `\n(${entry.code} is not the listing you have selected. Select it first — I can only act on the selected listing.)`;
        } else {
          const p = await readRemovePreview(service, entry.id);
          if (!p) {
            reply += `\n(I could not read the removal consequences for ${entry.code}, so nothing is proposed.)`;
          } else if (!p.removable) {
            reply += `\n(${removeRefusalSentence(p)})`;
          } else {
            preview = p;
            consequences = removeConsequenceLines(p);
            pendingPlan = {
              id: randomUUID(),
              operation: "remove_listing",
              items: [
                {
                  listing_id: entry.id,
                  code: entry.code,
                  brand: entry.brand,
                  model: entry.model,
                  reference: entry.reference,
                },
              ],
              reason_code: proposal.reason_code,
              reason_note: proposal.reason_note,
              created_at: new Date().toISOString(),
            };
          }
        }
      }
    } else {
      /* ── FOUNDER REVIEW: N approvals, each resolved against the set ──── */
      const resolved: PlanItem[] = [];
      const dropped: string[] = [];
      for (const rawCode of modelOut.proposeApprove) {
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
      if (dropped.length > 0) {
        reply += `\n(Not currently approvable from the working set, so not in any plan: ${dropped.join(", ")}.)`;
      }
      if (resolved.length > 0) {
        pendingPlan = {
          id: randomUUID(),
          operation: "approve_listings",
          items: resolved,
          created_at: new Date().toISOString(),
        };
      }
    }

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
        {
          error: "session_failed",
          detail: "The turn could not be recorded. Nothing was executed.",
        },
        { status: 500 }
      );
    }

    /* The thread's activity clock advances because the founder worked it,
       not because a page rendered. Anchoring the selected listing keeps the
       object identity with the work as it moves rooms. */
    if (thread) {
      if (openListingId) {
        await addAnchor(service, {
          ownerUid: gate.uid,
          threadId: thread.id,
          objectType: "listing",
          objectId: openListingId,
          room,
        });
      }
      await service
        .from("assistant_operational_threads")
        .update({ last_activity_at: new Date().toISOString(), current_room: room })
        .eq("id", thread.id)
        .eq("owner_uid", gate.uid);
    }

    return NextResponse.json({
      session_id: session.id,
      room,
      thread_id: thread?.id ?? null,
      current_truth: "VERIFIED",
      reply,
      plan: pendingPlan,
      preview,
      consequences,
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
    /* A Tier A room cannot confirm anything. This is the structural half of
       the refusal PA-01 Step 1 exercises: even if a prompt were coaxed into
       proposing a mutation here, there is no operation for this room to
       confirm and execution is unreachable. */
    if (!OPERATION_FOR_ROOM[room]) {
      return NextResponse.json(
        {
          error: "room_has_no_governed_action",
          detail:
            `${ROOM_LABEL[room]} can see and explain this work, but it performs no governed action. ` +
            "Nothing was executed. The decision belongs in Founder Review — I can carry this work there with everything it is holding.",
          suggested_handoff: "founder_review",
        },
        { status: 409 }
      );
    }
    if (OPERATION_FOR_ROOM[room] !== plan.operation) {
      return NextResponse.json(
        {
          error: "wrong_room",
          detail: `A ${plan.operation} plan cannot be confirmed from ${room}.`,
        },
        { status: 409 }
      );
    }

    /* ── ROUND G: the replay gate ────────────────────────────────────────
       The plan id IS the correlation id. Before any governed machinery is
       touched, ask what the product already knows about this exact
       operation. Both refusal outcomes below happen BEFORE execution, so a
       double confirmation cannot become a double mutation. */
    const correlationId = plan.id;
    const confirmThreadId =
      typeof body.thread_id === "string" && body.thread_id ? body.thread_id : null;

    const { data: priorReceipt } = await service
      .from("assistant_operation_receipts")
      .select("id, created_at, succeeded_listing_ids")
      .eq("correlation_id", correlationId)
      .maybeSingle();

    const { data: priorMarker } = await service
      .from("assistant_unreceipted_operations")
      .select("correlation_id, operation, succeeded_listing_ids, executed_at, receipt_error")
      .eq("correlation_id", correlationId)
      .eq("state", "OPEN")
      .maybeSingle();

    const gateDecision = decideExecution({
      existingReceipt: (priorReceipt as ExistingReceipt) ?? null,
      openMarker: (priorMarker as OpenMarker) ?? null,
    });

    if (gateDecision.state === "ALREADY_EXECUTED") {
      return NextResponse.json({
        session_id: session.id,
        room,
        reply: gateDecision.sentence,
        replay_refused: true,
        receipt_id: gateDecision.receiptId,
        results: { succeeded: [], failed: [] },
      });
    }

    if (gateDecision.state === "AWAITING_RECEIPT_RECONCILIATION") {
      /* MINIMUM RETRY LAW: re-read current governed state before deciding
         anything. The action already happened; what is missing is only its
         record, so the legal repair is a receipt write, never a re-run. */
      const { data: currentRows } = await service
        .from("listings")
        .select("id, status")
        .in("id", plan.items.map((i) => i.listing_id));
      const currentById = new Map(
        (currentRows ?? []).map((r) => [r.id as string, r.status as string])
      );

      const { data: repaired, error: repairErr } = await service
        .from("assistant_operation_receipts")
        .insert({
          session_id: session.id,
          operation: plan.operation,
          authorized_by: gate.uid,
          correlation_id: correlationId,
          requested_listing_ids: plan.items.map((i) => i.listing_id),
          succeeded_listing_ids: gateDecision.marker.succeeded_listing_ids,
          failed_listings: [],
        })
        .select("id")
        .maybeSingle();

      let reply = gateDecision.sentence;
      if (!repairErr && repaired?.id) {
        await service
          .from("assistant_unreceipted_operations")
          .update({
            state: "RECONCILED",
            reconciled_at: new Date().toISOString(),
            reconciled_receipt_id: repaired.id,
          })
          .eq("correlation_id", correlationId)
          .eq("state", "OPEN");
        if (confirmThreadId) {
          await recordEvent(service, {
            threadId: confirmThreadId,
            type: "RECEIPT_RECONCILED",
            actorUid: gate.uid,
            detail: { correlation_id: correlationId, receipt_id: repaired.id },
          });
        }
        reply = `${reconciledSentence(repaired.id)}\nCurrent status now: ${plan.items
          .map((i) => `${i.code} — ${currentById.get(i.listing_id) ?? "no longer present"}`)
          .join("; ")}`;
      }

      return NextResponse.json({
        session_id: session.id,
        room,
        reply,
        replay_refused: true,
        reconciled: !repairErr && !!repaired?.id,
        receipt_id: repaired?.id ?? null,
        results: { succeeded: [], failed: [] },
      });
    }

    const succeeded: { listing_id: string; code: string; status: string }[] = [];
    const failed: { listing_id: string; code: string; error: string; detail: string }[] = [];

    if (plan.operation === "remove_listing") {
      /* ── ONE listing, one governed call, through the service-role-only
            entry point. The browser cannot reach this function; that grant
            is what makes executed_via='assistant' unforgeable. ── */
      const item = plan.items[0];
      const fresh = await readRemovePreview(service, item.listing_id);
      if (!fresh) {
        failed.push({
          listing_id: item.listing_id,
          code: item.code,
          error: "not_found",
          detail: "The listing could not be read — nothing was changed.",
        });
      } else if (!fresh.removable) {
        failed.push({
          listing_id: item.listing_id,
          code: item.code,
          error: fresh.refusal ?? "not_removable",
          detail: removeRefusalSentence(fresh),
        });
      } else {
        const { data, error } = await service.rpc("remove_listing_assistant", {
          p_listing_id: item.listing_id,
          p_reason_code: plan.reason_code ?? null,
          p_reason_note: plan.reason_note ?? null,
          p_authorized_by: gate.uid,
        });
        if (error) {
          failed.push({
            listing_id: item.listing_id,
            code: item.code,
            error: "remove_failed",
            detail: error.message,
          });
        } else {
          const committed = (data as { status?: string } | null) ?? {};
          succeeded.push({
            listing_id: item.listing_id,
            code: item.code,
            status: String(committed.status ?? "removed"),
          });
          /* Bells derive from committed events and are never allowed to
             turn a completed removal into a failure — the same posture the
             direct remove route takes. */
          try {
            await service.rpc("emit_listing_removal_notifications", {
              p_listing_id: item.listing_id,
            });
          } catch (e) {
            console.error("[assistant] removal bells deferred:", item.listing_id, e);
          }
        }
      }
    } else {
      /* ── FOUNDER REVIEW approvals, unchanged from V1 ─────────────────── */
      const { data: rows } = await service
        .from("listings")
        .select("id, status")
        .in(
          "id",
          plan.items.map((i) => i.listing_id)
        );
      const statusById = new Map((rows ?? []).map((r) => [r.id as string, r.status as string]));

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
    }

    /* The receipt — append-only, IDs stored, counts always derived. */
    const { data: receipt, error: receiptErr } = await service
      .from("assistant_operation_receipts")
      .insert({
        session_id: session.id,
        operation: plan.operation,
        authorized_by: gate.uid,
        correlation_id: correlationId,
        requested_listing_ids: plan.items.map((i) => i.listing_id),
        succeeded_listing_ids: succeeded.map((s) => s.listing_id),
        failed_listings: failed,
      })
      .select("id")
      .maybeSingle();

    /* ── The known unknown ───────────────────────────────────────────────
       The mutation is already done at this point. If its record could not be
       written, that fact is persisted so the founder does not have to carry
       it — and so the next confirmation of this same plan hits the replay
       gate above and repairs the receipt instead of acting again. */
    let unreceipted = false;
    if (receiptErr) {
      console.error("[assistant] receipt insert failed:", receiptErr.message);
      if (succeeded.length > 0) {
        unreceipted = true;
        const { error: markerErr } = await service
          .from("assistant_unreceipted_operations")
          .insert({
            correlation_id: correlationId,
            thread_id: confirmThreadId,
            session_id: session.id,
            operation: plan.operation,
            authorized_by: gate.uid,
            succeeded_listing_ids: succeeded.map((s) => s.listing_id),
            receipt_error: receiptErr.message.slice(0, 400),
          });
        if (markerErr) {
          console.error("[assistant] known-unknown marker failed:", markerErr.message);
        } else if (confirmThreadId) {
          await recordEvent(service, {
            threadId: confirmThreadId,
            type: "UNRECEIPTED_OPERATION",
            actorUid: gate.uid,
            detail: {
              correlation_id: correlationId,
              operation: plan.operation,
              succeeded: succeeded.length,
            },
          });
        }
      }
    }

    /* The account is composed HERE from what actually happened — never by
       the model, so it cannot narrate an execution that did not occur. */
    const lines: string[] = [];
    if (plan.operation === "remove_listing") {
      for (const s of succeeded) {
        lines.push(
          `✓ ${s.code} — taken off the market. It is reversible: Restore returns it to review for your approval.`
        );
      }
      for (const f of failed) lines.push(`✗ ${f.code} — ${f.detail}`);
    } else {
      for (const s of succeeded) {
        lines.push(
          s.status === "private_active"
            ? `✓ ${s.code} — approved and released privately to its authorized buyer.`
            : `✓ ${s.code} — approved and published.`
        );
      }
      for (const f of failed) lines.push(`✗ ${f.code} — ${f.detail}`);
    }
    lines.push(
      receipt?.id
        ? `Receipt ${receipt.id}.`
        : unreceipted
          ? unreceiptedSentence(succeeded.length, failed.length)
          : "The receipt could not be written. Nothing succeeded, so there is no completed action missing a record."
    );
    const verb = plan.operation === "remove_listing" ? "remove_listing" : "approve_listings";
    const account = `Executed ${verb} on ${plan.items.length} listing(s): ${succeeded.length} succeeded, ${failed.length} did not.\n${lines.join("\n")}`;

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
      room,
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
      detail:
        "action must be one of: message, confirm, cancel_plan, close, thread_list, thread_start, " +
        "thread_resume, thread_pause, thread_close, thread_handoff, loop_create, loop_dispose, anchor_add.",
    },
    { status: 400 }
  );
}
