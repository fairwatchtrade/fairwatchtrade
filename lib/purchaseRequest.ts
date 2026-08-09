/* ════════════════════════════════════════════════════════════════════════
   PURCHASE REQUEST — the shared submission contract.

   One authoritative reading of what the server said, used by every entry
   point: the dedicated /listings/[id]/purchase-request route, the desktop
   right-rail expansion, and the narrow-desktop inline section. The three
   surfaces differ only in where they draw the form — never in what an
   answer from POST /api/purchase-requests MEANS.

   Nothing here submits, validates an amount, or touches money. Amount
   parsing stays with the shared price parser and the authoritative snapshot
   is created server-side; this module only classifies the response so the
   error taxonomy cannot drift between surfaces.
   ════════════════════════════════════════════════════════════════════════ */

/** What the buyer should be shown after a submission attempt. */
export type PurchaseRequestOutcome =
  /** Created. The server's own figure wins over the locally parsed one. */
  | { kind: "success"; proposedPurchasePrice: number }
  /** 401 — session ended. The draft is preserved; never a false success. */
  | { kind: "expired" }
  /** Reserved or no longer readable by this buyer. */
  | { kind: "unavailable" }
  /** The seller moved the asking price mid-session. Nothing was sent. */
  | { kind: "changed"; old: number; current: number }
  /** A form-level truth — duplicate request, own listing, currency unset. */
  | { kind: "form_error"; detail: string }
  /** Belongs beside the amount field, which takes focus. */
  | { kind: "field_error"; detail: string };

export const GENERIC_SUBMIT_ERROR =
  "Something went wrong sending your request. Please try again.";

/** Session-scoped, listing-scoped. Never carries across listings or sessions. */
export function draftKeyFor(listingId: string): string {
  return `fwt.pr.draft.${listingId}`;
}

function detailOf(data: Record<string, unknown> | null): string | null {
  const d = data?.detail;
  return typeof d === "string" && d.trim() !== "" ? d : null;
}

/**
 * Classify a submission response. Branch order is load-bearing and matches
 * the shipped dedicated route exactly: identity first, then success, then
 * the specific conflicts, then an honest fallback.
 *
 * @param fallbackAmount the locally parsed offer, used only when the server
 *        does not echo its own figure back.
 */
export function classifyPurchaseResponse(
  status: number,
  data: Record<string, unknown> | null,
  fallbackAmount: number
): PurchaseRequestOutcome {
  // No false success after 401 — the caller preserves the draft on this.
  if (status === 401) return { kind: "expired" };

  if (status >= 200 && status < 300) {
    const echoed = data?.proposedPurchasePrice;
    return {
      kind: "success",
      proposedPurchasePrice: typeof echoed === "number" ? echoed : fallbackAmount,
    };
  }

  const err = typeof data?.error === "string" ? data.error : undefined;

  if (status === 409 && err === "listing_changed") {
    return { kind: "changed", old: Number(data?.old), current: Number(data?.current) };
  }

  /* Unavailable at submit: either explicitly non-published (409) or no longer
     readable by this buyer at all (404) — once reserved, RLS hides the row
     from a non-owner, non-accepted buyer, so a listing that was open at load
     reads as a 404. Both mean the same truthful outcome. */
  if (status === 404 || (status === 409 && err === "listing_unavailable")) {
    return { kind: "unavailable" };
  }

  if (status === 409 && err === "duplicate_request") {
    return {
      kind: "form_error",
      detail: detailOf(data) ?? "You already have a pending request on this listing.",
    };
  }

  if (status === 403) {
    return {
      kind: "form_error",
      detail: detailOf(data) ?? "You can't request your own listing.",
    };
  }

  /* Currency absent at submission — the mid-session race. A form-level truth
     rather than a fault with the amount the buyer typed. */
  if (status === 409 && err === "listing_currency_unset") {
    return {
      kind: "form_error",
      detail:
        detailOf(data) ??
        "This listing's currency has not been recorded yet, so it can't receive an offer.",
    };
  }

  if (status === 400 && err === "invalid_amount") {
    return {
      kind: "field_error",
      detail: detailOf(data) ?? "Enter your offer using numbers only.",
    };
  }

  return { kind: "form_error", detail: GENERIC_SUBMIT_ERROR };
}
