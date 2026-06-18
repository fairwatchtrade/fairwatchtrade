/* ════════════════════════════════════════════════════════════════════════
   WEEKLY FEATURED LISTINGS (front page)

   Highest combined two-part scores get featured on the homepage. No manual
   curation, no pay-to-play, no ads — purely merit-based.

   This is a PURE selection function. It does not query anything. When the
   listings database exists (Supabase, later), you fetch the candidate
   listings, map them into ScoredListing[], and pass them here. Testable and
   runnable today with in-memory data.

   Design decisions locked here (all tunable via options):
     - count           : homepage slots (default 6 — fits a clean grid)
     - maxWeeksFeatured : anti-camp rule so one long-listed grail can't own
                          the front page forever (default 2). After that it
                          yields to give others a turn.
     - sold listings are always excluded.
     - tie-break: newer listing first (keeps the page feeling fresh).
   ════════════════════════════════════════════════════════════════════════ */

export type ScoredListing = {
  id: string;
  combined: number; // from scoreListing().combined
  createdAt: string; // ISO 8601
  sold: boolean;
  /** How many distinct weeks this listing has already been featured. */
  weeksFeatured: number;
};

export type FeaturedOptions = {
  count?: number;
  maxWeeksFeatured?: number;
};

export function selectFeaturedListings(
  listings: ScoredListing[],
  opts: FeaturedOptions = {}
): ScoredListing[] {
  const { count = 6, maxWeeksFeatured = 2 } = opts;

  return listings
    .filter((l) => !l.sold && l.weeksFeatured < maxWeeksFeatured)
    .sort((a, b) => {
      if (b.combined !== a.combined) return b.combined - a.combined; // score, desc
      return Date.parse(b.createdAt) - Date.parse(a.createdAt); // newer first
    })
    .slice(0, count);
}

/* Helper for the weekly job (later): given the listings that were just
   featured, return the ids whose weeksFeatured should be incremented.
   Kept here so the increment rule lives next to the selection rule. */
export function featuredIdsToIncrement(featured: ScoredListing[]): string[] {
  return featured.map((l) => l.id);
}
