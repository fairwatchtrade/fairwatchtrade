"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { browseDraftHref } from "@/lib/wanted";
import { createClient } from "@/lib/supabase/client";
import SaveSearchControl from "@/components/SaveSearchControl";
import {
  DealerContactPanel,
  DealerTrustMark,
  type DealerContactItem,
} from "@/components/DealerRoomActions";
import { formatMoney } from "@/lib/formatMoney";
import { cardImageSrc } from "@/lib/media/cardImage";
import { caseDiameterLabel } from "@/lib/caseDiameter";
import LoupeIcon from "@/components/LoupeIcon";
import FwtListingId from "@/components/FwtListingId";
import BrowseCardInspector from "@/components/BrowseCardInspector";
import BrowseQuickAdd, { type QuickAddCategory } from "@/components/BrowseQuickAdd";
import { documentationState, inlineDocumentation } from "@/lib/listingDocumentation";
import { parseBrowseSort, sortListings, type BrowseSort } from "@/lib/browseSort";
import { facetKey, foldFacets } from "@/lib/browseFacets";
import {
  defaultFrame,
  frameFor,
  frameStyle,
  isDefaultFrame,
  presentationStyleFor,
  resolveHeroIndex,
  sanitizePhotoPresentation,
} from "@/lib/photoPresentation";
import { automaticHeroIndex as roleAutomaticHero, sortByPhotoRole } from "@/lib/photoRoles";
import BrowseSearch, { type SearchChip } from "@/components/BrowseSearch";
import SearchEmptyState from "@/components/SearchEmptyState";
import { publiclyDisplayablePhotos } from "@/lib/servicePhotoPrivacy";
import {
  parseSearch,
  matchesSearch,
  matchesDialColorFamily,
  removeMeaningFromQuery,
  type Meaning,
  type SearchState,
} from "@/lib/search/parse";

/* ────────────────────────────────────────────────────────────────────────
   BROWSE CLIENT — client-side facet filtering shell for /browse (v1.57)

   Receives the already-ranked listings from the server page and renders the
   Studio filter sidebar (desktop) / overlay (mobile) plus the card grid.
   Filter/facet logic, toggle functions, and useMemo hooks are preserved
   verbatim from v1.28 — only the visual/layout chrome is restyled, plus
   grid-width and page-size controls.

   v1.57 — Phase 1A: Gallery View / Collector View toggle + Collector's
   Workbench. Core design law: "Gallery View is for seeing watches.
   Collector View is for understanding watches. The left rail is for
   narrowing watches." Movement and Case Size MOVED out of the ordinary
   rail into the Workbench — one control, one location, never duplicated.
   Beat Rate/Power Reserve values are confirmed to exist but not confirmed
   clean; normalizeVph()/normalizePowerReserve() below are DISPLAY-ONLY
   transforms (the stored listings.details values are never rewritten) —
   same established pattern as sizeLabel() already uses for case size.

   v1.59 — Phase 1B follow-on (real-device evidence, iPhone 14 Pro 430x932):
   fixed mobile cramping by collapsing Collector to one card per row BELOW
   the md: breakpoint — but left it reverting to a 3/4-wide grid ABOVE that
   breakpoint, i.e. on desktop. That silently broke the core Collector View
   law (one listing per row, every width) the moment a wide monitor moved
   past 768px. Not a visual-preference bug — Collector's whole layout
   (small thumbnail left, DOMINANT data stack right) depends on a full-
   width row; forced into a 3-wide grid cell, the data stack becomes
   cramped exactly the way the mobile fix was trying to prevent.

   v2.5d — savedIds now seeds from the real saved_watches table on Browse
   mount (was session-only in v2.5c). Skips entirely when logged out — no
   behavior change for anonymous browsing. Save/unsave logic untouched.

   v2.5c — Add to Catalogue WIRED. saved_watches table created (verified
   nothing existed: no table, no migration history, no profiles column).
   Client-side insert via @/lib/supabase/client, same pattern as login page /
   NavBar Sign Out. Logged-out click → /login?callbackUrl=/browse (reuses the
   auth-flow-correction shipped this session). Duplicate-save is a harmless
   upsert no-op. Button shows a confirmed "Saved" state per session.

   v1.63 — Collector row polish: spec plate width pinned via inline style
   (the max-w utility was being ignored in the live build, letting values
   drift toward the price); watch photo enlarged to a portrait frame
   (120×150 mobile / 150×190 desktop, object-cover) to match the approved
   concept. No data, field, or logic changes.

   v1.62 — Collector View becomes a research tool. Three-zone row (photo /
   identity+capped-specs+Snapshot-trigger / price+Compare+Add-to-Catalogue).
   Collector Snapshot: inline absolute overlay, one-open-at-a-time, no layout
   shift, content generated ONLY from details keys verified to exist in
   production (buildSnapshot). Compare: per-row selection state only, no
   compare screen this phase. Add to Catalogue: placed & styled per the locked
   vocabulary but intentionally NOT wired — no Saved Watches store exists yet;
   handleAddToCatalogue is a no-op stub pending that mechanism. Out of scope
   per brief (deferred to Design Gate): guilloché, fumé, shadow/gutter/border
   aesthetic experimentation, animation refinement.

   v1.61 — Collector View outer wrapper: flex flex-col + real vertical gutter
   (space-y-6 md:space-y-8) replacing the grid gap-px background-bleed hack;
   per-row inset box-shadow perimeter. Gallery View grid untouched.

   v1.60 — restores the law: Collector View is grid-cols-1, unconditionally,
   at every width, full stop. The 3-wide/4-wide toggle is now removed from
   the DOM entirely (not grayed out) while Collector is active — it would
   otherwise sit on screen controlling nothing, which is worse than not
   being there. Gallery View: every width, untouched. 20/40/All page-size
   and Refine stay visible regardless of viewMode, per the brief.

   v1.58 — Phase 1B: Collector View gets its actual spec-first card layout
   (Phase 1A shipped it as Gallery-card-plus-one-line; this closes that
   gap). Gallery View's render branch is byte-for-byte untouched below.
   Collector: small fixed thumbnail left, dominant data stack right — nine
   fields in the brief's exact order, each rendered only when present (no
   "Unknown"/"N/A"/dash for missing data, ever). Documentation reuses the
   existing docBadge derivation verbatim, just placed as a stack row
   instead of a floating pill (logic identical, placement is the only
   change). caseThicknessMm is real, verified live against production
   before writing this: "11.7" and "9.5", plain decimal, same clean shape
   as caseSizeMm — thicknessLabel() mirrors sizeLabel() exactly.
   v2.10 — Back to Browse with filters preserved. The URL is now the single
   source of truth for all durable Browse view-state: the nine facet Sets,
   viewMode, gridCols, and pageSize are derived directly from useSearchParams()
   via useMemo — NOT parallel useState mirrors kept in sync with the URL.
   Two sources of truth is exactly the drift risk this design avoids: a
   separately-held useState value could theoretically render one tick out of
   sync with the URL; a value derived FROM the URL cannot, by construction.
   Toggling a filter/control calls router.replace() with a freshly-built
   URLSearchParams string — never manual string concatenation, which is
   exactly where the repeated-key/comma-hazard encoding (beatRateLabel() can
   contain a literal comma, e.g. "28,800 vph") would silently break if
   hand-rolled. openSnapshotId, compareSelected, isFilterOpen, mobileOpen, and
   savedIds are UNCHANGED — explicitly transient/DB-seeded, never persisted to
   the URL, per the locked ruling. All three listing-link call sites (Gallery
   card, Collector photo, Collector identity-header) now append the current
   Browse URL as an encoded returnTo value via listingHref(), so a buyer who
   opens a listing and clicks "← Browse" returns to the exact same filtered/
   sorted/paginated reality, not a reset one.
   v3.30 — Mobile Gallery media frame. Below md the card's image well is a
   responsive 4:3 frame at full card width (card padding p-3), replacing the
   fixed 140px-tall well that became a tall letterboxed shaft inside the
   3/4-column grid on a phone. A seller-authored presentation frame (whose
   editor stage is itself 4:3) renders as the approved cover-crop on mobile;
   every other photograph stays object-contain — the whole watch, always,
   never a blind centre-crop. Image badges (🛡️, FULL SET) anchor to the
   media frame itself, opposite corners, ending the card-corner collision.
   Desktop ≥md keeps p-7 card padding; its contain well became SQUARE in
   v4.91 (was a 140px strip that capped the watch's height and stranded it
   between two margins of empty well).
   v3.31 — Derived presentation thumbnails for unframed photographs. A
   source photo with large EMPTY margins baked into its bytes (a phone
   screenshot's letterbox bands, a studio backdrop) still rendered the
   watch small inside the v3.30 frame. Mobile Gallery now loads such
   photos through /api/presentation-thumb, which trims only near-uniform
   border margins at read time (trust-gated, safe margin retained, whole
   watch preserved, original bytes untouched — see
   lib/media/presentationThumb.ts). Seller-authored frames still win
   (v3.30 path unchanged); desktop still downloads the untouched original
   via <picture>/<source>.
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = {
  // pathname is the stable storage identity — it is what a stored hero choice
  // points at, since a URL can be re-signed and a pathname cannot. Optional
  // because rows written before hero choice existed carry no dependency on it.
  photo: { url: string; pathname?: string };
  category: string;
  isWristShot?: boolean;
};

export type ListingRow = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  public_code?: string | null;
  description?: string | null;
  year: string;
  condition: string;
  asking_price: number | null;
  // Money Truth Stage B — undisclosed until attested, never assumed USD.
  asking_currency: string | null;
  photos: ListingPhoto[];
  // Seller hero framing (v3.7) — already flowing through select("*"); typed
  // now, following the v1.57 type-only precedent. Absent on older rows.
  photo_presentation?: unknown;
  details?: {
    dialColorType?: string;
    caseMaterial?: string;
    documentation?: string;
    caseSizeMm?: string;
    movementType?: string;
    movementFrequency?: string; // Beat Rate / VPH — heterogeneous raw formats
    powerReserve?: string; // heterogeneous raw formats
    caseThicknessMm?: string; // v1.58 — verified live against production
    // v1.62 — Collector Snapshot fields. Every key below was verified to
    // exist in real listings.details before being added here (Supabase read,
    // both production rows). Nothing speculative: the mockup's "Condition
    // Notes"/"Concern" were NOT in the data and are deliberately absent.
    // Scalars:
    calibre?: string;
    jewels?: string;
    crystalMaterial?: string;
    casebackType?: string;
    bezelMaterial?: string;
    waterResistance?: string;
    caseColorFinish?: string;
    closureType?: string;
    braceletWristSize?: string;
    // Arrays (rendered joined with " · " when non-empty):
    complications?: string[];
    serviceHistory?: string[];
    includedWithWatch?: string[];
  } | null;
  /* Private curation score. NOT fetched by Browse — the buyer's browser
     never receives it (see app/browse/page.tsx). Optional so a surface that
     does select it still type-checks; nothing here reads it. */
  combined_score?: number;
  created_at: string; // ISO 8601 — ranking tie-break
  sold?: boolean; // optional on the row; defaults false if absent
  weeks_featured?: number; // optional on the row; defaults 0 if absent
  status: string;
  in_hand_verified?: boolean;
};

export type DealerBrowseScope = {
  sellerId: string;
  slug: string;
  businessName: string;
  logoUrl: string | null;
  location: string | null;
  tagline: string | null;
};

/* Null asking price is a truth, not a zero — render the evidence layer's
   honest words, never $0/$NaN (Buyer Price Truth order, Bug 1). Money Truth
   Stage B extends the same honesty to a missing currency via the shared
   formatter: no bare $, no assumed USD. */
function formatPrice(value: number | null, currency: string | null): string {
  return formatMoney(value, currency);
}

/* Hero + its framing. The browse card is a REAL crop — a 120×150 / 150×190
   portrait window with object-cover over photographs of every shape — so this
   is the surface where a seller's centring actually earns its keep, and the
   one where an off-centre watch was most visibly being clipped.

   The automatic rule (first Dial, else first photo) is unchanged and still
   governs every listing that has no stored presentation. */
function heroFrame(row: {
  photos: ListingPhoto[];
  photo_presentation?: unknown;
}): {
  url: string | null;
  style: React.CSSProperties;
  galleryFrameStyle: React.CSSProperties | null;
} {
  // Service Evidence stays off the Browse card unless the seller opted in —
  // a hero must never surface a service receipt (lib/servicePhotoPrivacy).
  const raw = publiclyDisplayablePhotos(Array.isArray(row.photos) ? row.photos : []);
  const presentation = sanitizePhotoPresentation(row.photo_presentation);
  if (raw.length === 0) {
    return { url: null, style: frameStyle(defaultFrame()), galleryFrameStyle: null };
  }
  // Role order governs which photo leads, exactly as on the listing page.
  const photos = sortByPhotoRole(raw, (p) => p?.category);
  const index = resolveHeroIndex(
    photos.map((p) => p?.photo?.pathname ?? null),
    presentation,
    roleAutomaticHero(photos, (p) => p?.category)
  );
  const chosen = photos[index] ?? photos[0];
  const frame = frameFor(presentation, chosen?.photo?.pathname);
  return {
    url: chosen?.photo?.url ?? null,
    /* The steeper of the card's two breakpoint shapes (150x190) — its
       cover-scale also covers the shallower 120x150, so a rotated photo can
       never show a gap at either size. */
    style: presentationStyleFor(presentation, chosen?.photo?.pathname, 150 / 190),
    /* The mobile Gallery card's 4:3 frame may cover-crop ONLY with a frame
       the seller authored — the presentation editor's stage is itself 4:3,
       so that framing is exactly the crop the seller approved at this
       aspect, never a blind centre-crop. No authored frame → null → the
       card falls back to object-contain: the whole watch, always. */
    galleryFrameStyle: isDefaultFrame(frame) ? null : frameStyle(frame, 4 / 3),
  };
}

