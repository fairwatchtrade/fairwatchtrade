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
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      <div className="flex flex-col">
        {/* Browse header */}
        <div className="flex items-end justify-between border-b border-[var(--border-faint)] px-6 py-5">
          <div>
            <h1 className="font-display text-[24px] font-light tracking-[0.5px] text-[var(--platinum)]">
              Discover
            </h1>
            <p className="mt-[3px] text-[10px] tracking-[0.5px] text-[var(--ghost)]">
              {featuredRows.length} watches · curated and verified
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          {featuredRows.length === 0 ? (
            <p className="text-[14px] text-[var(--slate)]">
              No listings are available right now — check back soon.
            </p>
          ) : (
            <BrowseClient listings={featuredRows} />
          )}
        </div>
      </div>
    </main>
  );
}
