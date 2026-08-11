/* Free-text facet folding.

   Dial colour and case material are typed by the seller through a typeahead
   that only SUGGESTS, so the same real attribute reaches the database in
   several spellings. On production "champagne" and "Champagne" were two
   separate tiles — and, worse, two separate filters: asking Browse for a
   Champagne dial returned three of the four champagne-dialled watches and
   silently withheld the fourth. A filter that quietly returns a short set is
   the same broken promise as a search that substitutes a near match.

   Grouping is by case-folded key. The label shown is the spelling the listings
   themselves use most, ties broken alphabetically so the result is
   deterministic rather than dependent on row order — the room reports what the
   data says and never invents a spelling no seller ever wrote.

   Presentation only. Stored values are untouched, and the server-side
   saved-search watcher already matched case-insensitively
   (lower(dialColorType) ~ lower(val)), so folding here brings Browse INTO
   parity with the watcher rather than away from it.

   Deliberately NOT handled: distinct words for one thing — "stainless" vs
   "Stainless Steel". Case-folding cannot merge those, and deciding which term
   is canonical is a naming decision, not an engineering one. They remain two
   honest tiles until that is ruled. */

/** The identity a facet is grouped and matched by. */
export function facetKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Group raw values case-insensitively, returning [displayLabel, count] sorted
    alphabetically — the same shape the ungrouped counter returns. */
export function foldFacets(values: readonly (string | null | undefined)[]): [string, number][] {
  const groups = new Map<string, { total: number; spellings: Map<string, number> }>();
  for (const value of values) {
    const raw = (value ?? "").trim();
    if (!raw) continue;
    const key = facetKey(raw);
    const group = groups.get(key) ?? { total: 0, spellings: new Map<string, number>() };
    group.total += 1;
    group.spellings.set(raw, (group.spellings.get(raw) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      // Most-used spelling wins. On a genuine tie prefer the capitalised form
      // — both are real stored spellings, so this only decides which of two
      // truths to show, and a rail reading "blue" beside "Abyss Blue" looks
      // like an accident rather than a decision. Alphabetical last, so the
      // outcome never depends on row order.
      const capitalised = (s: string) => (/^[A-Z]/.test(s) ? 1 : 0);
      const label = [...group.spellings.entries()].sort(
        (a, b) =>
          b[1] - a[1] ||
          capitalised(b[0]) - capitalised(a[0]) ||
          a[0].localeCompare(b[0]),
      )[0][0];
      return [label, group.total] as [string, number];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
}
