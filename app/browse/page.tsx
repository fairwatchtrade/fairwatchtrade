import { createClient } from "@/lib/supabase/server";
import BrowseClient from "@/components/BrowseClient";

/* ────────────────────────────────────────────────────────────────────────
   PUBLIC BROWSE — /browse  (v1.58)

   v1.58 — Phase 1B: details type widened again for caseThicknessMm (same
   type-only precedent as v1.57 — no query change, select("*") already
   returned this column, TypeScript just didn't know about it yet).

   v1.57 — Phase 1 (Browse Gallery/Collector View + Collector's Workbench):
   details type widened to match what BrowseClient.tsx already expects/reads
   (caseSizeMm/movementType were already flowing through select("*") but
   untyped here; movementFrequency/powerReserve are newly consumed by the
   Workbench). Type-only change — the query itself is unchanged, still
   select("*"), no migration, no new columns.

   Buyer-facing storefront. Fetches every published listing and hands the
   full set to BrowseClient, which owns filtering, faceting, layout controls,
   and pagination. Browse is filter-first: it shows the entire published
   catalogue, not a pre-ranked slice.

   The merit-based top-6 ranker (selectFeaturedListings in lib/featured.ts)
   is NOT used here — it belongs to the homepage marketplace preview. It
   remains intact in lib/featured.ts for that surface to consume later.

   PRIVACY: combined_score is never rendered. No score number appears on this
   buyer-facing surface.
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
  /** Public listing code (q15932) — issued by the database, searchable. */
  public_code: string | null;
  description?: string | null;
  year: string;
  condition: string;
  asking_price: number;
  photos: ListingPhoto[];
  details?: {
    dialColorType?: string;
    caseMaterial?: string;
    documentation?: string;
    caseSizeMm?: string;
    movementType?: string;
    movementFrequency?: string;
    powerReserve?: string;
    caseThicknessMm?: string; // v1.58 — Phase 1B, type-only, same precedent
  } | null;
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
              {rows.length} watches · curated and verified
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          {rows.length === 0 ? (
            <p className="text-[14px] text-[var(--slate)]">
              No listings are available right now — check back soon.
            </p>
          ) : (
            <BrowseClient listings={rows} />
          )}
        </div>
      </div>
    </main>
  );
}
