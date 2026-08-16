"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CatalogueRail from "@/components/CatalogueRail";
import SavedSearchesCard from "@/components/SavedSearchesCard";
import {
  railCard,
  railHeading,
  railBody,
  railAction,
  railInactive,
} from "@/components/rail/catalogueCardStyles";
import { offerPrice } from "@/lib/offerPresentation";
import { formatMoney } from "@/lib/formatMoney";
import { documentationState, inlineDocumentation } from "@/lib/listingDocumentation";
import { publiclyDisplayablePhotos } from "@/lib/servicePhotoPrivacy";
import { cardImageSrc } from "@/lib/media/cardImage";
import { caseDiameterLabel } from "@/lib/caseDiameter";
import {
  catalogueHeroState,
  groupCatalogueMatches,
  type CatalogueMatchRow,
  type CatalogueSearch,
} from "@/lib/catalogueMatches";

/* Content-aware Catalogue sizing — static class maps so Tailwind sees every
   variant. Card cells target ~280px; the section width = cards + 220px rail
   + the gap, so the rail always hugs the content instead of the far edge. */
const CARD_COLS: Record<1 | 2 | 3, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};
const SECTION_MAX_W: Record<1 | 2 | 3, string> = {
  1: "lg:max-w-[560px]",
  2: "lg:max-w-[840px]",
  3: "lg:max-w-[1100px]",
};

/* ────────────────────────────────────────────────────────────────────────
   CATALOGUE CLIENT — the buyer's Catalogue  (v2.7b)

   Answers one question: "What happened while I was away?" Every element is
   secondary to that except the Catalogue Match hero, which answers it
   directly — from real accrued saved-search matches (Permissioned
   Adjacency, 2026-08-12). The marketplace-wide "Discovery" newest-three
   feed is GONE: Browse is what is on FairWatchTrade; Catalogue is what is
   relevant to this collector. Search Matches renders exact matches first
   and, only for searches whose owner opted in, explainable close matches
   in a visually subordinate section — each with the stored reason it was
   shown. One listing, one card; exact wins; adjacent never inflates
   exact-match language; empty is quieter than fabricated. Saved Watches is
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
  asking_price: number | null;
  // Money Truth Stage B — renders as undisclosed until attested, never USD.
  asking_currency: string | null;
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
  searches: CatalogueSearch[];
  matchRows: CatalogueMatchRow<ListingRow>[];
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
  listing_id: string | null; // stable grouping key even when the join is denied
  status: string; // raw DB value; narrowed via STATUS_LABELS at render time
  proposed_purchase_price: number | null;
  listing_price: number | null;
  // Stage A snapshot — the offer's currency AT SUBMISSION (null pre-Stage-B).
  proposed_currency: string | null;
  // v2.27 — identity snapshot captured at request time. Authoritative fallback
  // for watch identity when the joined listing is null because RLS now denies a
  // superseded/declined buyer the reserved listing row.
  listing_brand: string | null;
  listing_model: string | null;
  listing_reference: string | null;
  created_at: string;
  listing: ListingRow | null; // joined; may be null (listing gone OR RLS-denied)
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
// Account Status Colorway Parity — tones are named for the LIFECYCLE FAMILY
// they resolve to, not for a color word, and they resolve to the same --lc-*
// tokens the seller sees in Requests. One underlying state, one color, both
// sides of the transaction. (Before this, pending read gold to the buyer and
// grey to the seller; declined read muted to the buyer and red to the seller.)
type OfferTone = "pending" | "accepted" | "declined" | "withdrawn" | "ghost";

const STATUS_LABELS: Record<
  OfferStatus,
  { label: string; note: string; tone: OfferTone }
> = {
  pending: {
    label: "Pending",
    note: "Awaiting the seller's response.",
    tone: "pending",
  },
  accepted: {
    label: "Accepted",
    note: "The seller accepted your request.",
    tone: "accepted",
  },
  declined: {
    label: "Declined",
    note: "The seller declined this request.",
    tone: "declined",
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
  // Public vocabulary law (Withdraw Offer v4): the buyer-facing status is
  // "Withdrawn"; 'cancelled' is internal database vocabulary only.
  cancelled: {
    label: "Withdrawn",
    note: "You withdrew this offer.",
    tone: "withdrawn",
  },
};

// Any unrecognized status fails to a neutral, non-misleading descriptor rather
// than rendering nothing (schema honesty: a new DB status must never silently
// vanish from the buyer's view).
function offerLabel(status: string): {
  label: string;
  note: string;
  tone: OfferTone;
} {
  return (
    STATUS_LABELS[status as OfferStatus] ?? {
      label: status,
      note: "",
      tone: "ghost" as const,
    }
  );
}

// CSS colors rather than utility classes: --lc-* are custom properties, so the
// value is applied via style, matching how SellerListingsRoom consumes them.
// Subdued tier matches RequestsView exactly: --lc-neutral-line is a BORDER
// token and unreadable as text; --ghost is 3.4:1 and reserved for
// disabled/placeholder. Withdrawn --slate (7.1:1), quieter terminal states
// --muted (5.1:1). Both clear AA on --ink and --surface.
const TONE_COLOR: Record<OfferTone, string> = {
  pending: "var(--lc-pending_review-badge)",
  accepted: "var(--lc-published-badge)",
  declined: "var(--lc-rejected-badge)",
  withdrawn: "var(--slate)",
  ghost: "var(--muted)",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* Null asking price renders honestly, never $0/$NaN (Buyer Price Truth, Bug 1).
   Money Truth Stage B: the shared formatter extends the same honesty to a
   missing CURRENCY — an amount whose currency is not yet on the record is a
   number, not a price, and shows the same undisclosed state. */
