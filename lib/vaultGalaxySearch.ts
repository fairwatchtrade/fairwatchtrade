/* ════════════════════════════════════════════════════════════════════════
   VAULT GALAXY SEARCH — shared relevance scoring   (lib/vaultGalaxySearch.ts)

   WHY THIS LIB EXISTS — the alias corpus stays off the wire.

   The brand `search_aliases` set is curated collector-language IP: the
   shorthand, the no-umlaut spellings, the dealer nicknames that make "lange"
   find A. Lange & Söhne. It is genuinely valuable and it must NOT ship to the
   browser as a downloadable dictionary. Before v6.86 the Galaxy page
   serialized all 191 brands' aliases into the anonymous page payload, so an
   unauthenticated `curl /vault` or `/vault/galaxy` handed over the whole set.

   The fix keeps the Galaxy exactly as public and exactly as searchable, and
   moves only the MATCHING to the server: app/api/vault/galaxy-search reads the
   alias data and answers one query at a time, returning per-brand scores and
   the best match — never the aliases themselves. An observer can still probe
   individual queries; it can no longer bulk-download the dictionary.

   This module is the ONE scoring implementation. The server route runs it over
   the full alias data; the client runs the identical function as an offline
   fallback over the fields it still holds (name/description/cluster, aliases
   absent). Same math both places, so the primary path and the fallback can
   never diverge in how they rank — only in whether aliases are present.

   The scoring is the POC-ported relevance the Galaxy has always shipped with;
   only its location moved. Do not "optimise" the alias column back onto the
   page payload — that reopens the exact exposure this exists to close.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type GalaxySearchBrand = {
  id: string;
  name: string;
  description: string | null;
  /** Optional on purpose: present on the server, absent on the client. */
  search_aliases?: string[] | null;
  cluster: string | null;
};

export type GalaxySearchResult = {
  /** One score per brand id — feeds the field-dimming brightness map. */
  scores: Record<string, number>;
  /** The brand to fly to, or null when nothing scores above the floor. */
  bestId: string | null;
};

/* A miss never scores zero — see the reasoning in VaultGalaxy.runSearch. An
   empty query scores every brand 1 (nothing is a match, so nothing dims). */
const MATCH_FLOOR = 0.18;

export function galaxySearchTerms(raw: string): string[] {
  return raw.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

export function galaxyRelevance(b: GalaxySearchBrand, terms: string[]): number {
  if (!terms.length) return 1;
  const hay = (
    b.name +
    " " +
    (b.description ?? "") +
    " " +
    (b.search_aliases ?? []).join(" ") +
    " " +
    (b.cluster ?? "")
  ).toLowerCase();
  let s = 0;
  terms.forEach((term) => {
    if (hay.includes(term)) s++;
  });
  return Math.max(MATCH_FLOOR, s / Math.max(1, terms.length));
}

/* Iterate in the SAME order the page renders (both fetch `.order("name")`), so
   a tie for top score resolves to the same brand server-side and client-side.
   Strict `>` keeps first-max-wins, exactly as the original client loop did. */
export function searchGalaxyBrands(
  brands: GalaxySearchBrand[],
  raw: string
): GalaxySearchResult {
  const terms = galaxySearchTerms(raw);
  const scores: Record<string, number> = {};
  let bestId: string | null = null;
  let bestScore = MATCH_FLOOR;
  for (const b of brands) {
    const r = galaxyRelevance(b, terms);
    scores[b.id] = r;
    if (terms.length > 0 && r > bestScore) {
      bestScore = r;
      bestId = b.id;
    }
  }
  return { scores, bestId };
}
