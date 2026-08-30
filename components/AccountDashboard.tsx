"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AccountRail from "@/components/AccountRail";
import DealerAcceleratorEntry from "@/components/DealerAcceleratorEntry";
import AccountRoomSelector from "@/components/AccountRoomSelector";
import DealerAcceleratorRoom from "@/components/DealerAcceleratorRoom";
import SavedSearchesModule from "@/components/SavedSearchesModule";
import WantedRequestsModule from "@/components/WantedRequestsModule";
import TradeOffersModule from "@/components/TradeOffersModule";
import SellerListingsRoom from "@/components/SellerListingsRoom";
import CommunicationsRoom from "@/components/CommunicationsRoom";
import type { CommRequest, CommThread } from "@/lib/communications";
import HelpBubble from "@/components/HelpBubble";
import { sellerLabel, statusTokenKey } from "@/lib/listingStatus";
import { formatMoney } from "@/lib/formatMoney";

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
  /* pathname is the STABLE identity of the stored object — a URL can be
     reissued — and it is what photo_presentation keys every seller choice
     by. Optional because rows written before pathnames were persisted must
     keep rendering. */
  photo: { url: string; pathname?: string };
  category: string;
};

export type AccountListing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  /** The FairWatchTrade listing number. Part of the listing's identity, not a
      sort dimension — it is randomly assigned, so ordering by it means
      nothing. It exists to tell two otherwise-identical watches apart, which
      is exactly the case this seller has: three Datejusts on one reference. */
  public_code: string | null;
  condition: string;
  asking_price: number;
  // Money Truth Stage B — null until the founder attestation; renders as the
  // locked undisclosed state, never assumed USD.
  asking_currency: string | null;
  status: string;
  created_at: string;
  photos?: ListingPhoto[];
  // v2.24 · The Aubrey Check seller-facing state. Copy is locked by ruling;
  // neither field ever carries provider names, scores, or sources.
  integrity_hold_reason?: string | null;
  seller_clarification_note?: string | null;
  /** Seller-facing rejection reason. Fetched since the adverse-decision
      flight — before that a founder could write one only dealers could read. */
  rejection_reason?: string | null;
  /** Listing lifecycle Stage 6 — the seller took this watch off the market.
      Removed is a LIVE state in the seller's own workspace, not a graveyard:
      the listing is still theirs and keeps every byte of its data, and only
      its public availability ended. Optional because every surface that
      predates Stage 6 must keep rendering without them. */
  removed_at?: string | null;
  removal_reason_code?: string | null;
  removal_reason_note?: string | null;
  /** Private Listing V1 — the ONE authorized buyer, set only on private
      rows. Optional so every pre-private surface keeps rendering. */
  private_buyer_id?: string | null;
  /** The governed seller photo-presentation record — read here only so the
      Listings rail can show the Story Photo the seller chose. Unknown rather
      than typed: it crosses from jsonb and must go through
      sanitizePhotoPresentation before anything reads a field off it. */
  photo_presentation?: unknown;
};

/** One recorded adjudication decision, seller-visible fields only. The
    founder-only reviewer note lives in a different table and never appears. */
export type AccountDecisionEvent = {
  listing_id: string;
  decision: string;
  seller_message: string | null;
  created_at: string;
};

type ModuleId =
  | "dashboard"
  | "inventory"
  | "accelerator"
  | "market"
  | "communications"
  | "messages"
  | "requests"
  | "saved"
  | "wanted"
  | "trades"
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
/* WS2 (v2.88) — the strict deep-link allowlist: every REAL module, never the
   "soon" placeholders (a ?module=market URL must not select an empty room).
   Unknown/absent values fall to Inventory, the account's default task. */
/* "communications" is the rail door; "messages" and "requests" survive
   ONLY as deep-link addresses (notification → requests filter, email →
   messages filter). All three render the same room. */
const NAVIGABLE_MODULE_IDS = [
  "dashboard",
  "inventory",
  "accelerator",
  "communications",
  "messages",
  "requests",
  "saved",
  "wanted",
  "trades",
] as const;
function moduleFromParam(p: string | null): ModuleId {
  return (NAVIGABLE_MODULE_IDS as readonly string[]).includes(p ?? "")
    ? (p as ModuleId)
    : "inventory";
}