function formatPrice(value: number | null, currency: string | null): string {
  return formatMoney(value, currency);
}

// Dial photo first, fallback to the first photo. Matches /browse. Service
// Evidence is excluded unless opted-in (lib/servicePhotoPrivacy) — a hero
// must never surface a service receipt.
function heroUrl(photos: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const visible = publiclyDisplayablePhotos(photos);
  if (visible.length === 0) return null;
  const dial = visible.find((p) => p?.category === "Dial");
  return (dial ?? visible[0])?.photo?.url ?? null;
}

/* ── Left nav ─────────────────────────────────────────────────────────
   v3.21 — the inline NavSection/NavItem rail is RETIRED, replaced by the
   Painted Line <CatalogueRail /> (Design Gate Concept A, v3 order §5/§6).
   Replacement, never layered — the old markup is ancestry, not a second
   navigation system. */

/* ── Discovery card — reuses the /browse visual treatment ─────────────── */

function ListingCard({ row }: { row: ListingRow }) {
  const hero = heroUrl(row.photos);
  const meta = [row.condition, row.year].filter(Boolean).join(" · ");
  /* Diameter in the same position as the Browse card, through the same
     formatter — these two grids are read the same way and must not drift. */
  const parts = [
    caseDiameterLabel(row.details?.caseSizeMm),
    row.details?.dialColorType,
    row.details?.caseMaterial,
  ].filter(Boolean);
  const attrs = parts.join(" · ") || null;
  const doc = row.details?.documentation;
  /* Completeness leaves the photo plane and joins the scanning line —
     the same ruling the Browse grid follows, from the same module. */
  const docBadge = documentationState(doc);
  const docInline = docBadge ? inlineDocumentation(docBadge) : null;

  return (
    <Link
      href={`/listings/${row.id}`}
      className="group relative block cursor-pointer border border-transparent bg-[var(--card-surface)] p-7 transition hover:bg-[var(--hover-wash)]"
    >
      {/* v4.91 — square, not a 140px strip. Contained in a 250×140 well a
          portrait watch capped its height first and painted ~105px wide,
          marooned in empty well. Same repair as the Browse card, same
          reason; these two treatments are meant to match. */}
      <div className="mb-4 flex aspect-square w-full items-center justify-center overflow-hidden bg-[var(--image-well)]">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cardImageSrc(hero, { width: 720 })} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] tracking-[0.3px] text-[var(--muted)]">
            No photo
          </div>
        )}
      </div>

      <div className="mb-[5px] text-[11px] font-medium uppercase tracking-[1.6px] text-[var(--gold)]">
        {row.brand}
      </div>
      <div className="mb-1 font-display text-[15px] font-light leading-[1.25] text-[var(--platinum)]">
        {row.model ?? row.brand}
      </div>
      {/* Same scanning line as the Browse card, kept identical on purpose:
          the two grids are read the same way and must not drift. See the note
          in BrowseClient for why this is 13px rather than 10px. */}
      {/* Gated on the composed line, matching Browse — see the note there. */}
      {[meta, attrs, docInline].filter(Boolean).length > 0 && (
        <div className="mb-3 text-[13px] leading-[1.5] tracking-[0.2px] text-[var(--slate)]">
          {[meta, attrs, docInline].filter(Boolean).join(" · ")}
        </div>
      )}
      <div className="font-display text-[17px] font-light text-[var(--platinum-dim)]">
        {formatPrice(row.asking_price, row.asking_currency)}
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
    // Group by listing_id (a column on the request itself), so multiple
    // requests to the same watch still merge even when RLS denies the joined
    // listing row (reserved listing, unsuccessful buyer). Falls back to the
    // offer id only when there is genuinely no listing_id.
    const key = offer.listing_id ?? offer.id;
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

