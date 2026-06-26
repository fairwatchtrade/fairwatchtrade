import { createClient } from "@/lib/supabase/server";
import { selectFeaturedListings, type ScoredListing } from "@/lib/featured";
import BrowseClient from "@/components/BrowseClient";

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
  details?: { dialColorType?: string; caseMaterial?: string; documentation?: string } | null;
  combined_score: number; // private — ranking input only, never rendered
  created_at: string; // ISO 8601 — ranking tie-break
  sold?: boolean; // optional on the row; defaults false if absent
  weeks_featured?: number; // optional on the row; defaults 0 if absent
  status: string;
};

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
      <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8">
        <h1 className="text-[22px] font-medium text-[#E8E4DC]">Available Now</h1>
        <p className="mt-1 text-[13px] text-[#B7BAC4]">
          A merit-ranked selection from the FairWatchTrade marketplace.
        </p>

        {featuredRows.length === 0 ? (
          <p className="mt-10 text-[14px] text-[#B7BAC4]">
            No listings are available right now — check back soon.
          </p>
        ) : (
          <BrowseClient listings={featuredRows} />
        )}
      </div>
    </main>
  );
}
