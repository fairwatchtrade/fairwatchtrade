import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ListingGallery from "@/components/ListingGallery";
import ListingSpecs from "@/components/ListingSpecs";
import WatchBlueprint from "@/components/WatchBlueprint";

/* ────────────────────────────────────────────────────────────────────────
   PUBLIC LISTING DETAIL — /listings/[id]  (v1.57)

   Buyer-facing detail view for a single published listing. Server Component:
   fetches the row by UUID from `listings`, 404s if missing or not published.

   PRIVACY: scoring fields (significance_score, score_state, combined_score,
   etc.) are NEVER rendered here — they are seller-only. Only buyer-safe
   fields below reach the markup.

   Five-section layout (top → bottom):
     1. Media gallery (hero w/ brand·model overlay + thumbnail strip)
     2. Identity block — brand+model, Ref., Box & Papers badge, snapshot pills
     3. Collector Snapshot — prominent two-column spec grid
     4. Technical Specifications — remaining specs, never duplicating §3
     5. From the Seller — full description, mb-8 reserve for the message stream
     Price  ← absolute last in-flow element
   The message bar is position:fixed (viewport-pinned), so it is NOT part of
   the scrolling content flow — price remains the last in-flow element.

   v1.57: Studio design-system token migration. No logic, data, scoring,
   privacy, or photo-sort changes — className/layout only.
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

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  // photo, but this must not be assumed structurally.
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
          />
        )}

        {/* DIAL REVEAL — Phase 2
            On hover over dial photo only, a thin contrast/brightness slider appears.
            No zoom. No magnifying glass. Just the detail that was already there —
            MOP depth, guilloché pattern, printing on dark dials, hidden by the
            photographer's exposure balance.
            Implementation: CSS filter on img element, one range input, ~30 lines JS.
            Slot: wrap the dial <img> in a relative container with data-dial-reveal.
            Activation: when real data is present and DialReveal component exists. */}

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
            className="mt-1 inline-block text-[11px] text-[var(--gold-subtle)] transition hover:text-[var(--gold)]"
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

        {/* PRICE — absolute last rendered element in page content */}
        <div className="mt-10 border-t border-[var(--border-faint)] pt-6">
          <p className="font-display text-[36px] font-light text-[var(--platinum)]">{priceText}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[2px] text-[var(--muted)]">
            Asking Price · 5% platform fee applies
          </p>
        </div>
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

      {/* MESSAGE THREAD SHELL — fixed to viewport bottom. UI only, no backend.
          FUTURE FLIGHT: messaging is not wired this pass. Input is non-functional,
          Send button remains disabled. Do not wire without a messaging brief. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--ink)]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-6 py-3 sm:px-8">
          {/* Left — anchored snapshot (dial thumb, brand, reference, price) */}
          <div className="flex min-w-0 items-center gap-3">
            {heroUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroUrl}
                alt=""
                className="h-10 w-10 shrink-0 border border-[var(--border-subtle)] object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-[var(--platinum)]">
                {listing.brand}
              </p>
              <p className="truncate text-[11px] text-[var(--muted)]">
                Ref. {listing.reference} · {priceText}
              </p>
            </div>
          </div>

          {/* Right — message input + disabled Send (wired in a future flight) */}
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              placeholder="Message seller…"
              className="min-w-0 flex-1 border-b border-[var(--border-mid)] bg-transparent px-0 py-2 text-[14px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none"
            />
            <button
              type="button"
              disabled
              className="shrink-0 cursor-not-allowed border border-[var(--border-gold)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--gold)] opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
