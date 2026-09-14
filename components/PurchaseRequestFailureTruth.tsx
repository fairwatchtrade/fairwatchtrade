import Link from "next/link";
import type { PurchaseRequestFailure } from "@/lib/purchaseRequest";

const submissionUnconfirmedCopy =
  "We couldn't confirm whether your purchase request was sent. Check My Offers before trying again.";

/* One structural owner for both Purchase Request renderers. The state label,
   copy, and verification action carry the truth without relying on color. */
export default function PurchaseRequestFailureTruth({
  failure,
  className = "",
}: {
  failure: PurchaseRequestFailure;
  className?: string;
}) {
  const unconfirmed = failure.kind === "submission_unconfirmed";

  return (
    <div
      className={`border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3 ${className}`.trim()}
      data-purchase-request-failure={failure.kind}
      role="status"
      aria-live="polite"
    >
      <div className="fw-validity-state uppercase text-[var(--slate)]">
        {unconfirmed ? "Submission not confirmed" : "Request not sent"}
      </div>
      <p className="mt-1.5 fw-functional-copy text-[var(--platinum-dim)]">
        {unconfirmed ? submissionUnconfirmedCopy : failure.detail}
      </p>
      {unconfirmed && (
        <Link
          href="/catalogue#my-offers"
          className="mt-3 inline-flex min-h-[36px] items-center border border-[var(--gold)] px-3 fw-compact-control uppercase text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] hover:text-[var(--platinum)]"
        >
          View My Offers
        </Link>
      )}
    </div>
  );
}