/* Every publicly displayable photograph of one listing, in the SAME role
   order the hero is chosen from, plus which of them the card is showing.
   The carousel has to walk the identical sequence: a panel that opened on a
   different photograph than the card displayed would make the loupe feel
   like it changed the watch. Service Evidence stays excluded here exactly
   as it is excluded from the hero. */
function cardPhotos(row: {
  photos: ListingPhoto[];
  photo_presentation?: unknown;
}): { urls: string[]; heroIndex: number } {
  const raw = publiclyDisplayablePhotos(Array.isArray(row.photos) ? row.photos : []);
  if (raw.length === 0) return { urls: [], heroIndex: 0 };
  const photos = sortByPhotoRole(raw, (p) => p?.category);
  const presentation = sanitizePhotoPresentation(row.photo_presentation);
  const heroIndex = resolveHeroIndex(
    photos.map((p) => p?.photo?.pathname ?? null),
    presentation,
    roleAutomaticHero(photos, (p) => p?.category)
  );
  const urls = photos.map((p) => p?.photo?.url).filter((u): u is string => typeof u === "string");
  return { urls, heroIndex: Math.min(Math.max(heroIndex, 0), Math.max(urls.length - 1, 0)) };
}

/* Quick Specs — ONLY what this listing actually holds.
   Values are rendered exactly as stored. This surface does not resolve
   vocabulary: a display that "corrects" a stored value is asserting
   something the record does not say, and canonical-when-known belongs to
   whatever writes the record, never to the room that reads it. A field with
   nothing behind it is omitted rather than shown empty — no penalty for
   missing data, only a penalty for bad data. */
function quickSpecs(row: ListingRow): { label: string; value: string }[] {
  const d = row.details ?? {};
  const candidates: [string, string | null | undefined][] = [
    ["Case size", d.caseSizeMm],
    ["Movement", d.movementType],
    ["Dial", d.dialColorType],
    ["Case material", d.caseMaterial],
    ["Condition", row.condition],
    ["Documentation", d.documentation],
    ["Reference", row.reference],
    ["Year", row.year],
  ];
  return candidates
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([label, value]) => ({ label, value: (value as string).trim() }));
}

/* The derived presentation thumbnail for one photograph — only our own
   public listing photos route through it; anything else renders as-is.
   The route itself re-validates and falls back to the original on any
   failure, so a card can never lose its photograph to the derivation.

   Now the shared helper: this used to be local, and desktop bypassed it
   entirely, which is how a nine-card Browse page came to transfer 2.5MB to
   paint 341×140 wells. See lib/media/cardImage.ts.

   720 since v4.91: the square well paints the photograph at roughly 341 CSS
   px, so 480 would have gone soft on a 1.25× display the moment the well
   stopped being a 140px strip. Still a derivative, still far under the
   original — the payload win survives the geometry repair. */
const presentationThumbSrc = (url: string) => cardImageSrc(url, { width: 720 });

