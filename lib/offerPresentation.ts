/* ────────────────────────────────────────────────────────────────────────
   OFFER PRESENTATION — pure helpers for the buyer's My Offers surface.

   offerPrice guards the v2.85 Buyer Price Truth ruling (Bug 2): the
   historical-offer slot shows ONE fact — the buyer's snapshotted offer
   amount on that purchase request. It must never borrow the asking-price
   snapshot (a different fact) or any live listing value (a current number
   masquerading as history). Absence stays absent; the UI renders its own
   honest absence states. Extracted here so a regression test can hold the
   contract without rendering React.
   ──────────────────────────────────────────────────────────────────────── */

export function offerPrice(offer: {
  proposed_purchase_price: number | null;
}): number | null {
  return offer.proposed_purchase_price ?? null;
}
