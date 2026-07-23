"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImportedDraftsWorkspace from "@/components/ImportedDraftsWorkspace";
import SellerListingsRoom from "@/components/SellerListingsRoom";
import { sellerLabel } from "@/lib/listingStatus";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT DASHBOARD — client shell for /account  (v2.7)

   Architecture: "Global navigation changes WHERE you are; workspace controls
   change WHAT you're doing."
     • Left panel = global module nav (Dashboard / Inventory / Messages /
       Requests / coming-soon).
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

   v2.7 — Purchase Requests (Requests module). Closes a real, verified gap:
   POST /api/purchase-requests and PATCH /api/purchase-requests/[id] already
   existed and were logically correct, but had NO calling UI anywhere, and —
   discovered during this flight's verification — purchase_requests and
   transactions both had RLS enabled with ZERO policies, meaning neither
   route actually worked for a real user until an additive RLS migration
   fixed it in this same flight (5 policies: buyer/seller-owns-own-row,
   matching each route's own existing identity checks — no route code
   touched by that fix).

   Requests are fetched the SAME way threads are (v2.6 precedent): a direct,
   RLS-scoped client call on mount, not a new GET API route — this repo's
   established convention for "read my own rows" (see also archiveThread's
   direct .update() below). Explicit .eq("seller_id", user.id) is included
   even though RLS now also enforces this — defense in depth, matching the
   project's standing "never rely on implicit scoping alone" convention.

   Deliberately NOT joined: buyer display name. The brief's per-request
   requirements are proposed price vs. listing price, shipping/included/
   notes, and Accept/Decline — buyer identity wasn't asked for, and adding it
   would mean a second, unverified join (purchase_requests.buyer_id →
   profiles) whose RLS wasn't checked this flight. Flagged as a possible
   future addition, not silently included.

   v2.8 — Dealer Accelerator Flight 2A. Two things, both real:

   (a) A LIVE BUG FIX, affecting every seller, not just dealers: the Pending
   tab filtered on the status string "pending", which is not a real listing
   status and never has been. The actual value is "pending_review" (see
   app/api/admin/listings/[id]/status/route.ts's ALLOWED_STATUSES). The tab,
   its count, and STATUS_LABELS all keyed on the phantom value, so the Pending
   tab silently showed zero results and a pending_review listing would have
   rendered its raw status string as a badge. Because the tab id IS used
   directly as the status value (see InventoryView's `filtered`), the fix is
   to make the id the real status — not to special-case the comparison. The
   user-facing label stays "Pending".

   (b) Submit for Review. A draft now carries an owner-gated
   draft → pending_review action (POST /api/listings/[id]/submit-for-review),
   and a submitted listing states plainly that it is awaiting review rather
   than going silent. Listings remain PROPS-ONLY: this deliberately does NOT
   add a third client-fetch deviation, and deliberately does NOT hold a local
   copy of status that could drift from the database. It calls
   router.refresh(), so the server page re-runs its own query and the prop
   arrives as truth. Reuses the Accept/Decline action-button treatment below
   verbatim — no new visual design was invented here.

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
  // v2.24 · The Aubrey Check seller-facing state. Copy is locked by ruling;
  // neither field ever carries provider names, scores, or sources.
  integrity_hold_reason?: string | null;
  seller_clarification_note?: string | null;
};

type ModuleId =
  | "dashboard"
  | "inventory"
  | "accelerator"
  | "market"
  | "messages"
  | "requests"
  | "analytics";
// v2.23 — lifecycle tab state moved into SellerListingsRoom, which owns the
// Listings room's tabs and selection (ids remain the REAL status values).

type Counts = {
  total: number;
  active: number;
  draft: number;
  pending: number;
  rejected: number;
};

/* v2.8 — submission wiring, drilled down to ListingRow exactly the way
   onSelect already is. All optional: a view that doesn't wire submission
   still renders ordinary rows. Error is carried as (id, message) so the
   failure surfaces on the row it actually belongs to, not globally. */
type SubmitProps = {
  onSubmitForReview?: (id: string) => void;
  submittingId?: string | null;
  submitErrorId?: string | null;
  submitErrorMsg?: string | null;
};

// Labels come from the shared lib/listingStatus.ts helper (single source of
// truth). This preview previously had no 'reserved' key — a Sale Pending
// listing fell through to the raw "reserved"; the helper closes that gap.
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
  // v2.21 — Dealer Accelerator Review Workspace. Desktop is governing scope.
  { id: "accelerator", label: "Imported Drafts", soon: false },
  { id: "market", label: "Market Intel", soon: true },
  { id: "messages", label: "Messages", soon: false },
  { id: "requests", label: "Requests", soon: false },
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

/* ── v2.7 · Purchase Request types — mirror the direct-client-fetch shape.
   `listings` embeds via the single unambiguous FK (purchase_requests.
   listing_id → listings.id); Supabase returns a to-one embed as an object,
   but is defensively unwrapped below in case a client version returns an
   array, same caution used for the Vault chain embeds elsewhere. ── */

type PurchaseRequestListing = {
  brand: string;
  model: string | null;
  reference: string;
  photos?: ListingPhoto[];
};

type PurchaseRequestSummary = {
  id: string;
  listing_id: string;
  proposed_purchase_price: number;
  listing_price: number;
  shipping_terms: string | null;
  included_items: string | null;
  notes: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  listings: PurchaseRequestListing | PurchaseRequestListing[] | null;
};

/* ── Listing row — Studio row treatment (replaces the v1.42 card). Markup
   shape follows the prototype; the published-vs-div link logic and the
   visual selected-state are preserved/added here. ── */
function ListingRow({
  row,
  selected,
  onSelect,
  onSubmitForReview,
  submitting = false,
  submitError = null,
}: {
  row: AccountListing;
  selected: boolean;
  onSelect: (id: string) => void;
  // v2.8 — optional so any caller that doesn't wire submission still renders
  // an ordinary row rather than breaking.
  onSubmitForReview?: (id: string) => void;
  submitting?: boolean;
  submitError?: string | null;
}) {
  const price = `$${Number(row.asking_price).toLocaleString("en-US")}`;
  const badgeLabel = sellerLabel(row.status);
  const badgeClass =
    row.status === "published"
      ? "text-[var(--success)]"
      : row.status === "rejected"
        ? "text-[var(--danger)]"
        : "text-[var(--muted)]";

  const inner = (
    <div
      onClick={() => onSelect(row.id)}
      className={`relative cursor-pointer border-b border-[rgba(255,255,255,0.03)] px-6 py-[18px] transition hover:bg-[rgba(255,255,255,0.02)] ${
        selected
          ? "bg-[rgba(201,168,76,0.04)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-[var(--gold)]"
          : ""
      }`}
    >
      {/* v2.8 — the row's original single-line content, unchanged, now wrapped
          so a draft's submit action / a submitted listing's state can sit
          beneath it rather than squeezing the line on mobile. */}
      <div className="flex items-center gap-3">
      {/* Dial thumbnail — the real dial photo when the listing has one.
          v2.8: the no-photo fallback was a bare 16px circle, which read as a
          radio button and implied a selection affordance this row does not
          have. It is purely a MEDIA PLACEHOLDER — no interaction now, none
          planned — so it is now the conventional framed-image-with-slash
          glyph, which cannot be mistaken for a control. --ghost is the correct
          token here rather than a legibility regression: globals.css reserves
          --ghost for "disabled states and placeholders ONLY", and this is
          literally a placeholder, not text the user must read. */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
        {dialThumbUrl(row.photos) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dialThumbUrl(row.photos)!} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px] text-[var(--ghost)]"
            role="img"
            aria-label="No photo"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3.5 16.5 8 12l3 3 3.5-3.5 6 6" />
            <line x1="3.5" y1="20.5" x2="20.5" y2="3.5" />
          </svg>
        )}
      </div>

      {/* Info — v2.8 legibility corrections, both of which were violations of
          globals.css's OWN stated readability floor, not new design opinions:
          "--muted is the absolute minimum for ANY text the user is meant to
          read; --ghost is for disabled states and placeholders ONLY."
            · brand was --gold-subtle → composites to 2.58:1 over --ink at
              8.5px, far under the 4.5:1 AA floor. Now --gold-dim (4.95:1),
              which keeps the gold identity AND respects the GOLD HIERARCHY
              rule — --gold is spent once per section, and in this row that's
              the Submit for Review action.
            · Ref. was --ghost (3.58:1) — a readable, informational line
              rendered in the placeholder-only tier. Now --muted (5.35:1).
          Hierarchy is preserved, not flattened: model --platinum (15.12) and
          price --platinum-dim (11.85) still clearly dominate; brand and Ref.
          remain secondary — just legible. */}
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] text-[8.5px] uppercase tracking-[2px] text-[var(--gold-dim)]">
          {row.brand}
        </div>
        <div className="truncate font-display text-[14px] font-light text-[var(--platinum)]">
          {row.model ?? row.brand}
        </div>
        <div className="mt-[2px] text-[9px] tracking-[0.3px] text-[var(--muted)]">
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

      {/* v2.8 — DRAFT: the owner's own submission action. stopPropagation so
          clicking the button submits rather than merely selecting the row.
          Button treatment is the Accept/Decline pattern from RequestsView,
          reused verbatim. The line beneath it exists because "Submit for
          Review" could otherwise read as "publish now" — it says plainly that
          it doesn't. */}
      {/* v2.24 — CLARIFICATION: the locked neutral introduction plus the
          founder's bounded note. Shown on drafts only (clarify returns the
          listing to draft); resubmitting answers it and clears the note. */}
      {row.status === "draft" && row.seller_clarification_note != null && (
        <div className="mt-3 border-l border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)] px-3 py-2 text-[10px] leading-relaxed tracking-[0.3px] text-[var(--muted)]">
          We need a little more information about one or more photographs before
          the listing can be published.
          {row.seller_clarification_note.trim() !== "" && (
            <span className="mt-1 block text-[var(--platinum-dim)]">
              {row.seller_clarification_note}
            </span>
          )}
        </div>
      )}

      {row.status === "draft" && onSubmitForReview && (
        <div className="mt-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSubmitForReview(row.id);
            }}
            disabled={submitting}
            className="border border-[var(--border-gold)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
          <div className="mt-1.5 text-[10px] tracking-[0.3px] text-[var(--muted)]">
            Sends this draft to FairWatchTrade. Nothing publishes until it&apos;s approved.
          </div>
        </div>
      )}

      {/* v2.8 — SUBMITTED: say what happened and what comes next. Never
          silence, never ambiguity. There is no resubmit action here because a
          resubmission isn't a real thing the lifecycle supports.
          v2.24 — a listing held by the integrity gate shows the locked
          held-state copy instead of the generic submission line. */}
      {row.status === "pending_review" &&
        (row.integrity_hold_reason ? (
          <div className="mt-3 text-[10px] leading-relaxed tracking-[0.3px] text-[var(--muted)]">
            Your photographs are receiving an additional authenticity review.
            <span className="mt-1 block">
              Your listing is saved and is not visible to buyers yet. Most
              reviews require no action from the seller.
            </span>
          </div>
        ) : (
          <div className="mt-3 text-[10px] tracking-[0.3px] text-[var(--muted)]">
            Submitted for review. FairWatchTrade will publish it or send it back —
            no further action needed from you.
          </div>
        ))}

      {/* Failure is reported, never swallowed into a silent no-op. */}
      {submitError && (
        <div className="mt-2 text-[10px] tracking-[0.3px] text-[var(--danger)]">
          {submitError}
        </div>
      )}
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
  onSubmitForReview,
  submittingId,
  submitErrorId,
  submitErrorMsg,
}: {
  listings: AccountListing[];
  counts: Counts;
  selectedListing: string | null;
  onSelect: (id: string) => void;
} & SubmitProps) {
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
              onSubmitForReview={onSubmitForReview}
              submitting={submittingId === row.id}
              submitError={submitErrorId === row.id ? submitErrorMsg ?? null : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── INVENTORY module — v2.23: the Seller Listings Design Gate room.
   InventoryView (status tabs + full-width ListingRow list) is retired,
   replaced by <SellerListingsRoom /> (components/SellerListingsRoom.tsx):
   compact one-watch-per-row inventory + contextual selected-listing rail.
   The room owns its own tab and selection state; ListingRow remains in use
   by DashboardView's recent-3 preview above. ── */

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

/* ── v2.7 · REQUESTS module — Purchase Requests. Flat list (no thread-style
   drill-down needed — each request is a single, self-contained card), a
   Pending/Resolved toggle mirroring Messages' active/archived toggle, and
   two actions per pending request calling the existing, unmodified PATCH
   contract (only the transactionCreated flag is new on the response, and
   only because the route now checks a write it previously ignored). ── */
function RequestsView({
  requests,
  onActionComplete,
}: {
  requests: PurchaseRequestSummary[];
  onActionComplete: () => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const visible = requests.filter((r) =>
    showResolved ? r.status !== "pending" : r.status === "pending"
  );

  const STATUS_COLOR: Record<PurchaseRequestSummary["status"], string> = {
    pending: "text-[var(--muted)]",
    accepted: "text-[var(--success)]",
    declined: "text-[var(--danger)]",
  };

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
      // v2.5 route fix: a false transactionCreated means the status DID
      // change but the transaction row failed to write — surface it rather
      // than showing a clean success the way the old route silently would.
      if (status === "accepted" && data?.transactionCreated === false) {
        setActionError(
          "Accepted, but the transaction record failed to create. Contact support to resolve."
        );
      }
      onActionComplete();
    } catch {
      setActionError("Could not update this request. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
          Purchase Requests
        </div>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="text-[9px] uppercase tracking-[1.5px] text-[var(--ghost)] transition hover:text-[var(--muted)]"
        >
          {showResolved ? "Show pending" : "Show resolved"}
        </button>
      </div>

      {actionError && (
        <div className="mx-6 mb-3 text-[12px] text-[var(--danger)]">{actionError}</div>
      )}

      {visible.length === 0 ? (
        <div className="mx-6 border border-[var(--border-faint)] px-6 py-10 text-center">
          <p className="font-display text-[13px] font-light italic text-[var(--muted)]">
            {showResolved
              ? "No resolved requests yet."
              : "No pending requests. When a collector proposes a purchase on one of your listings, it appears here."}
          </p>
        </div>
      ) : (
        <div>
          {visible.map((r) => {
            const listing = Array.isArray(r.listings) ? r.listings[0] : r.listings;
            const title = listing
              ? `${listing.brand}${listing.model ? " " + listing.model : ""}`
              : "Listing";
            const thumb = listing ? dialThumbUrl(listing.photos) : null;
            const proposed = Number(r.proposed_purchase_price).toLocaleString("en-US");
            const asking = Number(r.listing_price).toLocaleString("en-US");
            const delta = Number(r.proposed_purchase_price) - Number(r.listing_price);
            const deltaLabel =
              delta === 0
                ? "at asking"
                : delta > 0
                  ? `$${delta.toLocaleString("en-US")} over asking`
                  : `$${Math.abs(delta).toLocaleString("en-US")} under asking`;

            return (
              <div key={r.id} className="border-b border-[rgba(255,255,255,0.03)] px-6 py-[18px]">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-[var(--border-subtle)]" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-display text-[14px] font-light text-[var(--platinum)]">
                        {title}
                      </span>
                      <span
                        className={`shrink-0 text-[9px] uppercase tracking-[1.5px] ${STATUS_COLOR[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </div>
                    {listing && (
                      <div className="mt-[2px] text-[9px] tracking-[0.3px] text-[var(--ghost)]">
                        Ref. {listing.reference}
                      </div>
                    )}

                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-display text-[16px] font-light text-[var(--platinum-dim)]">
                        ${proposed}
                      </span>
                      <span className="text-[10px] text-[var(--ghost)]">
                        vs. ${asking} asking · {deltaLabel}
                      </span>
                    </div>

                    {(r.shipping_terms || r.included_items || r.notes) && (
                      <div className="mt-2 space-y-1">
                        {r.shipping_terms && (
                          <div className="text-[11px] text-[var(--muted)]">
                            <span className="text-[var(--ghost)]">Shipping: </span>
                            {r.shipping_terms}
                          </div>
                        )}
                        {r.included_items && (
                          <div className="text-[11px] text-[var(--muted)]">
                            <span className="text-[var(--ghost)]">Included: </span>
                            {r.included_items}
                          </div>
                        )}
                        {r.notes && (
                          <div className="text-[11px] text-[var(--muted)]">
                            <span className="text-[var(--ghost)]">Note: </span>
                            {r.notes}
                          </div>
                        )}
                      </div>
                    )}

                    {r.status === "pending" && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => act(r.id, "accepted")}
                          disabled={busyId === r.id}
                          className="border border-[var(--border-gold)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {busyId === r.id ? "Working…" : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => act(r.id, "declined")}
                          disabled={busyId === r.id}
                          className="border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--platinum)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
  // Visual-only selected-row state (right context panel is Phase 2).
  const [selectedListing, setSelectedListing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // v2.8 — Submit for Review. router is used only to re-run the SERVER page's
  // own listings query after a successful transition; see submitForReview().
  const router = useRouter();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitErrorId, setSubmitErrorId] = useState<string | null>(null);
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);

  // v2.6 — Correspondence threads. Fetched on mount (powers the sidebar
  // unread badge even before the module is opened) and re-fetched when the
  // module reports a change (read, reply, archive).
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  // v2.23 — Seller Listings room: the rail's Correspondence count composes
  // from `threads` at read time, but an UNANSWERED source must render as a
  // truthful unavailable state, never as 0. False until /api/messages answers.
  const [threadsLoaded, setThreadsLoaded] = useState(false);

  // v2.7 — Purchase Requests. Same pattern: fetched on mount for the pending-
  // count badge, re-fetched after any accept/decline action.
  const [requests, setRequests] = useState<PurchaseRequestSummary[]>([]);

  async function refreshThreads() {
    try {
      const res = await fetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.threads)) {
          setThreads(data.threads);
          setThreadsLoaded(true);
        }
      }
    } catch {
      /* badge simply stays absent — never crashes the workspace */
    }
  }

  // Direct RLS-scoped client fetch — same convention as archiveThread above,
  // not a new GET API route (per ruling: consistency with the established
  // pattern over introducing a new endpoint). Explicit .eq("seller_id", ...)
  // is defense in depth even though RLS also now enforces this.
  async function refreshRequests() {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("purchase_requests")
        .select(
          `id, listing_id, proposed_purchase_price, listing_price, shipping_terms, included_items, notes, status, created_at,
           listings ( brand, model, reference, photos )`
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        setRequests(data as unknown as PurchaseRequestSummary[]);
      }
    } catch {
      /* badge simply stays absent — never crashes the workspace */
    }
  }

  /* v2.8 — draft → pending_review, via the owner-gated route. Shaped after
     RequestsView's act() above: call the route, surface a real failure, never
     report a success that didn't happen.

     On success this calls router.refresh() rather than mutating a local copy
     of the listing's status. That's deliberate: `listings` is a PROP owned by
     the server page (see the header note), so refresh() makes the server
     re-run its own query and the new status arrives as truth. Holding a local
     status would create a second source of truth for the same fact — the
     exact drift this codebase avoids elsewhere. */
  async function submitForReview(id: string) {
    setSubmittingId(id);
    setSubmitErrorId(null);
    setSubmitErrorMsg(null);
    try {
      const res = await fetch(`/api/listings/${id}/submit-for-review`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitErrorId(id);
        setSubmitErrorMsg(
          data?.detail ?? "Could not submit this listing for review. Please try again."
        );
        return;
      }
      router.refresh();
    } catch {
      setSubmitErrorId(id);
      setSubmitErrorMsg("Could not submit this listing for review. Please try again.");
    } finally {
      setSubmittingId(null);
    }
  }

  useEffect(() => {
    refreshThreads();
    refreshRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadThreadCount = threads.filter(
    (t) => !t.archivedByMe && t.unreadCount > 0
  ).length;

  const pendingRequestCount = requests.filter((r) => r.status === "pending").length;

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
    pending: searchFiltered.filter((l) => l.status === "pending_review").length,
    rejected: searchFiltered.filter((l) => l.status === "rejected").length,
  };

  const moduleTitle =
    activeModule === "dashboard"
      ? "Overview"
      : activeModule === "messages"
        ? "Correspondence"
        : activeModule === "requests"
          ? "Purchase Requests"
          : activeModule === "accelerator"
            ? "Review Imported Drafts"
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

          {/* Module nav — no counts, except unread/pending badges */}
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
                  {/* v2.6 — unread-thread badge on Messages. */}
                  {m.id === "messages" && unreadThreadCount > 0 && (
                    <span className="relative ml-2 border border-[var(--border-gold)] px-1.5 py-0.5 text-[8px] tracking-[1px] text-[var(--gold)]">
                      {unreadThreadCount}
                    </span>
                  )}
                  {/* v2.7 — pending-request badge on Requests. Same quiet
                      pattern as Messages' unread badge. Only when > 0. */}
                  {m.id === "requests" && pendingRequestCount > 0 && (
                    <span className="relative ml-2 border border-[var(--border-gold)] px-1.5 py-0.5 text-[8px] tracking-[1px] text-[var(--gold)]">
                      {pendingRequestCount}
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

          {/* Mobile: Inventory only — no module switching (panel hidden).
              Purchase Requests is NOT exposed on mobile in this flight — a
              deliberate scope decision, not an oversight; expanding mobile
              navigation is a separate UI decision beyond wiring the existing
              API to a UI, flagged rather than silently included. */}
          <div className="md:hidden">
            <SellerListingsRoom
              listings={searchFiltered}
              threadStats={threads.map((t) => ({ listingId: t.listing?.id ?? null }))}
              threadsLoaded={threadsLoaded}
              onSubmitForReview={submitForReview}
              onOpenImportedDrafts={() => setActiveModule("accelerator")}
              submittingId={submittingId}
              submitErrorId={submitErrorId}
              submitErrorMsg={submitErrorMsg}
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
                onSubmitForReview={submitForReview}
                submittingId={submittingId}
                submitErrorId={submitErrorId}
                submitErrorMsg={submitErrorMsg}
              />
            ) : activeModule === "messages" ? (
              <MessagesView threads={threads} onThreadsChanged={refreshThreads} />
            ) : activeModule === "requests" ? (
              <RequestsView requests={requests} onActionComplete={refreshRequests} />
            ) : activeModule === "accelerator" ? (
              <ImportedDraftsWorkspace />
            ) : (
              <SellerListingsRoom
                listings={searchFiltered}
                threadStats={threads.map((t) => ({ listingId: t.listing?.id ?? null }))}
                threadsLoaded={threadsLoaded}
                onSubmitForReview={submitForReview}
                onOpenImportedDrafts={() => setActiveModule("accelerator")}
                submittingId={submittingId}
                submitErrorId={submitErrorId}
                submitErrorMsg={submitErrorMsg}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
