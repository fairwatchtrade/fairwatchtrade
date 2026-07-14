import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ListingGallery from "@/components/ListingGallery";
import ListingSpecs from "@/components/ListingSpecs";
import WatchBlueprint from "@/components/WatchBlueprint";
import ListingCorrespondence from "@/components/ListingCorrespondence";

/* ────────────────────────────────────────────────────────────────────────
   PUBLIC LISTING DETAIL — /listings/[id]  (v2.4b)

   Buyer-facing detail view for a single published listing. Server Component:
   fetches the row by UUID from `listings`, 404s if missing or not published.

   PRIVACY: scoring fields (significance_score, score_state, combined_score,
   etc.) are NEVER rendered here — they are seller-only. Only buyer-safe
   fields below reach the markup.

   Six-section layout (top → bottom):
     1. Media gallery (hero w/ brand·model overlay + thumbnail strip)
     2. Identity block — brand+model, Ref., Box & Papers badge, snapshot pills
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
  photo: { url: string };
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
  photos: ListingPhoto[];
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

  if (error || !data || data.status !== "published") {
    notFound();
  }

  const listing = data as Listing;
  const details = (listing.details ?? {}) as ListingDetails;

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
  // hero detection and the URL list stay index-aligned.
  const allPhotos = Array.isArray(listing.photos) ? listing.photos : [];
  const withUrls = allPhotos.filter((p) => p?.photo?.url);
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
  const heroIndex = dialIdx >= 0 ? dialIdx : 0;
  const heroUrl = photoUrls[heroIndex] ?? photoUrls[0] ?? null;

  // Dial Reveal needs the dial photo specifically, independent of whichever
  // photo is currently the hero — in practice heroUrl usually IS the dial
  // photo, but this must not be assumed structurally. Now WIRED: passed to
  // ListingGallery as `dialUrl` below (v1.58) — this was computed all along,
  // it just never reached its consumer.
  const dialPhoto = sorted.find((p) => p?.category === "Dial");
  const dialPhotoUrl = dialPhoto?.photo.url ?? null;

  // Header title.
  const title = listing.model ? `${listing.brand} ${listing.model}` : listing.brand;

  // Box & Papers badge — only Full Set or Papers Only.
  const showBoxPapers =
    details.documentation === "Full Set" || details.documentation === "Papers Only";

  const priceText = `$${Number(listing.asking_price).toLocaleString()}`;

  // §2 — Identity snapshot pills (raw values; each complication its own pill).
  const snapshotPills: string[] = [];
  if (details.caseSizeMm) snapshotPills.push(`${details.caseSizeMm} mm`);
  if (details.caseThicknessMm) snapshotPills.push(`${details.caseThicknessMm} mm thick`);
  if (details.movementType) snapshotPills.push(details.movementType);
  if (listing.year) snapshotPills.push(listing.year);
  if (Array.isArray(details.complications)) {
    for (const c of details.complications) {
      if (c && String(c).trim() !== "") snapshotPills.push(String(c));
    }
  }

  return (
    <main className="min-h-screen bg-[var(--ink)] pb-32 text-[var(--platinum)]">
      <div className="relative mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
        {/* v2.5 — "← Browse" with filters preserved. Minimal, standalone,
            visually quiet — deliberately NOT the Collector's Drawer (Ducky
            3's, separately owned). Positioned first, near the top of the
            page. Reuses the exact "← Back to X" visual convention already
            established in PurchaseRequestForm.tsx rather than inventing a
            new one. Built to be trivially removable/relocatable once the
            real Drawer exists. */}
        <Link
          href={browseHref}
          className="mb-5 inline-block text-[14px] font-medium text-[var(--gold)] transition hover:opacity-80"
        >
          ← Back to Browse
        </Link>

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

        {/* SECTION 1 — Media gallery */}
        {photoUrls.length > 0 && (
          <ListingGallery
            photos={photoUrls}
            initialIndex={heroIndex}
            brandLabel={listing.brand}
            modelLabel={listing.model}
            dialUrl={dialPhotoUrl}
          />
        )}

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

        {/* SECTION 2 — Identity block */}
        <section className="mt-6">
          <h1 className="font-display text-[28px] font-light leading-tight tracking-[0.3px] text-[var(--platinum)]">
            {title}
          </h1>
          <p className="mt-1 text-[13px] tracking-[0.5px] text-[var(--muted)]">
            Ref. {listing.reference}
          </p>
          <Link
            href={`/sellers/${listing.seller_id}`}
            className="mt-1 inline-block text-[11px] text-[var(--muted)] transition hover:text-[var(--gold)]"
          >
            Sold by {sellerName} →
          </Link>

          {showBoxPapers && (
            <div className="mt-2">
              <span className="inline-flex border border-[var(--border-gold)] px-3 py-1 text-[11px] uppercase tracking-[1px] text-[var(--gold)]">
                Box &amp; Papers ✓
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

          {snapshotPills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {snapshotPills.map((pill, i) => (
                <span
                  key={i}
                  className="border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1 font-[Inter] text-[11px] tracking-[0.3px] text-[var(--slate)]"
                >
                  {pill}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* SECTIONS 3 & 4 — Collector Snapshot + collapsible Technical Specs */}
        <ListingSpecs
          details={details}
          year={listing.year}
          condition={listing.condition}
        />

        {/* SECTION 5 — From the Seller */}
        {listing.description && (
          <section className="mt-8">
            <div className="border-t border-[var(--border-faint)] pt-6 text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
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
        />

        {/* PRICE — last in-flow element before the buyer action below */}
        <div className="mt-10 border-t border-[var(--border-faint)] pt-6">
          <p className="font-display text-[36px] font-light text-[var(--platinum)]">{priceText}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[2px] text-[var(--muted)]">
            Asking Price · 5% platform fee applies
          </p>
        </div>

        {/* START PURCHASE REQUEST — buyer-only, owner-aware. Hidden entirely
            for the listing's own seller. A pending or accepted request hides
            the button (a second pending request would just 409; an accepted
            one has already moved past this step). A declined request shows
            a small note but still allows a new attempt — declined doesn't
            trip the exclusivity rule. */}
        {!isOwner && (
          <div className="mt-6 space-y-3">
            {myLatestRequest?.status === "declined" && (
              <div className="inline-block border border-[var(--border-mid)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
                Your previous request was declined
              </div>
            )}

            {myLatestRequest?.status === "superseded" ? (
              /* superseded — the watch sold to ANOTHER buyer via an accepted
                 request; this buyer was not individually declined. Explain the
                 state honestly and suppress the CTA: a resubmission would
                 contradict the state of the listing. */
              <div className="inline-block border border-[var(--border-mid)] px-4 py-3 text-[11px] tracking-[0.5px] text-[var(--muted)]">
                <div className="uppercase tracking-[2px] text-[var(--slate)]">
                  Another purchase request for this watch was accepted
                </div>
                <div className="mt-1 text-[var(--ghost)]">
                  This watch is no longer available.
                </div>
              </div>
            ) : myLatestRequest?.status === "pending" ? (
              <div className="inline-block border border-[var(--border-gold)] bg-[rgba(201,168,76,0.04)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
                Your request is pending
              </div>
            ) : myLatestRequest?.status === "accepted" ? (
              <div className="inline-block border border-[var(--success)] bg-[rgba(120,200,140,0.05)] px-4 py-2 text-[11px] uppercase tracking-[2px] text-[var(--success)]">
                Your request was accepted
              </div>
            ) : (
              <Link
                href={`/listings/${listing.id}/purchase-request`}
                className="inline-block bg-[var(--gold)] px-6 py-3 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--ink)] transition hover:opacity-90"
              >
                Start Purchase Request
              </Link>
            )}
          </div>
        )}
      </div>

      {/* COLLECTOR'S DRAWER — Phase 2
          Left-edge strip: stays CLOSED as a 28px collapsed strip with the word
          "Explore" running vertically. On hover it expands RIGHTWARD to ~178px,
          opening just over the LEFT PORTION of the hero shot — the dial behind
          it lightly shines through. Smoked glass, not a wall:
          background rgba(6,8,13,0.82) with backdrop-blur-md. The collector never
          feels they've left the viewing room; the drawer floats over it.
          Contains: Back to Browse (filters preserved), Similar Watches, Same
          Reference, Same Movement, Same Case Size, Same Dial Color, Compare,
          Recently Viewed, Add to My Catalogue.
          Aesthetics & motion owned by Ducky 3 — build to the prototype.
          Activation: when CollectorsDrawer component exists. */}

      {/* MESSAGE BAR — v2.7: the disabled shell that lived here is retired.
          The live entry bar is rendered by <ListingCorrespondence /> above
          (fixed positioning makes render location irrelevant), wired per the
          final Surface 1 ruling. */}
    </main>
  );
}
