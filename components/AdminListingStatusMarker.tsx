import { adminLabel, statusTokenKey } from "@/lib/listingStatus";

/* Founder/Admin rendering of the canonical listing lifecycle owner. Stored
   values never become display vocabulary here; unknown values deliberately
   resolve through the neutral lifecycle perimeter and readable fallback. */
export default function AdminListingStatusMarker({ status }: { status: string }) {
  const tokenKey = statusTokenKey(status);

  return (
    <span
      className="fw-lifecycle-label inline-flex whitespace-nowrap border px-2 py-1 uppercase"
      data-admin-listing-status={status}
      data-admin-listing-token={tokenKey}
      style={{
        borderColor: `var(--lc-${tokenKey}-line)`,
        backgroundColor: `var(--lc-${tokenKey}-wash, transparent)`,
        color: `var(--lc-${tokenKey}-badge, var(--muted))`,
      }}
    >
      {adminLabel(status)}
    </span>
  );
}
