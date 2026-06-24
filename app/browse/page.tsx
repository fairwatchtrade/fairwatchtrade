import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { selectFeaturedListings, type ScoredListing } from "@/lib/featured";

/* ────────────────────────────────────────────────────────────────────────
   PUBLIC BROWSE — /browse  (v1.25)

   Buyer-facing storefront. Fetches every published listing, ranks via the
   featured selector (merit-based, top 6 by combined score), and renders the
   result as a card grid. No search, no filters — v1 is merit-ranked only.

   PRIVACY: combined_score is read ONLY to feed the ranker — it is never
   rendered. No score number appears on this buyer-facing surface.
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = {
  photo: { url: string };
  category: string;
  isWristShot?: boolean;
};

type ListingRow = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  year: string;
  condition: string;
  asking_price: number;
  photos: ListingPhoto[];
  details?: { dialColorType?: string; caseMaterial?: string } | null;
  combined_score: number; // private — ranking input only, never rendered
  created_at: string; // ISO 8601 — ranking tie-break
  sold?: boolean; // optional on the row; defaults false if absent
  weeks_featured?: number; // optional on the row; defaults 0 if absent
  status: string;
};

function formatPrice(value: number): string {
  return `$${Number(value).toLocaleString("en-US")}`;
}

function heroUrl(photos: ListingPhoto[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

export default async function BrowsePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("status", "published");

  const rows = (!error && Array.isArray(data) ? data : []) as ListingRow[];

  // Map rows into the featured selector's ScoredListing shape, then let it
  // pick + rank the top 6. `sold` / `weeks_featured` are read defensively so
  // this is correct whether or not those columns exist on the row yet.
  const scored: ScoredListing[] = rows.map((row) => ({
    id: row.id,
    combined: Number(row.combined_score ?? 0),
    createdAt: row.created_at,
    sold: Boolean(row.sold),
    weeksFeatured: Number(row.weeks_featured ?? 0),
  }));

  // Re-associate the ranked result back to the raw rows by id, so rendering
  // stays decoupled from the ScoredListing shape.
  const featured = selectFeaturedListings(scored);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const featuredRows = featured
    .map((f) => byId.get(f.id))
    .filter((r): r is ListingRow => Boolean(r));

  return (
    <main className="min-h-screen bg-[#0D0F14] text-[#E8E4DC]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-[22px] font-medium text-[#E8E4DC]">Available Now</h1>
        <p className="mt-1 text-[13px] text-[#B7BAC4]">
          A merit-ranked selection from the FairWatchTrade marketplace.
        </p>

        {featuredRows.length === 0 ? (
          <p className="mt-10 text-[14px] text-[#B7BAC4]">
            No listings are available right now — check back soon.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredRows.map((row) => {
              const hero = heroUrl(row.photos);
              const title = row.model ? `${row.brand} ${row.model}` : row.brand;
              const meta = [row.condition, row.year].filter(Boolean).join(" · ");
              const parts = [row.details?.dialColorType, row.details?.caseMaterial].filter(Boolean);
              const attrs = parts.join(" · ") || null;

              return (
                <Link
                  key={row.id}
                  href={`/listings/${row.id}`}
                  className="group block overflow-hidden rounded-xl border border-white/10 bg-[#0D0F14] transition hover:border-[#C9A84C]/40"
                >
                  {hero ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hero}
                      alt=""
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center text-[13px] text-[#B7BAC4]">
                      No photo
                    </div>
                  )}

                  <div className="p-4">
                    {meta && (
                      <div className="text-[11px] uppercase tracking-[0.15em] text-[#B7BAC4]">
                        {meta}
                      </div>
                    )}
                    <div className="mt-1 text-[15px] font-medium text-[#E8E4DC]">
                      {title}
                    </div>
                    {attrs && (
                      <div className="mt-0.5 text-[12px] text-[#B7BAC4]">
                        {attrs}
                      </div>
                    )}
                    <div className="mt-2 text-[15px] font-semibold text-[#C9A84C]">
                      {formatPrice(Number(row.asking_price))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
