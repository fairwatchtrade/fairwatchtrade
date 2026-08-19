/* ────────────────────────────────────────────────────────────────────────
   COMMUNICATIONS — lib/communications.ts  (v5.93)

   Pure state logic for the seller Communications room: the unified
   item model (message threads + purchase requests in one correspondence
   list), folder filtering, deep-link resolution, and notification
   routing. Extracted from the component so scripts/communications-room
   .test.mjs can pin the behavior without a DOM.

   The permanent state law this file encodes:

     · READ STATE belongs to message threads (unreadCount from read_at).
     · TRANSACTIONAL STATE belongs to purchase requests (status). A
       pending request counts as requiring attention whether or not the
       seller has looked at it — reading is not resolving.
     · ARCHIVE STATE belongs to message threads (archived_by_a/b), and
       only to them: purchase requests have no archive column, so no
       archive affordance is invented for them.

   Three independent concepts. Nothing in this file collapses them.
   ──────────────────────────────────────────────────────────────────────── */

export type CommListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  thumbUrl: string | null;
};

/** One message thread, as /api/messages GET returns it. */
export type CommThread = {
  id: string;
  listing: CommListing | null;
  subject: string | null;
  otherId: string | null;
  otherName: string;
  lastMessage: { body: string; created_at: string; sender_id: string } | null;
  unreadCount: number;
  updatedAt: string;
  myRole: "a" | "b";
  archivedByMe: boolean;
};

export type CommListingPhoto = {
  category?: string;
  photo?: { url?: string };
};

type CommRequestListing = {
  brand: string;
  model: string | null;
  reference: string;
  photos?: CommListingPhoto[];
};

/** One purchase request, as the seller's RLS-scoped read returns it. */
export type CommRequest = {
  id: string;
  listing_id: string | null;
  buyer_id: string | null;
  listing_brand: string | null;
  listing_model: string | null;
  listing_reference: string | null;
  proposed_purchase_price: number;
  listing_price: number;
  proposed_currency: string | null;
  listing_currency: string | null;
  shipping_terms: string | null;
  included_items: string | null;
  notes: string | null;
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled" | "superseded";
  closure_cause: string | null;
  created_at: string;
  updated_at: string | null;
  listings: CommRequestListing | CommRequestListing[] | null;
};

export type CommItem =
  | { kind: "thread"; key: string; when: string; thread: CommThread }
  | { kind: "request"; key: string; when: string; request: CommRequest };

export type CommFolder = "all" | "requests" | "messages" | "unread" | "archived";

export const COMM_FOLDERS: CommFolder[] = ["all", "requests", "messages", "unread", "archived"];

export function threadKey(id: string): string {
  return `thr:${id}`;
}
export function requestKey(id: string): string {
  return `req:${id}`;
}

/** One correspondence list. Threads and requests interleave, newest
    activity first — a request's activity time is its last transition
    (updated_at), a thread's is its last message (updated_at via trigger). */
export function buildItems(threads: CommThread[], requests: CommRequest[]): CommItem[] {
  const items: CommItem[] = [
    ...threads.map((t) => ({
      kind: "thread" as const,
      key: threadKey(t.id),
      when: t.updatedAt,
      thread: t,
    })),
    ...requests.map((r) => ({
      kind: "request" as const,
      key: requestKey(r.id),
      when: r.updated_at ?? r.created_at,
      request: r,
    })),
  ];
  return items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}

/* Folder membership. The law lives here:
   · "all" is the live desk — everything except what the seller
     deliberately archived.
   · "requests" is EVERY request, pending and resolved — resolution is
     transactional state, not a different folder. The pill says which.
   · "unread" is unread MESSAGE state only. A pending-but-read request is
     attention, not unreadness; it does not appear here.
   · "archived" is archived threads only — requests can't be archived. */
export function folderItems(items: CommItem[], folder: CommFolder): CommItem[] {
  switch (folder) {
    case "all":
      return items.filter((i) => i.kind === "request" || !i.thread.archivedByMe);
    case "requests":
      return items.filter((i) => i.kind === "request");
    case "messages":
      return items.filter((i) => i.kind === "thread" && !i.thread.archivedByMe);
    case "unread":
      return items.filter(
        (i) => i.kind === "thread" && !i.thread.archivedByMe && i.thread.unreadCount > 0
      );
    case "archived":
      return items.filter((i) => i.kind === "thread" && i.thread.archivedByMe);
  }
}

export function folderCounts(items: CommItem[]): Record<CommFolder, number> {
  return {
    all: folderItems(items, "all").length,
    requests: folderItems(items, "requests").length,
    messages: folderItems(items, "messages").length,
    unread: folderItems(items, "unread").length,
    archived: folderItems(items, "archived").length,
  };
}