/* v3.21 — the module list, labels, and Soon rows now live in
   AccountRail.tsx (the Painted Line rail, Requests-before-Messages per the
   locked order). The old inline MODULES table is retired with the old
   aside; ModuleId and the deep-link allowlist above remain the law. */

/* ── v2.6 · Correspondence types — mirror /api/messages responses. ── */

/* v5.93 — the Correspondence and Purchase Request shapes (and the
   relative-time helper the old inline views carried) moved to
   lib/communications.ts, the Communications room's shared truth. This
   file only fetches; the room renders. */

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
  const price = formatMoney(row.asking_price, row.asking_currency);
  const badgeLabel = sellerLabel(row.status);
  // Order 2b — Overview now speaks the canonical Listings colorway instead of
  // its own success/danger/muted trio. Same --lc-* tokens and statusTokenKey
  // the Listings room uses, so one state means one color account-wide.
  const badgeStyle: React.CSSProperties = {
    color: `var(--lc-${statusTokenKey(row.status)}-badge, var(--muted))`,
  };

  const inner = (
    <div
      onClick={() => onSelect(row.id)}
      // Selection is Channel 4 and NEUTRAL (Hybrid C): the gold bar is gone so
      // gold no longer competes with Draft's lifecycle gold.
      style={selected ? { backgroundColor: "var(--lc-select-fill)" } : undefined}
      className={`relative cursor-pointer border-b border-[var(--border-faint)] px-6 py-[18px] transition hover:bg-[var(--hover-wash)] ${
        selected
          ? "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-[var(--lc-select-line)]"
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
            className="h-[18px] w-[18px] text-[var(--muted)]"
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
        <div className="mt-[2px] text-[11px] tracking-[0.3px] text-[var(--muted)]">
          Ref. {row.reference}
        </div>
      </div>

      {/* Price + status */}
      <div className="shrink-0 text-right">
        <div className="font-display text-[16px] font-light text-[var(--platinum-dim)]">
          {price}
        </div>
        <div className="mt-[3px] text-[11px] uppercase tracking-[1.2px]" style={badgeStyle}>
          {badgeLabel}
        </div>
      </div>
      </div>

      {/* v2.8 — DRAFT: the owner's own submission action. stopPropagation so
          clicking the button submits rather than merely selecting the row.
          Button treatment is the Communications room's Accept/Decline pattern,
          reused verbatim. The line beneath it exists because "Submit for
          Review" could otherwise read as "publish now" — it says plainly that
          it doesn't. */}
      {/* v2.24 — CLARIFICATION: the locked neutral introduction plus the
          founder's bounded note. Shown on drafts only (clarify returns the
          listing to draft); resubmitting answers it and clears the note. */}
      {row.status === "draft" && row.seller_clarification_note != null && (
        <div className="mt-3 border-l border-[var(--border-gold)] bg-[var(--gold-whisper)] px-3 py-2 text-[10px] leading-relaxed tracking-[0.3px] text-[var(--muted)]">
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
            className="border border-[var(--border-gold)] px-3 py-1.5 text-[11px] uppercase tracking-[1.5px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] disabled:cursor-not-allowed disabled:opacity-40"
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
  hasImportedDrafts,
  onOpenAccelerator,
  onOpenImportedDrafts,
}: {
  listings: AccountListing[];
  counts: Counts;
  selectedListing: string | null;
  onSelect: (id: string) => void;
  hasImportedDrafts: boolean | null;
  onOpenAccelerator: () => void;
  onOpenImportedDrafts: () => void;
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
            className="flex-1 border-r border-[var(--border-faint)] px-3 py-5 last:border-r-0 md:px-6 md:py-6"
          >
            <div className="text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]">
              {kpi.label}
            </div>
            <div className={`mt-1 font-display text-[22px] font-light ${kpi.valueClass}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Dealer Accelerator entry — Design Gate v2. The prominent doorway,
          directly below the activity strip: discoverable, never a buried
          settings feature — ON DESKTOP, where the viewport can hold a
          billboard and still read as Overview.

          On the phone that same billboard consumed the first useful
          viewport, so Overview visually RESOLVED into a Dealer landing
          page (founder-observed on the real device). The room must read
          as Overview first; the doorway stays discoverable as a genuinely
          subordinate one-row entry below instead. Same two capabilities,
          demoted presentation — no product machinery changed. */}
      <div className="hidden px-6 pt-6 md:block">
        <DealerAcceleratorEntry
          hasImportedDrafts={hasImportedDrafts}
          onOpenAccelerator={onOpenAccelerator}
          onOpenImportedDrafts={onOpenImportedDrafts}
        />
      </div>
      {/* Mobile: the compact subordinate entry. One quiet row; when
          imported drafts are waiting it says so and opens the review
          destination directly, otherwise it opens the Accelerator start.
          Both existing capabilities survive the demotion. */}
      <div className="px-6 pt-5 md:hidden">
        <button
          type="button"
          onClick={hasImportedDrafts ? onOpenImportedDrafts : onOpenAccelerator}
          className="flex w-full items-center justify-between gap-3 border border-[var(--border-faint)] px-4 py-3 text-left transition-colors active:opacity-70"
        >
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]">
              Dealer Accelerator
            </span>
            {hasImportedDrafts && (
              <span className="mt-0.5 block text-[12px] text-[var(--platinum-dim)]">
                Imported drafts waiting for review
              </span>
            )}
          </span>
          <span aria-hidden="true" className="text-[var(--muted)]">
            →
          </span>
        </button>
      </div>

      {/* RECENT PREVIEW — last 3, no tabs */}
      <div className="px-6 pt-5 pb-3 text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]">
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

