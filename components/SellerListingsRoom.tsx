"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { sellerLabel, statusTokenKey } from "@/lib/listingStatus";
import RemoveListingDialog, { type RemoveResult } from "@/components/RemoveListingDialog";
import DeleteListingDialog from "@/components/DeleteListingDialog";
import { canAskAboutDeletion } from "@/lib/listingDeleteEligibility";
import type { AccountListing, AccountDecisionEvent } from "@/components/AccountDashboard";

/** Seller-facing names for the recorded decisions. */
const DECISION_LABEL: Record<string, string> = {
  approved: "Approved",
  rejected: "Not accepted",
  clarification_requested: "More information requested",
  returned_to_draft: "Returned to draft",
};

/** The seller's own recorded reason, read back to them in their words. Kept
    beside DECISION_LABEL because they answer the same kind of question — but
    a removal is NOT an adjudication and never joins the decision history. */
const REMOVAL_REASON_LABEL: Record<string, string> = {
  sold_in_store: "Sold in my store / privately",
  sold_elsewhere: "Sold on another website",
  no_longer_for_sale: "No longer for sale",
  listing_mistake: "Listing mistake / duplicate",
  other: "Other",
};
import { formatMoney } from "@/lib/formatMoney";
import { cardImageSrc } from "@/lib/media/cardImage";