/** The door(s) into the room. The rail has ONE Communications entry
    (founder ruling 2026-08-19: one doorway, one room, filters inside),
    which opens on All — the live desk. The legacy module values stay
    valid as deep-link addresses: a purchase-request notification enters
    at module=requests (Requests filter), correspondence email links at
    module=messages (Messages filter). Same room, always. */
export function folderForModule(
  module: "communications" | "requests" | "messages"
): CommFolder {
  if (module === "requests") return "requests";
  if (module === "messages") return "messages";
  return "all";
}

/** Client-side list search across the fields a seller actually scans. */
export function searchItems(items: CommItem[], query: string): CommItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => {
    const hay =
      i.kind === "thread"
        ? [
            i.thread.otherName,
            i.thread.listing?.brand,
            i.thread.listing?.model,
            i.thread.listing?.reference,
            i.thread.subject,
            i.thread.lastMessage?.body,
          ]
        : [
            i.request.listing_brand,
            i.request.listing_model,
            i.request.listing_reference,
            i.request.notes,
            i.request.status,
          ];
    return hay.filter(Boolean).join(" ").toLowerCase().includes(q);
  });
}

/** Deep-link landing: which folder actually contains this item, so a
    notification click never selects something the visible list denies.
    An archived thread lands on Archived; a resolved request still lands
    on Requests (every request lives there). */
export function resolveDeepLink(
  items: CommItem[],
  requestId: string | null,
  threadId: string | null
): { key: string; folder: CommFolder } | null {
  if (requestId) {
    const hit = items.find((i) => i.kind === "request" && i.request.id === requestId);
    if (hit) return { key: hit.key, folder: "requests" };
  }
  if (threadId) {
    const hit = items.find((i) => i.kind === "thread" && i.thread.id === threadId);
    if (hit && hit.kind === "thread") {
      return { key: hit.key, folder: hit.thread.archivedByMe ? "archived" : "messages" };
    }
  }
  return null;
}

/** A purchase request's correspondence home: the thread on the same
    listing with the same buyer. Snapshot identity can't do this — only
    the live pair (listing, counterpart) can. */
export function matchThreadForRequest(
  threads: CommThread[],
  request: CommRequest
): CommThread | null {
  if (!request.listing_id || !request.buyer_id) return null;
  return (
    threads.find(
      (t) => t.listing?.id === request.listing_id && t.otherId === request.buyer_id
    ) ?? null
  );
}

/* ── Notification routing ────────────────────────────────────────────────
   The founder-observed defect this exists to kill: a purchase-request
   bell used to land on the PUBLIC listing, a page that shows the owner
   no correspondence and no request controls. A stamped bell now lands on
   the exact request inside the Communications room. Unstamped rows (all
   history, and types with no tighter home) keep the listing route. */
export type NotificationRow = {
  id: string;
  type: string;
  message: string;
  listing_id: string | null;
  purchase_request_id?: string | null;
  read: boolean;
  created_at: string;
};

export function notificationHref(n: NotificationRow): string | null {
  if (n.purchase_request_id) {
    return `/account?module=requests&request=${encodeURIComponent(n.purchase_request_id)}`;
  }
  if (n.listing_id) return `/listings/${n.listing_id}`;
  return null;
}

/* ── Request presentation vocabulary (moved from the old RequestsView —
   identical rulings, one home) ─────────────────────────────────────────── */

const REQUEST_STATUS_LABEL: Record<CommRequest["status"], string> = {
  pending: "pending",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
  cancelled: "withdrawn",
  superseded: "superseded",
};

/** Stage 6A closure attribution: a closure the seller caused by removing
    the listing must not read back as the buyer having withdrawn. */
export function requestLabel(r: CommRequest): string {
  if (r.status === "cancelled") {
    if (r.closure_cause === "listing_removed_by_seller") return "closed on removal";
    if (r.closure_cause === "buyer_withdrew") return "withdrawn";
    return "closed";
  }
  return REQUEST_STATUS_LABEL[r.status] ?? r.status;
}

export function requestTitle(r: CommRequest): string {
  const listing = Array.isArray(r.listings) ? r.listings[0] : r.listings;
  const brand = r.listing_brand ?? listing?.brand ?? null;
  const model = r.listing_model ?? listing?.model ?? null;
  const reference = r.listing_reference ?? listing?.reference ?? null;
  if (brand) return `${brand}${model ? " " + model : ""}`;
  if (reference) return `Ref. ${reference}`;
  return "Watch no longer listed";
}