/* ── v5.93 · COMMUNICATIONS — the old MessagesView and RequestsView are
   REPLACED by components/CommunicationsRoom.tsx: one Outlook-composition
   room (folders | list | reading pane) that both rail doors open. No
   orphaned views remain here. ── */

export default function AccountDashboard({
  listings,
  decisions = [],
  publishedAt = {},
  marketplaceControl = false,
}: {
  listings: AccountListing[];
  /** Adjudication history for these listings, newest first. Optional so any
      other caller keeps working without it. */
  decisions?: AccountDecisionEvent[];
  /** listing id -> ISO timestamp of the decision that first published it.
      Absent = never published, or published before the event table existed. */
  publishedAt?: Record<string, string>;
  /** Founder-only Marketplace Control rail entry — decided by the server
      page from the session, passed through untouched. */
  marketplaceControl?: boolean;
}) {
  /* WS2 (v2.88) — the URL is the ONLY owner of the active module. v2.68's
     ?module=saved deep link becomes the general convention: every real
     (non-"soon") module id is a valid ?module= value, derived on every
     render — so refresh, direct links, and new tabs all land on the right
     section, and Back/Forward walk real history (selectModule pushes a
     history entry; Next syncs useSearchParams on pushState/popstate).
     Listings stays the default exactly when no valid module is named.
     On mobile — deliberately Inventory-only since v2.7 — the URL still
     changes but the single-view law governs what renders; no mobile module
     nav is added (the 'saved' deep link remains mobile's one exception). */
  const moduleParam = useSearchParams().get("module");
  const activeModule = moduleFromParam(moduleParam);
  function selectModule(id: ModuleId) {
    if (id === activeModule) return;
    window.history.pushState(
      null,
      "",
      id === "inventory" ? "/account" : `/account?module=${id}`
    );
  }
  /* Which destination the Dealer Accelerator room opens on. Deliberately
     component state rather than a second URL parameter: the module is the
     navigable unit and stays the URL's business, while the room's internal
     tab is a starting position, not an address. Anything in the workspace
     offering "Review Imported Drafts" lands there without becoming a rival
     doorway to a child work state. */
  const [acceleratorTab, setAcceleratorTab] = useState<"start" | "batches" | "drafts">("start");
  function openAccelerator(tab: "start" | "batches" | "drafts") {
    setAcceleratorTab(tab);
    selectModule("accelerator");
  }

  // Visual-only selected-row state (right context panel is Phase 2).
  const [selectedListing, setSelectedListing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  /* Dealer Accelerator entry (Design Gate v2) — the REAL returning-dealer
     predicate: does this dealer own any listing_media row with
     capture_source='dealer_import' (unforgeable per v2.21 RLS)? Fetched ONCE
     here and passed down as a prop, so the CSS-gated mobile/desktop mounts
     never each fetch (the v2.68 double-mount lesson). Boolean only — no
     counts are rendered anywhere. null = unknown; the card shows no state
     line until the truth arrives. */
  const [hasImportedDrafts, setHasImportedDrafts] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { count, error } = await supabase
        .from("listing_media")
        .select("listing_id", { count: "exact", head: true })
        .eq("capture_source", "dealer_import");
      if (!cancelled && !error) setHasImportedDrafts((count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // v2.8 — Submit for Review. router is used only to re-run the SERVER page's
  // own listings query after a successful transition; see submitForReview().
  const router = useRouter();

  /* Mobile Account room navigator (v6.95) — the single compact selector that
     gives the phone what the desktop rail gives the browser. Its value is the
     current room (always obvious); choosing drives the SAME ?module= truth via
     selectModule, or the Settings route. messages/requests both read as their
     one Communications room; Marketplace Control is intentionally absent. */
  const MOBILE_ROOM_IDS = [
    "dashboard",
    "inventory",
    "trades",
    "communications",
    "saved",
    "wanted",
    "accelerator",
  ] as const;
  const mobileRoomValue =
    activeModule === "messages" || activeModule === "requests"
      ? "communications"
      : (MOBILE_ROOM_IDS as readonly string[]).includes(activeModule)
        ? activeModule
        : "inventory";
  function selectRoom(v: string) {
    if (v === "settings") {
      router.push("/account/settings");
      return;
    }
    selectModule(v as ModuleId);
  }
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitErrorId, setSubmitErrorId] = useState<string | null>(null);
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);

  // v2.6 — Correspondence threads. Fetched on mount (powers the sidebar
  // unread badge even before the module is opened) and re-fetched when the
  // module reports a change (read, reply, archive).
  const [threads, setThreads] = useState<CommThread[]>([]);
  // v2.23 — Seller Listings room: the rail's Correspondence count composes
  // from `threads` at read time, but an UNANSWERED source must render as a
  // truthful unavailable state, never as 0. False until /api/messages answers.
  const [threadsLoaded, setThreadsLoaded] = useState(false);

  // v2.7 — Purchase Requests. Same pattern: fetched on mount for the pending-
  // count badge, re-fetched after any accept/decline action.
  const [requests, setRequests] = useState<CommRequest[]>([]);
  // Mirrors threadsLoaded: the Communications room must know when a deep
  // link can safely conclude an id is not the seller's, not just unseen.
  const [requestsLoaded, setRequestsLoaded] = useState(false);

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
        /* Identity comes from the SNAPSHOT columns, not from the embed. The
           listings(...) join is retained for one thing only — current
           imagery — and is explicitly optional: Stage 5 moves this FK to
           ON DELETE SET NULL, after which a terminal request has no listing
           to embed and must still read correctly. */
        .select(
          `id, listing_id, buyer_id, listing_brand, listing_model, listing_reference,
           proposed_purchase_price, listing_price, proposed_currency, listing_currency,
           shipping_terms, included_items, notes, status, closure_cause, created_at, updated_at,
           listings ( brand, model, reference, public_code, photos )`
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        setRequests(data as unknown as CommRequest[]);
        setRequestsLoaded(true);
      }
    } catch {
      /* badge simply stays absent — never crashes the workspace */
    }
  }

  /* v2.8 — draft → pending_review, via the owner-gated route. Shaped after
     the Communications room's act(): call the route, surface a real failure, never
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

  /* Badge truth on mount. Both refreshers already await before they set
     state, but CALLING them straight from the effect body reads as a
     synchronous setState and trips react-hooks/set-state-in-effect. Awaiting
     them inside the effect's own async scope says what actually happens: the
     work starts here, the state lands after the fetch.

     The exhaustive-deps suppression that used to sit here is gone: it was
     stale, reporting as an unused directive, and a suppression nobody needs
     is a suppression that hides the next real warning. This is a
     once-on-mount read by design. */
  useEffect(() => {
    /* No cancellation flag on purpose: both refreshers own their own state
       writes, so a flag checked out here would guard nothing — it would only
       look like it did. They already swallow their own failures, which is why
       a badge can be absent but never crashes the workspace. */
    void (async () => {
      await Promise.all([refreshThreads(), refreshRequests()]);
    })();
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

  /* v5.93 — Requests and Messages are two doors into ONE Communications
     room; the header names the room, not the door. */
  const moduleTitle =
    activeModule === "dashboard"
      ? "Overview"
      : activeModule === "communications" ||
          activeModule === "messages" ||
          activeModule === "requests"
        ? "Communications"
        : activeModule === "accelerator"
          ? "Review Imported Drafts"
          : activeModule === "saved"
            ? "Saved Searches"
            : activeModule === "wanted"
              ? "Wanted Requests"
              : activeModule === "trades"
                ? "Trades"
                : "Listings";

  /* Mirrors the fallback above and the render branch below: the Listings room
     is what shows when the module is none of the named ones. Derived rather
     than hardcoded to one id, so the help can never drift away from the room
     it describes. Mobile disables module switching, so this holds there too —
     except the Saved Searches deep link, which the fallback already excludes. */
  const showingListingsRoom =
    activeModule !== "dashboard" &&
    activeModule !== "communications" &&
    activeModule !== "messages" &&
    activeModule !== "requests" &&
    activeModule !== "accelerator" &&
    activeModule !== "saved" &&
    activeModule !== "wanted" &&
    activeModule !== "trades";

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      <div className="flex min-h-screen">
        {/* LEFT CONTROL PANEL — the Painted Line AccountRail (v3.21 order,
            Design Gate Concept A). REPLACES the old inline aside per
            the replacement law — never layered beside it. Desktop-only inside the
            rail's own CSS; the mobile single-view law is untouched. Module
            switching stays the WS2 pushState convention via selectModule;
            badges are the dashboard's existing state — no second fetch. */}
        <AccountRail
          surface="account"
          activeModule={
            activeModule === "messages" || activeModule === "requests"
              ? "communications"
              : activeModule
          }
          onSelectModule={selectModule}
          unreadThreads={unreadThreadCount}
          pendingRequests={pendingRequestCount}
          marketplaceControl={marketplaceControl}
        />

        {/* RIGHT WORKSPACE — controls change WHAT you're doing. */}
        {/* WS1 (2026-07-28) — bounded workspace width. Ultrawide screens were
            stretching every row's justify-between into distant islands
            (identity far left, status/actions at the viewport cliff). The cap
            binds ONLY beyond 1280px — normal desktop, tablet, and mobile are
            untouched by construction; spare width breathes at the page edge
            (the v2.84 Catalogue precedent). No row internals changed. */}
        <div className="flex min-w-0 max-w-[1280px] flex-1 flex-col">
          {/* Shared workspace header */}
          <div className="flex-shrink-0 border-b border-[var(--border-faint)] px-6 pt-5 pb-0">
            {/* Mobile: the room selector owns a FULL row of its own. It
                shared the CTA row through v7.47, and the faithful right-
                edge chevron geometry left it visually jammed against
                CREATE LISTING on the real device — a full-width control
                cannot be faithful inside half a row. The row below keeps
                the CTA at its same right edge, one line down; desktop is
                untouched because this row does not exist there. */}
            <div className="mb-3 md:hidden">
              <AccountRoomSelector
                value={mobileRoomValue}
                onSelect={selectRoom}
              />
            </div>
            <div className="mb-4 flex items-center justify-between">
              {/* Mobile is Inventory-only — except the explicit Saved
                  Searches deep link, which is the only mobile path there. */}
              {/* ── Listings help ──────────────────────────────────────────
                  The listing cards read as passive information rows, but the
                  card BODY is the selection surface — that is how a seller
                  reaches Edit, Pause and Delete. Nothing on screen says so.

                  Taught once here rather than by hanging Edit/Pause/Delete on
                  every row, which would put permanent clutter on the whole
                  list to solve a one-time discovery problem.

                  The shared HelpBubble, not a new question mark: the same
                  affordance the Sell flow's Condition help uses, with its
                  hover-intent, tap-to-pin, Escape / outside / Android-Back
                  close, and focus returned to the trigger. `relative` on this
                  wrapper is what the bubble anchors to, and caretTracksTrigger
                  keeps the point on the ? wherever the heading sits.

                  No direction word: the panel is to the right on desktop but
                  stacks BELOW the list under lg, so "on the right" would be
                  false on a phone. */}
              <div className="relative flex items-center gap-1">
                {/* Mobile Trades: the way OUT rides the same row as the way
                    IN to selling — the upper mobile screen is precious, and
                    a return control does not earn a row of its own. Same
                    governed navigation as everywhere: one tap, one
                    selectModule, synchronous. Desktop never sees it. */}
                {activeModule === "trades" && (
                  <button
                    type="button"
                    onClick={() => selectModule("dashboard")}
                    className="flex min-h-[40px] items-center gap-2 text-[12px] uppercase tracking-[1.2px] text-[var(--platinum-dim)] transition-colors active:opacity-60 hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] md:hidden"
                  >
                    <span aria-hidden="true">←</span>
                    <span>Back to Account</span>
                  </button>
                )}
                <h2 className="hidden font-display text-[20px] font-light tracking-[0.5px] text-[var(--platinum)] md:block">
                  {moduleTitle}
                </h2>
                {showingListingsRoom && (
                  <HelpBubble
                    label="Managing your listings"
                    historyKey="fwtListingsManageHelp"
                    title="Managing your listings"
                    bubbleClassName="left-0 right-0 top-[calc(100%+10px)] rounded-2xl sm:right-auto sm:w-[330px]"
                    caretTracksTrigger
                  >
                    <p className="text-[13px] leading-[1.65] text-[var(--slate)]">
                      Select the{" "}
                      <span className="text-[var(--platinum)]">
                        body of any listing card
                      </span>{" "}
                      to open that listing in the management panel.
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.65] text-[var(--slate)]">
                      From there you can{" "}
                      <span className="text-[var(--platinum)]">
                        Edit, Pause, or Delete
                      </span>{" "}
                      the listing.
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.65] text-[var(--slate)]">
                      Buttons and links within a listing card keep their own
                      actions.
                    </p>
                  </HelpBubble>
                )}
              </div>
              {/* v3.21 — own-listings search, relocated from the retired
                  inline rail per the v3 order §4 (Jason-authorized).
                  DESKTOP-ONLY protection: the old rail was desktop-only, so
                  mobile never had this control — `hidden md:block` keeps it
                  that way (no duplicate leaks into the mobile branch, no
                  control lost). Identical filter logic and state. */}
              <div className="mx-6 hidden max-w-[260px] flex-1 md:block">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search your listings…"
                  /* WORKSPACE SEARCH — unboxed, underline only. No box, no
                     fill, no pill, ever.

                     The resting line was --border-faint, the same value the
                     room's structural dividers use, so a control read as
                     another horizontal rule. It now rests fainter than any
                     divider and earns strength only on approach: hover
                     clarifies, focus is strongest.

                     The TEXT does not recede with the line. It went the other
                     way — 11px to 13px — because a quieter underline makes
                     the control harder to find, and answering that by fading
                     the words too would hide the thing itself. */
                  className="w-full border-b border-[color:light-dark(rgba(62,54,38,0.13),rgba(232,226,214,0.09))] bg-transparent py-1.5 text-[13px] text-[var(--platinum)] transition-colors placeholder:text-[var(--muted)] hover:border-[var(--border-mid)] focus:border-[var(--border-gold)] focus:outline-none"
                />
              </div>
              <Link
                href="/sell"
                className="bg-[var(--cta-fill)] px-4 py-[7px] font-[Inter] text-[11px] font-normal uppercase tracking-[1.4px] text-[var(--on-cta)]"
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
          {/* v2.68 — Saved Searches renders ONCE, outside the mobile/desktop
              split. The existing split mounts both branches and hides one with
              CSS; for this module that would duplicate every entry's DOM id
              (which aria-controls points at) and fetch the collector's data
              twice — caught in evidence as 8 entries for 4 saved searches.
              One instance, full width, correct on both viewports. On mobile it
              is reached only via the explicit ?module=saved deep link. */}
          {activeModule === "saved" ? (
            <SavedSearchesModule />
          ) : activeModule === "trades" ? (
            /* SFX-024 — the Trades surface owns its narrow gutter HERE, at
               the one mounting seam, rather than hand-padding every child.
               The workspace header above is inset px-6 while this module
               rendered flush, so on the real phone every heading, exchange
               block and Transfer Record sat against the physical left edge
               (the recurring left-cliff law violation). px-4 matches the
               surrounding mobile idiom; md:px-0 keeps the accepted desktop
               presentation byte-identical. */
            <div className="px-4 pb-6 md:px-0 md:pb-0">
              {/* The explicit mobile way out (one tap, one selectModule,
                 synchronous — no history, no latency window) lives in the
                 header row beside CREATE LISTING now, so the room content
                 starts immediately and the top of the phone screen is not
                 spent on stacked navigation rows. */}
              <TradeOffersModule />
            </div>
          ) : activeModule === "wanted" ? (
            /* Rendered ONCE outside the mobile/desktop split, the same
               reasoning as Saved Searches above: mounted in both branches
               the queue would fetch twice and answer twice. */
            <WantedRequestsModule />
          ) : activeModule === "accelerator" ? (
            /* Renders ONCE, outside the mobile/desktop split — the same
               reasoning as Saved Searches directly above. Mounted inside both
               branches the room would get two lives: two state reads and two
               polling loops driving one dealer's run.

               This is also what finally gives the mobile Account a real
               Dealer Accelerator. The earlier text-only treatment existed
               because the only destination was a desktop-scoped workspace, so
               a mobile button would have been a dead end. Connect, progress,
               and Needs Attention are usable on a phone, so the doorway is
               now real on both. */
            <DealerAcceleratorRoom
              onBackToOverview={() => selectModule("dashboard")}
              initialTab={acceleratorTab}
            />
          ) : activeModule === "communications" ||
            activeModule === "messages" ||
            activeModule === "requests" ? (
            /* v5.93 — the Communications room renders ONCE, outside the
               mobile/desktop split (the Saved Searches / Accelerator
               precedent): a second CSS-hidden mount would give the room two
               lives — two thread fetches, two selections, two read-marking
               passes for one seller. One instance owns the one logical state
               model; its own CSS handles every viewport. This is also what
               puts Requests and Messages on a phone at all — the old inline
               views were desktop-only. */
            <CommunicationsRoom
              module={activeModule}
              threads={threads}
              requests={requests}
              loaded={threadsLoaded && requestsLoaded}
              onThreadsChanged={refreshThreads}
              onRequestsChanged={refreshRequests}
            />
          ) : activeModule === "dashboard" ? (
            /* Overview — now on BOTH viewports (v6.95). It hosts the Dealer
               Accelerator doorway, which is exactly why mobile Listings no
               longer needs to carry the billboard. */
            <DashboardView
              listings={searchFiltered}
              counts={counts}
              selectedListing={selectedListing}
              onSelect={setSelectedListing}
              onSubmitForReview={submitForReview}
              submittingId={submittingId}
              submitErrorId={submitErrorId}
              submitErrorMsg={submitErrorMsg}
              hasImportedDrafts={hasImportedDrafts}
              onOpenAccelerator={() => openAccelerator("start")}
              onOpenImportedDrafts={() => openAccelerator("drafts")}
            />
          ) : (
            /* Listings — one room on both viewports (identical props). On
               mobile the Dealer Accelerator entry is demoted BELOW the
               listing content: the first viewport is the seller's actual
               inventory, and DA stays available, secondary, beneath it.
               Desktop Listings never carried the billboard and still doesn't;
               Overview keeps DA as its prominent doorway. */
            <>
              <SellerListingsRoom
                listings={searchFiltered}
                decisions={decisions}
                publishedAt={publishedAt}
                threadStats={threads.map((t) => ({ listingId: t.listing?.id ?? null }))}
                threadsLoaded={threadsLoaded}
                onSubmitForReview={submitForReview}
                onOpenImportedDrafts={() => openAccelerator("drafts")}
                onRemoved={() => {
                  router.refresh();
                  refreshRequests();
                }}
                submittingId={submittingId}
                submitErrorId={submitErrorId}
                submitErrorMsg={submitErrorMsg}
              />
              <div className="px-4 pb-6 pt-2 md:hidden">
                <DealerAcceleratorEntry
                  hasImportedDrafts={hasImportedDrafts}
                  onOpenAccelerator={() => openAccelerator("start")}
                  onOpenImportedDrafts={() => openAccelerator("drafts")}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
