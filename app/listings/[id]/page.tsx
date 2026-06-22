import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListingGallery from "@/components/ListingGallery";

/* ────────────────────────────────────────────────────────────────────────
   PUBLIC LISTING DETAIL — /listings/[id]  (v1.22)

   Buyer-facing detail view for a single published listing. Server Component:
   fetches the row by UUID from `listings`, 404s if missing or not published.

   PRIVACY: scoring fields (significance_score, score_state, combined_score,
   etc.) are NEVER selected into the render path here — they are seller-only.
   We read only the buyer-safe fields below.

   Iron Laws layout hierarchy (top → bottom):
     Header (brand + model, Ref.)  |  Box & Papers badge (top-right)
     Case line (size · thickness)
     Photo gallery → Structured details → Seller description
     Price  ← absolute last element in page content
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

const MOVEMENT_LABELS: Record<string, string> = {
  "Manual Wind": "✦ Manual Wind",
  Automatic: "🔄 Automatic",
  Quartz: "⚡ Quartz",
  "Solar/Kinetic": "🔋 Solar/Kinetic",
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

  // LINE 2 — case size · thickness (header). Omit silently if neither exists.
  const headerCase = [
    details.caseSizeMm ? `${details.caseSizeMm}mm` : "",
    details.caseThicknessMm ? `${details.caseThicknessMm}mm thick` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const headerShowsCase = headerCase.length > 0;

  // Movement — mapped to the canonical labelled string.
  const movementLabel = details.movementType
    ? MOVEMENT_LABELS[details.movementType] ?? details.movementType
    : "";

  // Complications — comma-joined.
  const complications =
    Array.isArray(details.complications) && details.complications.length > 0
      ? details.complications.join(", ")
      : "";

  // Structured details — only fields that exist, in spec order.
  const detailRows: Array<{ label: string; value: string }> = [];
  if (movementLabel) detailRows.push({ label: "Movement", value: movementLabel });
  if (details.caseMaterial)
    detailRows.push({ label: "Case material", value: details.caseMaterial });
  // Case size/thickness in the panel ONLY when the header didn't already show it.
  if (!headerShowsCase && (details.caseSizeMm || details.caseThicknessMm)) {
    const panelCase = [
      details.caseSizeMm ? `${details.caseSizeMm}mm` : "",
      details.caseThicknessMm ? `${details.caseThicknessMm}mm thick` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (panelCase) detailRows.push({ label: "Case", value: panelCase });
  }
  if (details.dialColorType)
    detailRows.push({ label: "Dial color", value: details.dialColorType });
  if (complications) detailRows.push({ label: "Complications", value: complications });
  if (details.closureType)
    detailRows.push({ label: "Closure type", value: details.closureType });
  if (listing.year) detailRows.push({ label: "Year", value: listing.year });
  if (listing.condition) detailRows.push({ label: "Condition", value: listing.condition });

  const priceText = `$${Number(listing.asking_price).toLocaleString()}`;

  return (
    <main className="min-h-screen bg-[#0D0F14] pb-24 text-[#E8E4DC]">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {/* HEADER — title left, Box & Papers badge top-right */}
        <header className="flex items-start justify-between gap-4">
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
        </header>

        {/* LINE 2 — case size · thickness */}
        {headerShowsCase && (
          <p className="mt-2 text-sm text-[#B7BAC4]">{headerCase}</p>
        )}

        {/* MIDDLE — photo gallery */}
        {photoUrls.length > 0 && (
          <div className="mt-6">
            <ListingGallery photos={photoUrls} initialIndex={heroIndex} />
          </div>
        )}

        {/* MIDDLE — structured details panel */}
        {detailRows.length > 0 && (
          <section className="mt-8 rounded-lg border border-white/15 p-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {detailRows.map((row) => (
                <div key={row.label} className="flex flex-col">
                  <dt className="text-[11px] uppercase tracking-wide text-[#B7BAC4]">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 text-sm text-[#E8E4DC]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* MIDDLE — seller description (no truncation) */}
        {listing.description && (
          <section className="mt-8">
            <p className="whitespace-pre-line text-sm leading-relaxed text-[#B7BAC4]">
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
