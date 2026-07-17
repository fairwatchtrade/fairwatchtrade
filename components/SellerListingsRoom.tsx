"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AccountListing } from "@/components/AccountDashboard";

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
   · Edit: verified truth (VisionGPT correction, this flight) — the sell
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

type TabId = "all" | "published" | "draft" | "pending_review" | "rejected";

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  pending_review: "Pending Review",
  rejected: "Rejected",
  draft: "Draft",
};

const STATUS_CLASS: Record<string, string> = {
  published: "border-[rgba(121,191,144,0.28)] text-[var(--success)]",
  pending_review: "border-[rgba(201,168,76,0.32)] text-[var(--gold)]",
  rejected: "border-[rgba(200,90,90,0.32)] text-[var(--danger)]",
  draft: "border-[var(--border-mid)] text-[var(--muted)]",
};

function thumbUrl(photos?: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

export default function SellerListingsRoom({
  listings,
  threadStats,
  threadsLoaded,
  onSubmitForReview,
  onOpenImportedDrafts,
  submittingId,
  submitErrorId,
  submitErrorMsg,
}: {
  listings: AccountListing[];
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
    draft: listings.filter((l) => l.status === "draft").length,
    pending_review: listings.filter((l) => l.status === "pending_review").length,
    rejected: listings.filter((l) => l.status === "rejected").length,
  };

  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.all },
    { id: "published", label: "Published", count: counts.published },
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
     unavailable data into zero. */
  const price = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : `$${Number(n).toLocaleString("en-US")}`;

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
                className={`shrink-0 border-b-2 px-4 py-[10px] text-[10px] uppercase tracking-[1.5px] transition ${
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

        {visible.length === 0 ? (
          <div className="mx-6 mt-6 border border-[var(--border-faint)] px-6 py-10 text-center">
            <p className="text-[13px] text-[var(--muted)]">No listings in this view.</p>
          </div>
        ) : (
          <div>
            {/* Column guide — quiet, uppercase, from the locked artifact. */}
            <div className="hidden gap-3 border-b border-[rgba(255,255,255,0.03)] px-6 py-2 text-[8px] uppercase tracking-[1.7px] text-[var(--muted)] md:grid md:grid-cols-[56px_minmax(0,1fr)_110px_150px]">
              <span>Image</span>
              <span>Listing</span>
              <span className="text-right">Price</span>
              <span className="text-right">Status · Actions</span>
            </div>

            {visible.map((row) => {
              const isSel = row.id === selectedId;
              const thumb = thumbUrl(row.photos);
              const badge = STATUS_LABELS[row.status] ?? row.status;
              const badgeCls = STATUS_CLASS[row.status] ?? STATUS_CLASS.draft;
              return (
                <div
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`relative grid cursor-pointer grid-cols-[56px_minmax(0,1fr)] items-center gap-3 border-b border-[rgba(255,255,255,0.03)] px-6 py-[13px] transition hover:bg-[rgba(255,255,255,0.018)] md:grid-cols-[56px_minmax(0,1fr)_110px_150px] ${
                    isSel
                      ? "bg-[rgba(201,168,76,0.045)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-[var(--gold)]"
                      : ""
                  }`}
                >
                  {/* Real listing photograph */}
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[9px] text-[var(--ghost)]">—</span>
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
                    <div className="mt-[2px] truncate text-[9px] tracking-[0.3px] text-[var(--muted)]">
                      Ref. {row.reference}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="hidden text-right font-display text-[16px] font-light text-[var(--platinum-dim)] md:block">
                    {price(row.asking_price)}
                  </div>

                  {/* Status + restrained real actions */}
                  <div className="hidden items-center justify-end gap-2 md:flex">
                    <span
                      className={`border px-2 py-[3px] text-[8px] uppercase tracking-[1.5px] ${badgeCls}`}
                    >
                      {badge}
                    </span>
                    {row.status === "published" && (
                      <Link
                        href={`/listings/${row.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="border border-[var(--border-mid)] px-2.5 py-[5px] text-[9px] uppercase tracking-[1.4px] text-[var(--muted)] transition hover:text-[var(--platinum)]"
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
                        className="border border-[var(--border-gold)] px-2.5 py-[5px] text-[9px] uppercase tracking-[1.4px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {submittingId === row.id ? "…" : "Submit"}
                      </button>
                    )}
                  </div>

                  {/* Mobile: price + status compose with identity, never lost. */}
                  <div className="col-span-2 -mt-1 flex items-center justify-between md:hidden">
                    <span className="font-display text-[14px] font-light text-[var(--platinum-dim)]">
                      {price(row.asking_price)}
                    </span>
                    <span className={`border px-2 py-[3px] text-[8px] uppercase tracking-[1.5px] ${badgeCls}`}>
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
        )}
      </div>

      {/* ── RIGHT · contextual selected-listing rail ── */}
      <aside className="w-full shrink-0 border-t border-[var(--border-faint)] p-4 lg:w-[316px] lg:border-t-0">
        {selected ? (
          <div className="flex flex-col gap-4">
            <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.01)] p-4">
              <div className="mb-3 text-[9px] uppercase tracking-[2.2px] text-[var(--gold)]">
                Selected Listing
              </div>

              {/* Substantially larger real photograph */}
              <div className="mb-3 flex h-[220px] items-center justify-center overflow-hidden border border-[var(--border-faint)] bg-[var(--surface)]">
                {thumbUrl(selected.photos) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl(selected.photos)!}
                    alt={selected.model ?? selected.brand}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-display text-[12px] italic text-[var(--ghost)]">
                    No photograph
                  </span>
                )}
              </div>

              <div className="text-[8px] uppercase tracking-[2px] text-[var(--gold-dim)]">
                {selected.brand}
              </div>
              <h3 className="mt-1 font-display text-[22px] font-light leading-[1.08] text-[var(--platinum)]">
                {selected.model ?? selected.brand}
              </h3>
              <div className="mt-1.5 text-[10px] text-[var(--muted)]">Ref. {selected.reference}</div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
                <div className="col-span-2 border-t border-[rgba(255,255,255,0.035)] pt-2.5">
                  <div className="text-[9px] uppercase tracking-[1.6px] text-[var(--muted)]">
                    Asking Price
                  </div>
                  <div className="mt-1 font-display text-[24px] font-light text-[var(--platinum)]">
                    {price(selected.asking_price)}
                  </div>
                </div>

                {/* SAVES — not honestly queryable by the seller today
                    (saved_watches RLS is saver-owned). Truthful unavailable
                    state; never a fabricated zero. */}
                <div className="border-t border-[rgba(255,255,255,0.035)] pt-2.5">
                  <div className="text-[9px] uppercase tracking-[1.6px] text-[var(--muted)]">
                    Saves
                  </div>
                  <div className="mt-1 font-display text-[15px] font-light text-[var(--platinum-dim)]">
                    Not available yet
                  </div>
                </div>

                {/* CORRESPONDENCE — listing-specific threads, composed at
                    read time from the RLS-scoped source already fetched. */}
                <div className="border-t border-[rgba(255,255,255,0.035)] pt-2.5">
                  <div className="text-[9px] uppercase tracking-[1.6px] text-[var(--muted)]">
                    Correspondence
                  </div>
                  {threadsLoaded ? (
                    <>
                      <div className="mt-1 font-display text-[20px] font-light text-[var(--platinum)]">
                        {selectedThreadCount}
                      </div>
                      <div className="mt-0.5 text-[9px] text-[var(--muted)]">
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
                {selected.status === "published" ? (
                  <Link
                    href={`/listings/${selected.id}`}
                    className="border border-[rgba(201,168,76,0.34)] bg-[rgba(201,168,76,0.045)] px-3 py-[11px] text-center text-[10px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.09)]"
                  >
                    View Listing
                  </Link>
                ) : (
                  <div className="border border-[var(--border-faint)] px-3 py-[11px] text-center text-[10px] uppercase tracking-[1.6px] text-[var(--muted)]">
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
                  <div className="border-l border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)] px-3 py-2.5 text-left text-[10px] leading-[1.55] text-[var(--muted)]">
                    We need a little more information about one or more photographs before
                    the listing can be published.
                    {selected.seller_clarification_note.trim() !== "" && (
                      <span className="mt-1 block text-[var(--platinum-dim)]">
                        {selected.seller_clarification_note}
                      </span>
                    )}
                  </div>
                )}

                {/* EDIT — truthful per real routes (VisionGPT correction):
                    imported drafts/rejected imports have a REAL editing room;
                    everything else has none, and says so readably. */}
                {(selected.status === "draft" || selected.status === "rejected") &&
                importedIds?.has(selected.id) &&
                onOpenImportedDrafts ? (
                  <button
                    type="button"
                    onClick={onOpenImportedDrafts}
                    className="border border-[var(--border-gold)] px-3 py-[11px] text-center text-[10px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)]"
                  >
                    Edit in Imported Drafts
                  </button>
                ) : (
                  <div
                    aria-disabled="true"
                    className="cursor-not-allowed border border-dashed border-[var(--border-mid)] px-3 py-[9px] text-center text-[10px] uppercase tracking-[1.6px] text-[var(--muted)] opacity-80"
                    title="Listing editing is not available yet."
                  >
                    Edit Listing
                    <span className="mt-0.5 block text-[9px] normal-case tracking-[0.5px] text-[var(--muted)]">
                      Not available yet
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* MARKET PULSE — locked honest unavailable state, verbatim copy. */}
            <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-4 py-3.5">
              <div className="mb-2 text-[9px] uppercase tracking-[2.2px] text-[var(--gold)]">
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
          <div className="border border-[var(--border-faint)] px-4 py-8 text-center font-display text-[12px] italic text-[var(--ghost)]">
            No listing selected.
          </div>
        )}
      </aside>
    </div>
  );
}
