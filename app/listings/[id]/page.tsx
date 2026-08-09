import { Fragment } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ListingGallery from "@/components/ListingGallery";
import ListingSpecs from "@/components/ListingSpecs";
import WatchBlueprint from "@/components/WatchBlueprint";
import ListingCorrespondence from "@/components/ListingCorrespondence";
import CollectorsDrawer from "@/components/CollectorsDrawer";
import MobileCollectorsDrawer from "@/components/MobileCollectorsDrawer";
import ListingActionRail from "@/components/ListingActionRail";
import { buildCollectorFingerprint } from "@/lib/collectorFingerprint";
import { resolveHeroIndex, sanitizePhotoPresentation } from "@/lib/photoPresentation";
import { publiclyDisplayablePhotos } from "@/lib/servicePhotoPrivacy";
import { formatMoney } from "@/lib/formatMoney";

/* ────────────────────────────────────────────────────────────────────────
   PUBLIC LISTING DETAIL — /listings/[id]  (v2.4b)

   Buyer-facing detail view for a single published listing. Server Component:
   fetches the row by UUID from `listings`, 404s if missing or not published.

   PRIVACY: scoring fields (significance_score, score_state, combined_score,
   etc.) are NEVER rendered here — they are seller-only. Only buyer-safe
   fields below reach the markup.

   Six-section layout (top → bottom):
     1. Media gallery (hero w/ brand·model overlay + thumbnail strip)
     2. Identity block — brand+model, Ref., Box & Papers sentence, Collector
        Fingerprint (unboxed quick-read lines — Design Gate v2)
     3. Collector Snapshot — prominent two-column spec grid
     4. Technical Specifications — remaining specs, never duplicating §3
     5. From the Seller — full description, mb-8 reserve for the message stream
     6. Price, then (buyer-only) Start Purchase Request / pending-status badge
        ← these are now the last in-flow elements
   The message bar is position:fixed (viewport-pinned), so it is NOT part of
   the scrolling content flow.

   v1.58: DIAL REVEAL WIRED. dialPhotoUrl was already computed below (§ dial
   photo derivation) but never reached ListingGallery — the ONLY gap was a
   missing dialUrl prop at the call site. ListingGallery already had the
   (dialUrl && heroUrl === dialUrl) conditional ready to consume it. No
   changes to ListingGallery.tsx or DialReveal.tsx themselves were needed or
   made. Standing policy compliance note: this closes a previously-stalled
   Phase 2 item where the component existed but was never actually connected.

   v2.4a: added an owner-aware "Start Purchase Request" action directly below
   Price, hidden when the viewer is the listing's own seller, plus a
   buyer-facing badge when the viewer already has a pending request on this
   listing. This supersedes the prior "Price is the absolute last in-flow
   element" invariant from v1.57 — flagged as a deliberate change, not a
   silent drift, since that line was a documented architectural invariant.

   v2.4b: added a dedicated `superseded` branch to the buyer action block.
   Previously only declined/pending/accepted had explicit cases and every
   other status (superseded, expired, cancelled) fell through to the
   "Start Purchase Request" CTA — inviting a buyer to submit a fresh request
   on a watch that has already sold to another buyer. `superseded` now renders
   an explanatory, non-judgmental message ("Another purchase request for this
   watch was accepted." / "This watch is no longer available.") and suppresses
   the CTA entirely, since resubmission would contradict the state of the
   listing. Surgical: no other listing-page logic touched.

   v1.57: Studio design-system token migration. No logic, data, scoring,
   privacy, or photo-sort changes — className/layout only.

   v2.5 — "← Browse" with filters preserved. A buyer who filtered Browse
   (facets, view mode, grid width, page size) previously lost all of it the
   moment they opened a listing — there was no way back to that exact state.
   This adds a minimal, standalone `← Browse` link near the top of the page,
   independent of the future Collector's Drawer (Ducky 3's, separately owned
   — this does NOT authorize any of that work). Reads `returnTo` from the
   query string, TREATED AS UNTRUSTED INPUT: it must be validated as an
   internal `/browse` path before use, exactly the same open-redirect
   discipline already named for the parked Session Expiry `next` param.
   Anything absent, malformed, or pointing off-site falls back to plain
   `/browse`. Built to be trivially removable/relocatable once the real
   Collector's Drawer exists — this is not architected as a permanent
   fixture of it.

   v2.5a — LEGIBILITY FIX. Real-render check (wkhtmltoimage, real Inter
   font-weight 300, real globals.css tokens, real #0D0F14 background — not
   just contrast math) found the resting-state gold-subtle color, once
   composited over --ink, renders at ~2.58:1 contrast — well under the 4.5:1
   WCAG AA floor for text. This affected BOTH "← Browse" (new) and the
   pre-existing "Sold by {sellerName} →" link below, which shares the
   identical class and was already live with the same problem. Both now use
   --muted at rest (~5.35:1, verified by re-render), keeping the intended
   quiet/recessive feel — --muted is deliberately not louder than needed —
   while actually being readable. Hover state is unchanged (full --gold is
   already high-contrast). A third occurrence of the same class
   ("← Back to listing" in PurchaseRequestForm.tsx) has the same issue but is
   a different file, outside this flight's scope — flagged, not fixed here.
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = {
  // See BrowseClient: pathname is the stable identity a hero choice points at.
  photo: { url: string; pathname?: string };
  category: string;
  isWristShot?: boolean;
};

type ListingDetails = {
  movementType?: string;
  caseSizeMm?: string;
  caseThicknessMm?: string;
  caseMaterial?: string;
  dialColorType?: string;
  complications?: string[];
  closureType?: string;
  documentation: string;
  bezelMaterial?: string;
  waterResistance?: string;
  calibre?: string;
  jewels?: string;
  powerReserve?: string;
  casebackType?: string;
  crystalMaterial?: string;
};

type Listing = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  year: string;
  condition: string;
  asking_price: number;
  // Money Truth Stage B — flows through select("*"); null until attested.
  asking_currency: string | null;
  photos: ListingPhoto[];
  // Seller hero framing (v3.7) — flows through select("*"); null on every row
  // written before it existed, which sanitizes to automatic framing.
  photo_presentation?: unknown;
  details: ListingDetails;
  description: string;
  created_at: string;
  status: string;
  in_hand_verified?: boolean;
  verified_at?: string | null;
  seller_id: string;
};

// Buyer-facing photo display order by category; anything unlisted sorts last.
const PHOTO_ORDER = [
  "Dial",
  "Caseback",
  "Non-Crown Side",
  "Crown Side",
  "Movement (closeup)",
  "Full watch, strap/bracelet extended",
  "Clasp/Pin Buckle",
  "Box",
  "Papers/Warranty",
  "Wrist shot",
  "Other",
];

/* Manufacturer reference, rendered whole with a break opportunity after each
   REAL hyphen. <wbr /> contributes no text, so the value a collector copies —
   and the value a screen reader speaks — is byte-identical to the stored
   reference. Deliberately not character-level breaking: a reference must never
   fragment at an arbitrary position, and never dangerouslySetInnerHTML. */
