"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT DASHBOARD — client shell for /account  (v2.6)

   Architecture: "Global navigation changes WHERE you are; workspace controls
   change WHAT you're doing."
     • Left panel = global module nav (Dashboard / Inventory / Messages /
       coming-soon).
     • Right workspace = the active module's controls + content.

   Receives `listings` as a prop from the server page (app/account/page.tsx),
   which owns auth + the query. Listings involve no fetching here.

   v2.6 — Correspondence (Messages module). DELIBERATE deviation from the
   "no fetching here" rule above, documented rather than silent: threads are
   fetched client-side from /api/messages (on mount, for the sidebar unread
   badge; module views reuse the same data). Rewiring the server page to
   pass threads as props would have meant redelivering app/account/page.tsx
   for data the messages API already serves RLS-scoped. Listings remain
   props-only, untouched.

   PRIVACY: only buyer-safe fields + status arrive in the listings prop;
   scoring fields (significance_score, score_state, combined_score) never
   reach this layer.

   v1.59: Studio three-column instrument-panel migration. All state, module
   switching, tab filtering, count derivation, and the published-vs-div link
   logic are preserved verbatim — token + layout-shape changes only. The
   right context panel (selected-listing detail, activity, market pulse) is
   Phase 2 and intentionally NOT built here; a visual-only `selectedListing`
   state is wired so rows can show a selected treatment now.
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = {
  photo: { url: string };
  category: string;
};

export type AccountListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  condition: string;
  asking_price: number;
  status: string;
  created_at: string;
  photos?: ListingPhoto[];
};

type ModuleId = "dashboard" | "inventory" | "market" | "messages" | "analytics";
type TabId = "all" | "published" | "draft" | "pending" | "rejected";

type Counts = {
  total: number;
  active: number;
  draft: number;
  pending: number;
  rejected: number;
};

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  pending: "Pending",
  rejected: "Rejected",
  draft: "Draft",
};