/* offerPrice lives in lib/offerPresentation.ts (v2.86): the v2.85 Bug-2
   contract — snapshot-only, never a live fallback — now sits behind a
   regression test (scripts/offer-price-truth.test.mjs). */

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
function HistoryRow({ offer }: { offer: MyOfferRow }) {
  const { label } = offerLabel(offer.status);
  const price = offerPrice(offer);
  const when = relativeTime(offer.created_at);
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[10px] tracking-[0.3px] text-[var(--muted)]">
      <span className="min-w-0 truncate">
        {price != null ? formatPrice(Number(price), offer.proposed_currency) : "Offer"}
        <span className="mx-1.5 opacity-40">•</span>
        <span className="uppercase tracking-[1.5px]">{label}</span>
      </span>
      {when && <span className="shrink-0 opacity-70">{when}</span>}
    </div>
  );
}

// One watch group: identity once, current request dominant, history beneath.
function WatchOfferGroup({
  group,
  onRequestWithdraw,
}: {
  group: WatchGroup;
  onRequestWithdraw: (requestId: string, trigger: HTMLElement | null) => void;
}) {
  const { listing: l, current, history } = group;
  const { label, note, tone } = offerLabel(current.status);
  // Identity prefers the live joined listing; when RLS denies it (a reserved
  // listing hidden from an unsuccessful buyer), fall back to the request's own
  // authoritative snapshot so the watch identity is never lost — only the
  // navigation/photo are withheld. "Listing unavailable" remains solely for the
  // genuine no-identity case.
  /* SNAPSHOT IS AUTHORITATIVE, live listing is enhancement.
     Inverted from the original preference, on two grounds. Historically: the
     snapshot records what the buyer actually made an offer on, while a live
     listing edited afterwards would report identity the offer never
     concerned. Structurally: Stage 5 moves this FK to ON DELETE SET NULL, so
     a terminal request will routinely have no listing to read — reading it
     first would make the common case the fallback path. */
  const snapshotTitle = current.listing_brand
    ? current.listing_model
      ? `${current.listing_brand} ${current.listing_model}`
      : current.listing_brand
    : null;
  const liveTitle = l ? (l.model ? `${l.brand} ${l.model}` : l.brand) : null;
  const title = snapshotTitle ?? liveTitle ?? "Watch no longer listed";
  const reference = current.listing_reference ?? l?.reference ?? null;
  const hero = l ? heroUrl(l.photos) : null;
  const currentPrice = offerPrice(current);
  const currentWhen = relativeTime(current.created_at);

  const inner = (
    <div className="flex gap-4 px-4 py-4">
      {/* Watch thumbnail — appears once per group. Dial-first via heroUrl(),
          matching Discovery / Saved Watches visual identity. */}
      <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center overflow-hidden bg-[var(--image-well)]">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cardImageSrc(hero, { width: 240 })} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="text-[11px] tracking-[0.3px] text-[var(--muted)]">No photo</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* Identity — once */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] text-[var(--platinum)]">{title}</div>
            {reference && (
              <div className="mt-0.5 text-[10px] tracking-[0.3px] text-[var(--muted)]">
                Ref. {reference}
              </div>
            )}
          </div>
          {/* Current status — the dominant state */}
          <div className="shrink-0 text-right">
            <div className="text-[11px] uppercase tracking-[1.6px]" style={{ color: TONE_COLOR[tone] }}>
              {label}
            </div>
          </div>
        </div>

        {/* Current offer + its note. Submitted-time is present but subtle, so
            the current request stays dominant over the quieter history below. */}
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <div className="text-[12px] tracking-[0.3px] text-[var(--slate)]">
            {currentPrice != null ? (
              <>Your offer: {formatPrice(Number(currentPrice), current.proposed_currency)}</>
            ) : (
              <>&nbsp;</>
            )}
          </div>
          {currentWhen && (
            <div className="shrink-0 text-[10px] tracking-[0.3px] text-[var(--muted)]">
              Submitted {currentWhen}
            </div>
          )}
        </div>
        {note && (
          <div className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">{note}</div>
        )}

        {/* v2.86 — Withdraw Offer: pending requests only. A deliberate text
            action (never icon-only), secondary weight, real touch target. The
            group renders inside a <Link>, so the handler must stop the
            navigation before opening the section-level confirmation. */}
        {current.status === "pending" && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRequestWithdraw(current.id, e.currentTarget);
            }}
            className="mt-2.5 inline-flex min-h-[44px] items-center text-[11px] uppercase tracking-[1.6px] text-[var(--muted)] underline-offset-4 transition-colors hover:text-[var(--danger)] hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
          >
            Withdraw offer
          </button>
        )}

        {/* Prior requests — quieter history, newest-first, identity NOT repeated */}
        {history.length > 0 && (
          <div className="mt-3 border-t border-[rgba(255,255,255,0.04)] pt-2">
            <div className="mb-1 text-[11px] uppercase tracking-[1.4px] text-[var(--muted)] opacity-70">
              Previous requests
            </div>
            {history.map((h) => (
              <HistoryRow key={h.id} offer={h} />
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
      className="block border-b border-[rgba(255,255,255,0.03)] transition last:border-b-0 hover:bg-[var(--hover-wash)]"
    >
      {inner}
    </Link>
  ) : (
    <div className="block cursor-default border-b border-[rgba(255,255,255,0.03)] opacity-70 last:border-b-0">
      {inner}
    </div>
  );
}

/* v2.86 — Withdraw Offer. The confirmation dialog lives at SECTION level so
   it renders outside the group's <Link> wrapper (a dialog inside a link would
   navigate on every interaction). The trigger's element is captured at open
   so focus returns to it on cancel/Escape — the accessibility contract. */
type WithdrawPrompt = {
  requestId: string;
  trigger: HTMLElement | null;
};

// already_resolved race outcomes → the order's exact UI vocabulary.
function withdrawRaceMessage(detail: string): string {
  if (detail.includes("accepted")) return "This offer has already been accepted.";
  if (detail.includes("declined")) return "This offer has already been declined.";
  if (detail.includes("cancelled")) return "This offer has already been withdrawn.";
  return "This offer is no longer pending.";
}

function MyOffersSection({
  state,
  onWithdrawn,
}: {
  state: MyOffersState;
  onWithdrawn: () => void;
}) {
  const groups =
    state.phase === "loaded" ? groupOffersByWatch(state.offers) : [];

  const [prompt, setPrompt] = useState<WithdrawPrompt | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawnNotice, setWithdrawnNotice] = useState(false);
  const keepButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus lands on the safe action when the dialog opens.
  useEffect(() => {
    if (prompt) keepButtonRef.current?.focus();
  }, [prompt]);

  function closePrompt() {
    const trigger = prompt?.trigger ?? null;
    setPrompt(null);
    setWithdrawError(null);
    trigger?.focus();
  }

  async function confirmWithdraw() {
    if (!prompt || withdrawing) return; // double-submit prevention
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const res = await fetch(`/api/purchase-requests/${prompt.requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "withdrawn" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setWithdrawError(
          data?.error === "already_resolved"
            ? withdrawRaceMessage(String(data?.detail ?? ""))
            : "Could not withdraw this offer. Please try again."
        );
        return;
      }
      setPrompt(null);
      setWithdrawnNotice(true); // announced state — see aria-live region below
      onWithdrawn(); // refetch → the row now reads "Withdrawn", no refresh
    } catch {
      setWithdrawError("Could not withdraw this offer. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    // WS1 (2026-07-28) — bounded section width: this section sits OUTSIDE the
    // v2.84-capped two-column grid, so on ultrawide screens its rows stretched
    // status to the viewport cliff. The cap binds only beyond 1100px.
    <div className="mt-8 max-w-[1100px]">
      <div className="mb-4 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
        My Offers
      </div>

      {state.phase === "loading" ? (
        // Quiet loading placeholder — deliberately NOT the empty-state copy, so
        // the buyer is never told "no offers" before the query resolves.
        <div className="border border-[var(--border-subtle)] px-4 py-6 text-center">
          <div className="font-display text-[11px] italic text-[var(--muted)]">
            Loading your offers…
          </div>
        </div>
      ) : state.phase === "error" ? (
        // Fail honestly and non-destructively — the rest of Catalogue is
        // unaffected; we simply say this one section is unavailable.
        <div className="border border-dashed border-[var(--border-faint)] px-4 py-6 text-center">
          <div className="font-display text-[11px] italic text-[var(--muted)]">
            Your offers are unavailable right now. Please try again shortly.
          </div>
        </div>
      ) : groups.length === 0 ? (
        // Honest empty state — the section is durable and always present.
        <div className="border border-dashed border-[var(--border-faint)] px-4 py-8 text-center">
          <div className="mb-3 font-display text-[13px] font-light italic text-[var(--platinum-dim)]">
            You haven&apos;t made any offers yet.
          </div>
          {/* Functional collector-facing information, and the large empty
              region around it made 11px read as a caption on nothing. */}
          <div className="mb-6 font-display text-[13px] italic leading-[1.6] text-[var(--muted)]">
            When you start a purchase request, it will appear here — every offer,
            across every listing, in one place.
          </div>
          <Link
            href="/browse"
            className="text-[11px] font-medium uppercase tracking-[1.4px] text-[var(--gold-on-tint)] transition hover:text-[var(--platinum)]"
          >
            Explore the Marketplace →
          </Link>
        </div>
      ) : (
        <div className="border border-[var(--border-subtle)]">
          {groups.map((group) => (
            <WatchOfferGroup
              key={group.key}
              group={group}
              onRequestWithdraw={(requestId, trigger) => {
                setWithdrawnNotice(false);
                setPrompt({ requestId, trigger });
              }}
            />
          ))}
        </div>
      )}

      {/* Success announcement — polite live region; also receives focus so
          keyboard users land on the confirmed outcome. */}
      <div aria-live="polite">
        {withdrawnNotice && (
          <p
            tabIndex={-1}
            ref={(el) => el?.focus()}
            className="mt-3 text-[11px] tracking-[0.3px] text-[var(--muted)] outline-none"
          >
            Offer withdrawn.
          </p>
        )}
      </div>

      {/* Withdraw confirmation — lightweight, deliberate, keyboard-complete. */}
      {prompt && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(7,8,12,0.72)] px-6"
          onClick={closePrompt}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              closePrompt();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-offer-title"
            aria-describedby="withdraw-offer-body"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] border border-[var(--border-mid)] bg-[var(--surface)] px-6 py-6"
          >
            <h2
              id="withdraw-offer-title"
              className="font-display text-[18px] font-light text-[var(--platinum)]"
            >
              Withdraw this offer?
            </h2>
            <p
              id="withdraw-offer-body"
              className="mt-2 text-[12px] leading-[1.6] text-[var(--muted)]"
            >
              The seller will no longer be able to accept this purchase request.
            </p>
            {withdrawError && (
              <p className="mt-3 text-[11px] text-[var(--danger)]">{withdrawError}</p>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                ref={keepButtonRef}
                type="button"
                disabled={withdrawing}
                onClick={closePrompt}
                className="min-h-[44px] border border-[var(--border-subtle)] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--platinum-dim)] transition-colors hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-60"
              >
                Keep offer active
              </button>
              <button
                type="button"
                disabled={withdrawing}
                onClick={confirmWithdraw}
                className="min-h-[44px] border border-[var(--border-mid)] bg-[#0b0f15] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)] transition-colors hover:text-[var(--danger)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-60"
              >
                {withdrawing ? "Withdrawing…" : "Withdraw offer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function CatalogueClient({
  displayName,
  searches,
  matchRows,
}: CatalogueProps) {
  // Collector-scoped match truth, derived once (lib/catalogueMatches):
  // published-only, permission honored at read time, exact wins, adjacent
  // bounded. The hero and the Search Matches section both read from this.
  const { exact: exactMatches, adjacent: adjacentMatches } =
    groupCatalogueMatches(searches, matchRows);
  const heroState = catalogueHeroState(searches, exactMatches.length);
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
  // v2.86 — Withdraw Offer: bumping this refetches the offers list so the UI
  // shows "Withdrawn" without a manual refresh.
  const [offersVersion, setOffersVersion] = useState(0);

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
          "id, listing_id, status, proposed_purchase_price, listing_price, proposed_currency, listing_brand, listing_model, listing_reference, created_at, listings(id, brand, model, reference, condition, asking_price, asking_currency, photos, details, status, created_at, year)"
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
          listing_id: string | null;
          status: string;
          proposed_purchase_price: number | null;
          listing_price: number | null;
          proposed_currency: string | null;
          listing_brand: string | null;
          listing_model: string | null;
          listing_reference: string | null;
          created_at: string;
          listings: ListingRow | null;
        };
        return {
          id: row.id,
          listing_id: row.listing_id,
          status: row.status,
          proposed_purchase_price: row.proposed_purchase_price,
          listing_price: row.listing_price,
          proposed_currency: row.proposed_currency,
          listing_brand: row.listing_brand,
          listing_model: row.listing_model,
          listing_reference: row.listing_reference,
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
  }, [offersVersion]);

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
          "listing_id, created_at, listings(id, brand, model, reference, condition, asking_price, asking_currency, photos, details, status, created_at, year)"
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
  /* Smart section sizing (Jason's 2026-07-27 ruling): the card grids and the
     two-column section width follow the REAL listing count — the larger of
     the two card sections, capped at three columns, floored at one. */
  const contentCols = Math.min(
    3,
    Math.max(exactMatches.length, adjacentMatches.length, savedListings.length, 1),
  ) as 1 | 2 | 3;

  return (
    <div className="flex min-h-screen gap-5">
      {/* Left nav — v3.21: the Painted Line CatalogueRail (Design Gate
          Concept A, v3 order §5). Discover = Browse → Catalogue → Watch DNA
          (New Arrivals removed, Jason-approved); Seller exits separated;
          My Catalogue links to this page's existing Saved Watches section.
          The rail owns its own full-height fused composition and hides itself
          below md. */}
      <CatalogueRail />

      {/* Right content */}
      <div className="min-w-0 flex-1 py-8">
        {/* Greeting */}
        <h1 className="font-display text-[26px] font-light text-[var(--platinum)]">
          {greeting()}, {displayName ?? "Collector"}.
        </h1>

        {/* Catalogue Match hero — four honest states (Permissioned
            Adjacency). The gold border/background are present in EVERY
            state so the hero stays dominant even when quiet. "We're
            watching for you." is permitted only when FairWatchTrade
            actually watches at least one active saved search; a real match
            switches the hero to its found state; no saved searches means
            the promise is not yet made. Adjacent results never drive the
            hero — only exact matches may say "found". */}
        {/* Density correction (2026-08-09): padding tightened, nothing
            else — the hero's dominance over the sections beneath it is
            unchanged. */}
        <div className="mt-6 border border-[rgba(201,168,76,0.28)] bg-[var(--gold-whisper)] px-7 py-5">
          {/* --gold-subtle is 72% gold, and on this ivory hero it composited
              to 2.83:1 — measured on production Daylight, not estimated. The
              token is not globally wrong; it is wrong on a light surface this
              pale. Corrected at the instance, per the order. */}
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[1.4px] text-[var(--gold-on-tint)]">
            Catalogue Match
          </div>
          {heroState === "matches" ? (
            <>
              <div className="mb-1.5 font-display text-[22px] font-light text-[var(--platinum)]">
                Did your watch finally appear?
              </div>
              <div className="text-[13px] leading-relaxed text-[var(--muted)]">
                {exactMatches.length === 1
                  ? "A watch matching one of your saved searches is available now — it's just below."
                  : `${exactMatches.length} watches matching your saved searches are available now — they're just below.`}
              </div>
            </>
          ) : heroState === "watching" ? (
            <>
              <div className="mb-1.5 font-display text-[22px] font-light text-[var(--platinum)]">
                We&apos;re watching for you.
              </div>
              <div className="text-[13px] leading-relaxed text-[var(--muted)]">
                Your catalogue is active. We&apos;ll notify you the moment a match
                appears.
              </div>
            </>
          ) : heroState === "paused" ? (
            <>
              <div className="mb-1.5 font-display text-[22px] font-light text-[var(--platinum)]">
                Watching is paused.
              </div>
              <div className="text-[13px] leading-relaxed text-[var(--muted)]">
                Every saved search is paused. Resume one and FairWatchTrade will
                keep watching for you.{" "}
                <Link
                  href="/account?module=saved"
                  className="text-[var(--gold)] underline decoration-[rgba(201,168,76,0.44)] underline-offset-[3px] transition hover:decoration-[var(--gold)]"
                >
                  Manage saved searches
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mb-1.5 font-display text-[22px] font-light text-[var(--platinum)]">
                Nothing is being watched yet.
              </div>
              <div className="text-[13px] leading-relaxed text-[var(--muted)]">
                Save a search and FairWatchTrade will watch for your watch.{" "}
                <Link
                  href="/browse"
                  className="text-[var(--gold)] underline decoration-[rgba(201,168,76,0.44)] underline-offset-[3px] transition hover:decoration-[var(--gold)]"
                >
                  Browse watches
                </Link>
              </div>
            </>
          )}
        </div>

        {/* v2.6 — Correspondence. The inbox is a table of contents, not the
            destination: every row goes to the listing, where the
            conversation lives. Rendered only when threads exist. */}
        {activeThreads.length > 0 && (
          // WS1 (2026-07-28) — bounded: keeps each thread's timestamp attached
          // to its conversation instead of the far viewport edge on ultrawide.
          <div className="mt-8 max-w-[1100px]">
            <div className="mb-4 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
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
                    className="flex items-center justify-between border-b border-[rgba(255,255,255,0.03)] px-4 py-3 transition last:border-b-0 hover:bg-[var(--hover-wash)]"
                  >
                    <span
                      className={`truncate text-[13px] ${
                        unread ? "text-[var(--platinum)]" : "text-[var(--slate)]"
                      }`}
                    >
                      {title}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[10px] text-[var(--muted)]">
                        {unread
                          ? t.unreadCount === 1
                            ? "New reply"
                            : `${t.unreadCount} new`
                          : ""}
                      </span>
                      {unread && (
                        <span className="h-[6px] w-[6px] rounded-full bg-[var(--gold-fill)]" />
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
        <MyOffersSection
          state={myOffers}
          onWithdrawn={() => setOffersVersion((v) => v + 1)}
        />

        {/* Two-column below the hero — GRID, not flex (Jason's 2026-07-27
            narrow-width ruling). One SavedSearchesCard mount, placed by grid:
            at lg+ it is the rail's top card exactly as v2.25a approved; below
            lg it renders FIRST — eye-level, above Discovery — instead of the
            whole rail teleporting to the bottom of a long scroll on a 1px
            crossing of the lg boundary. The three Phase-2 shells are
            desktop-only until their features exist: placeholder furniture
            never outranks a watch on a narrow screen. Single mount = no
            double fetch, no duplicate ids (the v2.68 lesson). */}
        {/* Smart width — Jason's 2026-07-27 compression ruling. Uncapped, the
            1fr content column stretched the card grids' EMPTY cells into a
            dead band between the watches and the rail. The section now COUNTS
            the real listings (the larger of Discovery / Saved Watches, capped
            at three) and sizes both the card columns and its own width to
            that truth: two watches → two ~280px columns, rail hugging close;
            a third listing → the full three-across row returns by itself.
            Data-driven layout, no fabricated fill, nothing to revert as
            inventory grows. Spare width breathes at the page edge, where it
            reads as intent. */}
        <div
          className={`mt-8 grid grid-cols-1 gap-x-8 ${SECTION_MAX_W[contentCols]} lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start`}
        >
          {/* Saved Searches — narrow: first and visible; lg+: rail top. */}
          <div className="lg:col-start-2 lg:row-start-1">
            <SavedSearchesCard />
          </div>

          {/* Left — search matches + saved watches. The marketplace-wide
              "Discovery" newest-three feed is gone (Permissioned Adjacency):
              what renders here is collector-scoped truth only, and when
              there is none the section is quietly absent — the hero above
              already says what FairWatchTrade is doing. */}
          <div className="mt-8 min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:mt-0">
            {(exactMatches.length > 0 || adjacentMatches.length > 0) && (
              <div>
                {exactMatches.length > 0 && (
                  <div>
                    <div className="mb-4 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                      Search Matches
                    </div>
                    <div className={`grid grid-cols-1 gap-px bg-[var(--grid-gutter)] ${CARD_COLS[contentCols]}`}>
                      {exactMatches.map((card) => (
                        <div key={card.listing.id} className="flex flex-col bg-[var(--card-surface)]">
                          {/* Exact vs. adjacent must be unmistakable: the
                              exact label is the section's one gold accent. */}
                          <div className="px-7 pt-4 text-[11px] uppercase tracking-[1.5px]">
                            <span className="text-[var(--gold)]">Exact match</span>
                            <span className="text-[var(--muted)]">
                              {" "}· from &ldquo;{card.searchNames.join("”, “")}&rdquo;
                            </span>
                          </div>
                          <ListingCard row={card.listing} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Close matches — visually subordinate, bounded, and each
                    one says WHY it was shown (the stored reason). Never
                    mixed into, or counted with, exact matches. */}
                {adjacentMatches.length > 0 && (
                  <div className={exactMatches.length > 0 ? "mt-10" : ""}>
                    <div className="mb-1 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                      Close to your search
                    </div>
                    <p className="mb-4 text-[12px] leading-[1.5] text-[var(--muted)]">
                      Not exact matches — watches meaningfully related to
                      searches where you asked to see close matches too.
                    </p>
                    <div className={`grid grid-cols-1 gap-px bg-[var(--grid-gutter)] ${CARD_COLS[contentCols]}`}>
                      {adjacentMatches.map((card) => (
                        <div key={card.listing.id} className="flex flex-col bg-[var(--card-surface)]">
                          <div className="px-7 pt-4 text-[11px] uppercase tracking-[1.5px] text-[var(--muted)]">
                            Close to &ldquo;{card.searchNames.join("”, “")}&rdquo;
                          </div>
                          <ListingCard row={card.listing} />
                          {card.reason && (
                            <p className="-mt-2 px-7 pb-5 text-[12px] leading-[1.5] text-[var(--slate)]">
                              {card.reason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Saved watches — v2.5c: real data from saved_watches, joined to
                listings. Empty-state copy (product-soul-approved) is
                preserved verbatim for the true empty case AND the loading
                case, so there's no flash between "loading" and "0 saved". */}
            <div id="saved-watches" className="mt-8 scroll-mt-32">
              <div className="mb-4 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                Saved Watches
              </div>
              {savedListings.length > 0 ? (
                <div className={`grid grid-cols-1 gap-px bg-[var(--grid-gutter)] ${CARD_COLS[contentCols]}`}>
                  {savedListings.map((row) => (
                    <ListingCard key={row.id} row={row} />
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-[var(--border-faint)] px-4 py-8 text-center">
                  <div className="mb-3 font-display text-[13px] font-light italic text-[var(--platinum-dim)]">
                    Every great library begins with a single volume.
                  </div>
                  {/* The literary line above may stay quiet. This sentence is
                      the one that tells a collector what the room is FOR, so
                      it reads at the body floor rather than as a footnote to
                      the sentence it explains. */}
                  <div className="mb-6 font-display text-[13px] italic leading-[1.6] text-[var(--muted)]">
                    Save a watch that speaks to you, and your Catalogue will begin to take shape.
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <Link href="/browse" className="text-[11px] font-medium uppercase tracking-[1.4px] text-[var(--gold-on-tint)] transition hover:text-[var(--platinum)]">
                      Explore the Marketplace →
                    </Link>
                    <Link href="/vault" className="text-[11px] font-medium uppercase tracking-[1.4px] text-[var(--gold-on-tint)] transition hover:text-[var(--platinum)]">
                      Explore the Vault →
                    </Link>
                    {/* v3.21 — LIVE link (v3 order §6.3): Watch DNA is a
                        working module; no surface may claim it is Soon. */}
                    <Link
                      href="/watch-dna"
                      className="text-[11px] font-medium uppercase tracking-[1.4px] text-[var(--gold-on-tint)] transition hover:text-[var(--platinum)]"
                    >
                      Watch DNA Quiz →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right rail, row 2 — the three Phase-2 shells. Desktop-only by
              Jason's 2026-07-27 ruling: at narrow widths these placeholders
              yield entirely; they return to narrow layouts only when their
              features become real. SavedSearchesCard sits in the grid cell
              above (v2.25a rail-first placement preserved at lg+; separation
              law intact — still never merged into the watch-imagery column). */}
          <div className="hidden lg:col-start-2 lg:row-start-2 lg:block">
            {/* My Catalogue — shell (Phase 2, catalogue table doesn't exist).
                The control stays genuinely disabled because the feature does
                not exist; only its legibility changes, so it now reads as
                deliberately not-yet rather than as a broken button. */}
            <div className={`mt-4 ${railCard}`}>
              <div className={`mb-3 ${railHeading}`}>My Catalogue</div>
              <div className={`mb-4 ${railBody}`}>Add your first reference.</div>
              <button disabled className={railInactive}>
                + Add reference
              </button>
            </div>

            {/* Watch DNA — LIVE (v3.21, v3 order §6.3). The module works and
                has a real door; this card stops claiming Soon and links it.
                Existing card treatment kept — text-and-link change only. */}
            {/* Watch DNA — LIVE (v3.21, v3 order §6.3). "Craft / Presence /
                Heritage" are gone: they were never part of the quiz, which
                scores the archetypes in lib/watchDna.ts, so three invented
                words sat where a collector's real result would go and made a
                working door look like a preview of an unfinished one. The
                card now says what the module does and offers one plainly
                actionable way in. */}
            <Link
              href="/watch-dna"
              className={`mt-4 block ${railCard} transition-colors hover:border-[var(--border-gold)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-[3px]`}
            >
              <div className={`mb-3 ${railHeading}`}>Watch DNA</div>
              <div className={`mb-4 ${railBody}`}>
                Discover what draws you to a watch.
              </div>
              <span className={railAction}>Create yours →</span>
            </Link>

            {/* Recent activity — shell. Given the family's card surface so it
                stops floating unbounded beside two bordered neighbours. */}
            <div className={`mt-4 ${railCard}`}>
              <div className={`mb-3 ${railHeading}`}>Recent Activity</div>
              <div className={railBody}>No recent activity.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
