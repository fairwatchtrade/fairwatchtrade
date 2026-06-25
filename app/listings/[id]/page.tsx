import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListingGallery from "@/components/ListingGallery";
import ListingSpecs from "@/components/ListingSpecs";

/* ────────────────────────────────────────────────────────────────────────
   PUBLIC LISTING DETAIL — /listings/[id]  (v1.30c)

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
};

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

  // Photos: keep only entries that actually carry a URL, so category-based
  // hero detection and the URL list stay index-aligned.
  const allPhotos = Array.isArray(listing.photos) ? listing.photos : [];
  const withUrls = allPhotos.filter((p) => p?.photo?.url);
  const photoUrls = withUrls.map((p) => p.photo.url);
  const dialIdx = withUrls.findIndex((p) => p?.category === "Dial");
  const heroIndex = dialIdx >= 0 ? dialIdx : 0;
  const heroUrl = photoUrls[heroIndex] ?? photoUrls[0] ?? null;

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
    <main className="min-h-screen bg-[#0D0F14] pb-24 text-[#E8E4DC]">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {/* SECTION 1 — Media gallery */}
        {photoUrls.length > 0 && (
          <ListingGallery
            photos={photoUrls}
            initialIndex={heroIndex}
            brandLabel={listing.brand}
            modelLabel={listing.model}
          />
        )}

        {/* SECTION 2 — Identity block */}
        <section className="mt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold leading-tight text-[#E8E4DC]">
                {title}
              </h1>
              <p className="mt-1 text-sm text-[#B7BAC4]">Ref. {listing.reference}</p>
            </div>

            {showBoxPapers && (
              <span className="shrink-0 rounded-full border border-[#C9A84C] px-3 py-1 text-[11px] font-medium text-[#C9A84C]">
                Box &amp; Papers ✓
              </span>
            )}
          </div>

          {snapshotPills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {snapshotPills.map((pill, i) => (
                <span
                  key={i}
                  className="rounded border border-white/15 bg-[#13151C] px-2 py-0.5 font-mono text-[11px] text-[#B7BAC4]"
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

        {/* SECTION 5 — Story & Provenance */}
        {listing.description && (
          <section className="mt-8">
            <div className="text-[11px] uppercase tracking-[0.15em] text-[#B7BAC4] pt-6 border-t border-white/10">
              From the Seller
            </div>
            <p className="mt-3 mb-8 whitespace-pre-line text-sm leading-relaxed text-[#B7BAC4]">
              {listing.description}
            </p>
          </section>
        )}

        {/* PRICE — absolute last rendered element in page content */}
        <div className="mt-10">
          <p className="text-3xl font-semibold text-[#E8E4DC]">{priceText}</p>
        </div>
      </div>

      {/* MESSAGE THREAD SHELL — fixed to viewport bottom. UI only, no backend. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-[#0D0F14]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* Left — anchored snapshot (dial thumb, brand, reference, price) */}
          <div className="flex min-w-0 items-center gap-3">
            {heroUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md border border-white/15 object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[#E8E4DC]">
                {listing.brand}
              </p>
              <p className="truncate text-[11px] text-[#B7BAC4]">
                Ref. {listing.reference} · {priceText}
              </p>
            </div>
          </div>

          {/* Right — message input + disabled Send (wired in a future flight) */}
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              placeholder="Message seller…"
              className="min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm text-[#E8E4DC] placeholder:text-[#B7BAC4] focus:outline-none"
            />
            <button
              type="button"
              disabled
              className="shrink-0 cursor-not-allowed rounded-md border border-[#C9A84C] px-4 py-2 text-sm font-medium text-[#C9A84C] opacity-60"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
