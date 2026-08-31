import type { ImplementedRoom } from "@/lib/assistantRooms";

/* ────────────────────────────────────────────────────────────────────────
   RENDERED ROOM CONTEXT — the source-of-"here" contract

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The server can just read the room again."

   It cannot, and the difference is the whole product. A server-side re-query
   is an APPROXIMATION of the room: it does not know the founder's filters,
   his search, his sort, which page he is on, what he has selected, or which
   forty of nine hundred rows are actually on his screen. Marketplace Control
   shipped exactly that defect — the Assistant answered about the newest
   forty listings while the founder was looking at a filtered, searched,
   sorted, paginated working set, and every answer was confidently about a
   room that was not in front of him.

   > The room tells the Assistant what the founder is looking at.
   > The governed systems tell the Assistant what those things currently mean.

   ── THIS IS A STRUCTURAL REQUIREMENT, NOT A PREFERENCE ──────────────────

   The value is PASSED from the same state the room renders from. There is
   deliberately no server-side function in this codebase capable of building
   a substitute RenderedRoomContext — not a fallback, not a default, not a
   "close enough" query. A missing or malformed context is a REFUSAL, because
   the alternative is answering about a different room and sounding certain.

   ── AND IT IS NOT PERMISSION ────────────────────────────────────────────

   Rendered context says what is on screen. It never says what is true, and
   it never authorizes a mutation. Everything consequential is re-read from
   the governed system, and eligibility comes from the product's own verdict.
   ──────────────────────────────────────────────────────────────────────── */

export type RenderedRoomContext = {
  room: ImplementedRoom;
  /** Identity of every record the founder can currently see, in render order. */
  visibleIds: string[];
  /** The one record opened/selected, when the room has such a concept. */
  selectedId: string | null;
  /** Lifecycle/tab/workspace the room is showing. */
  view: string | null;
  /** Active filters, as the room itself names them. */
  filters: Record<string, string | number | boolean | null>;
  search: string | null;
  sort: string | null;
  page: number | null;
  pageSize: number | null;
  /** Counts the room displays — reported, never recomputed server-side. */
  counts: Record<string, number>;
  /** Sub-context within the room (an inspected record, an open sale). */
  subview: string | null;
};

export type ContextResolution =
  | { state: "ok"; context: RenderedRoomContext }
  | { state: "missing_room_context"; sentence: string; detail: string };

const MAX_VISIBLE = 400;

function str(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function idList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return null;
    const t = item.trim();
    if (!t) continue;
    out.push(t.slice(0, 100));
    if (out.length > MAX_VISIBLE) break;
  }
  return out;
}

/* The one door. A caller that cannot produce a context gets a refusal it can
   show the founder — never a default room, and never an empty one that would
   read as "nothing here". */
export function resolveRoomContext(raw: unknown, room: ImplementedRoom): ContextResolution {
  const missing = (detail: string): ContextResolution => ({
    state: "missing_room_context",
    detail,
    sentence:
      "This page didn't tell me what you're actually looking at, so I'm not going to answer as though it had. " +
      "I won't guess at the room from a separate query — that is how an assistant ends up confidently describing " +
      "a different set of listings than the ones on your screen. Reload the room and try again.",
  });

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return missing("room_context absent or not an object");
  }
  const o = raw as Record<string, unknown>;

  const visibleIds = idList(o.visibleIds);
  if (visibleIds === null) {
    return missing("visibleIds missing or not an array of strings");
  }

  const selectedId = str(o.selectedId, 100);
  /* A selection the founder cannot see is a contradiction, not an edge case:
     it means the payload was assembled from two different moments. */
  if (selectedId && visibleIds.length > 0 && !visibleIds.includes(selectedId)) {
    return missing("selectedId is not present in visibleIds");
  }

  const counts: Record<string, number> = {};
  if (o.counts && typeof o.counts === "object" && !Array.isArray(o.counts)) {
    for (const [k, v] of Object.entries(o.counts as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) counts[k.slice(0, 40)] = v;
    }
  }

  const filters: Record<string, string | number | boolean | null> = {};
  if (o.filters && typeof o.filters === "object" && !Array.isArray(o.filters)) {
    for (const [k, v] of Object.entries(o.filters as Record<string, unknown>)) {
      if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        filters[k.slice(0, 40)] = typeof v === "string" ? v.slice(0, 200) : v;
      }
    }
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return {
    state: "ok",
    context: {
      room,
      visibleIds,
      selectedId,
      view: str(o.view, 60),
      filters,
      search: str(o.search, 200),
      sort: str(o.sort, 60),
      page: num(o.page),
      pageSize: num(o.pageSize),
      counts,
      subview: str(o.subview, 60),
    },
  };
}

/* A one-line human description of the room, built ONLY from what the room
   passed. Used to orient the model, and to make a context-change visible in
   the answer when the founder changes filter/search/sort/page/selection. */
export function describeContext(c: RenderedRoomContext): string {
  const bits: string[] = [];
  if (c.view) bits.push(`view ${c.view}`);
  if (c.subview) bits.push(`sub-view ${c.subview}`);
  if (c.search) bits.push(`search "${c.search}"`);
  const f = Object.entries(c.filters).filter(([, v]) => v !== null && v !== "" && v !== false);
  if (f.length) bits.push(`filters ${f.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (c.sort) bits.push(`sorted by ${c.sort}`);
  if (c.page !== null) bits.push(`page ${c.page}${c.pageSize ? ` of ${c.pageSize} per page` : ""}`);
  bits.push(`${c.visibleIds.length} record(s) on screen`);
  if (c.selectedId) bits.push("one record selected");
  const counts = Object.entries(c.counts);
  if (counts.length) bits.push(`room counts ${counts.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  return bits.join(" · ");
}

/* ────────────────────────────────────────────────────────────────────────
   AUTHORITATIVE REREAD — could not look is not nothing found
   ──────────────────────────────────────────────────────────────────────── */

export type Reread<T> =
  | { state: "OK"; value: T }
  | { state: "COULD_NOT_VERIFY"; source: string; detail: string; sentence: string };

export function couldNotVerify<T>(source: string, detail: string): Reread<T> {
  return {
    state: "COULD_NOT_VERIFY",
    source,
    detail,
    sentence:
      `I couldn't establish current FairWatchTrade truth for this part of the room (${source}), ` +
      "so I'm not going to answer from remembered state. That is not the same as finding nothing — " +
      "it means I could not look. Nothing has been executed, and what I already know from earlier " +
      "actions is still recorded, but I can't tell you what is true right now until this reads cleanly.",
  };
}

/** Never let an empty successful read and a failed read render the same. */
export function isVerified<T>(r: Reread<T>): r is { state: "OK"; value: T } {
  return r.state === "OK";
}