function dialThumbUrl(photos?: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

// Left-panel modules — GLOBAL nav. No counts here. Labels use the prototype's
// shorter forms so they fit the 152px panel without wrapping.
const MODULES: Array<{ id: ModuleId; label: string; soon: boolean }> = [
  { id: "dashboard", label: "Overview", soon: false },
  { id: "inventory", label: "Listings", soon: false },
  { id: "market", label: "Market Intel", soon: true },
  { id: "messages", label: "Messages", soon: false },
  { id: "analytics", label: "Analytics", soon: true },
];

/* ── v2.6 · Correspondence types — mirror /api/messages responses. ── */

type ThreadSummary = {
  id: string;
  listing: {
    id: string;
    brand: string;
    model: string | null;
    reference: string;
    thumbUrl: string | null;
  } | null;
  subject: string | null;
  otherName: string;
  lastMessage: { body: string; created_at: string; sender_id: string } | null;
  unreadCount: number;
  updatedAt: string;
  myRole: "a" | "b";
  archivedByMe: boolean;
};

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

/* ── Listing row — Studio row treatment (replaces the v1.42 card). Markup
   shape follows the prototype; the published-vs-div link logic and the
   visual selected-state are preserved/added here. ── */
function ListingRow({
  row,
  selected,
  onSelect,
}: {
  row: AccountListing;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const price = `$${Number(row.asking_price).toLocaleString("en-US")}`;
  const badgeLabel = STATUS_LABELS[row.status] ?? row.status;
  const badgeClass =
    row.status === "published"
      ? "text-[var(--success)]"
      : row.status === "rejected"
        ? "text-[var(--danger)]"
        : "text-[var(--muted)]";

  const inner = (
    <div
      onClick={() => onSelect(row.id)}
      className={`relative flex cursor-pointer items-center gap-3 border-b border-[rgba(255,255,255,0.03)] px-6 py-[18px] transition hover:bg-[rgba(255,255,255,0.02)] ${
        selected
          ? "bg-[rgba(201,168,76,0.04)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-[var(--gold)]"
          : ""
      }`}
    >
      {/* Dial thumbnail — real photo when available, placeholder circle otherwise */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
        {dialThumbUrl(row.photos) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dialThumbUrl(row.photos)!} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-4 w-4 rounded-full border border-[var(--border-subtle)]" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] text-[8.5px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
          {row.brand}
        </div>
        <div className="truncate font-display text-[14px] font-light text-[var(--platinum)]">
          {row.model ?? row.brand}
        </div>
        <div className="mt-[2px] text-[9px] tracking-[0.3px] text-[var(--ghost)]">
          Ref. {row.reference}
        </div>
      </div>

      {/* Price + status */}
      <div className="shrink-0 text-right">
        <div className="font-display text-[16px] font-light text-[var(--platinum-dim)]">
          {price}
        </div>
        <div className={`mt-[3px] text-[8px] uppercase tracking-[1.5px] ${badgeClass}`}>
          {badgeLabel}
        </div>
      </div>
    </div>
  );

  // Only published listings have a live public detail page.
  return row.status === "published" ? (
    <Link href={`/listings/${row.id}`} className="group block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

/* ── DASHBOARD module — KPI stat strip, then a recent-3 preview. ── */
function DashboardView({
  listings,
  counts,
  selectedListing,
  onSelect,
}: {
  listings: AccountListing[];
  counts: Counts;
  selectedListing: string | null;
  onSelect: (id: string) => void;
}) {
  const kpis: Array<{ label: string; value: number; valueClass: string }> = [
    { label: "Active Listings", value: counts.active, valueClass: "text-[var(--gold)]" },
    { label: "Drafts", value: counts.draft, valueClass: "text-[var(--platinum)]" },
    { label: "Pending", value: counts.pending, valueClass: "text-[var(--platinum)]" },
    {
      label: "Rejected",
      value: counts.rejected,
      valueClass: counts.rejected > 0 ? "text-[var(--danger)]" : "text-[var(--muted)]",
    },
  ];

  const recent = listings.slice(0, 3); // already ordered created_at desc

  return (
    <div>
      {/* KPI STAT STRIP — full-width, border-divided */}
      <div className="flex border-b border-[var(--border-faint)]">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="flex-1 border-r border-[var(--border-faint)] px-6 py-6 last:border-r-0"
          >
            <div className="text-[8px] uppercase tracking-[2px] text-[var(--muted)]">
              {kpi.label}
            </div>
            <div className={`mt-1 font-display text-[22px] font-light ${kpi.valueClass}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* RECENT PREVIEW — last 3, no tabs */}
      <div className="px-6 pt-5 pb-3 text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
        Recent Listings
      </div>
      {recent.length === 0 ? (
        <div className="mx-6 border border-[var(--border-faint)] px-6 py-10 text-center">
          <p className="text-[13px] text-[var(--muted)]">
            No listings yet. Create your first one.
          </p>
        </div>
      ) : (
        <div>
          {recent.map((row) => (
            <ListingRow
              key={row.id}
              row={row}
              selected={selectedListing === row.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── INVENTORY module — status tabs, filtered list. Default module. ── */
function InventoryView({
  listings,
  counts,
  activeTab,
  setActiveTab,
  selectedListing,
  onSelect,
}: {
  listings: AccountListing[];
  counts: Counts;
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  selectedListing: string | null;
  onSelect: (id: string) => void;
}) {
  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.total },
    { id: "published", label: "Active", count: counts.active },
    { id: "draft", label: "Drafts", count: counts.draft },
    { id: "pending", label: "Pending", count: counts.pending },
    { id: "rejected", label: "Rejected", count: counts.rejected },
  ];

  const filtered =
    activeTab === "all" ? listings : listings.filter((l) => l.status === activeTab);

  return (
    <div>
      {/* STATUS TABS */}
      <div className="flex border-b border-[var(--border-faint)]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-[10px] text-[10px] uppercase tracking-[1.5px] transition ${
                isActive
                  ? "border-[var(--gold)] text-[var(--platinum)]"
                  : "border-transparent text-[var(--ghost)] hover:text-[var(--slate)]"
              }`}
            >
              {tab.label}
              <span className="ml-1 text-[8px] text-[var(--gold)]">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* FILTERED LIST */}
      {filtered.length === 0 ? (
        <div className="mx-6 mt-6 border border-[var(--border-faint)] px-6 py-10 text-center">
          <p className="text-[13px] text-[var(--muted)]">No listings in this view.</p>
        </div>
      ) : (
        <div>
          {filtered.map((row) => (
            <ListingRow
              key={row.id}
              row={row}
              selected={selectedListing === row.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── v2.6 · MESSAGES module — Correspondence. Thread list + thread view.
   No chat bubbles: sender name, timestamp, body. Collector correspondence,
   not Discord. Threads arrive from the parent (fetched once for the badge);
   opening a thread fetches its messages from /api/messages/[threadId],
   which also marks the other party's messages read server-side. ── */
function MessagesView({
  threads,
  onThreadsChanged,
}: {
  threads: ThreadSummary[];
  onThreadsChanged: () => void;
}) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadMeta, setThreadMeta] = useState<ThreadSummary | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const visible = threads.filter((t) => t.archivedByMe === showArchived);

  async function openThread(t: ThreadSummary) {
    setOpenThreadId(t.id);
    setThreadMeta(t);
    setThreadMessages([]);
    setLoadingThread(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/messages/${t.id}`);
      if (res.ok) {
        const data = await res.json();
        setThreadMessages(Array.isArray(data.messages) ? data.messages : []);
        // Server marked unread as read — refresh the parent's badge/list.
        onThreadsChanged();
      }
    } catch {
      /* leave the empty state; nothing crashes */
    }
    setLoadingThread(false);
  }

  async function sendReply() {
    const body = reply.trim();
    if (!body || !openThreadId) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/messages/${openThreadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setReply("");
        // Re-fetch the thread so the new message appears with server truth.
        const refreshed = await fetch(`/api/messages/${openThreadId}`);
        if (refreshed.ok) {
          const data = await refreshed.json();
          setThreadMessages(Array.isArray(data.messages) ? data.messages : []);
        }
        onThreadsChanged();
      } else {
        const err = await res.json().catch(() => null);
        setSendError(err?.detail ?? "Message could not be sent. Please try again.");
      }
    } catch {
      setSendError("Message could not be sent. Please try again.");
    }
    setSending(false);
  }

  async function archiveThread(t: ThreadSummary) {
    // Quiet action — sets my side's archived flag directly (RLS-scoped),
    // same direct-supabase-update convention AccountSettings already uses.
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const column = t.myRole === "a" ? "archived_by_a" : "archived_by_b";
    await supabase.from("message_threads").update({ [column]: true }).eq("id", t.id);
    setOpenThreadId(null);
    setThreadMeta(null);
    onThreadsChanged();
  }

  /* ── Thread view ── */
  if (openThreadId && threadMeta) {
    const title = threadMeta.listing
      ? `${threadMeta.listing.brand}${threadMeta.listing.model ? " " + threadMeta.listing.model : ""}`
      : (threadMeta.subject ?? "Correspondence");
    return (
      <div className="px-6 py-5">
        <button
          type="button"
          onClick={() => {
            setOpenThreadId(null);
            setThreadMeta(null);
          }}
          className="mb-5 text-[9px] uppercase tracking-[2px] text-[var(--muted)] transition hover:text-[var(--slate)]"
        >
          ← Correspondence
        </button>

        {/* Listing identity */}
        <div className="mb-5 flex items-center justify-between border-b border-[var(--border-faint)] pb-4">
          <div className="flex items-center gap-3">
            {threadMeta.listing?.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={threadMeta.listing.thumbUrl}
                alt=""
                className="h-10 w-10 shrink-0 border border-[var(--border-faint)] object-cover"
              />
            )}
            <div>
              <div className="font-display text-[16px] font-light text-[var(--platinum)]">
                {title}
              </div>
              {threadMeta.listing && (
                <div className="text-[9px] tracking-[0.3px] text-[var(--ghost)]">
                  Ref. {threadMeta.listing.reference} · with {threadMeta.otherName}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => archiveThread(threadMeta)}
            className="text-[9px] uppercase tracking-[2px] text-[var(--ghost)] transition hover:text-[var(--muted)]"
          >
            Archive
          </button>
        </div>

        {/* History — chronological, no bubbles */}
        {loadingThread ? (
          <div className="py-8 text-center font-display text-[12px] italic text-[var(--ghost)]">
            Opening correspondence…
          </div>
        ) : threadMessages.length === 0 ? (
          <div className="py-8 text-center font-display text-[12px] italic text-[var(--ghost)]">
            No messages yet.
          </div>
        ) : (
          <div className="space-y-5">
            {threadMessages.map((m) => (
              <div key={m.id} className="border-b border-[rgba(255,255,255,0.03)] pb-4">
                <div className="mb-1 flex items-baseline justify-between">
                  <span
                    className={`text-[10px] uppercase tracking-[1.5px] ${
                      m.isMine ? "text-[var(--gold-subtle)]" : "text-[var(--slate)]"
                    }`}
                  >
                    {m.isMine ? "You" : m.senderName}
                  </span>
                  <span className="text-[9px] text-[var(--ghost)]">{timeAgo(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-line text-[13px] leading-[1.7] text-[var(--platinum-dim)]">
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Reply */}
        <div className="mt-6">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, 2000))}
            placeholder="Write your reply…"
            rows={3}
            className="w-full border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[13px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[9px] text-[var(--ghost)]">{reply.length}/2000</span>
            <div className="flex items-center gap-3">
              {sendError && <span className="text-[11px] text-[var(--danger)]">{sendError}</span>}
              <button
                type="button"
                onClick={sendReply}
                disabled={sending || reply.trim().length === 0}
                className={`border border-[var(--border-gold)] px-4 py-2 text-[10px] uppercase tracking-[2px] text-[var(--gold)] transition ${
                  sending || reply.trim().length === 0
                    ? "cursor-not-allowed opacity-40"
                    : "hover:bg-[rgba(201,168,76,0.06)]"
                }`}
              >
                {sending ? "Sending…" : "Send Reply"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Thread list ── */
  return (
    <div>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
          Correspondence
        </div>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-[9px] uppercase tracking-[1.5px] text-[var(--ghost)] transition hover:text-[var(--muted)]"
        >
          {showArchived ? "Show active" : "Show archived"}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="mx-6 border border-[var(--border-faint)] px-6 py-10 text-center">
          <p className="font-display text-[13px] font-light italic text-[var(--muted)]">
            {showArchived
              ? "No archived correspondence."
              : "No correspondence yet. When a collector writes about one of your watches, it appears here."}
          </p>
        </div>
      ) : (
        <div>
          {visible.map((t) => {
            const unread = t.unreadCount > 0;
            const title = t.listing
              ? `${t.listing.brand}${t.listing.model ? " " + t.listing.model : ""}`
              : (t.subject ?? "Correspondence");
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openThread(t)}
                className="flex w-full items-center gap-3 border-b border-[rgba(255,255,255,0.03)] px-6 py-[16px] text-left transition hover:bg-[rgba(255,255,255,0.02)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`truncate text-[13px] ${
                        unread ? "text-[var(--platinum)]" : "text-[var(--slate)]"
                      }`}
                    >
                      {t.otherName} · {title}
                    </span>
                  </div>
                  {t.lastMessage && (
                    <div className="mt-[3px] truncate font-display text-[12px] font-light italic text-[var(--ghost)]">
                      &ldquo;{t.lastMessage.body.slice(0, 90)}
                      {t.lastMessage.body.length > 90 ? "…" : ""}&rdquo;
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[9px] text-[var(--ghost)]">{timeAgo(t.updatedAt)}</span>
                  {unread && (
                    <span
                      aria-label={`${t.unreadCount} unread`}
                      className="h-[6px] w-[6px] rounded-full bg-[var(--gold)]"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AccountDashboard({
  listings,
}: {
  listings: AccountListing[];
}) {
  // Default module = Inventory: the listings are the primary daily task.
  const [activeModule, setActiveModule] = useState<ModuleId>("inventory");
  const [activeTab, setActiveTab] = useState<TabId>("published");
  // Visual-only selected-row state (right context panel is Phase 2).
  const [selectedListing, setSelectedListing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // v2.6 — Correspondence threads. Fetched on mount (powers the sidebar
  // unread badge even before the module is opened) and re-fetched when the
  // module reports a change (read, reply, archive).
  const [threads, setThreads] = useState<ThreadSummary[]>([]);

  async function refreshThreads() {
    try {
      const res = await fetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.threads)) setThreads(data.threads);
      }
    } catch {
      /* badge simply stays absent — never crashes the workspace */
    }
  }

  useEffect(() => {
    refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadThreadCount = threads.filter(
    (t) => !t.archivedByMe && t.unreadCount > 0
  ).length;

  // Client-side filter — all listings already loaded as a prop, no new query.
  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter(
      (l) =>
        l.brand.toLowerCase().includes(q) ||
        (l.model ?? "").toLowerCase().includes(q) ||
        l.reference.toLowerCase().includes(q)
    );
  }, [listings, searchQuery]);

  // Counts derived from the search-filtered set, so the stat strip and tab
  // counts reflect the active search.
  const counts: Counts = {
    total: searchFiltered.length,
    active: searchFiltered.filter((l) => l.status === "published").length,
    draft: searchFiltered.filter((l) => l.status === "draft").length,
    pending: searchFiltered.filter((l) => l.status === "pending").length,
    rejected: searchFiltered.filter((l) => l.status === "rejected").length,
  };

  const moduleTitle =
    activeModule === "dashboard"
      ? "Overview"
      : activeModule === "messages"
        ? "Correspondence"
        : "Listings";

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      <div className="flex">
        {/* LEFT CONTROL PANEL — desktop only. Global nav: changes WHERE you are. */}
        <aside className="hidden min-h-screen w-[176px] shrink-0 flex-col border-r border-[var(--border-faint)] bg-[var(--ink)] pt-7 pb-6 md:flex">
          {/* Header zone */}
          <div className="mb-5 px-5">
            <div className="text-[8px] uppercase tracking-[3px] text-[var(--ghost)]">
              Seller Panel
            </div>
            <div className="mt-[3px] text-[9px] uppercase tracking-[2px] text-[var(--gold)]">
              Your Workspace
            </div>
          </div>

          {/* Search — filters own listings client-side, no new query */}
          <div className="mb-4 px-5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your listings…"
              className="w-full border-b border-[var(--border-faint)] bg-transparent py-1.5 text-[11px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none"
            />
          </div>

          {/* Module nav — no counts */}
          <nav>
            {MODULES.map((m) => {
              if (m.soon) {
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-5 py-[9px] text-[11px] text-[var(--ghost)]"
                  >
                    <span>{m.label}</span>
                    <span className="text-[8px] tracking-[1px] text-[var(--ghost)]">
                      Soon
                    </span>
                  </div>
                );
              }
              const isActive = activeModule === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveModule(m.id)}
                  className={`relative flex w-full items-center justify-between px-5 py-[10px] text-left text-[10px] tracking-[1px] transition ${
                    isActive
                      ? "border-l-2 border-[var(--gold)] text-[var(--platinum)]"
                      : "border-l-2 border-transparent text-[var(--muted)] hover:text-[var(--slate)]"
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{ background: "rgba(201,168,76,0.04)" }}
                    />
                  )}
                  <span className="relative">{m.label}</span>
                  {/* v2.6 — unread-thread badge on Messages. Gold, small,
                      same quiet pattern as existing badges. Only when > 0. */}
                  {m.id === "messages" && unreadThreadCount > 0 && (
                    <span className="relative ml-2 border border-[var(--border-gold)] px-1.5 py-0.5 text-[8px] tracking-[1px] text-[var(--gold)]">
                      {unreadThreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom identity zone */}
          <div className="mt-auto border-t border-[var(--border-faint)] px-5 pt-5">
            <div className="text-[10px] text-[var(--muted)]">Seller</div>
            <div className="mt-[2px] text-[9px] text-[var(--ghost)]">Active workspace</div>
          </div>
        </aside>

        {/* RIGHT WORKSPACE — controls change WHAT you're doing. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Shared workspace header */}
          <div className="flex-shrink-0 border-b border-[var(--border-faint)] px-6 pt-5 pb-0">
            <div className="mb-4 flex items-center justify-between">
              {/* Mobile is Inventory-only; desktop reflects the active module. */}
              <h2 className="font-display text-[20px] font-light tracking-[0.5px] text-[var(--platinum)]">
                <span className="md:hidden">Listings</span>
                <span className="hidden md:inline">{moduleTitle}</span>
              </h2>
              <Link
                href="/sell"
                className="bg-[var(--gold)] px-4 py-[7px] font-[Inter] text-[9px] font-normal uppercase tracking-[2px] text-[var(--ink)]"
              >
                Create Listing
              </Link>
            </div>
          </div>

          {/* Mobile: Inventory only — no module switching (panel hidden). */}
          <div className="md:hidden">
            <InventoryView
              listings={searchFiltered}
              counts={counts}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              selectedListing={selectedListing}
              onSelect={setSelectedListing}
            />
          </div>

          {/* Desktop: module-driven. */}
          <div className="hidden md:block">
            {activeModule === "dashboard" ? (
              <DashboardView
                listings={searchFiltered}
                counts={counts}
                selectedListing={selectedListing}
                onSelect={setSelectedListing}
              />
            ) : activeModule === "messages" ? (
              <MessagesView threads={threads} onThreadsChanged={refreshThreads} />
            ) : (
              <InventoryView
                listings={searchFiltered}
                counts={counts}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                selectedListing={selectedListing}
                onSelect={setSelectedListing}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
