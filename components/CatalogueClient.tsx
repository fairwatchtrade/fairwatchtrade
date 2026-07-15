"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

/* ────────────────────────────────────────────────────────────────────────
   CATALOGUE CLIENT — the buyer's Catalogue  (v2.7b)

   Answers one question: "What happened while I was away?" Every element is
   secondary to that except the Catalogue Match hero, which answers it
   directly. My Catalogue (reference tracking) is still Phase 2 — its table
   doesn't exist yet, so it renders an honest empty shell. Saved Watches is
   real (v2.5c): fetched client-side from saved_watches, joined to listings.
   Correspondence is real (v2.6): the buyer's table of contents — every row
   links to the listing where the conversation lives, never a separate
   inbox. No fabricated matches, no placeholder watches.

   My Offers is real (v2.7): the buyer's outgoing purchase requests across
   ALL listings, fetched client-side from purchase_requests (RLS already
   permits buyer_id = auth.uid()), joined to listings. It is a READ MODEL —
   no new table, no cache, no mirror; every status label is derived at render
   time from a label map, never persisted. It is a durable workspace: it
   ALWAYS renders, with an honest empty state, and it fails honestly (loading
   and query-failure are distinct from "no offers"). Sits between
   Correspondence and Discovery, matching the page's active-over-passive
   hierarchy. Accepted offers are informational only — no buyer checkout /
   transaction destination exists yet, so none is invented here.

   ANTI-FEATURES (PRODUCT_SOUL.md, enforced here): no listing scores or
   combined_score, no save counts, no trend arrows, no manufactured urgency,
   no social-proof signals — anywhere on this page, ever. The discovery cards
   reuse the /browse visual treatment (defined locally, NOT imported from
   BrowseClient, which is a filtering shell rather than a card library).

   v2.12 — the sidebar now OWNS its horizontal padding (px-5 on the sticky
   wrapper) and the workspace gap is gap-4. The line below this note is the
   original assumption, preserved for history because it was the Left Cliff's
   root cause — no layout wrapper ever fulfilled it:
   Outer spacing assumed the shared app layout provides page max-width and
   horizontal padding (same assumption BrowseClient makes).
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = { photo: { url: string }; category: string };

// Same shape as BrowseClient's ListingRow, minus the private combined_score.
// Exported so the server page can type its cast (mirrors AccountDashboard /
// AccountListing).
export type ListingRow = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  year: string;
  condition: string;
  asking_price: number;
  photos: ListingPhoto[];
  details?: {
    dialColorType?: string;
    caseMaterial?: string;
    documentation?: string;
    caseSizeMm?: string;
    movementType?: string;
  } | null;
  status: string;
  created_at: string;
};

type CatalogueProps = {
  displayName: string | null;
  recentListings: ListingRow[];
};

/* ── My Offers (v2.7) ─────────────────────────────────────────────────────
   A buyer's outgoing purchase request, composed on read from
   purchase_requests + its joined listing. No stored copy of offer state or
   buyer-facing narrative — the status label is applied from STATUS_LABELS at
   render time, so a wording change is a UI edit, never a data migration. */

// Full live status set, verified against the purchase_requests_status_check
// DB constraint: pending | accepted | declined | expired | cancelled |
// superseded. All six are represented so no valid status silently falls
// through to generic or misleading copy.
type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "superseded";

type MyOfferRow = {
  id: string;
  status: string; // raw DB value; narrowed via STATUS_LABELS at render time
  proposed_purchase_price: number | null;
  listing_price: number | null;
  created_at: string;
  listing: ListingRow | null; // joined; may be null if the listing is gone
};

// loaded state is deliberately distinct from empty (loaded + zero rows) and
// from error — so the section never claims "no offers" while still loading or
// after a failed query.
type MyOffersState =
  | { phase: "loading" }
  | { phase: "loaded"; offers: MyOfferRow[] }
  | { phase: "error" };

// Status → buyer-facing copy, derived at render time. superseded is distinct
// from declined in both meaning and wording: the buyer was not individually
// rejected — another request was accepted and the watch is no longer
// available. Copy is non-judgmental across the board and never implies the
// seller personally rejected the buyer.
const STATUS_LABELS: Record<
  OfferStatus,
  { label: string; note: string; tone: "gold" | "success" | "muted" | "ghost" }
