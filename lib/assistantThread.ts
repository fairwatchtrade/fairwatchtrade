import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isRequiredEdge,
  ROOM_LABEL,
  type ArchitectureRoom,
  type ImplementedRoom,
} from "@/lib/assistantRooms";

/* ────────────────────────────────────────────────────────────────────────
   OPERATIONAL THREAD — server operations

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Entering a room should pick up where I left off."

   It must not, and that is the single most important behaviour here.
   Ordinary navigation is not an operational handoff. Walking into a room
   does not resurrect the last thread because the same founder owns it,
   because the room contains a related object, or because that thread was
   recently active. Continuity is carried ONLY by an explicit act: a
   thread-aware handoff, or a deliberate selection from the thread surface.

   > Navigation changes pages. Operational handoff moves work.

   Nothing in this module selects a thread on the founder's behalf. Every
   function that operates on a thread requires its id to have been chosen.

   ── WHAT A THREAD MAY AND MAY NOT REMEMBER ──────────────────────────────

   Intent and obligation, never product state. `operational_intent` may say
   "determine whether the identity blocker can be resolved"; it may never say
   "these two serials are still conflicting", because that is a mutable fact
   owned by another system and re-read every turn.

   ── HISTORY IS NOT RECEIPTS ─────────────────────────────────────────────

   Everything written here lands in assistant_thread_events, which proves
   what the founder was DOING. Governed product mutations write
   assistant_operation_receipts, which prove what HAPPENED. Two tables, two
   questions, deliberately never merged.
   ──────────────────────────────────────────────────────────────────────── */

type Service = SupabaseClient;

export type ThreadStatus = "ACTIVE" | "PAUSED" | "COMPLETE";

export type OperationalThread = {
  id: string;
  owner_uid: string;
  status: ThreadStatus;
  title: string | null;
  operational_intent: string | null;
  origin_room: string;
  current_room: string | null;
  created_at: string;
  last_activity_at: string;
  completed_at: string | null;
};

export type ThreadAnchor = {
  id: string;
  thread_id: string;
  object_type: string;
  object_id: string;
  source_room: string | null;
  added_at: string;
};

export type OpenLoop = {
  id: string;
  thread_id: string;
  obligation_type: string;
  founder_intent: string | null;
  source_room: string;
  state: "OPEN" | "RESOLVED" | "DISMISSED";
  created_at: string;
  disposed_at: string | null;
  disposition: string | null;
};

export type ThreadEventType =
  | "THREAD_CREATED"
  | "THREAD_ACTIVATED"
  | "THREAD_PAUSED"
  | "THREAD_COMPLETED"
  | "THREAD_SWITCHED"
  | "ROOM_HANDOFF"
  | "ROOM_HANDOFF_FAILED"
  | "ANCHOR_ADDED"
  | "ANCHOR_REMOVED"
  | "RELATION_ADDED"
  | "RELATION_REMOVED"
  | "OPEN_LOOP_CREATED"
  | "OPEN_LOOP_RESOLVED"
  | "OPEN_LOOP_DISMISSED"
  | "OPEN_LOOP_CARRIED_FORWARD"
  | "UNRECEIPTED_OPERATION"
  | "RECEIPT_RECONCILED";

const THREAD_COLS =
  "id, owner_uid, status, title, operational_intent, origin_room, current_room, created_at, last_activity_at, completed_at";

/* ── history ─────────────────────────────────────────────────────────── */

export async function recordEvent(
  service: Service,
  input: {
    threadId: string;
    type: ThreadEventType;
    actorUid: string;
    fromRoom?: string | null;
    toRoom?: string | null;
    reasonForMoving?: string | null;
    detail?: Record<string, unknown>;
  }
): Promise<boolean> {
  const { error } = await service.from("assistant_thread_events").insert({
    thread_id: input.threadId,
    event_type: input.type,
    actor_uid: input.actorUid,
    from_room: input.fromRoom ?? null,
    to_room: input.toRoom ?? null,
    reason_for_moving: input.reasonForMoving ?? null,
    detail: input.detail ?? {},
  });
  if (error) console.error("[assistant] thread event failed:", input.type, error.message);
  return !error;
}

/* ── reads ───────────────────────────────────────────────────────────── */

