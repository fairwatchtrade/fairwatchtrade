"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HelpBubble from "@/components/HelpBubble";
import {
  buildItems,
  folderCounts,
  folderItems,
  folderForModule,
  matchThreadForRequest,
  requestKey,
  requestCode,
  requestLabel,
  requestThumb,
  requestTitle,
  resolveDeepLink,
  searchItems,
  threadKey,
  type CommFolder,
  type CommRequest,
  type CommThread,
} from "@/lib/communications";
import { formatMoney, hasMoneyTruth } from "@/lib/formatMoney";

/* ────────────────────────────────────────────────────────────────────────
   COMMUNICATIONS ROOM — components/CommunicationsRoom.tsx  (v5.93)

   One correspondence room for the seller workspace: classic Outlook
   translated into FairWatchTrade materials —

     folders / filters | correspondence list | reading / action pane

   ONE rail door opens it — Communications (founder ruling 2026-08-19:
   one doorway, one room, filters inside; the door lands on the All
   folder). The legacy module addresses stay live for deep links only:
   module=requests (purchase-request notifications → Requests filter)
   and module=messages (correspondence emails → Messages filter). It
   REPLACES the old separate MessagesView and RequestsView modules — one
   room, never two inbox products.

   Authoritative design gate:
   FWT_Communications_Outlook_Style_Design_Gate_2026-08-17.html
   (interaction/composition reference — FWT Daylight materials, not a
   visual clone; all functional text at the 11px legibility floor even
   where the mock rendered smaller).

   THE PERMANENT STATE LAW (three independent concepts):
     · Read state — message threads only. Opening marks read; Mark Unread
       reverses it. Nothing else.
     · Transactional state — purchase requests only. Pending needs seller
       ACTION; reading a request resolves nothing and the Requests badge
       does not move until Accept/Decline/withdraw does.
     · Archive state — message threads only, my side's flag only.
   Reading is not resolving. Reading is not archiving.

   AUTO-SELECT vs OPEN: the Gate auto-shows the first item of a folder.
   Auto-display fetches with ?peek=1 and does NOT consume read state; an
   explicit row click (and a notification landing) fetches without peek
   and marks read as ever.

   SELECTION IS ADDRESSABLE: ?request=<id> / ?thread=<id> ride alongside
   ?module=. Notification deep links land on the exact item; reload
   restores the same selection; selection updates use replaceState (the
   module remains the only pushState unit — WS2).

   RESPONSIVE: every pane mounts exactly once; CSS decides visibility.
   Under md the room is two levels (folders+list, then the reading pane
   behind a back control) — same instance, same state, so the selected
   item, read state, request state, and a typed draft all survive a
   viewport change. Drafts are additionally keyed per item, so switching
   selection never destroys typed text.

   Private Listing is a FUTURE seam (conversation → known buyer). Nothing
   here blocks it; nothing here fakes it — no placeholder CTA exists.

   PFC274 = 62 — Sell Flow scoring untouched. Canary path untouched.
   ──────────────────────────────────────────────────────────────────────── */

type ThreadMessage = {
  id: string;
  senderName: string;
  isMine: boolean;
  body: string;
  createdAt: string;
};

/** Quiet relative timestamp — collector correspondence, not a chat app. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* Request state colors — the same --lc-* families the Listings room and
   the buyer's My Offers resolve to (Account Status Colorway Parity). */
function requestColor(r: CommRequest): string {
  if (r.status === "cancelled" && r.closure_cause === "listing_removed_by_seller") {
    return "var(--muted)";
  }
  const map: Record<CommRequest["status"], string> = {
    pending: "var(--lc-pending_review-badge)",
    accepted: "var(--lc-published-badge)",
    declined: "var(--lc-rejected-badge)",
    cancelled: "var(--slate)",
    superseded: "var(--muted)",
    expired: "var(--muted)",
  };
  return map[r.status] ?? "var(--muted)";
}

const FOLDER_LABEL: Record<CommFolder, string> = {
  all: "All",
  requests: "Requests",
  messages: "Messages",
  unread: "Unread",
  archived: "Archived",
};

const FOLDER_EMPTY: Record<CommFolder, string> = {
  all: "No correspondence yet. Requests and messages both land here.",
  requests:
    "No purchase requests yet. When a collector proposes a purchase on one of your listings, it appears here.",
  messages:
    "No correspondence yet. When a collector writes about one of your watches, it appears here.",
  unread: "Nothing unread.",
  archived: "No archived correspondence.",
};