function ReferenceValue({ value }: { value: string }) {
  const segments = value.split(/(?<=-)/);
  return (
    <>
      {segments.map((segment, i) => (
        <Fragment key={i}>
          {segment}
          {i < segments.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  );
}

// returnTo is read from a request-controlled query string — untrusted input —
// and must be validated as a genuine internal FairWatchTrade path before ever
// being used as a link/redirect target. Requires an EXACT match on "/browse",
// or "/browse?..." (query string), or "/browse/..." (a future sub-path) —
// NOT a bare prefix match. startsWith("/browse") alone would also accept
// "/browse-archive" or "/browsely", i.e. any future route merely sharing that
// letter sequence, not genuinely "/browse" itself. No such route exists
// today, but a validator shouldn't rely on that staying true. Also rejects
// embedded control characters defensively. Anything that fails falls back to
// plain "/browse" — never thrown, never rendered raw.
/* v2.11 — "Around This Watch" target for the Collector's Drawer.

   AUDITED against the live Browse implementation before being built. Browse
   matches these four facets on the RAW stored value:
       brand        -> l.brand
       movement     -> l.details.movementType
       caseMaterial -> l.details.caseMaterial
       dialColor    -> l.details.dialColorType
   so a link built from those lands on real results, exactly.

   Deliberately EXCLUDED, and this is the whole point of the audit:
     · caseSize / beatRate / powerReserve are matched through Browse's own
       normalizers (sizeLabel / beatRateLabel / powerReserveLabel — stored
       values are heterogeneous, e.g. "28800" | "28,800 vph" | "4 Hz").
       Reimplementing those here would be a SECOND normalizer that silently
       drifts the moment Browse's changes — the link would still look alive
       while matching nothing.
     · `reference` is not a Browse facet at all. There is no such param.

   Repeated params, never comma-joined — the same convention the Browse
   filters already use, and required because facet values legitimately
   contain commas.

   Returns null when the listing has none of the four, so the Drawer omits
   the item rather than offering a link to an unfiltered browse. */
function buildSimilarHref(
  brand: string,
  details: { movementType?: string; caseMaterial?: string; dialColorType?: string }
): string | null {
  const params = new URLSearchParams();
  if (brand?.trim()) params.append("brand", brand);
  if (details.movementType?.trim()) params.append("movement", details.movementType);
  if (details.caseMaterial?.trim()) params.append("caseMaterial", details.caseMaterial);
  if (details.dialColorType?.trim()) params.append("dialColor", details.dialColorType);
  const qs = params.toString();
  return qs ? `/browse?${qs}` : null;
}

function safeBrowseReturn(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "/browse";
  const isBrowsePath =
    value === "/browse" || value.startsWith("/browse?") || value.startsWith("/browse/");
  if (!isBrowsePath) return "/browse";
  if (/[\r\n\t]/.test(value)) return "/browse";
  return value;
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  const browseHref = safeBrowseReturn(returnTo);

  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .single();

  // v2.27 — a 'reserved' listing (an offer was accepted; the watch is off the
  // competitive market, settlement not yet represented) must NOT 404 for an
  // authorized viewer. RLS already restricts a reserved row to the seller and
  // the accepted buyer (published stays public), so an unauthorized viewer
  // still receives no row here and correctly falls through to notFound().
  if (error || !data || (data.status !== "published" && data.status !== "reserved")) {
    notFound();
  }

  const listing = data as Listing;
  const details = (listing.details ?? {}) as ListingDetails;
  const similarHref = buildSimilarHref(listing.brand, details);

  // Seller display name — same profiles/display_name/id-join pattern already
  // confirmed working in app/sellers/[id]/page.tsx. Fails open to a generic
  // label rather than erroring if the profile row is missing.
  const { data: sellerProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", listing.seller_id)
    .single();

  const sellerName = sellerProfile?.display_name ?? "FairWatchTrade Seller";

  // Owner-aware button visibility — the seller shouldn't see their own
  // listing's "Start Purchase Request" action.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === listing.seller_id;

  // Buyer's own most recent request on this listing, if any — now that
  // created_at is confirmed, we can order and pick the latest regardless of
  // status (a buyer may have a declined request followed by a new one).
  const { data: myLatestRequest } = user
    ? await supabase
      .from("purchase_requests")
      .select("status")
      .eq("listing_id", listing.id)
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null };

  // Photos: keep only entries that actually carry a URL, so category-based
  // hero detection and the URL list stay index-aligned. Service Evidence is
  // private by default — shown only on the seller's deliberate opt-in
  // (lib/servicePhotoPrivacy, consolidation ruling 2026-08-06).
  const allPhotos = Array.isArray(listing.photos) ? listing.photos : [];
  const withUrls = publiclyDisplayablePhotos(allPhotos).filter((p) => p?.photo?.url);
  // Sort by category priority so the gallery receives URLs in display order;
  // a Dial photo lands at index 0 and becomes the hero. Stable sort keeps the
  // original order within a category. (Done here because category data lives
  // on the row, not on the URL-only gallery prop.)
  const photoRank = (c?: string) => {
    const i = PHOTO_ORDER.indexOf(c ?? "");
    return i === -1 ? PHOTO_ORDER.length : i;
  };
  const sorted = [...withUrls].sort((a, b) => photoRank(a?.category) - photoRank(b?.category));
  const photoUrls = sorted.map((p) => p.photo.url);
  const dialIdx = sorted.findIndex((p) => p?.category === "Dial");
  /* ── Seller hero framing ── the sort above is UNTOUCHED: photo roles still
     govern gallery order, exactly as the evidence law requires. The seller's
     choice moves only which photo opens first, and carries the focal framing
     for that one photo. A hero whose file is gone falls back to the automatic
     dial-first rule rather than showing nothing. */
  const presentation = sanitizePhotoPresentation(listing.photo_presentation);
  const automaticHeroIndex = dialIdx >= 0 ? dialIdx : 0;
  const heroIndex = resolveHeroIndex(
    sorted.map((p) => p?.photo?.pathname ?? null),
    presentation,
    automaticHeroIndex
  );
  const heroUrl = photoUrls[heroIndex] ?? photoUrls[0] ?? null;

  // Dial Reveal needs the dial photo specifically, independent of whichever
  // photo is currently the hero — in practice heroUrl usually IS the dial
  // photo, but this must not be assumed structurally. Now WIRED: passed to
  // ListingGallery as `dialUrl` below (v1.58) — this was computed all along,
  // it just never reached its consumer.
  const dialPhoto = sorted.find((p) => p?.category === "Dial");
  const dialPhotoUrl = dialPhoto?.photo.url ?? null;

  /* §2 IDENTITY — maker eyebrow, model heading, reference signature.
     `brand` and `model` are separate columns; the model value is normally the
     model alone. Some records carry the maker inside the model string, which
     would print the brand twice now that the eyebrow carries it — so the
     leading maker is dropped from the heading only when it is actually there.
     With no model at all the maker becomes the heading and the eyebrow is
     omitted, rather than leaving an eyebrow above a repeat of itself. */
  const maker = listing.brand?.trim() ?? "";
  const modelRaw = listing.model?.trim() ?? "";
  const model =
    modelRaw && maker && modelRaw.toLowerCase().startsWith(maker.toLowerCase())
      ? modelRaw.slice(maker.length).trim()
      : modelRaw;
  const headingText = model || maker;
  const showMaker = Boolean(model) && Boolean(maker);
  const reference = listing.reference?.trim() ?? "";

  /* Box and papers — stated, not certified. The predicate is the seller's own
     documentation value. "Full Set" is the only value that means both a box
     AND papers, so it is the only value this sentence can truthfully describe;
     "Papers Only" now renders nothing rather than claiming a box that is not
     there. No checkmark, no verification implication. */
  const includesBoxAndPapers = details.documentation === "Full Set";

  /* Null asking price renders honestly, never $0/$NaN (Buyer Price Truth,
     Bug 1). Money Truth Stage B: the shared formatter extends the same
     honesty to a missing CURRENCY — an amount without one is undisclosed,
     never dressed as dollars. en-US stays pinned inside formatMoney. */
  const priceText = formatMoney(listing.asking_price, listing.asking_currency);

  /* §2 — Collector Fingerprint (Design Gate v2). Built from the same live
     values the rest of the page uses, never a stored copy. Two conceptual
     lines — identity, then complications — each rendered only when it has
     facts. The v2 Gate supersedes LD1.7's chronograph fold: the movement
     reads plain, and Chronograph joins its sibling complications in the
     truthful stored order. Only facts that exist join a line, so separators
     can never lead, trail, or double up. */
  const fingerprint = buildCollectorFingerprint(
    {
      caseSizeMm: details.caseSizeMm,
      caseThicknessMm: details.caseThicknessMm,
      movementType: details.movementType,
      complications: details.complications,
    },
    listing.year,
  );
  const fingerprintLines = [fingerprint.primary, fingerprint.complications].filter(
    (line) => line.length > 0,
  );

  return (
    <main className="min-h-screen bg-[var(--ink)] pb-32 text-[var(--platinum)]">
      {/* v2.11 — RESPONSIVE COMPOSITION (locked ruling).
          Desktop (xl+): the approved two-column composition — 974px primary
          + 276px staggered rail, --space-6 gap, page-level Collector's Drawer
          owning Back to Browse. The container widens to 1438px (1274 content
          + 82px padding each side); the Drawer's collapsed tab lives at
          left:-50px INSIDE that padding, which is why the padding is not
          decorative and must not be reduced.
          Mobile/tablet (<xl): today's single column, untouched, keeping the
          standalone "Return to browse" link.
          NO viewport shows both navigation mechanisms.
          Breakpoint = xl (1280px), derived from the mockup rather than
          picked: the approved grid needs 1274px, and the study's own floor is
          min-width:1180px. Gating at 1280 means the two-column grid never
          renders narrower than the Gate ever approved (at 1280 the primary
          column still gets ~816px). iPad landscape (1024) reads as tablet;
          iPad Pro landscape (1366) reads as desktop. */}
      {/* v2.90 — WS3 staged container growth (Design Duck ruling, 2026-07-28).
          The old single jump (768 → 1438 at one pixel) forced the gallery,
          title, and thumbnails through a binary reflow the instant the rail
          mounted. The container now grows in deliberate single-column steps:
            <1024   max-w-3xl        → 704px content
            lg      max-w-[832px]    → 768px content
            ≥1152   max-w-[880px]    → 816px content
          816 is not arbitrary: at the xl threshold (1280 viewport, 82px
          padding, 276px rail, 24px gap) the primary column computes to
          EXACTLY 816px — so at the flip the gallery/title/thumbnails hold
          still while the rail enters width the box jump itself created; the
          primary then grows fluidly 816 → 974, reaching the approved
          974+276 geometry at ≥1438. A scrollbar-width oscillation now moves
          only the rail's presence, never the composition. */}
      {/* min-[72rem] (=1152px) deliberately in REM: Tailwind v4 sorts px-unit
          arbitrary variants BEFORE the rem breakpoints, so a min-[1152px]
          rule lands earlier in the sheet than lg (64rem) and loses the
          equal-specificity tie. Same unit family → correct order. */}
      <div className="relative mx-auto w-full max-w-3xl px-6 py-8 sm:px-8 lg:max-w-[832px] min-[72rem]:max-w-[880px] xl:max-w-[1438px] xl:px-[82px]">
        {/* v2.25 — the standalone "Return to browse" link is RETIRED wherever
            a Drawer exists (chain ruling: no dual Back-to-Browse controls).
            Desktop retired it at lg in v2.11/v2.17 in favour of the spine
            Drawer's row; the mobile Collector's Drawer now exists below lg
            and carries the same returnTo-preserved href in its Back to Browse
            row — the v2.11 law ("no viewport shows both navigation
            mechanisms") is satisfied by the Drawer alone everywhere. ONE
            degenerate exception, kept honest: a photo-less listing has no
            gallery for the mobile Drawer to anchor to, so below lg it renders
            this link instead — never both. */}
        {photoUrls.length === 0 && (
          <Link
            href={browseHref}
            className={[
              "mb-5 inline-flex items-center gap-1.5 min-[56rem]:hidden",
              "font-display text-[16px] font-light tracking-[0.3px]",
              "text-[var(--gold)] transition hover:opacity-80",
            ].join(" ")}
          >
            <span className="text-[13px] leading-none" aria-hidden="true">
              ←
            </span>
            <span>Return to browse</span>
          </Link>
        )}

        {/* WatchBlueprint — atmospheric background.
            completed="all": this watch has been fully documented. Nothing
            animates; it is simply present, behind the record of its life.
            pointer-events-none + aria-hidden: decoration only, never
            interferes with content and invisible to screen readers.
            opacity-[0.04] is the ghost state taken further — a collector might
            notice it subconsciously, never consciously. If it ever draws the
            eye, drop the opacity further. */}
        <div
          className="pointer-events-none absolute right-0 top-24 w-[280px] opacity-[0.04]"
          aria-hidden="true"
        >
          <WatchBlueprint completed="all" />
        </div>

        {/* ── OPENING — the approved two-column composition at xl; plain
               stacked flow below it. align-items:start so the rail's 112px
               stagger reads as intended rather than being stretched. ── */}
        {/* v2.14 — the opening grid now has TWO rows in column 1: the gallery
            row and the content row. This exists for exactly one reason: the
            Collector's Drawer is a LISTING feature, and its spine rail (below)
            inherits the gallery's height by occupying the gallery's grid row —
            pure CSS, no measurement, no gallery coupling. gap-y is explicitly
            zero so the split renders pixel-identically to the old single
            column (identity keeps its own top margin). */}
        {/* v2.17 moved the grid off `hidden xl:block` (a hard 1279↔1280
            existence threshold) down to lg, so the spine rail exists — and
            inherits the gallery row's height — across the desktop range. The
            approved TWO-COLUMN form still waits for xl, untouched.

            v2.93 lowers that handoff again, to min-[56rem] (896px), because lg
            was still too early: the same 1mm-of-mouse flip was reported one
            breakpoint down. Measured on production — the spine is
            `left-[-65px] w-[48px]`, so with the below-lg container
            (max-w-3xl = 768px) its left edge sits at
            (clientWidth − 768) / 2 − 33. It is flush at 834 and clears the
            viewport edge by ~23px at 896, matching the 17px it gets inside the
            xl gutter. Below that it crowds the edge.

            REM, not px: Tailwind v4 sorts px-unit arbitrary variants BEFORE the
            rem breakpoints (see the min-[72rem] note above — the v2.90a
            defect), so min-[896px] would land ahead of sm/md and lose the
            cascade tie. 56rem is the same 896px in the right sort position.

            All SEVEN sites move together — this grid, the rail, both cell
            placements, the standalone back-link, and the two mobile-drawer
            self-gates — or a band appears showing two navigation mechanisms at
            once. Below the handoff: the locked mobile ruling, as before. */}
        <div className="relative min-[56rem]:grid min-[56rem]:grid-cols-[minmax(0,1fr)] min-[56rem]:grid-rows-[auto_auto] min-[56rem]:items-start min-[56rem]:gap-y-0 xl:grid-cols-[minmax(0,974px)_276px] xl:gap-x-[var(--space-6)]">
          {/* ── SPINE RAIL (v2.14) — a zero-width grid item sharing the
                 gallery's cell (col 1, row 1) with self-stretch, so its height
                 IS the gallery's height by grid construction. The Drawer
                 anchors here: its geometry is owned by the LISTING layout —
                 the rail's left edge is the content edge, fixed at every xl
                 width regardless of how the gallery column resizes. The spine
                 itself sits at −65px, centered in the page's 82px gutter.
                 ListingGallery still has ZERO knowledge of the Drawer. */}
          <div className="relative hidden w-0 min-[56rem]:col-start-1 min-[56rem]:row-start-1 min-[56rem]:block min-[56rem]:justify-self-start min-[56rem]:self-stretch">
            <CollectorsDrawer
              listingId={listing.id}
              browseHref={browseHref}
              similarHref={similarHref}
            />
          </div>

          {/* GALLERY CELL — col 1, row 1. Its content defines the row height
              the spine rail inherits. v2.25: `relative`, because the mobile
              Collector's Drawer anchors here (inset-y-0) so its height IS the
              gallery's height — the same zero-knowledge law the desktop spine
              rail obeys; ListingGallery still knows nothing of any Drawer. */}
          <div className="relative min-[56rem]:col-start-1 min-[56rem]:row-start-1">
            {/* SECTION 1 — Media gallery */}
            {photoUrls.length > 0 && (
              <ListingGallery
                photos={photoUrls}
                initialIndex={heroIndex}
                /* Hero CHOICE only — see ListingGallery for why focal framing
                   is deliberately not applied to an uncropped hero. */
                brandLabel={listing.brand}
                modelLabel={listing.model}
                dialUrl={dialPhotoUrl} /* v2.19 — Dial Reveal RECONNECTED as
                    Discovery Mode. This is the exact one-line reversal of the
                    v2.18 founder disable: dialPhotoUrl has been computed
                    correctly all along (see § dial photo derivation above), it
                    simply wasn't reaching its consumer. ListingGallery's
                    (dialUrl && heroUrl === dialUrl) conditional is unchanged
                    and still the ONE source of truth for "is the hero the dial
                    photo" — no per-photo `dial` flag was added, because that
                    would be a second source of truth for a fact this prop
                    already carries. The feature is now worth having: the
                    retired hover-driven reveal was REPLACED inside
                    components/DialReveal.tsx (v2.19), not wrapped or
                    re-enabled. Touch devices still take the plain <img> path,
                    gated inside DialReveal pending a mobile Design Gate. */
              />
            )}

            {/* v2.25 — MOBILE/TABLET Collector's Drawer (approved artifact:
                side overlay + gold watch-hand pull, no spine). Mounts only
                below lg — the component self-gates with lg:hidden — while the
                desktop spine rail above stays byte-identical. Rendered only
                when the gallery exists: the overlay inherits this cell's
                height, and a photo-less listing has no gallery to anchor to. */}
            {photoUrls.length > 0 && (
              <MobileCollectorsDrawer
                listingId={listing.id}
                browseHref={browseHref}
                similarHref={similarHref}
              />
            )}
          </div>

          {/* CONTENT CELL — col 1, row 2: everything that followed the gallery
              in the old primary column, unchanged. */}
          <div className="min-[56rem]:col-start-1 min-[56rem]:row-start-2">

        {/* DIAL REVEAL — WIRED (v1.58). Was a Phase-2 placeholder ("Activation:
            when real data is present and DialReveal component exists").
            DialReveal.tsx now exists and is activated by the dialUrl prop
            passed to ListingGallery above. ListingGallery already contained
            the (dialUrl && heroUrl === dialUrl) conditional — the only gap
            was this prop never reaching it from here. No changes made to
            ListingGallery.tsx or DialReveal.tsx themselves; this was purely a
            missing-prop wiring gap, closed with one line.
            Behavior: on hover over the dial photo only, a thin contrast/
            brightness slider appears. No zoom, no magnifying glass — just the
            detail that was already there (MOP depth, guilloché pattern,
            printing on dark dials) hidden by the photographer's exposure
            balance. Correctly deactivates if the buyer navigates the hero to
            a non-dial photo, and reactivates if they click back to it, since
            heroUrl and dialUrl are both derived from the same category match. */}

        {/* SECTION 2 — Identity block. LD1.7: the watch is introduced as one
            composed identity — maker, model, reference signature, inclusion
            statement, collector shorthand — rather than as unrelated data
            components stacked in sequence. Nothing here is boxed. */}
        <section className="mt-6">
          {showMaker && (
            <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--muted)] sm:text-[12px]">
              {maker}
            </div>
          )}
          <h1 className="font-display text-[35px] font-light leading-[1.03] tracking-[-0.018em] text-[var(--platinum)] sm:text-[48px] sm:leading-[1.06]">
            {headingText}
          </h1>

          {/* Reference signature — the manufacturer reference is part of the
              watch's identity, not a database footnote under the title. The
              rule beneath it starts gold with meaning and fades into the
              graphite. Absent reference omits the whole signature cleanly. */}
          {reference && (
            <div className="mt-[22px] max-w-[760px] sm:mt-[27px]">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-[var(--gold)]">
                Reference
              </span>
              <span className="block font-display text-[15px] leading-[1.55] tracking-[0.065em] text-[var(--platinum-dim)] sm:inline sm:text-[18px] sm:leading-[1.45] sm:tracking-[0.085em]">
                <ReferenceValue value={reference} />
              </span>
              <div
                aria-hidden="true"
                className="mt-[9px] h-px bg-[linear-gradient(90deg,rgba(201,168,76,0.85),rgba(201,168,76,0.18)_38%,transparent_76%)]"
              />
            </div>
          )}
          {/* v2.11 — RELOCATED, not duplicated: on desktop this same link
              lives in the rail's Dealer Information card. Identical treatment,
              one home per viewport. */}
          <Link
            href={`/sellers/${listing.seller_id}`}
            className="mt-1 inline-block text-[11px] text-[var(--slate)] transition hover:text-[var(--gold)] xl:hidden"
          >
            Sold by {sellerName} →
          </Link>

          {/* Stated by the seller, not certified by the platform: a sentence,
              no chip, no checkmark. The outline mark is decoration only. */}
          {includesBoxAndPapers && (
            <div className="mt-[21px] flex items-center gap-[10px] sm:mt-[23px]">
              <svg
                width="16"
                height="17"
                viewBox="0 0 16 17"
                fill="none"
                aria-hidden="true"
                className="flex-none text-[var(--gold-dim)]"
              >
                <rect x="0.5" y="5.5" width="15" height="11" stroke="currentColor" />
                <path d="M3.5 5.5V1.5h9v4" stroke="currentColor" />
              </svg>
              <span className="font-display text-[16px] leading-[1.4] text-[var(--platinum-dim)] sm:text-[17px]">
                Includes box and papers
              </span>
            </div>
          )}

          {listing.in_hand_verified && (
            <div className="mt-3 flex items-start gap-3 border border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)] px-4 py-3">
              <span className="mt-[2px] text-[var(--gold)] opacity-80" aria-hidden="true">🛡️</span>
              <div>
                <div className="text-[10px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
                  In Hand Verified
                  {listing.verified_at && (
                    <span className="ml-2 text-[var(--ghost)]">
                      · {new Date(listing.verified_at).toLocaleDateString("en-US", {
                        month: "long", day: "numeric", year: "numeric"
                      })}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                  Photos captured live at time of listing.{" "}
                  <span className="text-[var(--ghost)]">
                    FairWatchTrade verifies possession, not authenticity.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Collector Fingerprint — unboxed quick read, Design Gate v2. Two
              conceptual lines (identity, then complications), each rendered
              only when it has facts. Every fact carries the same weight and
              colour; the gold separators do the composing. The facts are flex
              items; each gold separator is a pseudo-element sitting in the
              inter-fact gap, not a glyph in the text flow. On a wrapped line
              the leading fact's separator falls at negative-left, outside the
              box, and is clipped by overflow-hidden — so no rendered line can
              begin OR end with a separator. Missing facts never render, so
              there is never a stray separator. Static facts: semantic text —
              no roles, no handlers, no affordance. */}
          {fingerprintLines.length > 0 && (
            <div className="mt-[22px] border-t border-[var(--border-subtle)] pt-[18px] sm:mt-[28px] sm:pt-[22px]">
              {fingerprintLines.map((line, li) => (
                <div
                  key={li}
                  className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 overflow-hidden font-display text-[16px] leading-[1.7] text-[var(--platinum-dim)] sm:gap-x-7 sm:text-[18px] sm:leading-[1.55] ${
                    li > 0 ? "mt-1" : ""
                  }`}
                >
                  {line.map((fact, i) => (
                    <span key={fact} className="relative">
                      {i > 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 -left-2 flex items-center text-[12px] text-[var(--gold-dim)] sm:-left-[14px]"
                        >
                          ·
                        </span>
                      )}
                      {fact}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
          </div>
          {/* end CONTENT CELL */}

          {/* ── RIGHT RAIL — 276px, col 2 spanning both rows. The 112px
                 stagger and the -14px pull are the approved composition's,
                 unchanged. ── */}
          <aside className="hidden xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:mt-[112px] xl:grid xl:-translate-x-[14px] xl:gap-[14px] xl:self-start">
            <ListingActionRail
              variant="rail"
              listingId={listing.id}
              sellerId={listing.seller_id}
              sellerName={sellerName}
              priceText={priceText}
              isOwner={isOwner}
              requestStatus={myLatestRequest?.status ?? null}
              listingStatus={listing.status}
              askingPrice={listing.asking_price}
              askingCurrency={listing.asking_currency}
              canRequestInline={!!user}
            />
          </aside>
        </div>
        {/* end OPENING */}

        {/* ── LOWER FLOW — full-width sections beneath the opening. Capped at
               974px so they align with the primary column and never run under
               the rail. ── */}
        <div className="xl:max-w-[974px]">

        {/* SECTIONS 3 & 4 — Collector Snapshot + collapsible Technical Specs */}
        <ListingSpecs
          details={details}
          year={listing.year}
          condition={listing.condition}
        />

        {/* SECTION 5 — From the Seller */}
        {listing.description && (
          <section className="mt-8">
            <div className="border-t border-[var(--border-faint)] pt-6 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--gold-dim)]">
              From the Seller
            </div>
            <p className="mt-3 mb-8 whitespace-pre-line font-display text-[16px] font-light leading-[1.9] text-[var(--platinum-dim)]">
              {listing.description}
            </p>
          </section>
        )}

        {/* CORRESPONDENCE — v2.7, Surface 1 per the final ruling. The
            reserved Section 5 message-stream slot becomes the conversation's
            canonical home: history + composer, permanently attached to this
            listing. The component also owns the fixed bottom entry bar
            (replacing the disabled shell that previously sat at the end of
            this file). Renders nothing at all for the listing's own seller. */}
        <ListingCorrespondence
          listingId={listing.id}
          brand={listing.brand}
          model={listing.model}
          reference={listing.reference}
          priceText={priceText}
          heroUrl={heroUrl}
          authed={!!user}
          isOwner={isOwner}
          /* The offer action for the fixed bar. Composed here, from the same
             ListingActionRail that owns the desktop rail and the mobile
             in-flow block, so all three presentations share one state
             machine and cannot drift. ListingCorrespondence never learns
             what a purchase request is. */
          offerAction={
            <ListingActionRail
              variant="bar"
              listingId={listing.id}
              sellerId={listing.seller_id}
              sellerName={sellerName}
              priceText={priceText}
              isOwner={isOwner}
              requestStatus={myLatestRequest?.status ?? null}
              listingStatus={listing.status}
            />
          }
        />

        {/* v2.11 — MOBILE/TABLET price + purchase. Today's in-flow layout,
            preserved exactly per the responsive ruling. On desktop this is
            display:none and the rail's Purchase Request card carries the same
            logic — ONE implementation (ListingActionRail), two dressings, so
            the branches can never drift apart. Because `hidden` is
            display:none, only one variant is ever in the accessibility tree. */}
        {/* NARROW DESKTOP (lg → xl): the rail can no longer hold the form, so
            the request becomes one deliberate full-width section of this same
            page. The collector still never leaves the watch, and the desktop
            Collector's Drawer — which also runs at lg and above — stays
            exactly where it is. lg is not a convenience breakpoint: it is the
            page's own composition boundary, where the mobile Drawer regime
            ends and the desktop one begins. */}
        <div className="hidden lg:block xl:hidden">
          <ListingActionRail
            variant="inline"
            listingId={listing.id}
            sellerId={listing.seller_id}
            sellerName={sellerName}
            priceText={priceText}
            isOwner={isOwner}
            requestStatus={myLatestRequest?.status ?? null}
            listingStatus={listing.status}
            askingPrice={listing.asking_price}
            askingCurrency={listing.asking_currency}
            canRequestInline={!!user}
          />
        </div>

        {/* MOBILE (below lg): the dedicated /listings/[id]/purchase-request
            route, deliberately kept. No inline form and no second sheet that
            would compete with the mobile Collector's Drawer. Because `hidden`
            is display:none, exactly one of these is ever in the accessibility
            tree — the same one-logic-two-dressings rule the rail already
            follows. */}
        <div className="lg:hidden">
          <ListingActionRail
            variant="inline"
            listingId={listing.id}
            sellerId={listing.seller_id}
            sellerName={sellerName}
            priceText={priceText}
            isOwner={isOwner}
            requestStatus={myLatestRequest?.status ?? null}
            listingStatus={listing.status}
          />
        </div>
        </div>
        {/* end LOWER FLOW */}
      </div>

      {/* COLLECTOR'S DRAWER — BUILT (v2.11). The Phase-2 note that lived here
          described an OLDER, different spec (28px strip, hover-to-expand,
          "Explore", nine items). It was replaced rather than activated: the
          approved Design Gate composition is a 46px click-to-toggle tab with a
          360px smoked-glass overlay and three live items. The component now
          mounts up inside the opening grid as a sibling of ListingGallery —
          see the gallery wrapper above. Desktop only; the mobile bottom-sheet
          Drawer is its own later Design Gate flight. */}

      {/* MESSAGE BAR — v2.7: the disabled shell that lived here is retired.
          The live entry bar is rendered by <ListingCorrespondence /> above
          (fixed positioning makes render location irrelevant), wired per the
          final Surface 1 ruling. */}
    </main>
  );
}
