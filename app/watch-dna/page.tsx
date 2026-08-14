import { createClient } from "@/lib/supabase/server";
import CatalogueRail from "@/components/CatalogueRail";
import WatchDnaQuiz from "@/components/WatchDnaQuiz";
import { isArchetypeKey } from "@/lib/watchDna";

/* v3.22 — Watch DNA result brand pills become real doors to Browse (Layout's
   order, 2026-08-02). Two things the page now owns that the quiz cannot:

   1. BRAND AVAILABILITY. A pill may only become a link if that exact brand
      has published inventory, so the page reads the live brand vocabulary
      here and hands it down. This is a presentation gate, not a truth
      filter — the archetype brand lists are unchanged and every pill still
      renders. Unavailable is NOT rendered as negative: an unlinked pill is
      exactly the pill that shipped before, with no count, badge, or "soon".
      Self-healing — a pill becomes a door the moment a listing publishes.

   2. RETURN CONTEXT. The result is now addressable as ?dna=<key>, so a
      collector who follows a pill into Browse can come back to the same
      result instead of a blank quiz. The quiz stamps the param itself via
      the router-integrated native History API; the page reads it back on
      any fresh entry.

   Because the page reads cookies (supabase) and searchParams it renders
   dynamically, so useSearchParams/Suspense is not involved.

   v3.21 — Watch DNA joins the Catalogue family (v3 rail order §6.4,
   correction 2): the page mounts the persistent CatalogueRail with Watch
   DNA active, in the same stage composition as /catalogue. The page stays
   public — the rail's links carry their own guards on arrival, unchanged.
   The rail hides itself below md — mobile /watch-dna renders as before.
   Collapse state is shared with /catalogue (fwt-rail-catalogue): one
   physical object across the family. */

/**
 * The brands a collector can actually reach from Browse right now: the
 * canonical `listings.brand` values of published listings. Returned verbatim
 * (never lowercased) because the Browse Brand criterion matches by exact
 * string equality — the link must carry the stored value, not the pill's.
 */
async function publishedBrands(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("listings")
      .select("brand")
      .eq("status", "published");

    if (error || !Array.isArray(data)) return [];
    return Array.from(
      new Set(
        data
          .map((row) => (row as { brand: string | null }).brand)
          .filter((b): b is string => typeof b === "string" && b.trim() !== "")
      )
    );
  } catch {
    /* Availability is an enhancement, never a dependency. If the lookup
       fails the pills simply stay plain text — the result card is intact. */
    return [];
  }
}

export default async function WatchDnaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [availableBrands, params] = await Promise.all([
    publishedBrands(),
    searchParams,
  ]);

  const dna = Array.isArray(params.dna) ? params.dna[0] : params.dna;
  const initialArchetype = isArchetypeKey(dna) ? dna : null;

  return (
    <div className="flex min-h-screen bg-[var(--ink)]">
      <CatalogueRail />
      <main className="flex flex-1 justify-center px-4 py-12">
        <div className="w-full max-w-xl text-center">
          <div className="mb-7 text-center">
            <div className="text-[11px] uppercase tracking-[0.25em] text-[var(--muted)]">
              FairWatchTrade
            </div>
            <h1 className="mt-2 text-[28px] font-semibold text-[var(--platinum)]">
              What&apos;s your Watch DNA?
            </h1>
            <p className="mt-2 text-[14px] text-[var(--muted)]">
              Five questions. No wrong answers — just what&apos;s true for you.
            </p>
          </div>

          <WatchDnaQuiz
            availableBrands={availableBrands}
            initialArchetype={initialArchetype}
          />
        </div>
      </main>
    </div>
  );
}