/** Threads the founder may deliberately choose. Never auto-selected. */
export async function listLiveThreads(
  service: Service,
  ownerUid: string
): Promise<OperationalThread[]> {
  const { data, error } = await service
    .from("assistant_operational_threads")
    .select(THREAD_COLS)
    .eq("owner_uid", ownerUid)
    .in("status", ["ACTIVE", "PAUSED"])
    .order("last_activity_at", { ascending: false })
    .limit(50);
  return error ? [] : ((data as OperationalThread[] | null) ?? []);
}

export async function getThread(
  service: Service,
  ownerUid: string,
  threadId: string
): Promise<OperationalThread | null> {
  const { data, error } = await service
    .from("assistant_operational_threads")
    .select(THREAD_COLS)
    .eq("id", threadId)
    .eq("owner_uid", ownerUid)
    .maybeSingle();
  return error ? null : ((data as OperationalThread | null) ?? null);
}

export async function threadAnchors(
  service: Service,
  threadId: string
): Promise<ThreadAnchor[]> {
  const { data, error } = await service
    .from("assistant_thread_anchors")
    .select("id, thread_id, object_type, object_id, source_room, added_at")
    .eq("thread_id", threadId)
    .is("removed_at", null)
    .order("added_at", { ascending: true });
  return error ? [] : ((data as ThreadAnchor[] | null) ?? []);
}

export async function openLoops(
  service: Service,
  threadId: string,
  onlyOpen = true
): Promise<OpenLoop[]> {
  let q = service
    .from("assistant_open_loops")
    .select(
      "id, thread_id, obligation_type, founder_intent, source_room, state, created_at, disposed_at, disposition"
    )
    .eq("thread_id", threadId);
  if (onlyOpen) q = q.eq("state", "OPEN");
  const { data, error } = await q.order("created_at", { ascending: true });
  return error ? [] : ((data as OpenLoop[] | null) ?? []);
}

/* ── lifecycle ───────────────────────────────────────────────────────── */

export async function startThread(
  service: Service,
  input: {
    ownerUid: string;
    room: ImplementedRoom;
    title: string;
    intent?: string | null;
  }
): Promise<OperationalThread | null> {
  const { data, error } = await service
    .from("assistant_operational_threads")
    .insert({
      owner_uid: input.ownerUid,
      origin_room: input.room,
      current_room: input.room,
      title: input.title.trim().slice(0, 160) || "Untitled work",
      operational_intent: input.intent?.trim().slice(0, 600) ?? null,
    })
    .select(THREAD_COLS)
    .maybeSingle();
  if (error || !data) {
    console.error("[assistant] thread create failed:", error?.message);
    return null;
  }
  const t = data as OperationalThread;
  await recordEvent(service, {
    threadId: t.id,
    type: "THREAD_CREATED",
    actorUid: input.ownerUid,
    toRoom: input.room,
    detail: { title: t.title },
  });
  return t;
}

