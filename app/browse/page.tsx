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
  // Money Truth Stage B — already flowing through select("*"); typed now.
  asking_currency: string | null;
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
  created_at: string; // ISO 8601 — ranking tie-break
  sold?: boolean; // optional on the row; defaults false if absent
  weeks_featured?: number; // optional on the row; defaults 0 if absent
  status: string;
};

/* ── BOUNDED FETCH ─────────────────────────────────────────────────────
      The query used to be select("*") with no limit: every published row,
      every column, every photo, in one unbounded call. At ten listings that
      is invisible; the shape is what fails, not today's numbers.

      Two bounds, both behaviour-preserving:

      1 · COLUMNS. Only what Browse actually consumes. select("*") shipped
          the private curation scores to every visitor's browser — never
          rendered, but present in the payload and readable in devtools.
          combined_score in particular was fetched, typed, and never read by
          a single line of BrowseClient. The scores stay out of the buyer's
          machine entirely now.
          ⚠ photo_presentation is REQUIRED here and was absent from this
          file's own row type — the cards read it for seller-authored
          framing, and it survived only because "*" swept it in. Any future
          narrowing must be driven by what the CLIENT reads, not by this
          type.
      ⚠ `sold` is NOT a column on listings — it is an optional type field
          that defaults to false. Naming it here made PostgREST reject the
          ENTIRE query, so rows fell back to [] and Browse rendered empty
          with no visible error. Verify every name against
          information_schema before adding it to this list.

      2 · ROW CEILING. An explicit limit so one page load can never fetch an
          unbounded catalogue. The ceiling is far above real inventory, so
          nothing about today's Browse changes; it exists so the failure
          mode at scale is a logged, deliberate truncation instead of an
          unbounded query.

      The ORDER BY exists ONLY to make that ceiling deterministic — without
      it a truncated fetch returns an arbitrary subset. It does not decide
      what the buyer sees: BrowseClient re-sorts the full set in memory, so
      display order is untouched. The separate known default-sort/ORDER BY
      product question is NOT addressed here.

      This is a fetch bound, not server-side pagination. Real pagination
      still requires the facet-count decision first — facets and filters are
      computed client-side over the whole set, so paginating the query
      without that ruling would silently make the counts wrong. ── */
const BROWSE_FETCH_CEILING = 500;

export default async function BrowsePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, public_code, description, year, condition, asking_price, asking_currency, photos, photo_presentation, details, created_at, weeks_featured, status, in_hand_verified"
    )
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(BROWSE_FETCH_CEILING + 1);

  const fetched = (!error && Array.isArray(data) ? data : []) as ListingRow[];
  /* Fetching ceiling+1 is how truncation is DETECTED rather than assumed.
     Crossing it means the catalogue outgrew this bound and the real
     server-side pagination flight is owed — say so loudly in the server log
     rather than quietly serving a partial catalogue forever. */
  const truncated = fetched.length > BROWSE_FETCH_CEILING;
  if (truncated) {
    console.error(
      `[browse] published catalogue exceeds the ${BROWSE_FETCH_CEILING}-row fetch ceiling — ` +
        "Browse is showing a truncated set. Server-side pagination is now required."
    );
  }
  const rows = truncated ? fetched.slice(0, BROWSE_FETCH_CEILING) : fetched;

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--platinum)]">
      <div className="flex flex-col">
        {/* Browse header renders inside BrowseClient so the Discover count
            reads the one canonical filtered result set — a page-level total
            beside filtered listings would contradict what actually renders. */}
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
