/* ════════════════════════════════════════════════════════════════════════
   OPEN THE IN-PAGE PURCHASE REQUEST — a one-line signal, not a second door.

   The listing's fixed bottom bar sits far from the rail card and the inline
   section, with the whole page between them. On desktop and narrow desktop
   its offer action should reach the form already on the page rather than
   navigate to the dedicated route and undo the thing the in-page form
   exists for.

   Lifting the form's open state up through the listing page, the
   correspondence bar and the action rail — three components that otherwise
   know nothing about each other — would couple all of them to a detail none
   of them owns. A window event carries the request instead: the bar asks,
   whichever surface is currently visible answers.

   This opens a form. It submits nothing, validates nothing, and touches no
   draft: the controller remains the only thing that can do any of that.
   ════════════════════════════════════════════════════════════════════════ */

export const OPEN_PURCHASE_REQUEST = "fwt:open-purchase-request";

export type OpenPurchaseRequestDetail = { listingId: string };

/** Ask the in-page Purchase Request form for this listing to open. */
export function askToOpenPurchaseRequest(listingId: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenPurchaseRequestDetail>(OPEN_PURCHASE_REQUEST, {
      detail: { listingId },
    })
  );
}