function countBy(listings: ListingRow[], pick: (l: ListingRow) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const l of listings) {
    const value = pick(l);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/* Free-text facet counter — dial colour and case material are typed through a
   typeahead that only SUGGESTS, so one real attribute reaches the database in
   several spellings and used to render as several tiles AND several filters.
   The folding rule and the reason it is presentation-only live in
   lib/browseFacets. */
function countByFolded(listings: ListingRow[], pick: (l: ListingRow) => string): [string, number][] {
  return foldFacets(listings.map(pick));
}

// Case size facet/filter key: append "mm" unless already present, so the
// displayed label and the value matched against the selection are identical.
function sizeLabel(value?: string): string {
  if (!value) return "";
  return value.includes("mm") ? value : `${value}mm`;
}

// v1.58 — Case thickness: display-only, mirrors sizeLabel() exactly.
// Verified against real listings.details before writing this — values are
// plain decimals ("11.7", "9.5"), same clean shape caseSizeMm already has.
function thicknessLabel(value?: string): string {
  if (!value) return "";
  return value.includes("mm") ? value : `${value}mm`;
}

// v1.57 — Beat Rate / VPH: display-only normalization. Stored values are
// confirmed heterogeneous ("28800" | "28,800 vph" | "4 Hz"). Hz is left as
// Hz (a real, different unit — never silently converted to vph). A
// recognizable vph number is reformatted with a thousands separator so
// "28800" and "28,800 vph" collapse to ONE facet instead of two. Anything
// unrecognized displays exactly as stored — never dropped, never guessed.
// The SAME output feeds both the facet label and the filter-match value
// (the sizeLabel pattern above), so display and filtering never disagree.
function beatRateLabel(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const hz = trimmed.match(/(\d+(?:\.\d+)?)\s*hz/i);
  if (hz) return `${hz[1]} Hz`;
  const num = trimmed.match(/[\d,]+/);
  if (num) {
    const n = Number(num[0].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return `${n.toLocaleString("en-US")} vph`;
  }
  return trimmed; // unrecognized format — shown as-is, not fabricated
}

// v1.57 — Power Reserve: same display-only law. Stored values are confirmed
// heterogeneous ("42 hours" | "dual barrel 42 hour reserve" | "approx. 42h").
// Extract the number preceding an hour-unit; unrecognized text passes
// through unchanged rather than being silently discarded.
function powerReserveLabel(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const hrs = trimmed.match(/(\d+(?:\.\d+)?)\s*h(?:our)?s?\b/i);
  if (hrs) return `${hrs[1]} hours`;
  return trimmed;
}

function FacetGroup({
  title,
  facets,
  selected,
  onToggle,
  implied,
  onImpliedToggle,
  dealerLegibility = false,
}: {
  title: string;
  facets: [string, number][];
  selected: Set<string>;
  onToggle: (value: string) => void;
  /** Values active because a Search interpretation covers them (one canonical
      state, a different origin). Rendered with the identical active treatment
      — origin stays internal, no visual clutter. Unchecking one removes the
      interpretation itself, so the rail can genuinely change or remove what
      Search understood. */
  implied?: Set<string>;
  onImpliedToggle?: (value: string) => void;
  dealerLegibility?: boolean;
}) {
  const selectedFolded = useMemo(
    () => new Set([...selected].map(facetKey)),
    [selected]
  );
  /* An empty dimension renders nothing. The dealer rail summarizes its
     empty dimensions in one quiet sentence instead of per-group
     "Unavailable" rows (buyer-facing polish, 2026-08-13) — a missing
     dimension is a fact about inventory, not a disabled control. */
  if (facets.length === 0) return null;
  return (
    <div className="mb-[22px] px-[18px]">
      <div
        className={
          dealerLegibility
            ? "mb-3 text-[11px] uppercase tracking-[1.8px] text-[var(--muted)]"
            : "mb-3 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]"
        }
      >
        {title}
      </div>
      <div>
        {facets.map(([value, count]) => {
          // Case-folded so a tile still reads as chosen when the URL carries a
          // different spelling of the same value. A no-op for the facets whose
          // vocabulary is already controlled.
          const isSelected =
            selected.has(value) || selectedFolded.has(facetKey(value));
          const isImplied = !isSelected && (implied?.has(value) ?? false);
          const isActive = isSelected || isImplied;
          return (
            <label
              key={value}
              className="mb-2 flex cursor-pointer items-center gap-2"
            >
              <input
                type="checkbox"
                checked={isActive}
                onChange={() =>
                  isImplied ? onImpliedToggle?.(value) : onToggle(value)
                }
                className="sr-only"
              />
              <div
                className={`flex h-[13px] w-[13px] shrink-0 items-center justify-center border-[1.5px] ${
                  isActive
                    ? "border-[var(--border-gold)] bg-[var(--gold-whisper)]"
                    : "border-[var(--slate)] bg-[var(--control-wash)]"
                }`}
              >
                {isActive && (
                  <div className="h-[5px] w-[5px] bg-[var(--gold-fill)] opacity-100" />
                )}
              </div>
              <span
                className={`min-w-0 flex-1 truncate tracking-[0.3px] ${
                  dealerLegibility
                    ? `text-[12px] ${
                        isActive ? "text-[var(--platinum-dim)]" : "text-[var(--slate)]"
                      }`
                    : `text-[11px] ${
                        isActive ? "text-[var(--slate)]" : "text-[var(--muted)]"
                      }`
                }`}
              >
                {value}
              </span>
              <span
                className={`tabular-nums ${
                  dealerLegibility
                    ? "text-[11px] text-[var(--slate)]"
                    : "text-[11px] text-[var(--muted)]"
                }`}
              >
                {count}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// v1.58 — one small presentational helper, shared by every Collector-View
// data-stack row: renders label/value only when value is truthy. This IS
// the "no Unknown/N/A/dash for missing data" law, enforced in one place
// instead of nine separate conditionals that could drift from each other.
function SpecRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-faint)] py-1 text-[11px] tracking-[0.3px]">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-[var(--slate)]">{value}</span>
    </div>
  );
}

// v1.62 — Collector Snapshot content, data-driven. Returns ONLY the deeper
// spec fields that (a) actually exist on this listing and (b) aren't already
// shown in the compact Collector row (Case Size / Movement / Beat Rate /
// Power Reserve / Thickness / Case Material / Documentation). Each field is
// emitted only when present — same "no penalty for missing data, only bad
// data" law SpecRow enforces. Arrays join with " · "; empty arrays are
// dropped, never rendered as an empty line. If this returns [], the row has
// nothing extra to reveal and the trigger is not shown at all.
function buildSnapshot(details: ListingRow["details"]): { label: string; value: string }[] {
  if (!details) return [];
  const rows: { label: string; value: string }[] = [];
  const scalar = (label: string, value?: string) => {
    if (value && value.trim()) rows.push({ label, value: value.trim() });
  };
  const list = (label: string, value?: string[]) => {
    if (Array.isArray(value) && value.length > 0) {
      rows.push({ label, value: value.join(" · ") });
    }
  };
  scalar("Calibre", details.calibre);
  scalar("Jewels", details.jewels);
  scalar("Crystal", details.crystalMaterial);
  scalar("Caseback", details.casebackType);
  scalar("Bezel", details.bezelMaterial);
  scalar("Water Resistance", details.waterResistance);
  scalar("Case Finish", details.caseColorFinish);
  scalar("Closure", details.closureType);
  scalar("Bracelet Fit", details.braceletWristSize);
  list("Complications", details.complications);
  list("Service History", details.serviceHistory);
  list("Included", details.includedWithWatch);
  return rows;
}

export default function BrowseClient({
  listings,
  dealerScope = null,
}: {
  listings: ListingRow[];
  dealerScope?: DealerBrowseScope | null;
}) {
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // v2.10 — the URL is the single source of truth for durable Browse state.
  // router.replace() is used (never .push()) so filter/view/grid/page-size
  // clicks don't spam browser history — pressing Back once should leave
  // Browse, not undo one facet toggle at a time. scroll:false preserves the
  // pre-existing UX (clicking a control never scrolled the page before).
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Builds the next URL from the CURRENT searchParams (never from local
  // component state, which could theoretically be one render behind) plus
  // one changed key, and navigates via replace. Omitting a key entirely when
  // it would be empty/default keeps an all-defaults Browse at a clean
  // "/browse" with no query string at all, per the acceptance requirement.
  const navigateWithParams = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Multi-value facet toggle (repeated keys, e.g. ?brand=Omega&brand=Rolex).
  // Never comma-joins — the verified hazard is beatRateLabel() producing a
  // literal comma ("28,800 vph"); repeated keys sidestep that class of bug
  // entirely rather than trying to escape commas correctly.
  const toggleFilterParam = (key: string, value: string) => {
    navigateWithParams((next) => {
      const current = next.getAll(key);
      next.delete(key);
      if (current.includes(value)) {
        for (const v of current) if (v !== value) next.append(key, v);
      } else {
        for (const v of current) next.append(key, v);
        next.append(key, value);
      }
    });
  };

  // Single-value control (viewMode / gridCols / pageSize). Omits the key
  // entirely when set back to its default, so the URL never carries redundant
  // "everything is default" noise.
  const setSingleParam = (key: string, value: string, defaultValue: string) => {
    navigateWithParams((next) => {
      if (value === defaultValue) next.delete(key);
      else next.set(key, value);
    });
  };

  const viewModeParam = searchParams.get("viewMode");
  const defaultViewMode: "gallery" | "collector" = dealerScope ? "collector" : "gallery";
  /* Scan is the Dealer Room's third reading mode — a dense sweep of one
     dealer's shelf. It exists only where a single dealer's inventory is the
     whole result set; on the global /browse a "scan" URL value degrades to
     the default view rather than erroring, same law as every other URL
     control. */
  const viewMode: "gallery" | "collector" | "scan" =
    viewModeParam === "collector" ||
    viewModeParam === "gallery" ||
    (viewModeParam === "scan" && dealerScope)
      ? (viewModeParam as "gallery" | "collector" | "scan")
      : defaultViewMode;
  const setViewMode = (value: "gallery" | "collector" | "scan") =>
    setSingleParam("viewMode", value, defaultViewMode);

  /* v4.93 — absent means AUTO, and auto is now a real layout rather than a
     synonym for three. The default ladder answers to the width of the results
     region itself (2 → 3 → 4), because Browse keeps a persistent refine rail
     and the viewport therefore never describes the space the cards actually
     have. 3-WIDE / 4-WIDE remain, as deliberate overrides; both still obey
     the bounded region, so choosing a density can never re-inflate a card.
     "auto" is a sentinel the URL never carries — an explicit 3 must survive
     in the URL, or the collector's choice would be indistinguishable from
     never having chosen. */
  const gridColsParam = searchParams.get("gridCols");
  const gridCols: 2 | 3 | 4 | null =
    gridColsParam === "4" ? 4 : gridColsParam === "3" ? 3 : gridColsParam === "2" ? 2 : null;
  const setGridCols = (value: 2 | 3 | 4 | null) =>
    setSingleParam("gridCols", value ? String(value) : "auto", "auto");

  const pageSizeParam = searchParams.get("pageSize");
  const pageSize: 20 | 40 | "all" =
    pageSizeParam === "40" ? 40 : pageSizeParam === "all" ? "all" : 20;
  const setPageSize = (value: 20 | 40 | "all") =>
    setSingleParam("pageSize", String(value), "20");

  // Price sort. Held in the URL exactly like viewMode/gridCols/pageSize, which
  // is what makes it survive Back-to-Browse for free: currentBrowseUrl below
  // is built from the whole query string, so the returnTo every listing link
  // carries already contains the sort. No separate persistence mechanism, and
  // no way for the sort to reset while the filters beside it survive — which
  // would read as a data defect rather than a state defect.
  const sort = parseBrowseSort(searchParams.get("sort"));
  const setSort = (value: BrowseSort) => setSingleParam("sort", value, "default");

  // The current Browse reality, as a single encoded value — used to build
  // every listing link's returnTo. Built via URLSearchParams (never manual
  // template-literal concatenation), so nested repeated params and the
  // beatRate comma hazard are encoded/decoded symmetrically for free —
  // verified by round-trip test before this was written.
  const currentBrowseUrl = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const listingHref = (id: string) => {
    const p = new URLSearchParams();
    p.set("returnTo", currentBrowseUrl);
    return `/listings/${id}?${p.toString()}`;
  };
  // v1.62 — Collector research workflow state.
  // Only ONE snapshot may be open at a time: a single id (or null), never a
  // Set — opening another row's snapshot simply replaces this value, which
  // is the "opening another automatically closes the previous" rule for free.
  const [openSnapshotId, setOpenSnapshotId] = useState<string | null>(null);
  /* Quick Specs loupe — Dealer Room Gallery/Scan cards. A single id, never a
     Set: opening one card's specs closes the previous, the same
     one-open-at-a-time law the Collector Snapshot established. Transient by
     design — never persisted to the URL. */
  const [openQuickId, setOpenQuickId] = useState<string | null>(null);
  /* The folding loupe. One id, never a Set — opening one card's inspection
     closes the previous, the same one-open-at-a-time law the Collector
     Snapshot established. Deliberately NOT in the URL: a peek is not a
     place, and it should not survive a reload or own a back-button step.
     Distinct from openQuickId above, which belongs to the Dealer Room's own
     Scan/Gallery loupe and is out of scope for this flight. */
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  /* ── WHY THE INSPECTION FLOATS INSTEAD OF EXPANDING ────────────────────
     It used to be a grid item that grew across two columns, which read
     beautifully standing still and broke the moment it was used. Closing it
     repacked the grid UNDER THE POINTER: a collector who spotted another
     watch and reached for it clicked where that watch had been, and landed
     on whatever slid into the gap. The thing you click must remain the thing
     you acted on.

     So nothing moves now. The grid is frozen exactly as it was; the panel
     floats above it, anchored to the card that opened it. The watch the
     collector's eye found stays where their eye found it. */
  const gridRegionRef = useRef<HTMLDivElement | null>(null);
  const [inspectAnchor, setInspectAnchor] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  /* Measured at the moment of opening, against the region rather than the
     window, so scroll position never enters the arithmetic. Two cards wide
     where there is room, pulled back inside the region when the card that
     opened it sits at the right edge. */
  const openInspection = (rowId: string, source: HTMLElement) => {
    const region = gridRegionRef.current;
    const card = source.closest("a");
    if (region && card) {
      const r = region.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const width = Math.min(c.width * 2 + 1, r.width);
      let left = c.left - r.left;
      if (left + width > r.width) left = Math.max(0, r.width - width);
      setInspectAnchor({ top: c.top - r.top, left, width });
    } else {
      setInspectAnchor(null);
    }
    setInspectingId(rowId);
  };
  /* Which photograph each card is showing. The collector may step a card's
     photographs from the card itself or from inside the inspection, and the
     position they left it at is the position it keeps when the panel
     closes — the card remembers what they were looking at. */
  const [cardPhotoIndex, setCardPhotoIndex] = useState<Record<string, number>>({});
  // Compare is selection-only this phase (no compare screen yet). The Set is
  // the workflow-preparation surface the future compare view will read from.
  const [compareSelected, setCompareSelected] = useState<Set<string>>(new Set());
  // v2.5d — savedIds now seeds from the database on mount (was session-only
  // in v2.5c, which read as broken even though saves persisted correctly —
  // /catalogue always showed them right, Browse just didn't know yet).
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // (router is declared once, above, in the URL-state block — v2.10)

  // v2.5d — one query on load. Skips entirely if not logged in, so savedIds
  // stays empty exactly as before — no behavior change for anonymous
  // browsing. Does not touch save/unsave logic, only seeds initial state.
  useEffect(() => {
    let cancelled = false;
    async function seedSavedIds() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("saved_watches")
        .select("listing_id")
        .eq("user_id", user.id);

      if (!cancelled && !error && Array.isArray(data)) {
        setSavedIds(new Set(data.map((r) => r.listing_id as string)));
      }
    }
    seedSavedIds();
    return () => {
      cancelled = true;
    };
  }, []);

  // v2.10 — each filter is now DERIVED from the URL (useMemo over
  // searchParams.getAll(key)), not held as independent useState. Same names,
  // same Set<string> shape, so the FacetGroup renders and the `filtered`
  // useMemo below are UNCHANGED — only the origin of the value moved.
  const selectedBrands = useMemo(() => new Set(searchParams.getAll("brand")), [searchParams]);
  const selectedConditions = useMemo(
    () => new Set(searchParams.getAll("condition")),
    [searchParams]
  );
  const selectedCaseSizes = useMemo(
    () => new Set(searchParams.getAll("caseSize")),
    [searchParams]
  );
  const selectedMovements = useMemo(
    () => new Set(searchParams.getAll("movement")),
    [searchParams]
  );
  // v1.57 — Workbench-only facets (never rendered in the ordinary rail).
  const selectedBeatRates = useMemo(
    () => new Set(searchParams.getAll("beatRate")),
    [searchParams]
  );
  const selectedPowerReserves = useMemo(
    () => new Set(searchParams.getAll("powerReserve")),
    [searchParams]
  );
  const selectedMaterials = useMemo(
    () => new Set(searchParams.getAll("caseMaterial")),
    [searchParams]
  );
  const selectedDials = useMemo(() => new Set(searchParams.getAll("dialColor")), [searchParams]);

  /* Free-text facets are matched case-folded, so a link carrying the older
     lowercase spelling still selects the same watches instead of quietly
     returning a short set. */
  const selectedMaterialsFolded = useMemo(
    () => new Set([...selectedMaterials].map(facetKey)),
    [selectedMaterials]
  );
  const selectedDialsFolded = useMemo(
    () => new Set([...selectedDials].map(facetKey)),
    [selectedDials]
  );
  const selectedDocs = useMemo(() => new Set(searchParams.getAll("docs")), [searchParams]);

  /* ── SEARCH ──────────────────────────────────────────────────────────────
     Search lives in the URL beside the filters, in the same derived-from-URL
     model v2.10 established. That single decision is what makes Refine
     preserve Search, Search preserve Refine, and a return from a listing
     restore both — no synchronisation code, because there is no second copy
     of the truth. */
  const queryText = searchParams.get("q") ?? "";

  // Reference resolution is an exact identity lookup against real listings,
  // never a broad keyword match.
  const knownReferences = useMemo(
    () => listings.map((l) => l.reference).filter(Boolean),
    [listings]
  );

  /* GOVERNED RESOLUTION (SFX-006B) happens on the server, because the governed
     taxonomy carries the curated alias corpus and that corpus does not ship in
     the client bundle (v6.86 protected-alias posture). The route returns
     resolved meanings only, never the dictionary.

     The local parse below still runs FIRST and unchanged, so the page is never
     waiting on a round trip to show criteria: it is the immediate answer, and
     the governed answer replaces it when it arrives for the SAME query. A
     phrase the local parser cannot name — "tonda pf" — therefore appears
     briefly as Text before resolving to Family. */
  const [governed, setGoverned] = useState<{ q: string; state: SearchState } | null>(null);

  useEffect(() => {
    const q = queryText.trim();
    if (!q) {
      setGoverned(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/search/resolve?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((state: SearchState | null) => {
        if (!cancelled && state) setGoverned({ q, state });
      })
      .catch(() => {
        /* Resolution is an ENRICHMENT. If the route is unreachable the local
           parse still stands and Browse keeps working exactly as it did before
           this round — degraded to unresolved Text, never broken. */
      });
    return () => {
      cancelled = true;
    };
  }, [queryText]);

  const activeSearch = useMemo(() => {
    if (governed && governed.q === queryText.trim()) return governed.state;
    return parseSearch(queryText, { knownReferences });
  }, [queryText, knownReferences, governed]);

  const searchActive = Boolean(
    activeSearch.code || activeSearch.reference || activeSearch.meanings.length
  );

  const setQuery = (value: string) =>
    navigateWithParams((next) => {
      if (value.trim()) next.set("q", value);
      else next.delete("q");
    });

  // Removing a Search-made row edits the TEXT it came from — the input and
  // the actual result state can never contradict each other. Removing
  // "Collection: Kalpa" from "parmigiani kalpa -gold" leaves
  // "parmigiani -gold".
  const removeMeaning = (meaning: Meaning) =>
    setQuery(removeMeaningFromQuery(queryText, meaning));

  const clearSearchText = () =>
    navigateWithParams((next) => {
      next.delete("q");
    });

  const FILTER_KEYS: [string, string][] = [
    ["brand", "Brand"],
    ["condition", "Condition"],
    ["caseSize", "Case size"],
    ["movement", "Movement"],
    ["beatRate", "Beat rate"],
    ["powerReserve", "Power Reserve"],
    ["caseMaterial", "Case Material"],
    ["dialColor", "Dial Color"],
    ["docs", "Documentation"],
  ];

  const clearAll = () =>
    navigateWithParams((next) => {
      next.delete("q");
      for (const [key] of FILTER_KEYS) next.delete(key);
    });

  // Search-made meanings and manual Refine choices become the same kind of
  // removable row — one shared state, two origins.
  const searchChips = useMemo<SearchChip[]>(() => {
    const out: SearchChip[] = [];

    if (activeSearch.code) {
      out.push({
        id: `code:${activeSearch.code}`,
        label: `Listing: ${activeSearch.code}`,
        source: "search",
        onRemove: clearSearchText,
      });
    }
    if (activeSearch.reference) {
      out.push({
        id: `reference:${activeSearch.reference}`,
        label: `Reference: ${activeSearch.reference}`,
        source: "search",
        onRemove: clearSearchText,
      });
    }
    for (const m of activeSearch.meanings) {
      out.push({
        id: `${m.kind}:${m.value}`,
        label: m.label,
        source: "search",
        onRemove: () => removeMeaning(m),
      });
    }
    for (const [key, label] of FILTER_KEYS) {
      for (const value of searchParams.getAll(key)) {
        out.push({
          id: `${key}:${value}`,
          label: `${label}: ${value}`,
          source: "filter",
          onRemove: () => toggleFilterParam(key, value),
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSearch, searchParams]);

  const brandFacets = useMemo(() => countBy(listings, (l) => l.brand), [listings]);
  const conditionFacets = useMemo(
    () => countBy(listings, (l) => l.condition),
    [listings]
  );
  const caseSizeFacets = useMemo(
    () => countBy(listings, (l) => sizeLabel(l.details?.caseSizeMm)),
    [listings]
  );
  const movementFacets = useMemo(
    () => countBy(listings, (l) => l.details?.movementType ?? ""),
    [listings]
  );
  const beatRateFacets = useMemo(
    () => countBy(listings, (l) => beatRateLabel(l.details?.movementFrequency)),
    [listings]
  );
  const powerReserveFacets = useMemo(
    () => countBy(listings, (l) => powerReserveLabel(l.details?.powerReserve)),
    [listings]
  );
  const materialFacets = useMemo(
    () => countByFolded(listings, (l) => l.details?.caseMaterial ?? ""),
    [listings]
  );
  const dialFacets = useMemo(
    () => countByFolded(listings, (l) => l.details?.dialColorType ?? ""),
    [listings]
  );

  // Rail representation of Search-interpreted dial families: the stored dial
  // values a family covers render active in Refine, so the tile, the rail,
  // and the result set share one truth. Same family test as matching.
  const impliedDials = useMemo(() => {
    const families = activeSearch.meanings.filter((m) => m.kind === "dialColor");
    const out = new Set<string>();
    if (!families.length) return out;
    for (const [value] of dialFacets) {
      if (value && families.some((f) => matchesDialColorFamily(f.value, value))) {
        out.add(value);
      }
    }
    return out;
  }, [activeSearch, dialFacets]);

  // Unchecking an implied dial value removes the interpretation that covers
  // it — the query text loses exactly the words Search understood, so the
  // removed criterion cannot silently reapply itself from the raw text.
  const removeImpliedDial = (value: string) => {
    const covering = activeSearch.meanings.find(
      (m) => m.kind === "dialColor" && matchesDialColorFamily(m.value, value)
    );
    if (covering) removeMeaning(covering);
  };
  const docFacets = useMemo(
    () => countBy(listings, (l) => l.details?.documentation ?? ""),
    [listings]
  );

  const filtered = useMemo(
    () =>
      listings.filter((l) => {
        const brandOk = selectedBrands.size === 0 || selectedBrands.has(l.brand);
        const condOk =
          selectedConditions.size === 0 || selectedConditions.has(l.condition);
        const sizeOk =
          selectedCaseSizes.size === 0 ||
          selectedCaseSizes.has(sizeLabel(l.details?.caseSizeMm));
        const movementOk =
          selectedMovements.size === 0 ||
          selectedMovements.has(l.details?.movementType ?? "");
        const beatRateOk =
          selectedBeatRates.size === 0 ||
          selectedBeatRates.has(beatRateLabel(l.details?.movementFrequency));
        const powerReserveOk =
          selectedPowerReserves.size === 0 ||
          selectedPowerReserves.has(powerReserveLabel(l.details?.powerReserve));
        const materialOk =
          selectedMaterialsFolded.size === 0 ||
          selectedMaterialsFolded.has(facetKey(l.details?.caseMaterial ?? ""));
        const dialOk =
          selectedDialsFolded.size === 0 ||
          selectedDialsFolded.has(facetKey(l.details?.dialColorType ?? ""));
        const docOk =
          selectedDocs.size === 0 ||
          selectedDocs.has(l.details?.documentation ?? "");
        // Search narrows the same set the facets narrow — one result set.
        const searchOk = !searchActive || matchesSearch(l, activeSearch);
        return (
          searchOk &&
          brandOk &&
          condOk &&
          sizeOk &&
          movementOk &&
          beatRateOk &&
          powerReserveOk &&
          materialOk &&
          dialOk &&
          docOk
        );
      }),
    [
      listings,
      selectedBrands,
      selectedConditions,
      selectedCaseSizes,
      selectedMovements,
      selectedBeatRates,
      selectedPowerReserves,
      selectedMaterialsFolded,
      selectedDialsFolded,
      selectedDocs,
      searchActive,
      activeSearch,
    ]
  );

  /* Sort spans the WHOLE filtered set, then the page size is applied to the
     sorted result — never the reverse. With 20 selected, Price: Low to High
     returns the twenty lowest-priced listings in the entire filtered set, not
     the twenty that happened to already be on the page reordered among
     themselves. This ordering of the two lines IS the guarantee; keep them
     adjacent and never slice `filtered` directly again. */
  const sorted = useMemo(() => sortListings(filtered, sort), [filtered, sort]);

  const paginated = pageSize === "all" ? sorted : sorted.slice(0, pageSize);

  /* ── Exact Identifier Search Law — presentation truth ────────────────────
     When the Search IS one exact identifier (a listing code or a
     manufacturer reference, resolved or identifier-shaped), a zero-result
     outcome must say "No exact match found." and any nearby watches may
     appear only afterward, under their own visible label. Relatedness is
     deterministic: shared leading characters (case-insensitive, punctuation
     stripped) against each listing's reference and public code — at least
     three shared, longest first. Related results are computed OUTSIDE the
     canonical result set and can never enter it. */
  const exactIdentifier = activeSearch.code ?? activeSearch.reference;

  const relatedToIdentifier = useMemo(() => {
    if (!exactIdentifier || filtered.length > 0) return [];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const wanted = norm(exactIdentifier);
    if (wanted.length < 3) return [];
    const sharedPrefix = (a: string, b: string) => {
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      return i;
    };
    return listings
      .map((l) => ({
        l,
        shared: Math.max(
          sharedPrefix(wanted, norm(l.reference ?? "")),
          sharedPrefix(wanted, norm(l.public_code ?? ""))
        ),
      }))
      .filter((e) => e.shared >= 3)
      .sort(
        (a, b) =>
          b.shared - a.shared ||
          (a.l.reference ?? "").localeCompare(b.l.reference ?? "")
      )
      .slice(0, 6)
      .map((e) => e.l);
  }, [exactIdentifier, filtered.length, listings]);

  // v1.62 — Collector workflow handlers.
  const toggleSnapshot = (id: string) =>
    setOpenSnapshotId((prev) => (prev === id ? null : id));

  /* ESCAPE CLOSES THE OPEN SNAPSHOT.

     Bound to the document, because the collector's hands may be anywhere on
     the page by the time they want the panel gone -- the same reason the card
     inspector binds its own Escape there. Fields are guarded for the same
     reason too: inside the search input Escape means "abandon what I am
     typing", and a panel must not steal that.

     The listener exists only while something is open, so a Browse with every
     snapshot closed carries no key handler at all. */
  useEffect(() => {
    if (!openSnapshotId) return;
    const onKey = (e: KeyboardEvent) => {
      /* instanceof, not a cast. A cast only silences the compiler; the target
         of a keydown is not guaranteed to BE an element, and `document` has no
         .closest -- so a cast turns that case into a thrown TypeError inside
         the listener, which kills Escape silently rather than falling through
         to it. Narrowing honestly makes the non-element case close the panel,
         which is the right answer: nothing was being typed into. */
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpenSnapshotId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openSnapshotId]);

  const toggleCompare = (id: string) =>
    setCompareSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // v2.5c — Add to Catalogue: WIRED. The saved_watches table now exists
  // (verified via Supabase: no table, no migration history, no profiles
  // column — genuinely nothing before this build; created fresh, RLS
  // enabled, own-row-only policies). This writes directly from the client,
  // same pattern as the login page and NavBar's Sign Out already use
  // (@/lib/supabase/client). Logged-out click sends the user to /login with
  // callbackUrl=/browse, reusing the exact auth-flow-correction mechanism
  // shipped this session — login honors it and returns them here.
  const handleAddToCatalogue = async (id: string) => {
    if (savedIds.has(id)) return; // already saved this session — no-op

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push(`/login?callbackUrl=${encodeURIComponent(currentBrowseUrl)}`);
      return;
    }

    // upsert + ignoreDuplicates: idempotent against the (user_id, listing_id)
    // primary key — re-saving an already-saved watch is a harmless no-op,
    // never a thrown error surfaced to the collector.
    const { error } = await supabase
      .from("saved_watches")
      .upsert({ user_id: user.id, listing_id: id }, { onConflict: "user_id,listing_id", ignoreDuplicates: true });

    if (error) {
      console.error("[FairWatchTrade] Add to Catalogue failed:", error);
      return;
    }

    setSavedIds((prev) => new Set(prev).add(id));
  };

  const toggleBrand = (value: string) => toggleFilterParam("brand", value);

  const toggleCondition = (value: string) => toggleFilterParam("condition", value);

  const toggleCaseSize = (value: string) => toggleFilterParam("caseSize", value);

  const toggleMovement = (value: string) => toggleFilterParam("movement", value);

  const toggleBeatRate = (value: string) => toggleFilterParam("beatRate", value);

  const togglePowerReserve = (value: string) => toggleFilterParam("powerReserve", value);

  const toggleMaterial = (value: string) => toggleFilterParam("caseMaterial", value);

  const toggleDial = (value: string) => toggleFilterParam("dialColor", value);

  const toggleDoc = (value: string) => toggleFilterParam("docs", value);

  const showAllDealerInventory = () =>
    navigateWithParams((next) => next.delete("brand"));

  // v1.57 — the rail: ORDINARY narrowing only. Movement and Case Size have
  // moved out entirely (see Workbench below) — one control, one location,
  // never rendered in both places per the Phase 1 architectural correction.
  const standardFacetList = (
    <div>
      {/* Filter intro */}
      <div className="mb-5 border-b border-[var(--border-faint)] px-[18px] pb-5">
        <div className="mb-[6px] text-[11px] uppercase tracking-[1.4px] text-[var(--gold-subtle)]">
          {dealerScope ? `Refine ${dealerScope.businessName}` : "Refine"}
        </div>
        {/* Founder-locked Browse wording. The Dealer Room twin of this line
            lives in dealerFacetList under "Refine This Dealer" and is
            deliberately NOT changed: facetList resolves to dealerFacetList
            whenever a dealerScope exists, so the two never render together,
            and a Browse ruling does not reach a dealer's room. */}
        {/* LEGIBILITY, measured rather than eyeballed. At 13px/300/--muted this
            sentence carried a 1.40mm x-height on the founder's 32" 4K at 125%,
            while the 11px all-caps REFINE label directly above it rendered at
            1.82mm — the nominally larger line read 23% smaller, because
            Cormorant carries only ~0.469em of x-height against Inter's ~0.55.
            Three things were quiet at once: size, weight 300, and the lowest
            readable colour tier. 16px/400/--slate lifts the x-height to
            ~1.73mm and the contrast from 5.07:1 to ~6.8:1 while keeping the
            Cormorant italic editorial voice, which is the part worth keeping.
            1,400 is a real loaded cut, so this is a true weight, not synthetic
            emboldening. Three wrapped lines in this column is the accepted
            cost; the rail is not widened and nothing around it moves. */}
        <p className="font-display text-[16px] font-normal italic leading-[1.6] text-[var(--slate)]">
          We think in dials and VPH, not dropdowns.
        </p>
      </div>

      <FacetGroup
        title="Brand"
        facets={brandFacets}
        selected={selectedBrands}
        onToggle={toggleBrand}
      />
      <FacetGroup
        title="Case Material"
        facets={materialFacets}
        selected={selectedMaterials}
        onToggle={toggleMaterial}
      />
      <FacetGroup
        title="Dial Color"
        facets={dialFacets}
        selected={selectedDials}
        onToggle={toggleDial}
        implied={impliedDials}
        onImpliedToggle={removeImpliedDial}
      />
      <FacetGroup
        title="Box & Papers"
        facets={docFacets}
        selected={selectedDocs}
        onToggle={toggleDoc}
      />
      <FacetGroup
        title="Condition"
        facets={conditionFacets}
        selected={selectedConditions}
        onToggle={toggleCondition}
      />

      {/* v1.57 — Collector's Workbench: a distinct, visually separate group.
          Per the core design law, this is NOT the narrowing rail — it is
          collector-specific criteria, reusing the identical FacetGroup /
          countBy / toggle-handler pattern as every rail facet above. */}
      <div className="mx-[18px] mb-[22px] border-t border-[var(--border-faint)] pt-5">
        <div className="mb-3 text-[11px] uppercase tracking-[1.6px] text-[var(--gold-subtle)]">
          Collector&apos;s Workbench
        </div>
      </div>
      <FacetGroup
        title="Case Size"
        facets={caseSizeFacets}
        selected={selectedCaseSizes}
        onToggle={toggleCaseSize}
      />
      <FacetGroup
        title="Movement"
        facets={movementFacets}
        selected={selectedMovements}
        onToggle={toggleMovement}
      />
      <FacetGroup
        title="Beat Rate"
        facets={beatRateFacets}
        selected={selectedBeatRates}
        onToggle={toggleBeatRate}
      />
      <FacetGroup
        title="Power Reserve"
        facets={powerReserveFacets}
        selected={selectedPowerReserves}
        onToggle={togglePowerReserve}
      />
    </div>
  );

  /* The dealer rail's eight normal Browse dimensions, in ruled order, with
     their live facet truth — consumed just below to render populated groups
     and summarize empty ones. */
  const dealerDimensions: Array<{
    title: string;
    facets: [string, number][];
    selected: Set<string>;
    onToggle: (value: string) => void;
    implied?: Set<string>;
    onImpliedToggle?: (value: string) => void;
  }> = [
    { title: "Case Material", facets: materialFacets, selected: selectedMaterials, onToggle: toggleMaterial },
    { title: "Dial Color", facets: dialFacets, selected: selectedDials, onToggle: toggleDial, implied: impliedDials, onImpliedToggle: removeImpliedDial },
    { title: "Box & Papers", facets: docFacets, selected: selectedDocs, onToggle: toggleDoc },
    { title: "Condition", facets: conditionFacets, selected: selectedConditions, onToggle: toggleCondition },
    { title: "Case Size", facets: caseSizeFacets, selected: selectedCaseSizes, onToggle: toggleCaseSize },
    { title: "Movement", facets: movementFacets, selected: selectedMovements, onToggle: toggleMovement },
    { title: "Beat Rate", facets: beatRateFacets, selected: selectedBeatRates, onToggle: toggleBeatRate },
    { title: "Power Reserve", facets: powerReserveFacets, selected: selectedPowerReserves, onToggle: togglePowerReserve },
  ];

  const dealerFacetList = dealerScope ? (
    <div>
      <div className="mb-5 border-b border-[var(--border-faint)] px-[18px] pb-5">
        <div className="mb-3 text-[11px] uppercase tracking-[1.6px] text-[var(--gold-dim)]">
          Inventory Brands
        </div>
        <button
          type="button"
          onClick={showAllDealerInventory}
          aria-pressed={selectedBrands.size === 0}
          className={`group -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between border-l-2 px-2 py-2 text-left text-[12px] tracking-[0.3px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--border-gold)] ${
            selectedBrands.size === 0
              ? "border-[var(--gold-dim)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
              : "border-transparent text-[var(--slate)] hover:bg-[var(--hover-wash)] hover:text-[var(--platinum-dim)]"
          }`}
        >
          <span>All inventory</span>
          <span className={`text-[11px] tabular-nums transition-colors ${
            selectedBrands.size === 0
              ? "text-[var(--gold-dim)]"
              : "text-[var(--slate)] group-hover:text-[var(--platinum-dim)]"
          }`}>
            {listings.length}
          </span>
        </button>
        {brandFacets.map(([brand, count]) => {
          const active = selectedBrands.has(brand);
          return (
            <button
              key={brand}
              type="button"
              onClick={() => toggleBrand(brand)}
              aria-pressed={active}
              className={`group -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between border-l-2 px-2 py-2 text-left text-[12px] tracking-[0.3px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--border-gold)] ${
                active
                  ? "border-[var(--gold-dim)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
                  : "border-transparent text-[var(--slate)] hover:bg-[var(--hover-wash)] hover:text-[var(--platinum-dim)]"
              }`}
            >
              <span className="truncate">{brand}</span>
              <span className={`text-[11px] tabular-nums transition-colors ${
                active
                  ? "text-[var(--gold-dim)]"
                  : "text-[var(--slate)] group-hover:text-[var(--platinum-dim)]"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 border-b border-[var(--border-faint)] px-[18px] pb-5">
        <div className="mb-[6px] text-[11px] uppercase tracking-[1.6px] text-[var(--gold-dim)]">
          Refine This Dealer
        </div>
        <p className="font-display text-[14px] font-light italic leading-[1.6] text-[var(--slate)]">
          Collectors think in dials, not dropdowns.
        </p>
      </div>

      {/* A dimension this dealer's inventory doesn't populate is not a public
          control or a coverage report. It simply stays out of the room until
          represented values make the facet useful. */}
      {dealerDimensions.map((dim) =>
        dim.facets.length > 0 ? (
          <FacetGroup
            key={dim.title}
            title={dim.title}
            facets={dim.facets}
            selected={dim.selected}
            onToggle={dim.onToggle}
            implied={dim.implied}
            onImpliedToggle={dim.onImpliedToggle}
            dealerLegibility
          />
        ) : null
      )}
    </div>
  ) : null;

  const facetList = dealerFacetList ?? standardFacetList;

  /* Contact panel items — the dealer's public watches, straight from the
     already-loaded inventory. The panel walks a buyer into the EXISTING
     listing conversation; it never opens a parallel channel. */
  const dealerContactItems: DealerContactItem[] = dealerScope
    ? listings.map((row) => ({
        id: row.id,
        brand: row.brand,
        model: row.model,
        reference: row.reference,
        thumbUrl: heroFrame(row).url,
      }))
    : [];

  /* The catalogue owns the room's one public count. It names the marketplace
     object exactly and states the filtered relationship only when narrowed. */
  const dealerResultStatus = dealerScope
    ? filtered.length === listings.length
      ? `${listings.length} ${listings.length === 1 ? "listing" : "listings"}`
      : `${filtered.length} of ${listings.length} ${listings.length === 1 ? "listing" : "listings"}`
    : null;

  const dealerIdentity = dealerScope ? (
    <section className="relative -mx-6 -mt-5 grid grid-cols-1 items-center gap-2 border-b border-[var(--border-faint)] bg-[var(--ink-deep)] px-6 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-[var(--border-subtle)] bg-[var(--ink)] p-2">
          {dealerScope.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cardImageSrc(dealerScope.logoUrl, { mode: "fit", width: 96 })}
              alt={`${dealerScope.businessName} logo`}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="font-display text-[18px] font-light text-[var(--gold)]">
              {dealerScope.businessName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 3)
                .map((word) => word[0])
                .join("")
                .toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-light text-[var(--platinum)] sm:truncate">
            {dealerScope.businessName}
          </h1>
          {/* Trust context beside identity: what FairWatchTrade actually
              does, one tap away — inline with the dealer's location rather
              than spending a separate row on identity metadata. */}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0 text-[12px] text-[var(--slate)]">
            {dealerScope.location && <span>{dealerScope.location}</span>}
            {dealerScope.location && <span aria-hidden="true">·</span>}
            <DealerTrustMark />
          </div>
        </div>
      </div>
      <div className="shrink-0 sm:justify-self-end">
        {/* The room's primary buyer action — full-width and touch-safe on a
            phone, quieter and shorter beside the identity on desktop. */}
        <DealerContactPanel
          businessName={dealerScope.businessName}
          items={dealerContactItems}
        />
      </div>
    </section>
  ) : null;

  return (
    <div>
      {/* Dealer identity is data supplied by the canonical public identity
          record. It never changes the catalogue, cards, shell, or controls. */}
      {dealerIdentity}

      <div className={dealerScope ? "relative -mx-6" : ""}>

      {/* Browse header — the count is the canonical filtered result set, so
          the number always describes exactly the listings rendered below. */}
      {/* Mobile vertical density (real-XCover SEE-it, 2026-08-13): every
          pre-grid block keeps its desktop rhythm at md+ but tightens below
          it, so the first row of watches arrives materially earlier on a
          phone. Space is recovered from air between blocks only — text
          sizes, touch targets and the 2-up Gallery are untouched. */}
      {!dealerScope && <div className="-mx-6 -mt-5">
        <div className="flex items-end justify-between border-b border-[var(--border-faint)] px-6 py-3 md:py-5">
          <div>
            <h1 className="font-display text-[24px] font-light tracking-[0.5px] text-[var(--platinum)]">
              Discover
            </h1>
            {/* This line carries catalogue status and a trust claim, not
                decoration — how many watches are actually below, and that
                they were curated and verified. At 10px in --muted it was
                the smallest text on the page saying one of the most
                important things on it. 12px in --slate (7.4:1) reads
                immediately; the weight and casing stay ordinary so it
                remains a sentence beneath the heading, never a second one. */}
            <p className="mt-1 text-[12px] tracking-[0.4px] text-[var(--slate)]">
              {filtered.length} watches · curated and verified
            </p>
          </div>
        </div>

        {/* SEARCH — DD10. Sits above the existing Refine controls; the real
            production header and hamburger above it are untouched. */}
        <BrowseSearch
          query={queryText}
          onCommit={setQuery}
          chips={searchChips}
          onClearAll={clearAll}
          ariaLabel={
            "Search FairWatchTrade"
          }
          /* RULED: the empty Browse field shows no prompt text at all. It
             read as a sentence the collector had to clear before typing one
             of their own, and it sat above a block that then said nothing
             was there yet — two pieces of copy explaining an empty box. The
             enlarged magnifier is the whole affordance now. The field keeps
             its accessible name through ariaLabel, so removing the visible
             prompt costs a screen reader nothing. Dealer Room is untouched:
             it passes its own placeholder and runs in legibilityMode. */
          placeholder=""
        />
      </div>}

      {/* The catalogue bar. This band and the controls band below it read
          as ONE group: the catalogue names itself and is searched here, and
          the controls that operate on it sit directly beneath, closed by a
          single border. Previously these were three separately bordered
          full-width bands — search, then controls, then a heading — which
          put the tools ABOVE the heading they act on and spent most of the
          first screen before a single watch appeared. The heading also
          repeated the business name as a second <h1>; the identity band
          above already carries that. */}
      {dealerScope && (
        <div className="px-6 pt-4 md:ml-[250px] md:w-[calc(100%-250px)] md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8">
            <div className="min-w-0">
              <h2 className="font-display text-[19px] font-light tracking-[0.4px] text-[var(--platinum)] sm:truncate">
                {dealerScope.businessName} Catalogue
              </h2>
              <p className="mt-1 text-[12px] tracking-[0.4px] text-[var(--slate)]">
                {dealerResultStatus}
              </p>
            </div>
            {/* Deliberate width: the search takes a real column on desktop
                rather than the whole page, so the catalogue keeps the room.
                On a phone it returns to full width — the same control, not
                a second mobile product. */}
            <div className="w-full md:w-[300px] md:shrink-0">
              <BrowseSearch
                query={queryText}
                onCommit={setQuery}
                chips={searchChips}
                onClearAll={clearAll}
                ariaLabel={`Search ${dealerScope.businessName} inventory`}
                placeholder="Brand, model, or reference"
                legibilityMode
                dealerRoomMode
              />
            </div>
          </div>
        </div>
      )}

      {/* Toggle bar */}
      {!dealerScope && <div className="mt-4 flex flex-wrap items-center gap-3 md:mt-8">
        <button
          type="button"
          onClick={() => setIsFilterOpen((v) => !v)}
          className="hidden items-center rounded-md border border-[var(--border-mid)] px-3 py-1.5 text-[12px] text-[var(--platinum)] transition hover:border-[var(--border-gold)] md:inline-flex"
        >
          {isFilterOpen ? "Hide" : "Refine"}
        </button>
        {/* v2.25a — creation before consumption: the one real way to create
            and name a saved search, beside the control that owns the filter
            context. The Drawer's quick links only consume what this makes.
            When the result set is EMPTY the approved inline "save it" inside
            the empty state is the only save affordance — two save controls on
            one empty screen contradict each other. */}
        {!dealerScope && paginated.length > 0 && (
          <SaveSearchControl searchState={activeSearch} />
        )}
      </div>}

      {/* Layout controls bar — grid width + view mode + page size.
          v1.57 — the Gallery/Collector toggle sits alongside grid width:
          both are orthogonal display controls, neither replaces the other. */}
      <div
        className={`flex flex-wrap items-center justify-between gap-y-3 border-b border-[var(--border-faint)] pb-3 sm:flex-nowrap md:pb-4 ${
          dealerScope
            ? "px-6 pt-3 md:ml-[250px] md:w-[calc(100%-250px)] md:px-8"
            : "mt-3 md:mt-6"
        }`}
      >
        <div className="flex items-center gap-4">
          {dealerScope && (
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex items-center border border-[var(--border-subtle)] px-[10px] py-[5px] text-[11px] uppercase tracking-[1px] text-[var(--slate)] md:hidden"
            >
              Refine
            </button>
          )}
          {/* The primary view selector always owns the first position. Gallery
              density is secondary and appears after it, so the control a
              collector just used never moves when its dependent options
              enter or leave the DOM. */}
          <div className="flex items-center gap-1">
            {(dealerScope
              ? ([
                  { key: "collector", label: "Collector" },
                  { key: "gallery", label: "Gallery" },
                  { key: "scan", label: "Scan" },
                ] as const)
              : ([
                  { key: "gallery", label: "Gallery" },
                  { key: "collector", label: "Collector" },
                ] as const)
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewMode(key)}
                /* GALLERY / COLLECTOR chooses how a collector reads the whole
                   page, so it is not fine print. 9px is ~1.1mm of cap height
                   in a hand outdoors; the phone gets the same 11px the Dealer
                   Room was already corrected to, desktop keeps 9px. */
                className={`border px-[10px] py-[5px] uppercase tracking-[1px] transition ${
                  "text-[11px]"
                } ${
                  viewMode === key
                    ? "border-[var(--border-gold)] text-[var(--gold)]"
                    : dealerScope
                      ? "border-[var(--border-subtle)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
                      : "border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--slate)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* v1.60 — absent from the DOM outside Gallery because density then
              controls nothing. Desktop-only: phones keep the established
              two-column Gallery. */}
          {viewMode === "gallery" && (
            <div className="hidden items-center gap-1 border-l border-[var(--border-faint)] pl-4 md:flex">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={gridCols === n}
                  title={
                    gridCols === n
                      ? `${n} across — press again to fit the column count to the space`
                      : `Always ${n} across`
                  }
                  onClick={() => setGridCols(gridCols === n ? null : n)}
                  className={`border px-[10px] py-[5px] text-[11px] uppercase tracking-[1px] transition ${
                    gridCols === n
                      ? "border-[var(--border-gold)] text-[var(--gold)]"
                      : dealerScope
                        ? "border-[var(--border-subtle)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
                        : "border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--slate)]"
                  }`}
                >
                  {n}-wide
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort + page size — SIBLINGS of the view toggle, not a nested
            right-hand wrapper. The real-device pass exposed why the wrapper
            was a defect: real device font metrics tipped the whole wrapped
            group below the toggle, and its INNER wrap then stacked Sort and
            20/40/ALL on separate lines — three rows of controls before any
            watch. As direct bar children with phone-only order utilities,
            the cluster folds into TWO deliberate rows: view toggle with the
            page sizes beside it, Sort beneath — and Sort's dropdown (whose
            widest option sets its width) can never force a third row.
            Desktop's single nowrap line is visually identical to before. */}
        {/* Sort — a single dropdown, the control collectors already know
            from every other marketplace, and the one shape that absorbs a
            new ordering as one more line instead of another button competing
            for this bar. It borrows the neighbouring controls' type and
            border, and turns gold on the same rule they do: the room says
            plainly when it is no longer in its default order.

            "Default" is deliberately not "Featured" — nothing is featured
            here, and the underlying query carries no ORDER BY, so a word
            promising an editorial or recency order would be a claim the
            data does not support. */}
        <div className="order-last ml-auto flex items-center gap-2 md:order-none">
            <label
              htmlFor="browse-sort"
              className={`uppercase tracking-[1px] ${
                dealerScope
                  ? "text-[11px] text-[var(--slate)]"
                  : "text-[11px] text-[var(--muted)]"
              }`}
            >
              Sort
            </label>
            <select
              id="browse-sort"
              value={sort}
              onChange={(e) => setSort(parseBrowseSort(e.target.value))}
              className={`border bg-[var(--ink-deep)] px-[10px] py-[5px] text-[11px] uppercase tracking-[1px] transition ${
                dealerScope ? "!text-[11px]" : ""
              } ${
                sort === "default"
                  ? dealerScope
                    ? "border-[var(--border-subtle)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
                    : "border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--slate)]"
                  : "border-[var(--border-gold)] text-[var(--gold)]"
              }`}
            >
              <option value="default">Default</option>
              <option value="priceAsc">Price: Low to High</option>
              <option value="priceDesc">Price: High to Low</option>
              {/* A dealer's shelf is small enough for an alphabetical walk to
                  be a real reading order; the global catalogue keeps its
                  established three. */}
              {dealerScope && <option value="brandAsc">Brand A–Z</option>}
            </select>
          </div>

        {/* Desktop: ml-4 replaces the retired wrapper's gap-x-4 after Sort.
            Phone: ml-auto seats the page sizes at the right end of the view-
            toggle row (Sort has moved to its own row via order-last). */}
        <div className="ml-auto flex items-center gap-1 md:ml-4">
          {([20, 40, "all"] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPageSize(n)}
              className={`border px-[10px] py-[5px] uppercase tracking-[1px] transition ${
                "text-[11px]"
              } ${
                pageSize === n
                  ? "border-[var(--border-gold)] text-[var(--gold)]"
                  : dealerScope
                    ? "border-[var(--border-subtle)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
                    : "border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--slate)]"
              }`}
            >
              {n === "all" ? "All" : n}
            </button>
          ))}
        </div>
      </div>

      {/* QUICK ADD — the fast-addition half of the collapsed rail. Fed the
          IDENTICAL facet arrays, selection Sets and toggle handlers the rail's
          own FacetGroups receive, so it cannot become a second filter system:
          one act, one URL, one truth shared with the rail and the Active
          Criteria chips. Desktop, public Browse only — the Dealer Room owns a
          different rail composition and mobile keeps its approved sheet. */}
      {!dealerScope && (
        <BrowseQuickAdd
          refineOpen={isFilterOpen}
          onOpenRefine={() => setIsFilterOpen(true)}
          categories={
            [
              { key: "brand", title: "Brand", facets: brandFacets, selected: selectedBrands, onToggle: toggleBrand },
              { key: "caseSize", title: "Case Size", facets: caseSizeFacets, selected: selectedCaseSizes, onToggle: toggleCaseSize },
              { key: "movement", title: "Movement", facets: movementFacets, selected: selectedMovements, onToggle: toggleMovement },
              { key: "caseMaterial", title: "Case Material", facets: materialFacets, selected: selectedMaterials, onToggle: toggleMaterial },
              { key: "dialColor", title: "Dial Color", facets: dialFacets, selected: selectedDials, onToggle: toggleDial },
              { key: "docs", title: "Documentation", facets: docFacets, selected: selectedDocs, onToggle: toggleDoc },
              { key: "condition", title: "Condition", facets: conditionFacets, selected: selectedConditions, onToggle: toggleCondition },
            ] as QuickAddCategory[]
          }
        />
      )}

      <div className={dealerScope ? "block" : "mt-4 flex gap-6"}>
        {/* Desktop sidebar — collapses to w-0 */}
        <aside
          className={`hidden shrink-0 flex-col overflow-hidden transition-all duration-300 md:flex ${
            isFilterOpen
              ? dealerScope
                ? "absolute inset-y-0 left-0 w-[250px] border-r border-[var(--border-faint)] bg-[var(--ink-deep)] px-6 py-7"
                : "w-[168px]"
              : "w-0"
          }`}
        >
          <div className={dealerScope ? "w-full" : "w-[168px]"}>
            {facetList}
          </div>
        </aside>

        {/* Grid wrapper — expands as the sidebar collapses */}
        <div
          className={
            dealerScope
              ? "min-w-0 px-6 py-6 md:ml-[250px] md:w-[calc(100%-250px)] md:px-8"
              : "min-w-0 flex-1"
          }
        >
          {paginated.length === 0 ? (
            dealerScope && listings.length === 0 ? (
              <section className="py-8 sm:py-12">
                <div className="max-w-xl border-l border-[var(--border-gold)] pl-5">
                  <div className="mb-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold-dim)]">
                    Dealer inventory
                  </div>
                  <h2 className="font-display text-[24px] font-light text-[var(--platinum)]">
                    No public watches right now.
                  </h2>
                  <p className="mt-3 text-[14px] leading-[1.7] text-[var(--slate)]">
                    Published watches from {dealerScope.businessName} will appear here automatically.
                  </p>
                </div>
              </section>
            ) : searchActive ? (
              <SearchEmptyState
                searchState={activeSearch}
                queryString={searchParams.toString()}
                browseUrl={currentBrowseUrl}
                exactIdentifier={exactIdentifier}
                related={relatedToIdentifier.map((l) => ({
                  id: l.id,
                  href: listingHref(l.id),
                  brand: l.brand,
                  model: l.model,
                  reference: l.reference,
                  priceText: formatPrice(l.asking_price, l.asking_currency),
                }))}
              />
            ) : (
              /* Wanted V1 — the zero-result seam. What the collector already
                 narrowed down travels into the draft (browseDraftHref), so
                 declaring the hunt does not mean typing it all again. This
                 is the ONLY change to Browse in this flight. */
              <div>
                <p className="text-[14px] text-[var(--slate)]">
                  No watches match your selection.
                </p>
                <p className="mt-3 text-[13px] text-[var(--muted)]">
                  Looking for something specific? Tell FairWatchTrade, and eligible sellers can
                  answer with a governed listing.
                </p>
                <Link
                  href={browseDraftHref(searchParams)}
                  className="mt-3 inline-block border border-[var(--border-mid)] px-4 py-2 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]"
                >
                  Create Wanted Request →
                </Link>
              </div>
            )
          ) : (
            /* v4.93 — THE RESULTS REGION. Card grids answer to this element's
               width, never the window's: Browse keeps a persistent refine
               rail, so the two numbers differ by ~240px and only this one
               describes the space the cards have. It is also where growth
               stops — see .fw-grid-region in globals.css. Collector View is a
               stacked list, not a card grid, and is deliberately left out of
               the ladder and the bound. */
            <div
              ref={gridRegionRef}
              className={
                viewMode === "collector"
                  ? undefined
                  : `relative fw-grid-region ${
                      gridCols === 2
                        ? "fw-grid-region--2"
                        : gridCols === 3
                          ? "fw-grid-region--3"
                          : gridCols === 4
                            ? "fw-grid-region--4"
                            : "fw-grid-region--auto"
                    }`
              }
            >
            <div
              // v1.61 — Collector View: stacked block, not a grid. space-y-*
              // utilities don't apply inside `grid`, so Collector gets its
              // own flex flex-col wrapper with real vertical gutters instead
              // of the old gap-px background-bleed hack. Gallery View keeps the
              // same grid wrapper; only its phone column count has changed.
              className={
                viewMode === "collector"
                  ? "flex flex-col space-y-6 md:space-y-8"
                  : viewMode === "scan"
                    ? /* Scan — the dense sweep of one dealer's shelf. Its
                         fourth column earns its place earlier than Gallery's
                         because the cards are tighter by design. The phone
                         keeps the same two-column floor as Gallery: a third
                         phone column would shrink each watch to a postage
                         stamp, which is exactly the defect the Gallery mobile
                         grid already corrected. */
                      "grid gap-px bg-[var(--grid-gutter)] fw-grid-scan"
                  : /* The column count answers to the results region. A phone
                       is ~412px wide: three columns leave a 95px card holding
                       a 44px watch, which is how the 4:3 frame could be
                       correct and the watch still be a postage stamp. Two
                       columns is the floor everywhere; above it the ladder
                       climbs 3 → 4 as the REGION earns them, and an explicit
                       3-WIDE / 4-WIDE choice pins the count instead. */
                    `grid gap-px bg-[var(--grid-gutter)] ${
                      gridCols === 2
                        ? "grid-cols-2"
                        : gridCols === 3
                          ? "grid-cols-2 md:grid-cols-3"
                          : gridCols === 4
                            ? "grid-cols-2 md:grid-cols-4"
                            : "fw-grid-auto"
                    }`
              }
            >
              {paginated.map((row) => {
                const { url: hero, style: heroStyle, galleryFrameStyle } = heroFrame(row);
                const title = row.model ? `${row.brand} ${row.model}` : row.brand;
                const meta = [row.condition, row.year].filter(Boolean).join(" · ");
                /* Case diameter leads the attribute run: of the three facts
                   here it is the one a collector scans for fit, and it stops
                   requiring a Quick Specs open to answer. Composed into the
                   existing line rather than given a badge, pill or row of its
                   own — the card gains a word, not a layer. */
                const parts = [
                  caseDiameterLabel(row.details?.caseSizeMm),
                  row.details?.dialColorType,
                  row.details?.caseMaterial,
                ].filter(Boolean);
                const attrs = parts.join(" · ") || null;
                const doc = row.details?.documentation;
                /* Completeness is a FACT ABOUT THE WATCH, not a label that has
                   to interrupt its photograph. All four states are honoured
                   equally — a watch with no box says so in the same voice a
                   full set does. */
                const docBadge = documentationState(doc);
                const docInline = docBadge ? inlineDocumentation(docBadge) : null;

                // Gallery and Scan share one card anatomy; Scan is the same
                // card read at shelf density — tighter type, squarer well,
                // four to a row on a wide desktop.
                if (viewMode === "gallery" || viewMode === "scan") {
                  const scan = viewMode === "scan";
                  /* Quick Specs — the loupe's content. Rows exist only for
                     data this listing actually carries: no Unknown, no N/A,
                     no dash, per the standing missing-data law. An empty set
                     renders no loupe at all. */
                  const quickRows: { label: string; value: string }[] = dealerScope
                    ? [
                        {
                          label: "Case / Movement",
                          value: [sizeLabel(row.details?.caseSizeMm), row.details?.movementType]
                            .filter(Boolean)
                            .join(" · "),
                        },
                        { label: "Condition", value: row.condition ?? "" },
                        { label: "Dial", value: row.details?.dialColorType ?? "" },
                        { label: "Material", value: row.details?.caseMaterial ?? "" },
                        { label: "Documentation", value: row.details?.documentation ?? "" },
                      ].filter((r) => r.value.trim() !== "")
                    : [];
                  const hasQuick = quickRows.length > 0;
                  const isQuickOpen = hasQuick && openQuickId === row.id;

                  /* ── THE PEEK ────────────────────────────────────────────
                     The inspection is an ordinary grid item that grew to
                     two columns. Not an overlay, not a portal, not a fixed
                     scrim: the collector keeps their place in the results,
                     and the rest of the grid stays exactly where it was.
                     It replaces the card's Link rather than nesting inside
                     it — a panel full of buttons and a link inside a link
                     is not a control anyone can use. */
                  const { urls: photoUrls, heroIndex } = cardPhotos(row);
                  const activePhoto = Math.min(
                    Math.max(cardPhotoIndex[row.id] ?? heroIndex, 0),
                    Math.max(photoUrls.length - 1, 0)
                  );
                  const setPhoto = (index: number) =>
                    setCardPhotoIndex((prev) => ({ ...prev, [row.id]: index }));
                  const specRows = quickSpecs(row);


                  /* Once the collector has stepped away from the seller's
                     hero, the authored frame no longer describes what is on
                     screen — that crop was drawn for one photograph. The
                     rest of the sequence is shown whole instead of wearing
                     a frame that was never meant for it. */
                  const steppedAway = photoUrls.length > 0 && activePhoto !== heroIndex;
                  const shownPhoto = photoUrls[activePhoto] ?? hero;

                  return (
                    <Link
                      key={row.id}
                      href={listingHref(row.id)}
                      className={`group relative block cursor-pointer border border-transparent bg-[var(--card-surface)] p-3 transition hover:bg-[var(--hover-wash)] ${
                        scan ? "md:p-4" : "md:p-7"
                      }`}
                    >
                      {/* Dial / image area — v3.30: on mobile the well is a
                          short 4:3 frame at full card width (the old fixed
                          140px height turned into a tall letterboxed shaft
                          once the 3/4-column grid shrank each card on a
                          phone).

                          v4.91 — desktop is SQUARE, not a 140px strip. A
                          watch photograph is portrait or square; contained in
                          a 341×140 well its height capped first and it
                          painted about 105px wide, marooned between ~118px of
                          empty well on either side. The photograph was not
                          small — the well was shallow, so the watch could
                          never be the subject of its own card.

                          Square suits the real mix of sources (3:4, 1:1, and
                          the occasional tall screenshot) without turning the
                          grid into columns of slabs. Mobile's 4:3 is left
                          exactly as ruled and device-passed.

                          The frame is the positioning context for image
                          badges, so they anchor to the photograph's frame —
                          never float over card padding. */}
                      <div
                        className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-[var(--image-well)] ${
                          scan ? "mb-3" : "mb-4 md:aspect-square"
                        }`}
                      >
                        {hero ? (
                          steppedAway && shownPhoto ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={cardImageSrc(shownPhoto, { mode: "fit", width: 720 })}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain p-1.5 md:p-0"
                            />
                          ) : galleryFrameStyle ? (
                            <>
                              {/* Seller-authored framing: the presentation
                                  editor's stage is 4:3, so this cover is the
                                  crop the seller approved — mobile only. */}
                              {/* "fit": the seller's frame is coordinates in
                                  the photograph's own proportions, so this
                                  derivative shrinks the bytes and changes
                                  nothing about the geometry. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={cardImageSrc(hero, { mode: "fit", width: 720 })}
                                alt=""
                                loading="lazy"
                                style={galleryFrameStyle}
                                className="h-full w-full md:hidden"
                              />
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={cardImageSrc(hero, { mode: "fit", width: 720 })}
                                alt=""
                                loading="lazy"
                                className="hidden h-full w-full object-contain md:block"
                              />
                            </>
                          ) : (
                            /* Unframed photograph: the derived presentation
                               thumbnail (empty source margins trimmed, watch
                               whole, safe margin retained —
                               lib/media/presentationThumb.ts).

                               Desktop used to take the untouched original
                               through a <picture> source, which is how this
                               341×140 well came to pull 1800×2400 bytes. The
                               card's largest painted box is far under the
                               derivative's width, so both breakpoints now
                               want the same file and the <picture> that once
                               split them has nothing left to split. */
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={presentationThumbSrc(hero)}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain p-1.5 md:p-0"
                            />
                          )
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[11px] tracking-[0.3px] text-[var(--muted)]">
                            No photo
                          </div>
                        )}

                        {row.in_hand_verified && (
                          <div
                            title="In Hand Verified"
                            className="absolute left-1.5 top-1.5 text-[var(--gold)] opacity-70"
                            aria-label="In Hand Verified"
                          >
                            🛡️
                          </div>
                        )}
                      </div>
                      {/* ── THE LOUPE, OFF THE PHOTOGRAPH ──────────────
                          The watchmaker's loupe is the established Quick Specs
                          trigger. It belongs on the card surface below/right
                          of the photograph, never as a generic magnifier over
                          the watch itself.

                          It sits on the card's own surface now, beneath the
                          image at the head of the copy: still plainly about
                          inspection, no longer on top of the thing being
                          inspected.

                          Same licensed asset as the Quick Specs heading,
                          carried by currentColor into charcoal. There is no
                          second loupe drawing anywhere in the product. The
                          mark reads 18px; the pressable area is 32px, because
                          a quiet mark still has to be easy to hit. */}
                      {hero && (!dealerScope || hasQuick) && (
                        <div className="-mt-2 mb-1 flex justify-end">
                          <button
                            type="button"
                            title="Quick Specs"
                            aria-label={
                              dealerScope
                                ? `Quick Specs — ${title}`
                                : `Open Quick Specs for ${row.brand}${row.model ? ` ${row.model}` : ""}`
                            }
                            aria-expanded={dealerScope ? isQuickOpen : undefined}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (dealerScope) {
                                setOpenQuickId((prev) => (prev === row.id ? null : row.id));
                              } else {
                                openInspection(row.id, e.currentTarget);
                              }
                            }}
                            className={`flex h-8 w-8 items-center justify-center transition hover:text-[var(--gold)] hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] ${
                              dealerScope && isQuickOpen
                                ? "text-[var(--gold)] opacity-100"
                                : "text-[var(--platinum)] opacity-65"
                            }`}
                          >
                            <LoupeIcon size={18} />
                          </button>
                        </div>
                      )}
                      {/* Quick Specs panel — floats over the photograph, a
                          sibling of the frame so the frame's overflow-hidden
                          can never clip it. Interactions inside stay inside:
                          nothing here follows the card link. */}
                      {isQuickOpen && (
                        <div
                          role="group"
                          aria-label={`Quick specs for ${title}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          className="absolute left-4 top-4 z-40 w-[230px] max-w-[calc(100%-32px)] border border-[var(--panel-line)] bg-[var(--ink-deep)] p-4 shadow-[0_16px_40px_var(--panel-shadow-color)]"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-display text-[13px] font-light text-[var(--platinum)]">
                              Quick Specs
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenQuickId(null);
                              }}
                              aria-label="Close quick specs"
                              className="text-[11px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--slate)]"
                            >
                              Close
                            </button>
                          </div>
                          {quickRows.map((s) => (
                            <div
                              key={s.label}
                              className="flex items-baseline justify-between gap-3 border-t border-[var(--border-faint)] py-1 text-[11px] tracking-[0.3px]"
                            >
                              <span className="shrink-0 text-[var(--muted)]">{s.label}</span>
                              <span className="text-right text-[var(--slate)]">{s.value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Brand, and the platform's own name for this
                          listing. The code rides the maker line rather than
                          taking a line of its own: a collector scanning a
                          grid is reading for the watch, and the identifier
                          only has to be there when they decide to quote it.
                          Tone carries the distinction — maker gold, code
                          platinum. */}
                      <div className="mb-[5px] text-[11px] uppercase tracking-[1.6px] text-[var(--gold-subtle)]">
                        {row.brand}
                        <FwtListingId code={row.public_code} />
                      </div>

                      {/* Model */}
                      <div
                        className={`mb-1 font-display font-light leading-[1.25] text-[var(--platinum)] ${
                          scan ? "text-[13px]" : "text-[15px]"
                        }`}
                      >
                        {row.model ?? row.brand}
                      </div>

                      {/* Reference / meta — THE SCANNING LINE. A collector
                          reads down a grid looking for "Champagne" or
                          "Stainless Steel" to decide whether to stop, so this
                          is the text doing the most work per pixel on the
                          card, and it was 10px in the palette's second-dimmest
                          tone. 13px in --slate, with room to breathe when it
                          wraps. Still plainly secondary: the model is 15px
                          display in --platinum and the price 17px above it. */}
                      {/* Gated on the COMPOSED line, not on `meta` alone. The
                          old gate hid the whole run whenever condition and
                          year were both absent — which would have quietly
                          swallowed a diameter that was present and known.
                          No listing published today is in that state; the
                          card should not depend on that staying true. */}
                      {[meta, attrs, docInline].filter(Boolean).length > 0 && (
                        <div
                          className={`leading-[1.5] tracking-[0.2px] text-[var(--slate)] ${
                            scan ? "mb-2 text-[11px]" : "mb-3 text-[13px]"
                          }`}
                        >
                          {[meta, attrs, docInline].filter(Boolean).join(" · ")}
                        </div>
                      )}

                      {/* Price */}
                      <div
                        className={`font-display font-light text-[var(--platinum-dim)] ${
                          scan ? "text-[14px]" : "text-[17px]"
                        }`}
                      >
                        {formatPrice(row.asking_price, row.asking_currency)}
                      </div>

                      {/* HOVER ENRICHMENT — Phase 2: slot ready, data pending */}
                      {/* <div className="fw-hover-enrichment"> ... </div> */}
                    </Link>
                  );
                }

                // v1.62 — Collector View research row. Three zones:
                //   • photo (left)  — links to detail
                //   • identity + capped spec plate + Snapshot trigger (middle)
                //   • price + Compare + Add to Catalogue (right)
                // The row is no longer a single wrapping <Link>: it now holds
                // interactive controls (checkbox, buttons) that must NOT
                // navigate, so ONLY the photo and identity header link to the
                // detail page. Spec fields and normalizers (sizeLabel,
                // beatRateLabel, powerReserveLabel, thicknessLabel) and the
                // "no missing-data placeholder" law are unchanged from v1.58.
                const snapshotRows = buildSnapshot(row.details);
                const hasSnapshot = snapshotRows.length > 0;
                const isSnapshotOpen = openSnapshotId === row.id;
                const isCompared = compareSelected.has(row.id);
                /* The snapshot floats over whatever follows the row. The last
                   row has no row following it -- what is down there is the
                   footer, so the panel opens UPWARD from that one. */
                const isLastRow = paginated[paginated.length - 1]?.id === row.id;

                return (
                  <div
                    key={row.id}
                    // Perimeter whisper preserved from v1.61 (inset only, sharp
                    // corners, no drop-shadow). The row is raised above its
                    // siblings ONLY while its snapshot is open, so the absolute
                    // overlay is never clipped by the row beneath it.
                    className={`group relative grid grid-cols-[120px_minmax(0,1fr)] gap-4 p-5 shadow-[inset_0_0_0_1px_var(--row-perimeter-color)] transition md:flex ${
                      isSnapshotOpen ? "z-30" : "z-0"
                    }`}
                  >
                    {/* Photo (left) — links to detail. v1.63: enlarged to a
                        portrait frame (was 84×84) to match the approved concept
                        — the watch photo now carries real presence beside the
                        spec plate. Responsive so it doesn't crowd phone widths.
                        object-cover fills the frame edge-to-edge (was contain);
                        revert to object-contain if any hero crops awkwardly. */}
                    <Link
                      href={listingHref(row.id)}
                      className="relative row-span-2 flex h-[150px] w-[120px] shrink-0 items-center justify-center overflow-hidden bg-[var(--image-well)] transition hover:opacity-90 md:h-[190px] md:w-[150px]"
                    >
                      {hero ? (
                        // "fit": heroStyle is a rotation cover-scale sized
                        // against the photograph's own proportions.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cardImageSrc(hero, { mode: "fit" })}
                          alt=""
                          loading="lazy"
                          style={heroStyle}
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="text-center text-[11px] leading-tight tracking-[0.3px] text-[var(--muted)]">
                          No photo
                        </div>
                      )}
                    </Link>

                    {/* Middle — identity (links to detail), capped spec plate,
                        Snapshot trigger.

                        v4.2 — identity and the spec plate now share ONE
                        width-capped column, and the price rides the model line
                        inside it. That is what un-strands the price: the cap is
                        the plate's own width, so the price's right edge lands
                        exactly on the spec-value edge every value already
                        right-aligns to, on every row. The anchor is the plate,
                        not a measured offset — a listing that renders six or
                        seven specs cannot drift it, because the plate width
                        does not vary with spec count. */}
                    <div className="min-w-0 flex-1">
                      <div style={{ maxWidth: 420 }}>
                        <Link href={listingHref(row.id)} className="block">
                          <div className="mb-[3px] text-[11px] uppercase tracking-[1.6px] text-[var(--gold-subtle)]">
                            {row.brand}
                            <FwtListingId code={row.public_code} />
                          </div>
                          <div className="mb-[2px] flex items-center gap-2">
                            <span className="min-w-0 truncate font-display text-[14px] font-light leading-[1.25] text-[var(--platinum)]">
                              {row.model ?? row.brand}
                            </span>
                            {row.in_hand_verified && (
                              <span
                                title="In Hand Verified"
                                aria-label="In Hand Verified"
                                className="shrink-0 text-[var(--gold)] opacity-70"
                              >
                                🛡️
                              </span>
                            )}
                            {/* Price, desktop. ml-auto keeps the shield beside
                                the name and sends only the price to the edge.
                                Below md it stays in the action rail exactly
                                where it has always been — at that width the
                                420 cap is inert and the two positions are the
                                same pixel column anyway, so the phone layout is
                                deliberately left untouched. */}
                            <span className="ml-auto hidden shrink-0 pl-3 font-display text-[16px] font-light text-[var(--platinum-dim)] md:inline">
                              {formatPrice(row.asking_price, row.asking_currency)}
                            </span>
                          </div>
                          <div className="mb-2 truncate text-[11px] tracking-[0.3px] text-[var(--muted)]">
                            {row.reference}
                          </div>
                        </Link>

                        {/* Spec plate — each label↔value pair stays close and
                            never stretches across the row (brief §1). v1.63:
                            the utility cap (max-w-[380px]) was ignored in the
                            live build, so the width is pinned with an inline
                            style, which the browser honors unconditionally.
                            v4.2 moved that pin up one level to the shared
                            column above. Fields/normalizers unchanged. */}
                        <SpecRow label="Case Size" value={sizeLabel(row.details?.caseSizeMm) || null} />
                        <SpecRow label="Movement" value={row.details?.movementType ?? null} />
                        <SpecRow label="Beat Rate" value={beatRateLabel(row.details?.movementFrequency) || null} />
                        <SpecRow label="Power Reserve" value={powerReserveLabel(row.details?.powerReserve) || null} />
                        <SpecRow label="Thickness" value={thicknessLabel(row.details?.caseThicknessMm) || null} />
                        <SpecRow label="Case Material" value={row.details?.caseMaterial ?? null} />
                        <SpecRow label="Documentation" value={docBadge} />
                      </div>

                      {/* Snapshot trigger — shown only when there is deeper
                          data to reveal. Never navigates. */}
                      {hasSnapshot && (
                        <button
                          type="button"
                          onClick={() => toggleSnapshot(row.id)}
                          aria-expanded={isSnapshotOpen}
                          className="mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-[1.6px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]"
                        >
                          <span className={`transition-transform ${isSnapshotOpen ? "rotate-180" : ""}`}>▼</span>
                          Collector Snapshot
                        </button>
                      )}
                    </div>

                    {/* Right — workflow actions, and the phone's price.

                        v4.2: at md+ the price has moved to the model line and
                        this copy is display:none — which also takes it out of
                        the flex flow, so `justify-between` would have pulled
                        the lone button block up to the top of the row. Hence
                        md:justify-end: Compare and Add to Catalogue stay at the
                        bottom edge where they have always sat. Only ONE of the
                        two price nodes is ever rendered, so the figure is
                        announced once, never twice. */}
                    <div className="col-start-2 flex w-full flex-col items-end justify-between gap-4 md:w-[190px] md:shrink-0 md:justify-end">
                      <div className="font-display text-[16px] font-light text-[var(--platinum-dim)] md:hidden">
                        {formatPrice(row.asking_price, row.asking_currency)}
                      </div>

                      <div className="w-full">
                        {/* Compare — selection only this phase. Never navigates. */}
                        <button
                          type="button"
                          onClick={() => toggleCompare(row.id)}
                          aria-pressed={isCompared}
                          className={`flex w-full items-center gap-2 border px-[10px] py-[7px] text-[11px] uppercase tracking-[1.5px] transition ${
                            isCompared
                              ? "border-[var(--border-gold)] text-[var(--gold)]"
                              : "border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--slate)]"
                          }`}
                        >
                          <span
                            className={`flex h-[13px] w-[13px] shrink-0 items-center justify-center border-[1.5px] ${
                              isCompared
                                ? "border-[var(--border-gold)] bg-[var(--gold-whisper)]"
                                : "border-[var(--slate)] bg-[var(--control-wash)]"
                            }`}
                          >
                            {isCompared && <span className="h-[5px] w-[5px] bg-[var(--gold-fill)] opacity-100" />}
                          </span>
                          Compare
                        </button>

                        {/* Add to Catalogue — v2.5c: WIRED to the real
                            saved_watches table. Shows a confirmed state
                            once saved this session; re-click is a no-op
                            (handleAddToCatalogue short-circuits on savedIds).

                            The plus is sized and nudged, not restyled: at the
                            inherited 11px/300 it read as a faint tick rather
                            than an invitation. 13.5px is that raised ~23%,
                            weight 400 is one step off the button's own 300 —
                            enough to be immediately legible, not enough to
                            make a quiet outlined control loud.

                            leading-none is load-bearing: without it the
                            larger glyph's line box would exceed the label's
                            16.5px and grow the button. Capped at 13.5px the
                            span's box stays 13.5px, so the label still sets
                            the height and the button's geometry is untouched.

                            The 0.5px lift is measured, not eyeballed: this
                            glyph's ink centre sits 0.4px below its box centre
                            while a cap-height label sits 0.1px above, so
                            centring the BOXES leaves the plus optically low.
                            Transform, so it moves the ink without moving the
                            layout — and it applies because a flex item is
                            blockified (it would be inert on a bare inline).

                            The gap moves 4px to 6px — one step on the spacing
                            scale, and the smallest one available. It buys less
                            than the numbers suggest: this glyph is fullwidth,
                            so it carries 3.3px of its own side bearing, and the
                            button's 1.5px tracking lands after it too. The real
                            ink-to-ink distance was therefore already 8.7px and
                            becomes 10.7px — grown about 23%, the same
                            proportion the glyph itself grew. Two steps would
                            reach 12.7px against a 7.5px cap height, at which
                            point the mark stops reading as attached to its
                            label and starts reading as two separate things. */}
                        <button
                          type="button"
                          onClick={() => handleAddToCatalogue(row.id)}
                          disabled={savedIds.has(row.id)}
                          className={`mt-[10px] flex w-full items-center gap-1.5 border px-[10px] py-[7px] text-[11px] uppercase tracking-[1.5px] transition ${
                            savedIds.has(row.id)
                              ? "cursor-default border-[var(--border-gold)] text-[var(--gold)]"
                              : "border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--slate)]"
                          }`}
                        >
                          {savedIds.has(row.id) ? (
                            <>
                              <span>✓</span> Saved
                            </>
                          ) : (
                            <>
                              <span className="-translate-y-[0.5px] text-[13.5px] font-normal leading-none text-[var(--gold-subtle)]">＋</span> Add to Catalogue
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collector Snapshot overlay — absolute, anchored to this
                        row. Absolute positioning means it does NOT push the
                        following listings down (brief §2/§5: Browse stays
                        stable). One-open-at-a-time is guaranteed by the single
                        openSnapshotId. Content is generated only from fields
                        that exist on THIS listing (buildSnapshot). NOTE: the
                        panel's border/shadow here are the minimum needed to
                        read as a floating surface over the row beneath — any
                        aesthetic refinement of this treatment is deferred to
                        the Design Gate, per the brief's out-of-scope list. */}
                    {/* ── DISMISSAL CATCHER ──────────────────────────────
                        A transparent layer between the row and the panel, so
                        an outside click is SWALLOWED by construction.

                        This is deliberately NOT the document-mousedown-plus-
                        ref pattern the card inspector uses for its own
                        dismissal. That inspector floats over cards; this panel
                        hangs off a row whose photograph IS a link to the
                        listing. A document listener would let the same click
                        both close the snapshot and navigate away -- dismissing
                        and leaving would be one gesture, which is exactly the
                        defect the inspection bubble already solved this way.
                        The link never receives the click, rather than
                        receiving it and being asked politely not to act.

                        It paints nothing. The results stay fully visible and
                        legible behind it; this is a catcher, not a scrim.

                        z-30 sits under the panel's z-40 inside this row, and
                        the row itself is already raised to z-30 among its
                        siblings while open -- so the catcher covers the rows
                        beneath and the panel still takes its own clicks.
                        Clicks inside the panel never reach here at all. ── */}
                    {isSnapshotOpen && (
                      <div
                        className="fixed inset-0 z-30"
                        aria-hidden="true"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenSnapshotId(null);
                        }}
                      />
                    )}

                    {isSnapshotOpen && (
                      /* WHICH WAY IT OPENS.

                         Downward everywhere except the last row, where there
                         is nothing below to float over. Anchored down there,
                         the panel landed ON the footer -- measured at 151px
                         past the footer's top edge, and its own bottom edge
                         within a pixel of the end of the document, so the
                         final rows of specification could not be scrolled to
                         at all. It was unreachable, not merely untidy.

                         Anchoring the BOTTOM to the row instead makes footer
                         overlap impossible by construction rather than tuned
                         away: the panel now grows away from the footer, so no
                         reserved gap, no measured height and no magic number
                         can go stale as the panel's content changes. The one
                         thing it costs is that a last-row panel covers the row
                         ABOVE it, which is the same bargain every other row
                         already makes with the row below.

                         Still absolute, so nothing moves and Browse stays
                         stable. The shadow flips with it, because a panel that
                         rises must not cast its shadow onto the thing it rose
                         from. */
                      <div
                        className={`absolute left-[100px] right-4 z-40 border border-[var(--panel-line)] bg-[var(--ink-deep)] p-5 ${
                          isLastRow
                            ? "bottom-[calc(100%-14px)] shadow-[0_-16px_40px_var(--panel-shadow-color)]"
                            : "top-[calc(100%-14px)] shadow-[0_16px_40px_var(--panel-shadow-color)]"
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-[1.6px] text-[var(--gold-subtle)]">
                            Collector Snapshot · {row.model ?? row.brand}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSnapshot(row.id)}
                            aria-label="Close snapshot"
                            className="text-[11px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--slate)]"
                          >
                            Close
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
                          {snapshotRows.map((s) => (
                            <div
                              key={s.label}
                              className="flex items-baseline justify-between gap-3 border-b border-[var(--border-faint)] py-1 text-[11px] tracking-[0.3px]"
                            >
                              <span className="shrink-0 text-[var(--muted)]">{s.label}</span>
                              <span className="text-right text-[var(--slate)]">{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── THE INSPECTION BUBBLE ───────────────────────────────────
                Floats above a grid that does not move. Anchored to the card
                that opened it, sized to two cards where there is room, and
                pulled back inside the region when that card sits at the
                right edge.

                Absolute within the region — not fixed, not a portal, not a
                full-viewport scrim. The collector's place in the results is
                still visible above, below and beside it, which is the peek
                law intact; what changed is that the results no longer
                rearrange themselves underneath the pointer when it closes. */}
            {(() => {
              if (viewMode === "collector" || !inspectingId || !inspectAnchor) return null;
              const row = paginated.find((r) => r.id === inspectingId);
              if (!row) return null;
              const { urls, heroIndex } = cardPhotos(row);
              const index = Math.min(
                Math.max(cardPhotoIndex[row.id] ?? heroIndex, 0),
                Math.max(urls.length - 1, 0)
              );
              return (
                <>
                {/* ── DISMISSAL CATCHER ───────────────────────────────────
                    Every card is a link, so with the inspection open there
                    was no neutral pixel anywhere: a click meant to put the
                    peek down landed on whatever card sat underneath and
                    opened that listing instead. Dismissing and navigating
                    were the same gesture.

                    This transparent layer sits between the grid and the
                    panel, so an outside click is SWALLOWED by construction —
                    the card's link never receives it, rather than receiving
                    it and being asked politely not to act. It paints
                    nothing: the peek law's "no full-viewport scrim" is about
                    dimming the results, and the results stay fully visible
                    and fully legible behind it. Escape already closed the
                    panel and still does.

                    The listing opens only from a deliberate activation after
                    the peek is down — never from the same click that put it
                    down. */}
                <div
                  className="fixed inset-0 z-30"
                  aria-hidden="true"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setInspectingId(null);
                    setInspectAnchor(null);
                  }}
                />
                <div
                  className="absolute z-40"
                  style={{
                    top: inspectAnchor.top,
                    left: inspectAnchor.left,
                    width: inspectAnchor.width,
                  }}
                >
                  <BrowseCardInspector
                    brand={row.brand}
                    title={row.model ?? row.brand}
                    meta={[row.condition, row.year].filter(Boolean).join(" · ") || null}
                    priceText={formatPrice(row.asking_price, row.asking_currency)}
                    photos={urls}
                    photoIndex={index}
                    onPhotoIndex={(i) =>
                      setCardPhotoIndex((prev) => ({ ...prev, [row.id]: i }))
                    }
                    /* Resolved against the value's own current state, so a
                       press cannot be computed from a stale render and
                       silently lost when two land in one batch. Wrapping is
                       unchanged — the ends of the gallery behave exactly as
                       they did. */
                    onPhotoStep={(delta) =>
                      setCardPhotoIndex((prev) => {
                        const n = urls.length;
                        if (n < 2) return prev;
                        const current = Math.min(
                          Math.max(prev[row.id] ?? heroIndex, 0),
                          n - 1
                        );
                        return { ...prev, [row.id]: (current + delta + n) % n };
                      })
                    }
                    specs={quickSpecs(row)}
                    href={listingHref(row.id)}
                    onClose={() => {
                      setInspectingId(null);
                      setInspectAnchor(null);
                    }}
                  />
                </div>
                </>
              );
            })()}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Mobile filter overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--ink)]/95 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[80%] overflow-auto border-r border-[var(--border-faint)] bg-[var(--ink)] py-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between px-[18px]">
              <span className="text-[11px] uppercase tracking-[2px] text-[var(--gold-dim)]">
                Refine
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="fw-btn-secondary"
              >
                Close
              </button>
            </div>
            {facetList}
          </div>
        </div>
      )}
    </div>
  );
}
