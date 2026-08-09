"use client";

import { askToOpenPurchaseRequest } from "@/lib/purchaseRequestOpen";

/* ────────────────────────────────────────────────────────────────────────
   The fixed bottom bar's offer action, for viewports that have the form on
   the page already. It asks the visible in-page surface to open and brings
   the collector to it — it never navigates, never submits, and owns no form
   state of its own.

   Below the in-page form's breakpoint the bar keeps its ordinary link to
   the dedicated route, and a signed-out visitor keeps it at every width, so
   the route's own auth gate still decides identity.
   ──────────────────────────────────────────────────────────────────────── */

export default function OpenPurchaseRequestButton({
  listingId,
  className,
}: {
  listingId: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => askToOpenPurchaseRequest(listingId)}
      className={className}
    >
      Make Offer
    </button>
  );
}
