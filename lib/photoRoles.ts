/* ════════════════════════════════════════════════════════════════════════
   CANONICAL PHOTO ROLE ORDER — the one sequence, owned in one place

   > Photo role determines gallery order. Upload time does not.

   The seller tags each photograph by watch section precisely so FairWatch can
   present them in a deliberate collector order: the dial first, because that
   is the watch's face; then the caseback and movement, because that is its
   evidence; then the sides, the bracelet, the clasp; then box and papers,
   which are provenance rather than watch.

   Upload order carries no meaning at all. A seller who photographs the clasp
   first has not decided anything about how buyers should see the watch.

   ── WHY THIS FILE EXISTS ───────────────────────────────────────────────
   This ordering previously lived as a local PHOTO_ORDER array inside
   app/listings/[id]/page.tsx and NOWHERE else, so the published listing was
   ordered by role while the Review step, the editor, and the thumbnails were
   ordered by upload. Same photographs, two different sequences, and the
   seller only ever saw the wrong one while deciding.

   Every consumer now imports from here. Do not re-declare a local order array
   — that is the defect this file replaces.

   The sequence below is the one ALREADY LIVE on published listings, preserved
   deliberately so this correction does not silently reshuffle every existing
   gallery. 'Bracelet/Strap' is added because it is a real PhotoCategory that
   the old array omitted entirely and which therefore sorted last by accident.
   ════════════════════════════════════════════════════════════════════════ */

export const CANONICAL_PHOTO_ROLES: readonly string[] = [
  "Dial",
  "Caseback",
  "Non-Crown Side",
  "Crown Side",
  "Movement (closeup)",
  "Full watch, strap/bracelet extended",
  "Bracelet/Strap",
  "Clasp/Pin Buckle",
  "Box",
  "Papers/Warranty",
  "Wrist shot",
  "Other",
];

/** Rank of a role. Anything unrecognised sorts after every governed role
    rather than being dropped — an untagged or future category must still
    appear, just at the end. */
export function photoRoleRank(category?: string | null): number {
  const i = CANONICAL_PHOTO_ROLES.indexOf(category ?? "");
  return i === -1 ? CANONICAL_PHOTO_ROLES.length : i;
}

/* Sort into canonical role order.

   The tie-break is load-bearing: two photographs sharing a role (two dial
   shots, three papers) keep their original relative upload order, so the
   sequence is deterministic and a re-render can never shuffle them. Array
   .sort() is stable in modern JS, but the explicit index comparison makes
   that a guarantee of this function rather than an assumption about the
   runtime.

   Returns a NEW array. The caller's own array — which is evidence — is never
   mutated. */
export function sortByPhotoRole<T>(
  items: readonly T[],
  categoryOf: (item: T) => string | null | undefined
): T[] {
  return items
    .map((item, index) => ({ item, index, rank: photoRoleRank(categoryOf(item)) }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index))
    .map((x) => x.item);
}

/* The automatic hero, when the seller has not explicitly chosen one: the
   first photograph in canonical order, which is normally the Dial. Expressed
   as "first in role order" rather than "find the dial" so that a listing with
   no dial photograph still gets a sensible lead image instead of falling back
   to whatever happened to be uploaded first. */
export function automaticHeroIndex<T>(
  items: readonly T[],
  categoryOf: (item: T) => string | null | undefined
): number {
  if (items.length === 0) return 0;
  let best = 0;
  let bestRank = photoRoleRank(categoryOf(items[0]));
  for (let i = 1; i < items.length; i++) {
    const r = photoRoleRank(categoryOf(items[i]));
    if (r < bestRank) {
      bestRank = r;
      best = i;
    }
  }
  return best;
}