> = {
  pending: {
    label: "Pending",
    note: "Awaiting the seller's response.",
    tone: "gold",
  },
  accepted: {
    label: "Accepted",
    note: "The seller accepted your request.",
    tone: "success",
  },
  declined: {
    label: "Declined",
    note: "The seller declined this request.",
    tone: "muted",
  },
  superseded: {
    label: "No longer available",
    note: "Another purchase request for this watch was accepted.",
    tone: "ghost",
  },
  expired: {
    label: "Expired",
    note: "This request expired before it was answered.",
    tone: "ghost",
  },
  cancelled: {
    label: "Cancelled",
    note: "This request was cancelled.",
    tone: "ghost",
  },
};

// Any unrecognized status fails to a neutral, non-misleading descriptor rather
// than rendering nothing (schema honesty: a new DB status must never silently
// vanish from the buyer's view).
function offerLabel(status: string): {
  label: string;
  note: string;
  tone: "gold" | "success" | "muted" | "ghost";
} {
  return (
    STATUS_LABELS[status as OfferStatus] ?? {
      label: status,
      note: "",
      tone: "ghost" as const,
    }
  );
}

const TONE_CLASS: Record<"gold" | "success" | "muted" | "ghost", string> = {
  gold: "text-[var(--gold-subtle)]",
  success: "text-[var(--success)]",
  muted: "text-[var(--muted)]",
  ghost: "text-[var(--ghost)]",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatPrice(value: number): string {
  return `$${Number(value).toLocaleString("en-US")}`;
}

// Dial photo first, fallback to the first photo. Matches /browse.
function heroUrl(photos: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

/* ── Left nav ─────────────────────────────────────────────────────────── */

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--ghost)]">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function NavItem({
  href,
  active,
  soon,
  children,
}: {
  href?: string;
  active?: boolean;
  soon?: boolean;
  children: ReactNode;
}) {
  const base = "block text-[12px] tracking-[0.3px] transition";
  if (soon || !href) {
    // Phase 2 — present but not yet navigable. Quiet, not loud.
    return (
      <div className={`${base} cursor-default text-[var(--ghost)] opacity-60`}>
        {children}
        <span className="ml-1.5 text-[8px] uppercase tracking-[1.5px]">soon</span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} ${
        active
          ? "text-[var(--gold)]"
          : "text-[var(--muted)] hover:text-[var(--platinum)]"
      }`}
    >
      {children}
    </Link>
  );
}

/* ── Discovery card — reuses the /browse visual treatment ─────────────── */

function ListingCard({ row }: { row: ListingRow }) {
  const hero = heroUrl(row.photos);
  const meta = [row.condition, row.year].filter(Boolean).join(" · ");
  const parts = [row.details?.dialColorType, row.details?.caseMaterial].filter(
    Boolean
  );
  const attrs = parts.join(" · ") || null;
  const doc = row.details?.documentation;
  const docBadge = doc === "Full Set" || doc === "Papers Only" ? doc : null;

  return (
    <Link
      href={`/listings/${row.id}`}
      className="group relative block cursor-pointer border border-transparent p-7 transition hover:bg-[rgba(255,255,255,0.02)]"
    >
      <div className="mb-4 flex h-[140px] w-full items-center justify-center overflow-hidden bg-[var(--ink-deep)]">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] tracking-[0.3px] text-[var(--ghost)]">
            No photo
          </div>
        )}
        {docBadge && (
          <span className="absolute right-3 top-3 rounded-full border border-[var(--border-gold)] bg-[rgba(201,168,76,0.08)] px-2 py-0.5 text-[8px] uppercase tracking-[1.5px] text-[var(--gold)]">
            {docBadge}
          </span>
        )}
      </div>

      <div className="mb-[5px] text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
        {row.brand}
      </div>
      <div className="mb-1 font-display text-[15px] font-light leading-[1.25] text-[var(--platinum)]">
        {row.model ?? row.brand}
      </div>
      {meta && (
        <div className="mb-3 text-[10px] tracking-[0.3px] text-[var(--muted)]">
          {attrs ? `${meta} · ${attrs}` : meta}
        </div>
      )}
      <div className="font-display text-[17px] font-light text-[var(--platinum-dim)]">
        {formatPrice(Number(row.asking_price))}
      </div>
    </Link>
  );
}

/* ── My Offers (v2.7a) — buyer's outgoing purchase requests, GROUPED ───────
   A read model over purchase_requests. Always rendered (durable workspace),
   with four honest phases: loading, loaded-with-results, loaded-empty, error.

   OBJECT-FIRST (Purchase Request Law: "Watch is parent. Offers are children"):
   rows are grouped by watch, not shown as a flat list of database rows. Each
   watch appears ONCE; its current/latest request is the dominant headline,
   and any prior requests are listed beneath as quieter history (newest first).
   The watch's photo, title, reference, and price appear once per group — never
   repeated per request. All status copy is derived from STATUS_LABELS at
   render time; nothing is persisted. Accepted requests are informational only
   — the sole navigation is back to the existing listing; no checkout /
   transaction destination is invented. */

type WatchGroup = {
  // Stable grouping key: the listing id when present, else the offer id (so a
  // request whose listing is gone still forms its own honest group).
  key: string;
  listing: ListingRow | null;
  current: MyOfferRow; // latest request (offers arrive newest-first from query)
  history: MyOfferRow[]; // prior requests, newest-first, may be empty
};

// Group offers by watch, preserving the newest-first order the query already
// returned. First offer seen for a listing is its current/headline request;
// subsequent ones become history. Offers with a null listing each stand alone
// (they can't be meaningfully merged with anything).
function groupOffersByWatch(offers: MyOfferRow[]): WatchGroup[] {
  const groups: WatchGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const offer of offers) {
    const key = offer.listing ? offer.listing.id : offer.id;
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      groups.push({
        key,
        listing: offer.listing,
        current: offer,
        history: [],
      });
      indexByKey.set(key, groups.length - 1);
    } else {
      groups[existing].history.push(offer);
    }
  }
  return groups;
}

function offerPrice(offer: MyOfferRow, listing: ListingRow | null): number | null {
  return (
    offer.proposed_purchase_price ??
    offer.listing_price ??
    listing?.asking_price ??
    null
  );
}

// Relative time for offer history — "just now", "2 hours ago", "3 days ago",
// then falls back to an absolute date past ~30 days (older history reads better
// as a real date than "7 weeks ago"). SELF-CONTAINED on purpose: if a shared
// relative-time / date helper already exists elsewhere in the app, swap this
// call for it rather than keeping two definitions. The one date convention seen
// so far (In Hand Verified badge on the listing page) is absolute en-US
// "Month D, YYYY" — matched here for the >30-day fallback so the two agree.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? "yesterday" : `${day} days ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// One prior request, rendered quietly beneath the current one. Subordinate but
// fully readable — each row still answers Offer Amount / Status / When, with no
// repeated watch identity.
function HistoryRow({ offer, listing }: { offer: MyOfferRow; listing: ListingRow | null }) {
  const { label } = offerLabel(offer.status);
  const price = offerPrice(offer, listing);
  const when = relativeTime(offer.created_at);
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[10px] tracking-[0.3px] text-[var(--ghost)]">
      <span className="min-w-0 truncate">
        {price != null ? formatPrice(Number(price)) : "Offer"}
        <span className="mx-1.5 opacity-40">•</span>
        <span className="uppercase tracking-[1.5px]">{label}</span>
      </span>
      {when && <span className="shrink-0 opacity-70">{when}</span>}
    </div>
  );
}

// One watch group: identity once, current request dominant, history beneath.
function WatchOfferGroup({ group }: { group: WatchGroup }) {
  const { listing: l, current, history } = group;
  const { label, note, tone } = offerLabel(current.status);
  const title = l ? (l.model ? `${l.brand} ${l.model}` : l.brand) : "Listing unavailable";
  const hero = l ? heroUrl(l.photos) : null;
  const currentPrice = offerPrice(current, l);
  const currentWhen = relativeTime(current.created_at);

  const inner = (
    <div className="flex gap-4 px-4 py-4">
      {/* Watch thumbnail — appears once per group. Dial-first via heroUrl(),
          matching Discovery / Saved Watches visual identity. */}
      <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center overflow-hidden bg-[var(--ink-deep)]">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="text-[8px] tracking-[0.3px] text-[var(--ghost)]">No photo</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* Identity — once */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] text-[var(--platinum)]">{title}</div>
            {l?.reference && (
              <div className="mt-0.5 text-[10px] tracking-[0.3px] text-[var(--ghost)]">
                Ref. {l.reference}
              </div>
            )}
          </div>
          {/* Current status — the dominant state */}
          <div className="shrink-0 text-right">
            <div className={`text-[10px] uppercase tracking-[2px] ${TONE_CLASS[tone]}`}>
              {label}
            </div>
          </div>
        </div>

        {/* Current offer + its note. Submitted-time is present but subtle, so
            the current request stays dominant over the quieter history below. */}
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <div className="text-[12px] tracking-[0.3px] text-[var(--slate)]">
            {currentPrice != null ? (
              <>Your offer: {formatPrice(Number(currentPrice))}</>
            ) : (
              <>&nbsp;</>
            )}
          </div>
          {currentWhen && (
            <div className="shrink-0 text-[10px] tracking-[0.3px] text-[var(--ghost)]">
              Submitted {currentWhen}
            </div>
          )}
        </div>
        {note && (
          <div className="mt-0.5 text-[10px] leading-snug text-[var(--ghost)]">{note}</div>
        )}

        {/* Prior requests — quieter history, newest-first, identity NOT repeated */}
        {history.length > 0 && (
          <div className="mt-3 border-t border-[rgba(255,255,255,0.04)] pt-2">
            <div className="mb-1 text-[8px] uppercase tracking-[2px] text-[var(--ghost)] opacity-70">
              Previous requests
            </div>
            {history.map((h) => (
              <HistoryRow key={h.id} offer={h} listing={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Navigable to the existing listing when present; otherwise a quiet,
  // non-navigable group (the watch is gone — no fabricated destination).
  return l ? (
    <Link
      href={`/listings/${l.id}`}
      className="block border-b border-[rgba(255,255,255,0.03)] transition last:border-b-0 hover:bg-[rgba(255,255,255,0.02)]"
    >
      {inner}
    </Link>
  ) : (
    <div className="block cursor-default border-b border-[rgba(255,255,255,0.03)] opacity-70 last:border-b-0">
      {inner}
    </div>
  );
}

function MyOffersSection({ state }: { state: MyOffersState }) {
  const groups =
    state.phase === "loaded" ? groupOffersByWatch(state.offers) : [];

  return (
    <div className="mt-8">
      <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
        My Offers
      </div>

      {state.phase === "loading" ? (
        // Quiet loading placeholder — deliberately NOT the empty-state copy, so
        // the buyer is never told "no offers" before the query resolves.
        <div className="border border-[var(--border-subtle)] px-4 py-6 text-center">
          <div className="font-display text-[11px] italic text-[var(--ghost)]">
            Loading your offers…
          </div>
        </div>
      ) : state.phase === "error" ? (
        // Fail honestly and non-destructively — the rest of Catalogue is
        // unaffected; we simply say this one section is unavailable.
        <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
          <div className="font-display text-[11px] italic text-[var(--ghost)]">
            Your offers are unavailable right now. Please try again shortly.
          </div>
        </div>
      ) : groups.length === 0 ? (
        // Honest empty state — the section is durable and always present.
        <div className="border border-dashed border-[var(--border-faint)] px-4 py-8 text-center">
          <div className="mb-3 font-display text-[13px] font-light italic text-[var(--platinum-dim)]">
            You haven&apos;t made any offers yet.
          </div>
          <div className="mb-6 font-display text-[11px] italic text-[var(--ghost)]">
            When you start a purchase request, it will appear here — every offer,
            across every listing, in one place.
          </div>
          <Link
            href="/browse"
            className="text-[9px] uppercase tracking-[2px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]"
          >
            Explore the Marketplace →
          </Link>
        </div>
      ) : (
        <div className="border border-[var(--border-subtle)]">
          {groups.map((group) => (
            <WatchOfferGroup key={group.key} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function CatalogueClient({
  displayName,
  recentListings,
}: CatalogueProps) {
  // v2.5c — Saved Watches is now real. This component had zero data-fetching
  // of its own before this change (pure server-props-driven); rather than
  // require the parent server page (not available in this build — flagged
  // below), the fetch happens here client-side, same pattern already used by
  // the login page and NavBar's Sign Out (@/lib/supabase/client). Defaults to
  // the existing empty-state copy while loading, so there's no layout flash.
  const [savedListings, setSavedListings] = useState<ListingRow[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);

  // v2.7 — My Offers. The buyer's outgoing purchase requests across all
  // listings, fetched client-side (same pattern as Saved Watches below). RLS
  // already scopes SELECT to buyer_id = auth.uid(), so this is a read model
  // over authoritative data — no new table, cache, or mirror. Starts in an
  // explicit `loading` phase so the empty state is never shown prematurely,
  // and lands in `error` (not empty) on query failure.
  const [myOffers, setMyOffers] = useState<MyOffersState>({ phase: "loading" });

  // v2.6 — Correspondence. The buyer's table of contents: threads fetched
  // from /api/messages; each row links to the LISTING (the conversation's
  // home), never to a separate inbox. Section renders only when the buyer
  // has correspondence at all.
  const [threads, setThreads] = useState<
    {
      id: string;
      listing: { id: string; brand: string; model: string | null } | null;
      unreadCount: number;
      updatedAt: string;
      archivedByMe: boolean;
      messageCount?: number;
      lastMessage: { body: string; created_at: string } | null;
    }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    async function loadThreads() {
      try {
        const res = await fetch("/api/messages");
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (Array.isArray(data.threads)) setThreads(data.threads);
        }
      } catch {
        /* section simply doesn't render */
      }
    }
    loadThreads();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeThreads = threads.filter((t) => !t.archivedByMe && t.listing);

  useEffect(() => {
    let cancelled = false;
    async function loadOffers() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // Not signed in — treat as an empty (loaded) workspace, not an error.
        if (!cancelled) setMyOffers({ phase: "loaded", offers: [] });
        return;
      }
      const { data, error } = await supabase
        .from("purchase_requests")
        .select(
          "id, status, proposed_purchase_price, listing_price, created_at, listings(id, brand, model, reference, condition, asking_price, photos, details, status, created_at, year)"
        )
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        // Fail honestly: distinct error phase, never a fabricated empty result.
        setMyOffers({ phase: "error" });
        return;
      }
      const offers: MyOfferRow[] = (Array.isArray(data) ? data : []).map((r) => {
        const row = r as unknown as {
          id: string;
          status: string;
          proposed_purchase_price: number | null;
          listing_price: number | null;
          created_at: string;
          listings: ListingRow | null;
        };
        return {
          id: row.id,
          status: row.status,
          proposed_purchase_price: row.proposed_purchase_price,
          listing_price: row.listing_price,
          created_at: row.created_at,
          listing: row.listings ?? null,
        };
      });
      setMyOffers({ phase: "loaded", offers });
    }
    loadOffers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSaved() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setSavedLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("saved_watches")
        .select(
          "listing_id, created_at, listings(id, brand, model, reference, condition, asking_price, photos, details, status, created_at, year)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        if (!error && Array.isArray(data)) {
          const rows = data
            .map((r) => (r as unknown as { listings: ListingRow | null }).listings)
            .filter((l): l is ListingRow => Boolean(l));
          setSavedListings(rows);
        }
        setSavedLoading(false);
      }
    }
    loadSaved();
    return () => {
      cancelled = true;
    };
  }, []);

  /* v2.12 — workspace composition (Issue B). gap-8 (32px) was the sole,
     quantified cause of the detached sidebar (verified: the content div adds
     no compounding padding). gap-5 (20px) matches the sidebar's own px-5, so
     the whole rhythm is ONE value doing every adjacent job: 20px viewport
     air / text / 20px / 20px gap / content — a single intentional spacing
     unit rather than two near-values that happen to be close (chain ruling:
     fewer distinct values, each one intentional). Not gap-0: Catalogue has
     no border-r stitching its columns the way Account does, and fully
     collapsing the gap would merge two borderless columns rather than
     compose them. */
  return (
    <div className="flex gap-5 py-8">
      {/* Left nav — sticky, desktop only */}
      {/* v2.12 — Left Cliff fix (Issue A). The chain below this point is
          deliberately unpadded text; horizontal air is owned HERE, at the one
          point every section and item inherits. px-5 (20px) is the Left Cliff
          Law's proven floor (AccountDashboard's own sidebar blocks), applied
          as Catalogue's own padding rather than an assumption about a layout
          wrapper that does not exist. Width stays 200px; the text column
          becomes 160px, which the longest item ("Purchase Requests", 12px)
          fits comfortably. */}
      <nav className="hidden w-[200px] shrink-0 md:block">
        <div className="sticky top-6 space-y-6 px-5">
          <NavSection title="Discover">
            <NavItem href="/browse">Browse</NavItem>
            <NavItem href="/browse">New Arrivals</NavItem>
          </NavSection>
          <NavSection title="Intelligence">
            <NavItem soon>My Catalogue</NavItem>
            <NavItem soon>Watch DNA</NavItem>
          </NavSection>
          <NavSection title="Trade">
            <NavItem href="/catalogue" active>
              Catalogue
            </NavItem>
            <NavItem href="/account">Seller Workspace</NavItem>
            <NavItem href="/sell">Sell</NavItem>
          </NavSection>
        </div>
      </nav>

      {/* Right content */}
      <div className="min-w-0 flex-1">
        {/* Greeting */}
        <h1 className="font-display text-[26px] font-light text-[var(--platinum)]">
          {greeting()}, {displayName ?? "Collector"}.
        </h1>

        {/* Catalogue Match hero — State 2 (the honest state for v1.90).
            The gold border/background are present in BOTH states so the hero
            stays dominant even when empty. It is the promise, not the result. */}
        <div className="mt-6 border border-[rgba(201,168,76,0.28)] bg-[var(--gold-whisper)] px-8 py-8">
          {/* TODO: Phase 2 — State 1 (a real catalogue match exists): same gold
              border/background, headline "Did your watch finally appear?", a
              match card with listing details and a "View listing →" button.
              Requires the catalogue table (Phase 2). Not implemented in v1.90. */}
          <div className="mb-3 text-[9px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            Catalogue Match
          </div>
          <div className="mb-2 font-display text-[22px] font-light text-[var(--platinum)]">
            We&apos;re watching for you.
          </div>
          <div className="text-[13px] leading-relaxed text-[var(--muted)]">
            Your catalogue is active. We&apos;ll notify you the moment a match
            appears.
          </div>
        </div>

        {/* v2.6 — Correspondence. The inbox is a table of contents, not the
            destination: every row goes to the listing, where the
            conversation lives. Rendered only when threads exist. */}
        {activeThreads.length > 0 && (
          <div className="mt-8">
            <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
              Correspondence
            </div>
            <div className="border border-[var(--border-subtle)]">
              {activeThreads.map((t) => {
                const unread = t.unreadCount > 0;
                const title = t.listing
                  ? `${t.listing.brand}${t.listing.model ? " " + t.listing.model : ""}`
                  : "Correspondence";
                return (
                  <Link
                    key={t.id}
                    href={`/listings/${t.listing!.id}`}
                    className="flex items-center justify-between border-b border-[rgba(255,255,255,0.03)] px-4 py-3 transition last:border-b-0 hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <span
                      className={`truncate text-[13px] ${
                        unread ? "text-[var(--platinum)]" : "text-[var(--slate)]"
                      }`}
                    >
                      {title}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[10px] text-[var(--ghost)]">
                        {unread
                          ? t.unreadCount === 1
                            ? "New reply"
                            : `${t.unreadCount} new`
                          : ""}
                      </span>
                      {unread && (
                        <span className="h-[6px] w-[6px] rounded-full bg-[var(--gold)]" />
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* v2.7 — My Offers. Placed after Correspondence, before Discovery:
            active/status-driven content above passive browsing, matching the
            page's established hierarchy. Durable workspace — always rendered,
            with an honest empty state, independent of whether any offers
            exist. No new left-nav item (same precedent as Correspondence and
            Saved Watches). */}
        <MyOffersSection state={myOffers} />

        {/* Two-column below the hero */}
        <div className="mt-8 flex flex-col gap-8 lg:flex-row">
          {/* Left — discovery feed + saved watches */}
          <div className="min-w-0 flex-1">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                  Discovery
                </div>
                <Link
                  href="/browse"
                  className="text-[10px] uppercase tracking-[2px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]"
                >
                  See all →
                </Link>
              </div>

              {recentListings.length === 0 ? (
                <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
                  <div className="font-display text-[11px] italic text-[var(--ghost)]">
                    No published listings yet.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-px bg-[var(--border-faint)] sm:grid-cols-3">
                  {recentListings.map((row) => (
                    <ListingCard key={row.id} row={row} />
                  ))}
                </div>
              )}
            </div>

            {/* Saved watches — v2.5c: real data from saved_watches, joined to
                listings. Empty-state copy (product-soul-approved) is
                preserved verbatim for the true empty case AND the loading
                case, so there's no flash between "loading" and "0 saved". */}
            <div className="mt-8">
              <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                Saved Watches
              </div>
              {savedListings.length > 0 ? (
                <div className="grid grid-cols-1 gap-px bg-[var(--border-faint)] sm:grid-cols-3">
                  {savedListings.map((row) => (
                    <ListingCard key={row.id} row={row} />
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-[var(--border-faint)] px-4 py-8 text-center">
                  <div className="mb-3 font-display text-[13px] font-light italic text-[var(--platinum-dim)]">
                    Every great library begins with a single volume.
                  </div>
                  <div className="mb-6 font-display text-[11px] italic text-[var(--ghost)]">
                    Save a watch that speaks to you, and your Catalogue will begin to take shape.
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <Link href="/browse" className="text-[9px] uppercase tracking-[2px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]">
                      Explore the Marketplace →
                    </Link>
                    <Link href="/vault" className="text-[9px] uppercase tracking-[2px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]">
                      Explore the Vault →
                    </Link>
                    <div className="cursor-default text-[9px] uppercase tracking-[2px] text-[var(--ghost)] opacity-60">
                      Watch DNA Quiz <span className="text-[8px] tracking-[1.5px]">soon</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right — 220px rail of shells */}
          <div className="w-full shrink-0 lg:w-[220px]">
            {/* My Catalogue — shell (Phase 2, catalogue table doesn't exist) */}
            <div className="border border-[var(--border-subtle)] px-4 py-5">
              <div className="mb-3 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                My Catalogue
              </div>
              <div className="mb-4 font-display text-[12px] italic text-[var(--ghost)]">
                Add your first reference.
              </div>
              <button
                disabled
                className="cursor-not-allowed border border-[var(--border-subtle)] px-3 py-1.5 text-[9px] uppercase tracking-[2px] text-[var(--ghost)] opacity-40"
              >
                + Add reference
              </button>
            </div>

            {/* Watch DNA — shell, Coming Soon. No numbers, no fake metrics. */}
            <div className="mt-4 border border-[var(--border-subtle)] px-4 py-5">
              <div className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                Watch DNA
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["Craft", "Presence", "Heritage"].map((bucket) => (
                  <div key={bucket} className="text-center">
                    <div className="mb-1 text-[10px] text-[var(--slate)]">
                      {bucket}
                    </div>
                    <div className="font-display text-[10px] italic text-[var(--ghost)]">
                      Coming soon
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity — shell */}
            <div className="mt-4">
              <div className="mb-3 text-[9px] uppercase tracking-[2.5px] text-[var(--ghost)]">
                Recent Activity
              </div>
              <div className="font-display text-[11px] italic text-[var(--ghost)]">
                No recent activity.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
