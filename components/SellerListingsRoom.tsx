"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { sellerLabel, statusTokenKey } from "@/lib/listingStatus";
import type { AccountListing, AccountDecisionEvent } from "@/components/AccountDashboard";

/** Seller-facing names for the recorded decisions. */
const DECISION_LABEL: Record<string, string> = {
  approved: "Approved",
  rejected: "Not accepted",
  clarification_requested: "More information requested",
  returned_to_draft: "Returned to draft",
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

type TabId = "all" | "published" | "reserved" | "draft" | "pending_review" | "rejected";

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

function thumbUrl(photos?: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

export default function SellerListingsRoom({
  listings,
  decisions = [],
  threadStats,
  threadsLoaded,
  onSubmitForReview,
  onOpenImportedDrafts,
  submittingId,
  submitErrorId,
  submitErrorMsg,
}: {
  listings: AccountListing[];
  /** Adjudication history for these listings, newest first. */
  decisions?: AccountDecisionEvent[];
  /** listing ids of the seller's RLS-scoped correspondence threads (one entry per thread). */
  threadStats: ListingThreadStat[];
  /** false until /api/messages has answered — an unanswered source must not render as 0. */
  threadsLoaded: boolean;
  onSubmitForReview?: (id: string) => void;
  /** real module switch into the Imported Drafts workspace (owned by the shell). */
  onOpenImportedDrafts?: () => void;
  submittingId?: string | null;
  submitErrorId?: string | null;
  submitErrorMsg?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const counts = {
    all: listings.length,
    published: listings.filter((l) => l.status === "published").length,
    reserved: listings.filter((l) => l.status === "reserved").length,
    draft: listings.filter((l) => l.status === "draft").length,
    pending_review: listings.filter((l) => l.status === "pending_review").length,
    rejected: listings.filter((l) => l.status === "rejected").length,
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
  ];

  const visible = useMemo(
    () => (activeTab === "all" ? listings : listings.filter((l) => l.status === activeTab)),
    [listings, activeTab]
  );

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
        {/* Real lifecycle tabs — all five, never reduced to the artifact's three. */}
        <div className="flex overflow-x-auto border-b border-[var(--border-faint)]">
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
          <div>
            {/* Column guide — quiet, uppercase, from the locked artifact. */}
            <div className="hidden gap-3 px-7 py-2 text-[11px] uppercase tracking-[1.7px] text-[var(--muted)] md:grid md:grid-cols-[56px_minmax(0,1fr)_110px_150px]">
              <span>Image</span>
              <span>Listing</span>
              <span className="text-right">Price</span>
              <span className="text-right">Status · Actions</span>
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
                  className="relative grid cursor-pointer grid-cols-[56px_minmax(0,1fr)] items-center gap-3 border px-4 py-[12px] transition hover:bg-[rgba(255,255,255,0.018)] md:grid-cols-[56px_minmax(0,1fr)_110px_150px]"
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

                  {/* Identity — brand · model/collector identity · full reference */}
                  <div className="min-w-0">
                    <div className="text-[8.5px] uppercase tracking-[2px] text-[var(--gold-dim)]">
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
                  </div>

                  {/* Price */}
                  <div className="hidden text-right font-display text-[16px] font-light text-[var(--platinum-dim)] md:block">
                    {price(row)}
                  </div>

                  {/* Status + restrained real actions */}
                  <div className="hidden items-center justify-end gap-2 md:flex">
                    <span
                      className="border px-2 py-[3px] text-[11px] uppercase tracking-[1.2px]"
                      style={statusBadgeStyle(row.status)}
                    >
                      {badge}
                    </span>
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
              </div>
            </div>

            {/* MARKET PULSE — locked honest unavailable state, verbatim copy. */}
            <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-4 py-3.5">
              <div className="mb-2 text-[11px] uppercase tracking-[2.2px] text-[var(--gold)]">
                Market Pulse
              </div>
              <div className="font-display text-[17px] font-light text-[var(--platinum-dim)]">
                Not available yet
              </div>
              <p className="mt-1.5 text-[10px] leading-[1.55] text-[var(--muted)]">
                Aggregate market context will appear here only when it can be supported by
                verified comparable listings, completed-sale evidence, and broad
                non-identifying demand signals.
              </p>
            </div>
          </div>
        ) : (
          <div className="border border-[var(--border-faint)] px-4 py-8 text-center font-display text-[12px] italic text-[var(--muted)]">
            No listing selected.
          </div>
        )}
      </aside>
    </div>
  );
}
