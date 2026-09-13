import {
  isPurchaseRequestLifecycleStatus,
  purchaseRequestLifecycleColor,
} from "@/lib/purchaseRequestPresentation";

function founderClosureSentence(status: string, closureCause: string | null): string {
  if (status !== "cancelled") return "";
  if (closureCause === "buyer_withdrew") return "closed by the buyer";
  if (closureCause === "listing_removed_by_seller") {
    return "closed by the seller removing the listing";
  }
  if (closureCause === "listing_deleted_by_seller") {
    return "closed by the seller deleting the listing";
  }
  return "closed — cause not recorded";
}

/* The exact Founder Review Purchase Request emitter. Product meaning comes
   from the shared lifecycle owner; only diagnostic founder prose lives here.
   Expired, unknown, and unattributed cancellation remain readable and neutral
   rather than acquiring guessed semantic meaning. */
export default function AdminPurchaseRequestStatus({
  status,
  closureCause,
}: {
  status: string;
  closureCause: string | null;
}) {
  const lifecycleStatus = isPurchaseRequestLifecycleStatus(status) ? status : null;
  const semanticColor = lifecycleStatus
    ? purchaseRequestLifecycleColor(lifecycleStatus, closureCause)
    : undefined;
  const governance = semanticColor
    ? "governed"
    : status === "expired" ? "governance-pending" : "neutral";
  const closure = founderClosureSentence(status, closureCause);

  return (
    <span
      data-admin-purchase-request-status={status}
      data-admin-purchase-request-closure={closureCause ?? undefined}
      data-admin-purchase-request-governance={governance}
    >
      <span
        className="fw-lifecycle-label uppercase"
        style={{ color: semanticColor ?? "var(--muted)" }}
      >
        {status}
      </span>
      {closure && <span style={{ color: "var(--muted)" }}> · {closure}</span>}
    </span>
  );
}