export default function CommunicationsRoom({
  module,
  threads,
  requests,
  loaded,
  onThreadsChanged,
  onRequestsChanged,
}: {
  module: "communications" | "requests" | "messages";
  threads: CommThread[];
  requests: CommRequest[];
  /** True once BOTH sources have answered — deep links wait for this
      before concluding an id doesn't exist. */
  loaded: boolean;
  onThreadsChanged: () => void;
  onRequestsChanged: () => void;
}) {
  const items = useMemo(() => buildItems(threads, requests), [threads, requests]);
  const counts = useMemo(() => folderCounts(items), [items]);

  const [folder, setFolder] = useState<CommFolder>(folderForModule(module));
  const [search, setSearch] = useState("");
  /** Under md: false = folders+list level, true = reading pane level. */
  const [mobileOpen, setMobileOpen] = useState(false);

  const rows = useMemo(
    () => searchItems(folderItems(items, folder), search),
    [items, folder, search]
  );

  /* ── Requester names — public_seller_profiles, the sanctioned public
     display-name path. Batched; silence renders the quiet generic. ── */
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = [
      ...new Set(requests.map((r) => r.buyer_id).filter(Boolean) as string[]),
    ].filter((id) => !(id in names));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase
          .from("public_seller_profiles")
          .select("id, display_name")
          .in("id", missing);
        if (cancelled || !Array.isArray(data)) return;
        setNames((prev) => {
          const next = { ...prev };
          for (const row of data as { id: string; display_name: string | null }[]) {
            if (row.display_name) next[row.id] = row.display_name;
          }
          return next;
        });
      } catch {
        /* names simply stay generic */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  function requesterName(r: CommRequest): string {
    return (r.buyer_id && names[r.buyer_id]) || "FairWatchTrade Member";
  }

  /* ── Selection ───────────────────────────────────────────────────────
     One object owns "what is open and how it was opened". explicit=true
     means the user (or a notification landing) really opened the item —
     that consumes read state; explicit=false is the Gate's auto-show of a
     folder's first item, which only PEEKS. seq lets a re-click of the
     already-selected row escalate a peek into a real open. */
  const [selection, setSelection] = useState<{
    key: string;
    explicit: boolean;
    seq: number;
  } | null>(null);
  const selectedKey = selection?.key ?? null;

  /* ── Reading-pane thread data — DERIVED, never cleared ─────────────
     threadData remembers which selection it belongs to; a stale payload is
     simply ignored by the render instead of being synchronously cleared,
     so no effect ever has to call setState in its own body. */
  const [threadData, setThreadData] = useState<{
    forKey: string;
    threadId: string;
    msgs: ThreadMessage[];
  } | null>(null);

  const selected = useMemo(
    () => items.find((i) => i.key === selectedKey) ?? null,
    [items, selectedKey]
  );

  /** The thread a request corresponds through, when one exists. */
  const selectedRequestThread = useMemo(() => {
    if (!selected || selected.kind !== "request") return null;
    return matchThreadForRequest(threads, selected.request);
  }, [selected, threads]);

  const selectionThreadId =
    selected?.kind === "thread"
      ? selected.thread.id
      : (selectedRequestThread?.id ?? null);

  const threadMsgs =
    threadData && threadData.forKey === selectedKey ? threadData.msgs : [];
  const threadLoading =
    selectionThreadId !== null &&
    (threadData?.forKey !== selectedKey || threadData?.threadId !== selectionThreadId);

  const writeUrl = useCallback(
    (key: string | null) => {
      const qs = new URLSearchParams();
      qs.set("module", module);
      if (key) {
        const item = items.find((i) => i.key === key);
        if (item?.kind === "request") qs.set("request", item.request.id);
        if (item?.kind === "thread") qs.set("thread", item.thread.id);
      }
      /* replaceState, never pushState — the module is the history unit
         (WS2); selection is an address, not a navigation. History state is
         SPREAD-preserved so Next's internal entry survives. */
      window.history.replaceState(window.history.state, "", `/account?${qs.toString()}`);
    },
    [items, module]
  );

  const selectItem = useCallback((key: string, opts: { explicit: boolean }) => {
    setSelection((prev) => ({
      key,
      explicit: opts.explicit,
      seq: (prev?.seq ?? 0) + 1,
    }));
    if (opts.explicit) setMobileOpen(true);
  }, []);

  const chooseFolder = useCallback(
    (f: CommFolder) => {
      setFolder(f);
      const first = folderItems(items, f)[0];
      if (first) selectItem(first.key, { explicit: false });
      else setSelection(null);
    },
    [items, selectItem]
  );

  /* The selection's side effects live here: address the URL, then load the
     item's correspondence. Every setState happens inside fetch callbacks. */
  useEffect(() => {
    if (!selection) {
      writeUrl(null);
      return;
    }
    writeUrl(selection.key);
    const item = items.find((i) => i.key === selection.key);
    if (!item) return;
    const tid =
      item.kind === "thread"
        ? item.thread.id
        : (matchThreadForRequest(threads, item.request)?.id ?? null);
    if (!tid) return;

    let cancelled = false;
    const peek = !selection.explicit;
    fetch(`/api/messages/${tid}${peek ? "?peek=1" : ""}`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        setThreadData({
          forKey: selection.key,
          threadId: tid,
          msgs: Array.isArray(data?.messages) ? data.messages : [],
        });
        // A real open consumed read state — let the badges learn it.
        if (!peek) onThreadsChanged();
      })
      .catch(() => {
        /* the pane simply keeps its loading state until the next attempt */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  /** Reload the open thread after a send — handler-invoked, never an effect. */
  const reloadThread = useCallback(
    async (tid: string, forKey: string) => {
      try {
        const res = await fetch(`/api/messages/${tid}`);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          setThreadData({
            forKey,
            threadId: tid,
            msgs: Array.isArray(data?.messages) ? data.messages : [],
          });
        }
      } catch {
        /* keep what we have */
      }
      onThreadsChanged();
    },
    [onThreadsChanged]
  );

  /* ── Doors and deep links ──────────────────────────────────────────────
     The rail's Requests/Messages clicks change ?module= (no selection
     params); a notification lands with ?module=requests&request=<id>.
     Both arrive through the URL. Resolved DURING RENDER (the React
     adjust-state-on-prop-change pattern) — the same-value bail on
     handledNav prevents loops, and a deep link whose data has not arrived
     yet simply stays unhandled until items can answer. */
  const sp = useSearchParams();
  const requestParam = sp.get("request");
  const threadParam = sp.get("thread");
  const navSig = `${module}|${requestParam ?? ""}|${threadParam ?? ""}`;
  const [handledNav, setHandledNav] = useState<string | null>(null);

  if (handledNav !== navSig) {
    /* Everything below reads THIS render's `items` directly — the memoized
       chooseFolder/selectItem callbacks are for event handlers only. At the
       moment `loaded` first flips true, those callbacks still close over the
       previous render's data and would auto-select a stale first row (live
       walk finding, v5.96). */
    const openDoor = () => {
      const f = folderForModule(module);
      setFolder(f);
      const first = folderItems(items, f)[0] ?? null;
      setSelection((prev) =>
        first ? { key: first.key, explicit: false, seq: (prev?.seq ?? 0) + 1 } : null
      );
    };

    // Our own writeUrl echo: selecting an item rewrites the URL, which
    // changes navSig. That is not an inbound navigation — acknowledging it
    // without action is what keeps a selection in the All folder from being
    // yanked into the item's home folder a beat later.
    const selItem = selection ? (items.find((i) => i.key === selection.key) ?? null) : null;
    const isSelfEcho =
      (!!requestParam &&
        selItem?.kind === "request" &&
        selItem.request.id === requestParam) ||
      (!!threadParam && selItem?.kind === "thread" && selItem.thread.id === threadParam);

    if (isSelfEcho) {
      setHandledNav(navSig);
    } else if (requestParam || threadParam) {
      const hit = resolveDeepLink(items, requestParam, threadParam);
      if (hit) {
        setHandledNav(navSig);
        setFolder(hit.folder);
        // A notification landing is a real open, not a peek.
        setSelection((prev) => ({ key: hit.key, explicit: true, seq: (prev?.seq ?? 0) + 1 }));
        setMobileOpen(true);
      } else if (loaded) {
        // Both sources answered and the id isn't ours — fall through to
        // the door's ordinary filter. RLS already made the item invisible;
        // nothing is revealed and nothing pretends to be found.
        setHandledNav(navSig);
        openDoor();
      }
    } else if (loaded) {
      // Wait for data before auto-showing the folder's first item — running
      // against the empty first render silently skipped the Gate's
      // auto-select and left the pane blank until a manual click.
      setHandledNav(navSig);
      openDoor();
    }
  }

  /* ── Drafts — keyed per item so switching selection never eats text ── */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = (selectedKey && drafts[selectedKey]) || "";
  function setDraft(v: string) {
    if (!selectedKey) return;
    setDrafts((d) => ({ ...d, [selectedKey]: v.slice(0, 2000) }));
  }

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sendReply() {
    const body = draft.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    setSendError(null);
    try {
      let res: Response;
      if (selected.kind === "thread") {
        res = await fetch(`/api/messages/${selected.thread.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
      } else if (selectedRequestThread) {
        res = await fetch(`/api/messages/${selectedRequestThread.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
      } else {
        // First words to this buyer — the request itself is the doorway.
        res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseRequestId: selected.request.id, body }),
        });
      }
      if (res.ok) {
        setDrafts((d) => ({ ...d, [selectedKey as string]: "" }));
        const data = await res.json().catch(() => null);
        const tid =
          selected.kind === "thread"
            ? selected.thread.id
            : (selectedRequestThread?.id ?? (data?.threadId as string | undefined));
        if (tid) await reloadThread(tid, selected.key);
        else onThreadsChanged();
      } else {
        const err = await res.json().catch(() => null);
        setSendError(err?.detail ?? "Message could not be sent. Please try again.");
      }
    } catch {
      setSendError("Message could not be sent. Please try again.");
    }
    setSending(false);
  }

  /* ── Accept / Decline — the existing PATCH contract, unchanged ─────── */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(id: string, status: "accepted" | "declined") {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/purchase-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.detail ?? "Could not update this request. Please try again.");
        return;
      }
      /* accept_purchase_request is atomic — status change, sibling
         supersession, transaction row, and listing reservation all commit
         or all roll back, so a 200 here IS the whole truth. (The old
         RequestsView checked a transactionCreated flag that predates the
         RPC and no longer exists in the response.) */
      onRequestsChanged();
    } catch {
      setActionError("Could not update this request. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  /* ── Mark Unread / Archive — explicit reverse actions ──────────────── */
  const [toolBusy, setToolBusy] = useState(false);

  async function threadStateAction(
    threadId: string,
    action: "mark_unread" | "archive" | "unarchive"
  ) {
    if (toolBusy) return;
    setToolBusy(true);
    try {
      const res = await fetch(`/api/messages/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) onThreadsChanged();
    } catch {
      /* the row simply stays as it was */
    }
    setToolBusy(false);
  }

  /* ── Derived reading-pane identity ─────────────────────────────────── */
  const paneThread: CommThread | null =
    selected?.kind === "thread" ? selected.thread : selectedRequestThread;

  const paneTitle = !selected
    ? ""
    : selected.kind === "thread"
      ? selected.thread.listing
        ? `${selected.thread.listing.brand}${selected.thread.listing.model ? " " + selected.thread.listing.model : ""}`
        : (selected.thread.subject ?? "Correspondence")
      : requestTitle(selected.request);

  const paneReference =
    selected?.kind === "thread"
      ? (selected.thread.listing?.reference ?? null)
      : (selected?.request.listing_reference ?? null);

  /* The watch-context anchor (rulings 2026-08-19): a listing-bound
     conversation keeps its watch visibly attached — small thumbnail + the
     exact FWT listing code. No listing relationship → nothing invented;
     a private listing created from a conversation anchors through its own
     listing-bound correspondence the moment it exists. */
  const paneCode =
    selected?.kind === "thread"
      ? (selected.thread.listing?.publicCode ?? null)
      : selected
        ? requestCode(selected.request)
        : null;

  const paneThumb =
    selected?.kind === "thread"
      ? (selected.thread.listing?.thumbUrl ?? null)
      : selected
        ? requestThumb(selected.request)
        : null;

  const panePerson =
    selected?.kind === "thread"
      ? selected.thread.otherName
      : selected
        ? requesterName(selected.request)
        : "";

  const hasInbound = threadMsgs.some((m) => !m.isMine);

  /* ═══ RENDER — three panes, mounted once, CSS-responsive ═══════════ */
  return (
    <div className="flex min-h-0 flex-1 flex-col md:h-[calc(100vh-150px)] md:min-h-[520px]">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-x-0 border-b border-t border-[var(--border-faint)] bg-[var(--surface)] md:flex-row md:border-x">
        {/* ── FOLDERS ─────────────────────────────────────────────────── */}
        <nav
          aria-label="Communications filters"
          className={`shrink-0 border-b border-[var(--border-faint)] bg-[var(--surface-2)] md:w-[132px] md:border-b-0 md:border-r lg:w-[168px] ${
            mobileOpen ? "hidden md:block" : ""
          }`}
        >
          <div className="relative hidden items-center gap-1 px-4 pb-2 pt-4 md:flex">
            <span className="text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
              Inbox
            </span>
            {/* The state law, taught in FairWatchTrade's ONE help language —
                the shared HelpBubble with its gold ?, anchored speech bubble,
                caret on the trigger, and established open/close behavior.
                This replaced a permanent sentence that sat in the rail. */}
            <HelpBubble
              label="How reading works"
              historyKey="fwtCommunicationsReadHelp"
              title="Reading changes only read state"
              bubbleClassName="left-0 top-[calc(100%+10px)] w-[240px] rounded-2xl"
              caretTracksTrigger
            >
              <p className="text-[13px] leading-[1.65] text-[var(--slate)]">
                Reading does not resolve requests or archive conversations.
              </p>
            </HelpBubble>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 py-2 md:block md:space-y-[2px] md:overflow-visible md:px-2 md:py-0">
            {(Object.keys(FOLDER_LABEL) as CommFolder[]).map((f) => {
              const active = folder === f;
              const count = counts[f];
              const strong = (f === "requests" || f === "unread") && count > 0;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => chooseFolder(f)}
                  aria-current={active ? "true" : undefined}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-[7px] text-[12px] transition md:w-full ${
                    active
                      ? "bg-[var(--hover-wash)] text-[var(--platinum)]"
                      : "text-[var(--slate)] hover:text-[var(--platinum)]"
                  } md:border-l-2 ${active ? "md:border-[var(--gold)]" : "md:border-transparent"}`}
                >
                  <span>{FOLDER_LABEL[f]}</span>
                  <span
                    className={`md:ml-auto text-[11px] ${
                      strong ? "text-[var(--gold)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── LIST ────────────────────────────────────────────────────── */}
        <section
          className={`flex min-h-0 min-w-0 flex-col border-[var(--border-faint)] md:w-[264px] md:shrink-0 md:border-r lg:w-[320px] xl:w-[380px] ${
            mobileOpen ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-faint)] bg-[var(--surface-2)] px-3 py-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search correspondence…"
              aria-label="Search correspondence"
              className="w-full border-b border-[color:light-dark(rgba(62,54,38,0.13),rgba(232,226,214,0.09))] bg-transparent py-1.5 text-[13px] text-[var(--platinum)] transition-colors placeholder:text-[var(--muted)] hover:border-[var(--border-mid)] focus:border-[var(--border-gold)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                onThreadsChanged();
                onRequestsChanged();
              }}
              aria-label="Refresh correspondence"
              title="Refresh"
              className="shrink-0 border border-[var(--border-faint)] px-2 py-1 text-[12px] text-[var(--muted)] transition hover:text-[var(--platinum)]"
            >
              ↻
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto max-md:max-h-[46vh]">
            {rows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="mx-auto max-w-[42ch] font-display text-[14px] font-light italic leading-[1.6] text-[var(--platinum-dim)]">
                  {search.trim() ? "No correspondence matches your search." : FOLDER_EMPTY[folder]}
                </p>
              </div>
            ) : (
              rows.map((item) => {
                const isActive = item.key === selectedKey;
                if (item.kind === "thread") {
                  const t = item.thread;
                  const unread = t.unreadCount > 0;
                  const title = t.listing
                    ? `${t.listing.brand}${t.listing.model ? " " + t.listing.model : ""}`
                    : (t.subject ?? "Correspondence");
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => selectItem(item.key, { explicit: true })}
                      aria-current={isActive ? "true" : undefined}
                      className={`grid w-full grid-cols-[8px_1fr_auto] gap-2 border-b border-[var(--border-faint)] px-3 py-[10px] text-left transition ${
                        isActive
                          ? "bg-[var(--hover-wash)] shadow-[inset_2px_0_0_0_var(--gold)]"
                          : "hover:bg-[var(--hover-wash)]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[6px] h-[6px] w-[6px] rounded-full"
                        style={{
                          backgroundColor: unread ? "var(--lc-published-badge)" : "transparent",
                        }}
                      />
                      <span className="min-w-0">
                        <span
                          className={`block truncate text-[13px] ${
                            unread
                              ? "font-medium text-[var(--platinum)]"
                              : "text-[var(--slate)]"
                          }`}
                        >
                          {t.otherName}
                        </span>
                        <span
                          className={`block truncate text-[12px] ${
                            unread ? "text-[var(--platinum-dim)]" : "text-[var(--muted)]"
                          }`}
                        >
                          {title}
                        </span>
                        {(t.listing?.publicCode || t.lastMessage) && (
                          <span className="block truncate text-[12px] text-[var(--muted)]">
                            {t.listing?.publicCode && (
                              <span className="tracking-[0.6px] text-[var(--slate)]">
                                {t.listing.publicCode}
                              </span>
                            )}
                            {t.listing?.publicCode && t.lastMessage && " · "}
                            {t.lastMessage && (
                              <span className="font-display font-light italic">
                                &ldquo;{t.lastMessage.body.slice(0, 70)}
                                {t.lastMessage.body.length > 70 ? "…" : ""}&rdquo;
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="text-right text-[11px] text-[var(--muted)]">
                        {timeAgo(t.updatedAt)}
                      </span>
                    </button>
                  );
                }
                const r = item.request;
                const offer = formatMoney(r.proposed_purchase_price, r.proposed_currency);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => selectItem(item.key, { explicit: true })}
                    aria-current={isActive ? "true" : undefined}
                    className={`grid w-full grid-cols-[8px_1fr_auto] gap-2 border-b border-[var(--border-faint)] px-3 py-[10px] text-left transition ${
                      isActive
                        ? "bg-[var(--hover-wash)] shadow-[inset_2px_0_0_0_var(--gold)]"
                        : "hover:bg-[var(--hover-wash)]"
                    }`}
                  >
                    <span aria-hidden="true" className="mt-[6px] h-[6px] w-[6px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-[var(--slate)]">
                        {requesterName(r)}
                      </span>
                      <span className="block truncate text-[12px] text-[var(--muted)]">
                        {requestTitle(r)}
                      </span>
                      <span className="mt-[2px] block truncate text-[12px] text-[var(--platinum-dim)]">
                        {requestCode(r) && (
                          <>
                            <span className="tracking-[0.6px] text-[var(--slate)]">
                              {requestCode(r)}
                            </span>
                            {" · "}
                          </>
                        )}
                        Purchase request · {offer}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-[11px] text-[var(--muted)]">
                        {timeAgo(r.updated_at ?? r.created_at)}
                      </span>
                      <span
                        className="text-[11px] uppercase tracking-[1.2px]"
                        style={{ color: requestColor(r) }}
                      >
                        {requestLabel(r)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* ── READING / ACTION PANE ───────────────────────────────────── */}
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface)] ${
            mobileOpen ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Mobile back — same instance, so state survives the level change */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="shrink-0 border-b border-[var(--border-faint)] px-4 py-2 text-left text-[11px] uppercase tracking-[1.4px] text-[var(--muted)] transition hover:text-[var(--slate)] md:hidden"
          >
            ← Correspondence
          </button>

          {!selected ? (
            <div className="flex flex-1 items-center justify-center px-8 py-14">
              <p className="max-w-[40ch] text-center font-display text-[14px] font-light italic leading-[1.6] text-[var(--platinum-dim)]">
                Select correspondence to read it here.
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-[var(--border-faint)] bg-[var(--surface-2)] px-4 py-3">
                <div className="flex min-w-0 basis-[220px] grow items-start gap-3">
                  {/* The eye gets an object, not more chrome: the watch
                      itself, small and quiet, anchoring the correspondence.
                      Rendered ONLY when a real listing owns the thread. */}
                  {paneThumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={paneThumb}
                      alt=""
                      className="mt-[2px] h-11 w-11 shrink-0 border border-[var(--border-faint)] object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[1.6px] text-[var(--gold-subtle)]">
                      {selected.kind === "request" ? "Purchase Request" : "Message"}
                    </div>
                    <h3 className="mt-[2px] truncate font-display text-[18px] font-light text-[var(--platinum)]">
                      {paneTitle}
                    </h3>
                    {/* Wraps rather than truncates: the Identity Law says the
                        exact listing code stays visible after the user opens
                        the correspondence — a truncated line eats the code
                        first at narrow widths. */}
                    <div className="mt-[2px] text-[12px] leading-[1.5] text-[var(--muted)]">
                      {panePerson}
                      {paneReference ? ` · Ref. ${paneReference}` : ""}
                      {paneCode ? (
                        <>
                          {" · Listing "}
                          <span className="tracking-[0.6px] text-[var(--slate)]">
                            {paneCode}
                          </span>
                        </>
                      ) : (
                        ""
                      )}
                    </div>
                  </div>
                </div>
                {paneThread && (
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {hasInbound && (
                      <button
                        type="button"
                        onClick={() => threadStateAction(paneThread.id, "mark_unread")}
                        disabled={toolBusy}
                        className="border border-[var(--border-faint)] px-2.5 py-1.5 text-[11px] uppercase tracking-[1.2px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)] disabled:opacity-40"
                      >
                        Mark Unread
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        threadStateAction(
                          paneThread.id,
                          paneThread.archivedByMe ? "unarchive" : "archive"
                        )
                      }
                      disabled={toolBusy}
                      className="border border-[var(--border-faint)] px-2.5 py-1.5 text-[11px] uppercase tracking-[1.2px] text-[var(--muted)] transition hover:text-[var(--platinum)] disabled:opacity-40"
                    >
                      {paneThread.archivedByMe ? "Unarchive" : "Archive"}
                    </button>
                  </div>
                )}
              </div>

              {/* Private Listing V1 — the conversation-led doorway. From a
                  real buyer conversation the seller can list a watch for
                  exactly this person, never the public. The buyer is derived
                  from the thread relationship server-side; this link only
                  names the thread. Quiet by design: one line, no card, no
                  competition with the correspondence itself. */}
              {paneThread && paneThread.otherId && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border-faint)] bg-[var(--surface-2)] px-4 py-2">
                  <span className="text-[11px] text-[var(--muted)]">
                    Have a watch meant for {panePerson}?
                  </span>
                  <Link
                    href={`/sell?privateThread=${paneThread.id}`}
                    className="border border-[var(--border-gold)] px-2.5 py-1 text-[11px] uppercase tracking-[1.3px] text-[var(--gold-subtle)] transition hover:bg-[var(--gold-whisper)] hover:text-[var(--gold)]"
                  >
                    Create Private Listing for This Buyer
                  </Link>
                </div>
              )}

              {/* Purchase-request summary strip */}
              {selected.kind === "request" && (
                <div className="shrink-0 border-b border-[var(--border-faint)] px-4 py-3">
                  <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[1.2px] text-[var(--muted)]">
                        Requester
                      </div>
                      <div className="mt-[2px] truncate text-[13px] text-[var(--platinum-dim)]">
                        {requesterName(selected.request)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[1.2px] text-[var(--muted)]">
                        Offer
                      </div>
                      <div className="mt-[2px] font-display text-[16px] font-light text-[var(--platinum)]">
                        {formatMoney(
                          selected.request.proposed_purchase_price,
                          selected.request.proposed_currency
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[1.2px] text-[var(--muted)]">
                        Asking
                      </div>
                      <div className="mt-[2px] font-display text-[16px] font-light text-[var(--platinum-dim)]">
                        {formatMoney(
                          selected.request.listing_price,
                          selected.request.listing_currency
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[1.2px] text-[var(--muted)]">
                        Status
                      </div>
                      <div
                        className="mt-[3px] text-[12px] uppercase tracking-[1.2px]"
                        style={{ color: requestColor(selected.request) }}
                      >
                        {requestLabel(selected.request)}
                      </div>
                    </div>
                    {selected.request.status === "pending" && (
                      <div className="flex basis-full items-end gap-2 pt-1 lg:basis-auto lg:pt-0">
                        <button
                          type="button"
                          onClick={() => act(selected.request.id, "accepted")}
                          disabled={busyId === selected.request.id}
                          className="border border-[var(--border-gold)] px-3 py-1.5 text-[11px] uppercase tracking-[1.5px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {busyId === selected.request.id ? "Working…" : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => act(selected.request.id, "declined")}
                          disabled={busyId === selected.request.id}
                          className="border border-[var(--border-mid)] px-3 py-1.5 text-[11px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--platinum)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const r = selected.request;
                    const delta = Number(r.proposed_purchase_price) - Number(r.listing_price);
                    const deltaKnown =
                      hasMoneyTruth(r.proposed_purchase_price, r.proposed_currency) &&
                      r.proposed_currency === r.listing_currency;
                    const deltaLabel = !deltaKnown
                      ? null
                      : delta === 0
                        ? "at asking"
                        : delta > 0
                          ? `${formatMoney(delta, r.proposed_currency)} over asking`
                          : `${formatMoney(Math.abs(delta), r.proposed_currency)} under asking`;
                    return (
                      <div className="mt-2 space-y-1">
                        {deltaLabel && (
                          <div className="text-[12px] text-[var(--slate)]">{deltaLabel}</div>
                        )}
                        {r.shipping_terms && (
                          <div className="text-[12px] text-[var(--muted)]">
                            Shipping: {r.shipping_terms}
                          </div>
                        )}
                        {r.included_items && (
                          <div className="text-[12px] text-[var(--muted)]">
                            Included: {r.included_items}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {actionError && (
                    <div className="mt-2 text-[12px] text-[var(--danger)]">{actionError}</div>
                  )}
                </div>
              )}

              {/* Correspondence body */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 max-md:min-h-[200px]">
                {selected.kind === "request" && selected.request.notes && (
                  <div className="mb-4 max-w-[720px] border border-[var(--border-faint)] bg-[var(--surface-2)] px-3 py-2.5">
                    <div className="mb-1 flex items-baseline justify-between gap-4">
                      <span className="text-[11px] uppercase tracking-[1.5px] text-[var(--slate)]">
                        {requesterName(selected.request)} · Note with offer
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {timeAgo(selected.request.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-[13px] leading-[1.7] text-[var(--platinum-dim)]">
                      {selected.request.notes}
                    </p>
                  </div>
                )}

                {threadLoading ? (
                  <div className="py-8 text-center font-display text-[12px] italic text-[var(--muted)]">
                    Opening correspondence…
                  </div>
                ) : threadMsgs.length === 0 ? (
                  selected.kind === "thread" || selected.request.notes ? (
                    selected.kind === "thread" ? (
                      <div className="py-8 text-center font-display text-[12px] italic text-[var(--muted)]">
                        No messages yet.
                      </div>
                    ) : null
                  ) : (
                    <div className="py-8 text-center font-display text-[12px] italic text-[var(--muted)]">
                      No correspondence on this request yet. A reply below starts it.
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {threadMsgs.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[720px] border border-[var(--border-faint)] px-3 py-2.5 ${
                          m.isMine ? "ml-auto bg-[var(--hover-wash)]" : "bg-[var(--surface-2)]"
                        }`}
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-4">
                          <span
                            className={`text-[11px] uppercase tracking-[1.5px] ${
                              m.isMine ? "text-[var(--gold-subtle)]" : "text-[var(--slate)]"
                            }`}
                          >
                            {m.isMine ? "You" : m.senderName}
                          </span>
                          <span className="text-[11px] text-[var(--muted)]">
                            {timeAgo(m.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-line text-[13px] leading-[1.7] text-[var(--platinum-dim)]">
                          {m.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-[var(--border-faint)] bg-[var(--surface-2)] px-4 py-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write your reply…"
                  rows={3}
                  className="fw-correspondence"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--muted)]">
                    Reply stays in this correspondence. Reading alone changes only read state.
                  </span>
                  <div className="flex items-center gap-3">
                    {sendError && (
                      <span className="text-[11px] text-[var(--danger)]">{sendError}</span>
                    )}
                    <span className="text-[11px] text-[var(--muted)]">{draft.length}/2000</span>
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={sending || draft.trim().length === 0}
                      className={`border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition ${
                        sending || draft.trim().length === 0
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-[var(--gold-whisper)]"
                      }`}
                    >
                      {sending ? "Sending…" : "Send Reply"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* Re-exported so AccountDashboard's fetch layer and this room agree on one
   shape — the types' home is lib/communications. */
export type { CommThread, CommRequest };
export { requestKey, threadKey };
