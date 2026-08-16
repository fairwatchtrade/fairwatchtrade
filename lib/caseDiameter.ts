/* ════════════════════════════════════════════════════════════════════════
   CASE DIAMETER — the card scanning line's display grammar

   A collector scanning a grid asks three things of a card: what is this,
   what does it cost, and how big is it. The first two were already there.

   WHY THIS IS NOT sizeLabel()

   BrowseClient already has sizeLabel(), which renders "35mm" with no space.
   That is FACET grammar: the same string is both the tile label and the
   value a selection is matched against, so its shape is load-bearing for
   filtering. Reusing it here would tie the reading line to the filter key
   and mean a future typographic change to one silently altered the other.

   The scanning line is prose — "Excellent · 1980 · 35 mm · Champagne" — and
   takes the spaced form, which is also the grammar the listing detail page
   already speaks ("35 mm case"). Two different jobs, two formatters, no
   shared string between them.

   WHY IT IS SHARED

   Browse and Catalogue keep deliberately parallel card treatments — the
   comment in CatalogueClient says the two grids "are read the same way and
   must not drift". Diameter arrives in both through this one function so
   they cannot.

   WHAT IT WILL NOT DO

   Nothing is derived. The value is whatever the listing actually stored in
   details.caseSizeMm and nothing else — never inferred from case width,
   lug-to-lug, or parsed out of a title or description. Absent means absent:
   this returns null and the caller omits the segment entirely rather than
   printing "0 mm", "N/A" or "Unknown". Four of the ten listings published
   at the time of writing have no diameter, so the empty branch is the
   common case, not an edge one.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Display form of a stored case diameter for the card scanning line.
 * Returns null when there is nothing truthful to show.
 */
export function caseDiameterLabel(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  /* Stored values are bare numbers — "35", "40", "31" — because the field
     carries its unit in its name. Verified against every published listing
     before this was written: none contained a letter. The guard is for the
     free-text seller field behind it, which could one day arrive already
     carrying "mm"; appending unconditionally would print "40 mm mm". */
  if (/mm/i.test(trimmed)) return trimmed;

  return `${trimmed} mm`;
}