/** Bring a chosen thread into a room. The CHOICE happens before this call. */
export async function activateThread(
  service: Service,
  input: {
    ownerUid: string;
    threadId: string;
    room: ImplementedRoom;
    /** true when the founder switched away from another thread. */
    switchedFrom?: string | null;
  }
): Promise<OperationalThread | null> {
  const existing = await getThread(service, input.ownerUid, input.threadId);
  if (!existing) return null;
  if (existing.status === "COMPLETE") return null;

  const { data, error } = await service
    .from("assistant_operational_threads")
    .update({
      status: "ACTIVE",
      current_room: input.room,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", input.threadId)
    .eq("owner_uid", input.ownerUid)
    .select(THREAD_COLS)
    .maybeSingle();
  if (error || !data) return null;

  await recordEvent(service, {
    threadId: input.threadId,
    type: input.switchedFrom ? "THREAD_SWITCHED" : "THREAD_ACTIVATED",
    actorUid: input.ownerUid,
    fromRoom: existing.current_room,
    toRoom: input.room,
    detail: input.switchedFrom ? { switched_from_thread: input.switchedFrom } : {},
  });
  return data as OperationalThread;
}

export async function pauseThread(
  service: Service,
  ownerUid: string,
  threadId: string
): Promise<boolean> {
  const { error } = await service
    .from("assistant_operational_threads")
    .update({ status: "PAUSED", last_activity_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("owner_uid", ownerUid)
    .neq("status", "COMPLETE");
  if (error) return false;
  await recordEvent(service, { threadId, type: "THREAD_PAUSED", actorUid: ownerUid });
  return true;
}

export type CloseResult =
  | { state: "CLOSED" }
  | { state: "BLOCKED_BY_OPEN_LOOPS"; loops: OpenLoop[]; sentence: string }
  | { state: "FAILED"; detail: string };

/* Closure asks the database, and the database refuses when obligations
   remain. The pre-check exists to produce a human sentence naming the
   obligations — it is not the guard. The guard is the trigger, which is why
   a future writer that forgets this function still cannot lose work. */
export async function closeThread(
  service: Service,
  ownerUid: string,
  threadId: string
): Promise<CloseResult> {
  const remaining = await openLoops(service, threadId, true);
  if (remaining.length > 0) {
    return {
      state: "BLOCKED_BY_OPEN_LOOPS",
      loops: remaining,
      sentence:
        remaining.length === 1
          ? "This thread still has one unresolved obligation. Resolve it, dismiss it, or carry it forward before closing — closing must never quietly discard it."
          : `This thread still has ${remaining.length} unresolved obligations. Resolve, dismiss, or carry each forward before closing — closing must never quietly discard them.`,
    };
  }
  const { error } = await service
    .from("assistant_operational_threads")
    .update({
      status: "COMPLETE",
      completed_at: new Date().toISOString(),
      closed_by: ownerUid,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("owner_uid", ownerUid);
  if (error) {
    return {
      state: "FAILED",
      detail: /unresolved_open_loops/.test(error.message)
        ? "An obligation was added while closing. Nothing was closed."
        : error.message,
    };
  }
  await recordEvent(service, { threadId, type: "THREAD_COMPLETED", actorUid: ownerUid });
  return { state: "CLOSED" };
}

/* ── anchors ─────────────────────────────────────────────────────────── */

export async function addAnchor(
  service: Service,
  input: {
    ownerUid: string;
    threadId: string;
    objectType: string;
    objectId: string;
    room: ImplementedRoom;
  }
): Promise<ThreadAnchor | null> {
  const { data } = await service
    .from("assistant_thread_anchors")
    .select("id, thread_id, object_type, object_id, source_room, added_at")
    .eq("thread_id", input.threadId)
    .eq("object_type", input.objectType)
    .eq("object_id", input.objectId)
    .is("removed_at", null)
    .maybeSingle();
  if (data) return data as ThreadAnchor;

  const { data: created, error } = await service
    .from("assistant_thread_anchors")
    .insert({
      thread_id: input.threadId,
      object_type: input.objectType,
      object_id: input.objectId,
      source_room: input.room,
    })
    .select("id, thread_id, object_type, object_id, source_room, added_at")
    .maybeSingle();
  if (error || !created) return null;
  await recordEvent(service, {
    threadId: input.threadId,
    type: "ANCHOR_ADDED",
    actorUid: input.ownerUid,
    toRoom: input.room,
    detail: { object_type: input.objectType, object_id: input.objectId },
  });
  return created as ThreadAnchor;
}

/* ── open loops ──────────────────────────────────────────────────────── */

export async function createOpenLoop(
  service: Service,
  input: {
    ownerUid: string;
    threadId: string;
    obligationType: string;
    intent?: string | null;
    room: ImplementedRoom;
    anchorIds?: string[];
  }
): Promise<OpenLoop | null> {
  const { data, error } = await service
    .from("assistant_open_loops")
    .insert({
      thread_id: input.threadId,
      obligation_type: input.obligationType.trim().slice(0, 80),
      founder_intent: input.intent?.trim().slice(0, 600) ?? null,
      source_room: input.room,
    })
    .select(
      "id, thread_id, obligation_type, founder_intent, source_room, state, created_at, disposed_at, disposition"
    )
    .maybeSingle();
  if (error || !data) {
    console.error("[assistant] open loop create failed:", error?.message);
    return null;
  }
  const loop = data as OpenLoop;
  for (const anchorId of input.anchorIds ?? []) {
    await service
      .from("assistant_open_loop_anchors")
      .insert({ loop_id: loop.id, anchor_id: anchorId });
  }
  await recordEvent(service, {
    threadId: input.threadId,
    type: "OPEN_LOOP_CREATED",
    actorUid: input.ownerUid,
    toRoom: input.room,
    detail: { loop_id: loop.id, obligation_type: loop.obligation_type },
  });
  return loop;
}

/* A loop is never resolved because a query stopped finding the original
   condition. Disposition is an explicit act with a stated reason, which is
   why both are required arguments here and by CHECK in the schema. */
export async function disposeOpenLoop(
  service: Service,
  input: {
    ownerUid: string;
    threadId: string;
    loopId: string;
    state: "RESOLVED" | "DISMISSED";
    disposition: string;
  }
): Promise<boolean> {
  const disposition = input.disposition.trim().slice(0, 400);
  if (!disposition) return false;
  const { error } = await service
    .from("assistant_open_loops")
    .update({
      state: input.state,
      disposed_at: new Date().toISOString(),
      disposed_by: input.ownerUid,
      disposition,
    })
    .eq("id", input.loopId)
    .eq("thread_id", input.threadId)
    .eq("state", "OPEN");
  if (error) return false;
  await recordEvent(service, {
    threadId: input.threadId,
    type: input.state === "RESOLVED" ? "OPEN_LOOP_RESOLVED" : "OPEN_LOOP_DISMISSED",
    actorUid: input.ownerUid,
    detail: { loop_id: input.loopId, disposition },
  });
  return true;
}

/* ── handoff ─────────────────────────────────────────────────────────── */

export type HandoffResult =
  | { state: "HANDED_OFF"; thread: OperationalThread }
  | { state: "DESTINATION_UNSUPPORTED"; sentence: string }
  | { state: "FAILED"; sentence: string };

/* Moving the WORK, not the page. Records where it came from and why, and
   leaves the reason as history rather than a durable claim that the reason
   still holds — the destination re-reads and may find it already answered.

   A failed handoff never corrupts the origin: the thread is updated only on
   success, so an unsupported destination leaves the founder exactly where
   they were with their work intact. */
export async function handoffThread(
  service: Service,
  input: {
    ownerUid: string;
    threadId: string;
    from: ImplementedRoom;
    to: ArchitectureRoom;
    reason: string;
  }
): Promise<HandoffResult> {
  const thread = await getThread(service, input.ownerUid, input.threadId);
  if (!thread) return { state: "FAILED", sentence: "That thread could not be read, so nothing was moved." };

  const { isImplementedRoom } = await import("@/lib/assistantRooms");
  if (!isImplementedRoom(input.to)) {
    await recordEvent(service, {
      threadId: input.threadId,
      type: "ROOM_HANDOFF_FAILED",
      actorUid: input.ownerUid,
      fromRoom: input.from,
      toRoom: input.to,
      reasonForMoving: input.reason,
      detail: { refused: "destination_unsupported", required_edge: isRequiredEdge(input.from, input.to) },
    });
    return {
      state: "DESTINATION_UNSUPPORTED",
      sentence:
        `I can't move this work into ${ROOM_LABEL[input.to]} yet — that room isn't attached to the Assistant. ` +
        "Your thread is untouched and still here, with everything it was carrying.",
    };
  }

  const updated = await activateThread(service, {
    ownerUid: input.ownerUid,
    threadId: input.threadId,
    room: input.to,
  });
  if (!updated) return { state: "FAILED", sentence: "The handoff could not be recorded, so nothing was moved." };

  await recordEvent(service, {
    threadId: input.threadId,
    type: "ROOM_HANDOFF",
    actorUid: input.ownerUid,
    fromRoom: input.from,
    toRoom: input.to,
    reasonForMoving: input.reason.trim().slice(0, 400),
    detail: { required_edge: isRequiredEdge(input.from, input.to) },
  });
  return { state: "HANDED_OFF", thread: updated };
}

/* ── reorientation ───────────────────────────────────────────────────────
   The rule lives in lib/assistantThreadTiming.ts so it is testable without a
   database client, and is re-exported here so callers have one import. */
export {
  hoursSince,
  needsReorientation,
  reorientationSentence,
  REORIENT_AFTER_HOURS,
} from "@/lib/assistantThreadTiming";