/* ════════════════════════════════════════════════════════════════════════
   SELLER LISTINGS ROOM — v2.23, Seller Listings Design Gate (LOCKED)

   Governing artifact: FairWatchTrade_Seller_Listings_Design_Gate_Artifact —
   the PROPOSED right-hand room only (the left panel is June 27 ancestry and
   is deliberately not reproduced). Session evidence, not a repo file.

   Locked architecture, inside the real Seller Workspace shell:
     1. existing workspace navigation (owned by AccountDashboard — untouched);
     2. compact one-watch-per-row inventory (this file, center column);
     3. contextual selected-listing rail (this file, right column).
   The first visible listing is selected by default — the rail never opens
   empty. Selecting another row updates the rail without navigating away.

   TRUTH LAWS applied here (verified against live schema this flight):
   · Lifecycle tabs are the REAL five (all/published/draft/pending_review/
     rejected) — the artifact illustrated three; the product supports five;
     the richer live lifecycle is not reduced.
   · Saves: saved_watches RLS is select_own by the SAVER — a seller cannot
     honestly count saves on their own listing today. The rail therefore
     shows a truthful unavailable state. NEVER a fabricated 0. "No saves
     yet" may appear only when the database truth is genuinely zero, which
     this session cannot honestly observe — so it does not appear at all.
   · Correspondence: listing-specific conversation THREADS (not messages),
     composed at read time from the RLS-scoped /api/messages summaries the
     workspace already fetches. Genuinely-zero renders "No conversations
     yet"; a failed fetch renders an unavailable state, not 0.
   · View Listing: /listings/[id] — real for published listings only, so it
     renders only there.
   · Edit: verified truth (reviewed correction, this flight) — the sell
     flow is create-only and never loads an existing row, so MANUAL drafts
     have no edit route; but IMPORTED drafts/rejected imports have a real
     editing room: the v2.21 Imported Drafts workspace. The rail therefore
     offers "Edit in Imported Drafts" (module switch — real) exactly where
     dealer_import provenance exists (RLS-scoped listing_media check), and
     an unmistakably-disabled, still-readable Edit control everywhere else.
     No route is invented.
   · Market Pulse: honest unavailable state with the locked copy. No
     speculative logic, no metrics.
   · Never rendered: score rings, significance/combined/completeness score,
     view counts, buyer locations, presence, activity narration, urgency,
     trend arrows, invented comparables.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type ListingPhoto = { photo: { url: string }; category: string };

export type ListingThreadStat = {
  listingId: string | null;
};

type TabId =
  | "all"
  | "published"
  | "reserved"
  | "draft"
  | "pending_review"
  | "rejected"
  | "removed";

// v2.27 — 'reserved' is an intentional lifecycle state, not a fall-through: a
// listing whose offer was accepted (watch off the competitive market). It gets
// its own tab and, under Hybrid C, its own perimeter + badge so it never
// renders blank under "All". Labels come from lib/listingStatus.ts.
//
// Hybrid C (Design Gate closed) — the CONTAINER carries lifecycle: a faint
// perimeter in the state's --lc-<key>-line (+ a wash on the larger rail card),
// with the exact word in the badge. The teal --lc-attn-edge is Channel 2
// (attention / new change), shown only on a real condition. Selection is
// neutral (Channel 4) — gold no longer means "selected".
function lifecycleContainerStyle(
  status: string,
  opts: { selected?: boolean; attention?: boolean; wash?: boolean } = {}
): React.CSSProperties {
  const key = statusTokenKey(status);
  const shadows: string[] = [];
  if (opts.selected) shadows.push("inset 0 0 0 1px var(--lc-select-line)");
  if (opts.attention) shadows.push("inset 3px 0 0 0 var(--lc-attn-edge)");
  const style: React.CSSProperties = {
    borderColor: `var(--lc-${key}-line)`,
    boxShadow: shadows.length ? shadows.join(", ") : undefined,
  };
  if (opts.selected) style.backgroundColor = "var(--lc-select-fill)";
  else if (opts.wash) style.backgroundColor = `var(--lc-${key}-wash, transparent)`;
  return style;
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const key = statusTokenKey(status);
  return {
    borderColor: `var(--lc-${key}-line)`,
    color: `var(--lc-${key}-badge, var(--muted))`,
  };
}

// A real attention/new-change condition today: an integrity hold on a Pending,
// or a clarification round on a Draft (Channel 2 — the teal edge).
function hasAttention(row: {
  status: string;
  integrity_hold_reason?: string | null;
  seller_clarification_note?: string | null;
}): boolean {
  return (
    (row.status === "pending_review" && !!row.integrity_hold_reason) ||
    (row.status === "draft" && row.seller_clarification_note != null)
  );
}

/** One sortable column label. A real <button>, so it is reachable by keyboard
    and announces its own state rather than looking pressable and not being. */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      className={`group flex cursor-pointer items-center gap-1 text-[11px] uppercase tracking-[1.7px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] ${
        align === "right" ? "justify-end" : ""
      } ${active ? "text-[var(--platinum-dim)]" : "text-[var(--muted)] hover:text-[var(--slate)]"}`}
    >
      {label}
      {/* The arrow belongs to the active column only. Inactive columns show a
          hover-only mark so the affordance is discoverable without printing
          six arrows across a header that is meant to stay quiet. */}
      <span
        aria-hidden="true"
        className={`text-[10px] ${
          active ? "text-[var(--gold)]" : "opacity-0 transition-opacity group-hover:opacity-60"
        }`}
      >
        {active ? (sort.dir === 1 ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

/* ── ARRANGEMENT ────────────────────────────────────────────────────────
   IMAGE and ACTIONS are not sortable: one is a photograph and the other is
   a set of controls, and neither answers "how is this arranged?". */
type SortKey = "listing" | "listed" | "price" | "status";

const WORKBENCH_STATE_KEY = "fwt.listings.workbench";

/** Oldest→newest reads as ascending. An unknown date is not "the beginning of
    time" — it sorts to the END in both directions, so reversing the column
    never parades the listings whose date we do not know. */
function compareListed(a: string | null, b: string | null, dir: 1 | -1): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return (a < b ? -1 : 1) * dir;
}

/** Numeric, on the canonical amount — never the formatted string, where
    "US$9,000" sorts below "US$800" because '9' > '8' at the second character.
    A null price is UNSET truth, not zero, so it sorts to the end like an
    unknown date rather than pretending to be the cheapest watch. */
function comparePrice(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return (a - b) * dir;
}

function thumbUrl(photos?: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

export default function SellerListingsRoom({
  listings,
  decisions = [],
  publishedAt = {},
  threadStats,
  threadsLoaded,
  onSubmitForReview,
  onOpenImportedDrafts,
  onRemoved,
  submittingId,
  submitErrorId,
  submitErrorMsg,
}: {
  listings: AccountListing[];
  /** Adjudication history for these listings, newest first. */
  decisions?: AccountDecisionEvent[];
  /** listing id → ISO timestamp it was FIRST published. Composed at read time
      from the decision events; absent means the listing has never been
      published, or was published before that record existed. Never derived
      from created_at. */
  publishedAt?: Record<string, string>;
  /** listing ids of the seller's RLS-scoped correspondence threads (one entry per thread). */
  threadStats: ListingThreadStat[];
  /** false until /api/messages has answered — an unanswered source must not render as 0. */
  threadsLoaded: boolean;
  onSubmitForReview?: (id: string) => void;
  /** real module switch into the Imported Drafts workspace (owned by the shell). */
  onOpenImportedDrafts?: () => void;
  /** Stage 6 — the removal committed. The shell re-runs the server query so
      the new status arrives as truth rather than as a local copy. */
  onRemoved?: () => void;
  submittingId?: string | null;
  submitErrorId?: string | null;
  submitErrorMsg?: string | null;
}) {
  /* ── FILTERS ASK WHICH INVENTORY; HEADERS ASK HOW IT IS ARRANGED ────────
     The tabs above stay filters and are never converted into sort controls.
     The two questions are different and the room answers both.

     Both survive together. A dealer who set PUBLISHED + LISTED DATE ↑, opened
     a watch and came back was previously returned to ALL in default order —
     their working position discarded by the act of using it. sessionStorage
     rather than the URL: a sort is how you are working, not where you are,
     and it should not own a back-button step or be inherited by a shared
     link. It restores on remount and expires with the tab. ── */
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "listed",
    dir: -1,
  });
  const [restored, setRestored] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WORKBENCH_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { tab?: TabId; key?: SortKey; dir?: 1 | -1 };
        if (saved.tab) setActiveTab(saved.tab);
        if (saved.key && (saved.dir === 1 || saved.dir === -1)) {
          setSort({ key: saved.key, dir: saved.dir });
        }
      }
    } catch {
      /* a workbench position is never worth a crash */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    // Only after restore, so the first render's defaults cannot overwrite the
    // saved position before it has been read back.
    if (!restored) return;
    try {
      sessionStorage.setItem(
        WORKBENCH_STATE_KEY,
        JSON.stringify({ tab: activeTab, key: sort.key, dir: sort.dir })
      );
    } catch {
      /* private mode, quota — the room still works, it just forgets */
    }
  }, [restored, activeTab, sort]);

  /* First press of a header takes its natural reading order: A→Z for words,
     oldest→newest for the date per the order, low→high for money. A second
     press reverses. */
  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: (prev.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }
    );

  /* Decision history readers. `decisions` arrives newest-first, so the first
     match for a listing is its current one and anything after it is genuinely
     earlier — which is the whole point of the append-only record: a later
     ruling never erases the fact that an earlier one was given. */
  const latestMessage = (listingId: string, decision: string): string | null => {
    const hit = decisions.find(
      (d) => d.listing_id === listingId && d.decision === decision
    );
    const msg = hit?.seller_message?.trim();
    return msg ? msg : null;
  };
  const priorDecisions = (listingId: string): AccountDecisionEvent[] =>
    decisions.filter((d) => d.listing_id === listingId).slice(1);
  /* dealer_import provenance, RLS-scoped — identifies which drafts have a
     REAL editing room (the Imported Drafts workspace). Null until answered:
     an unanswered source must not silently disable a real action. */
  const [importedIds, setImportedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("listing_media")
          .select("listing_id")
          .eq("capture_source", "dealer_import");
        if (!cancelled && !error && Array.isArray(data)) {
          setImportedIds(new Set(data.map((m) => m.listing_id as string)));
        }
      } catch {
        /* rail simply keeps the disabled state — never crashes the room */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Stage 6 — Remove. The trigger element is held so focus can return to it
     when the dialog closes, matching the Withdraw Offer confirmation. The
     outcome notice is kept separately and announced politely: a seller who
     just closed three buyers' requests should be told that happened, in
     numbers, without a second dialog to dismiss. */
  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    title: string;
    publicCode: string | null;
    trigger: HTMLElement | null;
  } | null>(null);
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);

  /* Stage 7 — Delete Listing. Only ever opened on a Removed listing, and the
     dialog asks the server for the verdict; this holds nothing but which
     listing is being asked about. */
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
    reference: string | null;
    publicCode: string | null;
    trigger: HTMLElement | null;
  } | null>(null);

  /* ── ONE TABLE, TWO HANDLES ──────────────────────────────────────────
     The grid scrolls horizontally at intermediate widths, and a scroll
     container puts its bar at the BOTTOM of its own box — measured 168px
     below the fold with sixteen listings. Meanwhile the only bar the eye
     could actually see belonged to the lifecycle tabs sitting right above
     the column headers. That is a false affordance: it looks like the
     table's handle and moves something else entirely.

     So the table gets a second handle, directly above its own headers.
     Both are real scroll containers driving ONE position — the top one
     contains nothing but a spacer as wide as the table, so dragging either
     is the same gesture on the same grid. There is no second scroll state
     to drift out of sync.

     The spacer width is written to the DOM imperatively rather than held
     in React state. This is synchronisation with the layout, not data, and
     routing a number the browser already knows through a render would add
     a setState-in-effect for nothing. */
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);

  const mirrorScroll = useCallback(
    (
      from: React.RefObject<HTMLDivElement | null>,
      to: React.RefObject<HTMLDivElement | null>
    ) => {
      if (syncingRef.current) return;
      const a = from.current;
      const b = to.current;
      if (!a || !b || a.scrollLeft === b.scrollLeft) return;
      syncingRef.current = true;
      b.scrollLeft = a.scrollLeft;
      /* Released on the next frame: setting scrollLeft fires the other
         element's own scroll event, and without this guard the two would
         echo each other and fight an in-progress drag. */
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    },
    []
  );

  const counts = {
    all: listings.length,
    published: listings.filter((l) => l.status === "published").length,
    reserved: listings.filter((l) => l.status === "reserved").length,
    draft: listings.filter((l) => l.status === "draft").length,
    pending_review: listings.filter((l) => l.status === "pending_review").length,
    rejected: listings.filter((l) => l.status === "rejected").length,
    removed: listings.filter((l) => l.status === "removed").length,
  };

  // The "Sale Pending" tab appears only once a reserved listing exists, so the
  // inventory rail stays quiet for sellers who have none — but reserved rows
  // are never silently absent (they also remain under "All").
  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.all },
    { id: "published", label: "Published", count: counts.published },
    ...(counts.reserved > 0
      ? [{ id: "reserved" as TabId, label: "Sale Pending", count: counts.reserved }]
      : []),
    { id: "draft", label: "Drafts", count: counts.draft },
    { id: "pending_review", label: "Pending", count: counts.pending_review },
    { id: "rejected", label: "Rejected", count: counts.rejected },
    // Same rule as Sale Pending: the tab appears once the seller actually has
    // one, so a seller who has never removed anything is not shown an empty
    // filter — and a removed row is never hidden, because it stays under All.
    ...(counts.removed > 0
      ? [{ id: "removed" as TabId, label: "Paused", count: counts.removed }]
      : []),
  ];

  const visible = useMemo(() => {
    const filtered =
      activeTab === "all" ? listings : listings.filter((l) => l.status === activeTab);
    const { key, dir } = sort;
    /* A copy — the prop belongs to the server page and sorting it in place
       would mutate what the shell holds. */
    return [...filtered].sort((a, b) => {
      if (key === "price") return comparePrice(a.asking_price, b.asking_price, dir);
      if (key === "listed") {
        return compareListed(publishedAt[a.id] ?? null, publishedAt[b.id] ?? null, dir);
      }
      if (key === "status") {
        /* The status the SELLER reads, so the arrangement matches the words
           on screen. Plain A→Z: no workflow-priority doctrine is invented
           here, because none has been ruled. */
        const c = sellerLabel(a.status).localeCompare(sellerLabel(b.status));
        return (c !== 0 ? c : a.brand.localeCompare(b.brand)) * dir;
      }
      // listing: brand first, model as the tie-breaker.
      const c = a.brand.localeCompare(b.brand);
      return (c !== 0 ? c : (a.model ?? "").localeCompare(b.model ?? "")) * dir;
    });
  }, [listings, activeTab, sort, publishedAt]);

  /* Keep the top handle exactly as wide as the table it drives. Re-measured
     whenever the table's own box changes — a tab switch, a different row
     count, a window resize — so the handle can never promise a scroll range
     the grid does not have. */
  useEffect(() => {
    const table = tableScrollRef.current;
    const spacer = spacerRef.current;
    const handle = topScrollRef.current;
    if (!table || !spacer || !handle) return;
    const measure = () => {
      spacer.style.width = `${table.scrollWidth}px`;
      /* Hide the handle outright when the table fits.

         Measured at 1546px: the table reported 0px of overflow and correctly
         drew no bar, but the handle still reserved 15px — its content is a
         1px spacer, so the browser keeps the gutter rather than collapsing
         it, and the result was an empty bronze strip above the headers at
         wide desktop. overflow-x: auto is not enough on its own here. */
      handle.style.display =
        table.scrollWidth > table.clientWidth + 1 ? "" : "none";
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(table);
    return () => ro.disconnect();
  }, [visible.length, activeTab]);

  /* First VISIBLE listing selects by default; if the current selection
     leaves the filtered view, selection follows to the new first row. The
     rail never opens empty while any row exists. */
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((l) => l.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  const selected = visible.find((l) => l.id === selectedId) ?? null;

  const selectedThreadCount = selected
    ? threadStats.filter((t) => t.listingId === selected.id).length
    : 0;

  /* A null price is UNSET truth, never $0 — the gate forbids converting
     unavailable data into zero. Money Truth Stage B: a present amount renders
     through the shared currency-aware formatter (undisclosed until the row's
     currency is attested — never assumed USD), so the row identity travels in,
     not just the number. */
  const price = (row: { asking_price: number | null; asking_currency: string | null }) =>
    row.asking_price === null || row.asking_price === undefined
      ? "—"
      : formatMoney(row.asking_price, row.asking_currency);

  return (
    <div className="flex flex-col lg:flex-row">
      {/* ── CENTER · compact one-watch-per-row inventory ── */}
      <div className="min-w-0 flex-1 lg:border-r lg:border-[var(--border-faint)]">
        {/* THE OUTCOME BELONGS TO THE WORKSPACE, NOT TO A SELECTION.

            This first shipped inside the rail. Removing z99216 advanced the
            selection to m55915, and the sentence about z99216 stayed put —
            now sitting under a different watch and appearing to describe it.

            A result cannot live in a panel whose subject changes underneath
            it. Here it sits above the room itself, where nothing can
            reattach it, and it names the watch outright so it is legible on
            its own terms rather than by proximity. */}
        <div aria-live="polite">
          {removedNotice && (
            <p
              tabIndex={-1}
              ref={(el) => el?.focus()}
              className="border-b border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-6 py-3 text-[11px] leading-[1.55] text-[var(--platinum-dim)] outline-none"
            >
              {removedNotice}
            </p>
          )}
        </div>

        {/* Real lifecycle tabs — all five, never reduced to the artifact's three. */}
        {/* The tab strip overflows by ~31px whenever "Rejected" does not fit,
            so it stays scrollable — but its scrollbar chrome is now hidden.

            It used to render a full bar directly above the column headers,
            which is the most misleading place a scrollbar can be: it looked
            like the table's handle and moved five tabs instead. Five tabs are
            reachable by trackpad, touch and keyboard without a bar; the table
            is not, which is why the visible handle now belongs to the table. */}
        <div className="fw-scroll-none flex overflow-x-auto border-b border-[var(--border-faint)]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 border-b-2 px-4 py-[10px] text-[11px] uppercase tracking-[1.5px] transition ${
                  isActive
                    ? "border-[var(--gold)] text-[var(--platinum)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--slate)]"
                }`}
              >
                {tab.label}
                <span className="ml-1 text-[8px] text-[var(--gold)]">{tab.count}</span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="mx-6 mt-6 border border-[var(--border-faint)] px-6 py-10 text-center">
            <p className="text-[13px] text-[var(--muted)]">No listings in this view.</p>
          </div>
        ) : (
          /* THE ROOM'S OWN EDGE.

             Measured at a 1038px viewport: the listings pane is a 468px
             content box, the table needs 563px, every ancestor was
             overflow-x: visible, and so 95px of table painted straight out of
             the pane. The Actions column measured left 717 → right 801 while
             the pane ended at 707 — which is why View buttons appeared on top
             of the Selected Listing rail.

             The horizontal scrollbar already visible above the table belongs
             to the TAB STRIP (it scrolls 31px because "Rejected" does not
             fit), not to this grid. The grid never had a scroll container at
             all. This is that container.

             Content now disappears at the boundary of its own room and is
             reached by scrolling, rather than wandering underneath the
             neighbouring one. Nothing about the rail, the padding, or the
             breakpoints changes.

             THE PERIMETER IS PART OF THE FIX, NOT DECORATION. Each listing
             row carries its own lifecycle border, and with nothing drawn
             around the whole table the eye reads those row borders as the
             pane's outer edge — so a clipped Price or Status fragment looks
             like it is escaping the row rather than passing behind the
             container's edge. One step from --border-faint to
             --border-subtle is enough to establish the hierarchy:
             viewport → rows inside it → rail beside it. A 1px border shifts
             the header and the rows by the same 1px, so their alignment is
             untouched. */
          <div className="border border-[var(--border-subtle)]">
            {/* TOP HANDLE — the same scroll position as the table below it,
                sitting where the eye expects the table's control to be. It
                holds nothing but a spacer as wide as the grid, so it has a
                scrollbar and no content of its own. Hidden from assistive
                tech: it is a duplicate control, and the table itself is
                already scrollable by keyboard. */}
            <div
              ref={topScrollRef}
              onScroll={() => mirrorScroll(topScrollRef, tableScrollRef)}
              className="fw-scroll-x overflow-x-auto"
              aria-hidden="true"
            >
              <div ref={spacerRef} className="h-px" />
            </div>

            <div
              ref={tableScrollRef}
              onScroll={() => mirrorScroll(tableScrollRef, topScrollRef)}
              className="fw-scroll-x overflow-x-auto"
            >
            {/* THE ROW IS AS WIDE AS ITS CONTENT, NOT AS WIDE AS THE WINDOW.

                A block-level grid inside a scroll container takes the
                container's width and lets its tracks paint outside that box.
                Measured before this: a row's box read left 250 → right 694
                while its own Actions cell sat at left 717 → right 801. The
                lifecycle border draws on the BOX, so the green and red
                perimeters stopped short and Price, Status and Actions fell
                outside the very row they belong to — the boxes looked
                compressed because they were.

                min-w-max makes this wrapper as wide as the widest thing in
                it, so every row fills the full track width and its border
                encompasses the whole row, scrolling with it as one object.

                Desktop only: on mobile the grid is two columns and already
                fits, and max-content there would invent a scroll that the
                narrow layout does not need. */}
            <div className="md:min-w-max">
            {/* Column guide. Inactive headers stay as quiet as the guide has
                always been and reveal their affordance on approach; only the
                ACTIVE sort carries a persistent arrow, so the row reads as a
                label with one live indicator rather than a strip of arrows. */}
            <div className="hidden gap-3 px-7 py-2 text-[11px] uppercase tracking-[1.7px] text-[var(--muted)] md:grid md:grid-cols-[56px_minmax(200px,1fr)_104px_110px_120px_84px]">
              <span>Image</span>
              <SortHeader label="Listing" sortKey="listing" sort={sort} onSort={toggleSort} />
              <SortHeader
                label="Listed Date"
                sortKey="listed"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
              <SortHeader
                label="Price"
                sortKey="price"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
              <SortHeader
                label="Status"
                sortKey="status"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
              <span className="text-right">Actions</span>
            </div>

            {/* Hybrid C — each listing is its own container carrying its
                lifecycle perimeter; a faint gap separates them so the states
                read as distinct without a wash at this compact density. */}
            <div className="flex flex-col gap-[6px] px-3 pb-4 pt-1">
            {visible.map((row) => {
              const isSel = row.id === selectedId;
              const thumb = thumbUrl(row.photos);
              const badge = sellerLabel(row.status);
              const attn = hasAttention(row);
              return (
                <div
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  style={lifecycleContainerStyle(row.status, { selected: isSel, attention: attn })}
                  className="relative grid cursor-pointer grid-cols-[56px_minmax(0,1fr)] items-center gap-3 border px-4 py-[12px] transition hover:bg-[rgba(255,255,255,0.018)] md:grid-cols-[56px_minmax(200px,1fr)_104px_110px_120px_84px]"
                >
                  {/* Real listing photograph */}
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cardImageSrc(thumb, { width: 240 })}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] text-[var(--muted)]">—</span>
                    )}
                  </div>

                  {/* Identity — brand · model/collector identity · full
                      reference · listing code.

                      The track floor is 200px, not minmax(0,1fr). Measured:
                      1fr resolved to 0px in a 468px pane, and a zero-width
                      track does not merely squeeze this cell — it deletes most
                      of it, because the model is line-clamped and the
                      reference is truncated, and both clip to nothing at zero
                      width. Only the brand survived, because it is the one
                      line here with no overflow rule. The floor is what makes
                      the table overflow (and therefore scroll) instead of
                      silently eating the watch's identity. */}
                  <div className="min-w-0">
                    {/* The maker's name was set at 8.5px — smaller than every
                        piece of status language around it, on the one line
                        that says whose watch this is. */}
                    <div className="text-[11px] uppercase tracking-[2px] text-[var(--gold-dim)]">
                      {row.brand}
                    </div>
                    {/* The identity is the star — it WRAPS (two lines max)
                        rather than ellipsizing at narrow widths. */}
                    <div className="line-clamp-2 font-display text-[15px] font-light leading-[1.2] text-[var(--platinum)]">
                      {row.model ?? row.brand}
                    </div>
                    <div className="mt-[2px] truncate text-[11px] tracking-[0.3px] text-[var(--muted)]">
                      Ref. {row.reference}
                    </div>
                    {/* The FWT listing number, inside the identity cell rather
                        than as a column of its own — it is randomly assigned,
                        so it is an identifier, never a sort dimension. Shown
                        in every lifecycle state: the one case it exists for is
                        telling apart watches that are otherwise identical on
                        screen, and a Draft or Removed row needs that as much
                        as a Published one. */}
                    {/* Rendered exactly as the database issued it — lower
                        case. The code is the listing's name, not a label about
                        it, and case-shifting a name is a small lie. */}
                    {row.public_code && (
                      <div className="mt-[3px] truncate font-mono text-[11px] tracking-[1.1px] text-[var(--gold-dim)]">
                        {row.public_code}
                      </div>
                    )}
                  </div>

                  {/* LISTED DATE — the day this watch became visible to
                      collectors, and nothing else.

                      A dash is not a gap to be filled. A draft has never been
                      listed, so it has no listed date; substituting the day
                      the row was created would tell a dealer their unpublished
                      watch has been on the market for weeks. Published rows
                      from before the decision record existed are unknown for
                      the same reason, and are shown as unknown. */}
                  <div className="hidden text-right text-[12px] tabular-nums text-[var(--platinum-dim)] md:block">
                    {publishedAt[row.id] ? (
                      new Date(publishedAt[row.id]).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="hidden text-right font-display text-[16px] font-light text-[var(--platinum-dim)] md:block">
                    {price(row)}
                  </div>

                  {/* Status — its own column now, so it can be sorted and so
                      the badge stops sharing a cell with the controls. */}
                  <div className="hidden items-center justify-end md:flex">
                    <span
                      className="border px-2 py-[3px] text-[11px] uppercase tracking-[1.2px]"
                      style={statusBadgeStyle(row.status)}
                    >
                      {badge}
                    </span>
                  </div>

                  {/* Actions — real behaviour only; never a control that does
                      nothing on a row that cannot do it. */}
                  <div className="hidden items-center justify-end gap-2 md:flex">
                    {(row.status === "published" || row.status === "reserved") && (
                      <Link
                        href={`/listings/${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="border border-[var(--border-mid)] px-2.5 py-[5px] text-[11px] uppercase tracking-[1.4px] text-[var(--muted)] transition hover:text-[var(--platinum)]"
                      >
                        View
                      </Link>
                    )}
                    {/* Secondary control ONLY where it connects to real behavior:
                        a draft's real action is the existing owner-gated submit. */}
                    {row.status === "draft" && onSubmitForReview && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSubmitForReview(row.id);
                        }}
                        disabled={submittingId === row.id}
                        className="border border-[var(--border-gold)] px-2.5 py-[5px] text-[11px] uppercase tracking-[1.4px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {submittingId === row.id ? "…" : "Submit"}
                      </button>
                    )}
                  </div>

                  {/* Mobile: price + status compose with identity, never lost. */}
                  <div className="col-span-2 -mt-1 flex items-center justify-between md:hidden">
                    <span className="font-display text-[14px] font-light text-[var(--platinum-dim)]">
                      {price(row)}
                    </span>
                    <span
                      className="border px-2 py-[3px] text-[11px] uppercase tracking-[1.2px]"
                      style={statusBadgeStyle(row.status)}
                    >
                      {badge}
                    </span>
                  </div>

                  {submitErrorId === row.id && submitErrorMsg && (
                    <div className="col-span-full text-[10px] text-[var(--danger)]">
                      {submitErrorMsg}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
            </div>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT · contextual selected-listing rail ── */}
      <aside className="w-full shrink-0 border-t border-[var(--border-faint)] p-4 lg:w-[316px] lg:border-t-0">
        {selected ? (
          <div className="flex flex-col gap-4">
            <div
              className="border p-4"
              style={lifecycleContainerStyle(selected.status, {
                attention: hasAttention(selected),
                wash: true,
              })}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[2.2px] text-[var(--gold)]">
                  Selected Listing
                </span>
                <span
                  className="border px-2 py-[3px] text-[11px] uppercase tracking-[1.2px]"
                  style={statusBadgeStyle(selected.status)}
                >
                  {sellerLabel(selected.status)}
                </span>
              </div>

              {/* Substantially larger real photograph */}
              <div className="mb-3 flex h-[220px] items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
                {thumbUrl(selected.photos) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cardImageSrc(thumbUrl(selected.photos)!)}
                    alt={selected.model ?? selected.brand}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-display text-[12px] italic text-[var(--muted)]">
                    No photograph
                  </span>
                )}
              </div>

              <div className="text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]">
                {selected.brand}
              </div>
              <h3 className="mt-1 font-display text-[22px] font-light leading-[1.08] text-[var(--platinum)]">
                {selected.model ?? selected.brand}
              </h3>
              <div className="mt-1.5 text-[10px] text-[var(--muted)]">Ref. {selected.reference}</div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
                <div className="col-span-2 border-t border-[rgba(255,255,255,0.035)] pt-2.5">
                  <div className="text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                    Asking Price
                  </div>
                  <div className="mt-1 font-display text-[24px] font-light text-[var(--platinum)]">
                    {price(selected)}
                  </div>
                </div>

                {/* SAVES — not honestly queryable by the seller today
                    (saved_watches RLS is saver-owned). Truthful unavailable
                    state; never a fabricated zero. */}
                <div className="border-t border-[rgba(255,255,255,0.035)] pt-2.5">
                  <div className="text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                    Saves
                  </div>
                  <div className="mt-1 font-display text-[15px] font-light text-[var(--platinum-dim)]">
                    Not available yet
                  </div>
                </div>

                {/* CORRESPONDENCE — listing-specific threads, composed at
                    read time from the RLS-scoped source already fetched. */}
                <div className="border-t border-[rgba(255,255,255,0.035)] pt-2.5">
                  <div className="text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                    Correspondence
                  </div>
                  {threadsLoaded ? (
                    <>
                      <div className="mt-1 font-display text-[20px] font-light text-[var(--platinum)]">
                        {selectedThreadCount}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {selectedThreadCount === 0
                          ? "No conversations yet"
                          : selectedThreadCount === 1
                            ? "1 conversation"
                            : `${selectedThreadCount} conversations`}
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 font-display text-[15px] font-light text-[var(--platinum-dim)]">
                      Not available yet
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {selected.status === "published" || selected.status === "reserved" ? (
                  <Link
                    href={`/listings/${selected.id}`}
                    className="border border-[rgba(201,168,76,0.34)] bg-[rgba(201,168,76,0.045)] px-3 py-[11px] text-center text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.09)]"
                  >
                    {selected.status === "reserved" ? "View Sale-Pending Listing" : "View Listing"}
                  </Link>
                ) : (
                  <div className="border border-[var(--border-faint)] px-3 py-[11px] text-center text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                    Not publicly visible
                  </div>
                )}

                {/* v2.24 — locked held-state copy for an integrity-held
                    listing; never names the machinery, never accuses. */}
                {selected.status === "pending_review" && selected.integrity_hold_reason && (
                  <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left text-[10px] leading-[1.55] text-[var(--muted)]">
                    Your photographs are receiving an additional authenticity review.
                    <span className="mt-1 block">
                      Your listing is saved and is not visible to buyers yet. Most reviews
                      require no action from the seller.
                    </span>
                  </div>
                )}

                {/* v2.24 — clarification round: locked introduction + the
                    founder's bounded note. Resubmitting clears it. */}
                {selected.status === "draft" && selected.seller_clarification_note != null && (
                  <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left text-[10px] leading-[1.55] text-[var(--muted)]">
                    We need a little more information about one or more photographs before
                    the listing can be published.
                    {selected.seller_clarification_note.trim() !== "" && (
                      <span className="mt-1 block text-[var(--platinum-dim)]">
                        {selected.seller_clarification_note}
                      </span>
                    )}
                  </div>
                )}

                {/* Submitted and waiting — the first-time seller who cannot
                    find their watch on Browse gets the answer here, without
                    needing to know what a dashboard is. */}
                {selected.status === "pending_review" && !selected.integrity_hold_reason && (
                  <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left text-[10px] leading-[1.55] text-[var(--muted)]">
                    We&apos;ve received this listing and it&apos;s waiting for review.
                    <span className="mt-1 block">
                      It is not public yet. We&apos;ll let you know when it&apos;s approved or
                      if anything needs your attention.
                    </span>
                  </div>
                )}

                {/* What happened, why, and what next — for the decisions that
                    go against the seller. The reason is the founder's own
                    persisted message: the same words that were emailed, never
                    the founder-only reviewer note. */}
                {selected.status === "rejected" && (
                  <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left text-[10px] leading-[1.55] text-[var(--muted)]">
                    This listing won&apos;t be going live on FairWatchTrade.
                    {(selected.rejection_reason ?? latestMessage(selected.id, "rejected")) && (
                      <span className="mt-1 block text-[var(--platinum-dim)]">
                        {selected.rejection_reason ?? latestMessage(selected.id, "rejected")}
                      </span>
                    )}
                    <span className="mt-1 block">
                      Nothing has been deleted — your listing and its photographs are saved.
                    </span>
                  </div>
                )}

                {/* Stage 6 — the Removed state, read back to the seller in the
                    words they chose. Removed is a LIVE state in their own
                    workspace, so this panel says what is true of it rather
                    than presenting it as an ending: the watch is theirs, the
                    listing is intact, and only its public availability
                    stopped. The one thing not yet built is said plainly
                    instead of implied. */}
                {selected.status === "removed" && (
                  <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left text-[10px] leading-[1.55] text-[var(--muted)]">
                    You paused this listing
                    {selected.removed_at
                      ? ` on ${new Date(selected.removed_at).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}`
                      : ""}
                    .
                    {selected.removal_reason_code && (
                      <span className="mt-1 block text-[var(--platinum-dim)]">
                        {REMOVAL_REASON_LABEL[selected.removal_reason_code] ??
                          selected.removal_reason_code}
                        {selected.removal_reason_note
                          ? ` — ${selected.removal_reason_note}`
                          : ""}
                      </span>
                    )}
                    <span className="mt-1 block">
                      Nothing has been deleted. The listing and its photographs are
                      still here, and buyers can no longer see it.
                    </span>
                    <span className="mt-1 block">
                      Putting it back on the market isn&apos;t available yet.
                    </span>
                    {/* Historical reasons are shown, never asked for. Pause no
                        longer collects one, but listings paused under the older
                        Remove semantics genuinely carry the reason their seller
                        chose, and that is history rather than something to
                        quietly drop. */}
                  </div>
                )}

                {selected.status === "draft" &&
                  selected.seller_clarification_note == null &&
                  latestMessage(selected.id, "returned_to_draft") && (
                    <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left text-[10px] leading-[1.55] text-[var(--muted)]">
                      This listing was returned to your drafts so you can make a change.
                      <span className="mt-1 block text-[var(--platinum-dim)]">
                        {latestMessage(selected.id, "returned_to_draft")}
                      </span>
                      <span className="mt-1 block">
                        Everything you entered is still here. Submit it for review again when
                        you&apos;re ready.
                      </span>
                    </div>
                  )}

                {/* Earlier decisions stay truthful. A later ruling never
                    rewrites an earlier one, so a listing that was clarified
                    and then rejected still shows that both happened. */}
                {priorDecisions(selected.id).length > 0 && (
                  <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-3 py-2.5 text-left text-[10px] leading-[1.55] text-[var(--muted)]">
                    <span className="block text-[var(--muted)]">Earlier in this review</span>
                    {priorDecisions(selected.id).map((d, i) => (
                      <span key={i} className="mt-1 block">
                        <span className="text-[var(--platinum-dim)]">
                          {DECISION_LABEL[d.decision] ?? d.decision}
                        </span>
                        {d.seller_message ? ` — ${d.seller_message}` : ""}
                      </span>
                    ))}
                  </div>
                )}

                {/* EDIT — truthful per real routes (reviewed correction):
                    imported drafts/rejected imports have a REAL editing room;
                    everything else has none, and says so readably. */}
                {(selected.status === "draft" || selected.status === "rejected") &&
                importedIds?.has(selected.id) &&
                onOpenImportedDrafts ? (
                  <button
                    type="button"
                    onClick={onOpenImportedDrafts}
                    className="border border-[var(--border-gold)] px-3 py-[11px] text-center text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)]"
                  >
                    Edit in Imported Drafts
                  </button>
                ) : (
                  <div
                    aria-disabled="true"
                    className="cursor-not-allowed border border-dashed border-[var(--border-mid)] px-3 py-[9px] text-center text-[11px] uppercase tracking-[1.6px] text-[var(--muted)] opacity-80"
                    title="Listing editing is not available yet."
                  >
                    Edit Listing
                    <span className="mt-0.5 block text-[11px] normal-case tracking-[0.5px] text-[var(--muted)]">
                      Not available yet
                    </span>
                  </div>
                )}

                {/* REMOVE — offered only where the RPC will actually accept
                    it (published / reserved / pending_review). A draft was
                    never public, so it gets no control rather than a control
                    that fails. Deliberately the quietest action in the rail:
                    it is not destructive, but it is consequential, and it
                    must never compete with View Listing for the eye. */}
                {(selected.status === "published" ||
                  selected.status === "reserved" ||
                  selected.status === "pending_review") && (
                  <button
                    type="button"
                    onClick={(e) => {
                      setRemovedNotice(null);
                      setRemoveTarget({
                        id: selected.id,
                        title: selected.model
                          ? `${selected.brand} ${selected.model}`
                          : selected.brand,
                        publicCode: selected.public_code ?? null,
                        trigger: e.currentTarget,
                      });
                    }}
                    className="border border-[var(--border-subtle)] px-3 py-[11px] text-center text-[11px] uppercase tracking-[1.6px] text-[var(--muted)] transition-colors hover:border-[var(--border-mid)] hover:text-[var(--platinum-dim)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                  >
                    Pause Listing
                    <span className="mt-0.5 block text-[11px] normal-case tracking-[0.5px] text-[var(--muted)]">
                      Take it off the market, keep the listing
                    </span>
                  </button>
                )}

                {/* DELETE — offered only on a Removed listing, which is also
                    the only state the server will evaluate. This is a real
                    control with real behaviour: it asks whether permanent
                    deletion is possible yet and explains the answer. It is
                    NOT a disabled placeholder, and it does not delete —
                    there is no purge to trigger in this stage. */}
                {canAskAboutDeletion(selected.status) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      setRemovedNotice(null);
                      setDeleteTarget({
                        id: selected.id,
                        title: selected.model
                          ? `${selected.brand} ${selected.model}`
                          : selected.brand,
                        reference: selected.reference ?? null,
                        publicCode: selected.public_code ?? null,
                        trigger: e.currentTarget,
                      });
                    }}
                    className="border border-[var(--border-subtle)] px-3 py-[11px] text-center text-[11px] uppercase tracking-[1.6px] text-[var(--muted)] transition-colors hover:border-[var(--lc-rejected-line)] hover:text-[var(--platinum-dim)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                  >
                    Delete Listing
                    <span className="mt-0.5 block text-[11px] normal-case tracking-[0.5px] text-[var(--muted)]">
                      Permanently erase this listing
                    </span>
                  </button>
                )}

              </div>
            </div>

            {/* MARKET PULSE — locked honest unavailable state, verbatim copy. */}
            <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-4 py-3.5">
              <div className="mb-2 text-[11px] uppercase tracking-[2.2px] text-[var(--gold)]">
                Market Pulse
              </div>
              {/* The status was truthful and stayed truthful; the words were
                  the compliance argument FOR the status rather than the thing
                  itself. A seller does not need the evidence policy recited
                  to understand that something is not built yet.
                  "Coming soon" per the order — same future state, human voice.
                  Still promises no valuation, no pricing recommendation, and
                  no live functionality. */}
              <div className="font-display text-[17px] font-light text-[var(--platinum-dim)]">
                Coming soon
              </div>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--muted)]">
                A clearer view of the watch market—bringing together verified
                listings, completed sales, and broader market activity.
              </p>
            </div>
          </div>
        ) : (
          <div className="border border-[var(--border-faint)] px-4 py-8 text-center font-display text-[12px] italic text-[var(--muted)]">
            No listing selected.
          </div>
        )}
      </aside>

      {deleteTarget && (
        <DeleteListingDialog
          listingId={deleteTarget.id}
          title={deleteTarget.title}
          reference={deleteTarget.reference}
          publicCode={deleteTarget.publicCode}
          onClose={() => {
            const trigger = deleteTarget.trigger;
            setDeleteTarget(null);
            trigger?.focus();
          }}
          onDeleted={(summary) => {
            /* Read identity before clearing the target — a moment later
               there is nothing left to ask, and the listing itself no longer
               exists to be looked up. */
            const label = deleteTarget.publicCode
              ? `${deleteTarget.title} (${deleteTarget.publicCode})`
              : deleteTarget.title;
            const closed = summary.requests_closed ?? 0;
            setDeleteTarget(null);
            setRemovedNotice(
              closed > 0
                ? `${label} has been permanently deleted. ${
                    closed === 1
                      ? "One purchase request was closed, and that buyer has been told."
                      : `${closed} purchase requests were closed, and those buyers have been told.`
                  }`
                : `${label} has been permanently deleted.`
            );
            /* The row is gone; the shell must re-read rather than patch a
               local copy of something that no longer exists. */
            onRemoved?.();
          }}
        />
      )}

      {removeTarget && (
        <RemoveListingDialog
          listingId={removeTarget.id}
          title={removeTarget.title}
          publicCode={removeTarget.publicCode}
          onClose={() => {
            const trigger = removeTarget.trigger;
            setRemoveTarget(null);
            trigger?.focus();
          }}
          onRemoved={(result: RemoveResult) => {
            /* Read the identity BEFORE clearing the target — the notice has
               to name its own watch, and a moment later there is no target
               left to ask. */
            const label = removeTarget.publicCode
              ? `${removeTarget.title} (${removeTarget.publicCode})`
              : removeTarget.title;
            setRemoveTarget(null);
            setRemovedNotice(removalNotice(result, label));
            /* The room does not patch its own copy of the status. `listings`
               is a prop owned by the server page, so the shell re-runs that
               query and the new state arrives as truth — the same reason
               submitForReview calls router.refresh() instead of mutating. */
            onRemoved?.();
          }}
        />
      )}
    </div>
  );
}

/* What actually happened, in the seller's terms. Buyers who were waiting are
   named as a count because that is the consequence a seller cannot see for
   themselves, and an accepted request is called out separately precisely
   because Remove did NOT touch it — silence there would read as though it
   had. */
function removalNotice(result: RemoveResult, label: string): string {
  const closed = result.requests_cancelled ?? 0;
  const accepted = result.accepted_requests_remaining ?? 0;

  const parts: string[] = [`${label} is paused and off the market.`];
  if (closed > 0) {
    parts.push(
      closed === 1
        ? "One purchase request that was waiting for your answer has been closed, and that buyer has been told."
        : `${closed} purchase requests that were waiting for your answer have been closed, and those buyers have been told.`
    );
  }
  if (accepted > 0) {
    parts.push(
      accepted === 1
        ? "Your accepted purchase request is unaffected and still stands."
        : `Your ${accepted} accepted purchase requests are unaffected and still stand.`
    );
  }
  return parts.join(" ");
}
