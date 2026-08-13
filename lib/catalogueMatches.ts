/* ────────────────────────────────────────────────────────────────────────
   CATALOGUE MATCHES — lib/catalogueMatches.ts

   Pure derivations for the Catalogue's collector-scoped match surface.
   No DOM, no Supabase, no side effects — unit-tested in
   scripts/catalogue-matches.test.mjs.

   Product law (Permissioned Adjacency build order, 2026-08-12):
     · Browse is what is on FairWatchTrade; Catalogue is what is relevant
       to THIS collector. Nothing appears here merely because it is new.
     · Exact and adjacent never mix: exact wins whenever a listing
       qualifies exactly, adjacent is visually subordinate and bounded.
     · Adjacency is permissioned per Saved Search (include_adjacent) and
       honored at READ time too: switching it off removes adjacent
       presentation immediately, without deleting accrued history.
     · Empty is better than fabricated. If nothing qualifies, the
       Catalogue is allowed to be quiet.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export type CatalogueSearch = {
  id: string;
  name: string;
  paused: boolean;
  include_adjacent: boolean;
};

/** One saved_search_matches row as the Catalogue reads it (listing joined). */
export type CatalogueMatchRow<L extends { id: string; status: string }> = {
  id: string;
  saved_search_id: string;
  /** Absent on pre-adjacency rows — those are exact by construction. */
  match_kind?: string | null;
  adjacent_reason?: string | null;
  created_at: string;
  listing: L | null;
};

/** One deduplicated card the Catalogue may truthfully render. */
export type CatalogueCard<L extends { id: string; status: string }> = {
  listing: L;
  matchKind: "exact" | "adjacent";
  /** The stored collector-readable sentence; null for exact matches. */
  reason: string | null;
  /** Every saved search that produced this card, for attribution. */
  searchNames: string[];
  foundAt: string;
};

/** How many adjacent cards the Catalogue shows — bounded so the Catalogue
    never becomes Browse by accumulation. */
export const ADJACENT_DISPLAY_CAP = 6;

/**
 * The hero's four honest states. "We're watching for you." is permitted
 * only when FairWatchTrade actually watches at least one active search.
 */
export function catalogueHeroState(
  searches: Pick<CatalogueSearch, "paused">[],
  exactCount: number
): "no-searches" | "matches" | "watching" | "paused" {
  if (searches.length === 0) return "no-searches";
  if (exactCount > 0) return "matches";
  if (searches.some((s) => !s.paused)) return "watching";
  return "paused";
}

/**
 * Group raw match rows into displayable cards.
 *
 * · Only currently published listings render (an accrued match whose watch
 *   left the market is history, kept on the Account module — not a card
 *   implying availability).
 * · Adjacent rows render only while their search is unpaused AND currently
 *   opted in — the permission is honored at read time.
 * · Exact rows from a paused search still render: pausing stops watching,
 *   not history (the Account module states exactly this).
 * · One listing, one card: exact wins over adjacent across searches;
 *   attribution merges every contributing search name.
 */
export function groupCatalogueMatches<L extends { id: string; status: string }>(
  searches: CatalogueSearch[],
  rows: CatalogueMatchRow<L>[],
  adjacentCap: number = ADJACENT_DISPLAY_CAP
): { exact: CatalogueCard<L>[]; adjacent: CatalogueCard<L>[] } {
  const byId = new Map(searches.map((s) => [s.id, s]));
  const cards = new Map<string, CatalogueCard<L>>();

  const ordered = [...rows].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );

  for (const row of ordered) {
    const search = byId.get(row.saved_search_id);
    const listing = row.listing;
    if (!search || !listing || listing.status !== "published") continue;

    const kind: "exact" | "adjacent" =
      row.match_kind === "adjacent" ? "adjacent" : "exact";
    if (kind === "adjacent" && (search.paused || !search.include_adjacent)) {
      continue;
    }

    const existing = cards.get(listing.id);
    if (!existing) {
      cards.set(listing.id, {
        listing,
        matchKind: kind,
        reason: kind === "adjacent" ? (row.adjacent_reason ?? null) : null,
        searchNames: [search.name],
        foundAt: row.created_at,
      });
      continue;
    }
    // Exact wins; a listing never appears as both.
    if (kind === "exact" && existing.matchKind === "adjacent") {
      existing.matchKind = "exact";
      existing.reason = null;
    }
    if (!existing.searchNames.includes(search.name)) {
      existing.searchNames.push(search.name);
    }
  }

  const all = [...cards.values()];
  return {
    exact: all.filter((c) => c.matchKind === "exact"),
    adjacent: all.filter((c) => c.matchKind === "adjacent").slice(0, adjacentCap),
  };
}
