/* ════════════════════════════════════════════════════════════════════════
   SERVICE PHOTO PRIVACY — one governed public-visibility rule
   (Consolidation ruling · 2026-08-06)

   Service Evidence images are PRIVATE BY DEFAULT. Service documents
   routinely carry a person's address, phone, email, billing ZIP, partial
   payment details, account numbers, signatures, and prices paid — so
   selecting the evidence category never publishes the document. Only the
   seller's separate, deliberate opt-in ("Show this service document on my
   public listing", default UNCHECKED) makes one publicly displayable.

   Every public surface that renders listing photographs consumes THIS
   predicate — the listing page, the Browse hero, the Catalogue hero — so
   a mistaken category selection can never expose a service receipt from
   any of them. Review and the seller's own flow always see everything.
   ════════════════════════════════════════════════════════════════════════ */

type PhotoLike = {
  category?: string | null;
  servicePublicOptIn?: boolean;
} | null | undefined;

export function isPubliclyDisplayable(p: PhotoLike): boolean {
  if (!p) return false;
  if (p.category !== "Service Evidence") return true;
  return p.servicePublicOptIn === true;
}

/** Filter a listing's photo array down to what public surfaces may show.
    Returns a NEW array; never mutates. */
export function publiclyDisplayablePhotos<T extends PhotoLike>(
  photos: readonly T[] | null | undefined
): T[] {
  return (photos ?? []).filter((p) => isPubliclyDisplayable(p));
}
