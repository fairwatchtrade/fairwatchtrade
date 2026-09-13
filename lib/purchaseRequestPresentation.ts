/* formError still mixes product rejections with network/unknown-outcome
   failure, so its legacy color remains an LS-4-adjacent stop. */
export const PURCHASE_REQUEST_LEGACY_FORM_ERROR_COLOR = "#d8a171";

export const purchaseRequestPresentation = {
  validation: { text: "var(--slate)", border: "var(--gold-dim)" },
} as const;

type SubmitOutcome = "success" | "changed" | "unavailable";
type SubmitPresentationState = SubmitOutcome | "form" | "expired" | "gold" | "platinum";
type OutcomePresentation = { text: string; border: string };

const SUBMIT_OUTCOME_PRESENTATION: Record<SubmitOutcome, OutcomePresentation> = {
  success: { text: "var(--success)", border: "var(--lc-published-line)" },
  changed: { text: "var(--slate)", border: "var(--slate)" },
  unavailable: { text: "var(--platinum)", border: "var(--border-subtle)" },
};

export const PURCHASE_REQUEST_LIFECYCLE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "superseded",
] as const;
export type PurchaseRequestLifecycleStatus =
  (typeof PURCHASE_REQUEST_LIFECYCLE_STATUSES)[number];

export const PURCHASE_REQUEST_CLOSURE_CAUSES = [
  "buyer_withdrew",
  "listing_removed_by_seller",
  "listing_deleted_by_seller",
] as const;
export type PurchaseRequestClosureCause =
  (typeof PURCHASE_REQUEST_CLOSURE_CAUSES)[number];

const CANCELLED_LIFECYCLE_COLORS: Record<PurchaseRequestClosureCause, string> = {
  buyer_withdrew: "var(--slate)",
  listing_removed_by_seller: "var(--lc-rejected-badge)",
  listing_deleted_by_seller: "var(--lc-rejected-badge)",
};

const LIFECYCLE_COLORS: Record<Exclude<PurchaseRequestLifecycleStatus, "cancelled" | "expired">, string> = {
  pending: "var(--lc-pending_review-badge)",
  accepted: "var(--lc-published-badge)",
  declined: "var(--lc-rejected-badge)",
  superseded: "var(--muted)",
};

/* Deliberately returns undefined for expired and every unknown state. Expiry's
   product meaning is not ruled, so its existing local presentation remains
   outside this map rather than acquiring a semantic tone by fallback. */
export function purchaseRequestOutcomePresentation(
  outcome: SubmitPresentationState
): OutcomePresentation | undefined {
  return SUBMIT_OUTCOME_PRESENTATION[outcome as SubmitOutcome];
}

export function isPurchaseRequestLifecycleStatus(status: string): status is PurchaseRequestLifecycleStatus {
  return (PURCHASE_REQUEST_LIFECYCLE_STATUSES as readonly string[]).includes(status);
}

export function purchaseRequestLifecycleColor(
  status: PurchaseRequestLifecycleStatus,
  closureCause: string | null
): string | undefined {
  if (status === "cancelled") {
    return closureCause === "buyer_withdrew" ||
      closureCause === "listing_removed_by_seller" ||
      closureCause === "listing_deleted_by_seller"
      ? CANCELLED_LIFECYCLE_COLORS[closureCause]
      : undefined;
  }
  // Persisted expiry and unknown statuses likewise retain their local legacy
  // fallback until product semantics are ruled; neither is mapped here.
  return status === "pending" ||
    status === "accepted" ||
    status === "declined" ||
    status === "superseded"
    ? LIFECYCLE_COLORS[status]
    : undefined;
}
