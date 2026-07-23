/* ════════════════════════════════════════════════════════════════════════
   lib/listingStatus.ts — the ONE listing lifecycle-status source of truth

   Introduced by the Lifecycle Status Container Language flight (Design Gate
   closed on Hybrid C). Before this, four surfaces each declared their own
   status label maps — SellerListingsRoom, AccountDashboard, ListingStatusControls,
   and AdminDashboard's raw pill — and Flight 1 proved they had already drifted
   (Admin leaked the raw "pending_review"; the dashboard preview had no
   "reserved" label at all). This module owns the canonical states, the audience
   labels, the writable set, and the design-token key each surface uses to reach
   the Hybrid C colours defined in app/globals.css.

   The five proven values live in listings.status (plain text — there is NO db
   CHECK; the admin status route is the write-time guard). 'reserved' is written
   only by the offer-accept RPC and shows to sellers as "Sale Pending".

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Canonical lifecycle order (draft → settled). 'reserved' = an offer was accepted.
export const LIFECYCLE_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "reserved",
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export function isLifecycleStatus(v: string): v is LifecycleStatus {
  return (LIFECYCLE_STATUSES as readonly string[]).includes(v);
}

// The founder adjudication path (app/api/admin/listings/[id]/status/route.ts)
// can set exactly these four. Order mirrors the founder dropdown. 'reserved' is
// intentionally absent — it is written only by the accept RPC, never by hand.
export const WRITABLE_STATUSES = [
  "pending_review",
  "published",
  "draft",
  "rejected",
] as const;

export type WritableStatus = (typeof WRITABLE_STATUSES)[number];

export function isWritableStatus(v: string): v is WritableStatus {
  return (WRITABLE_STATUSES as readonly string[]).includes(v);
}

// Humanized labels. Seller and Admin share the wording under Hybrid C — Admin
// stops rendering the raw stored string (applied in the Admin implementation
// order). The two accessors stay separate because the AUDIENCES are distinct
// even where the label matches. Unknown values fall through to the raw string.
const STATUS_LABELS: Record<LifecycleStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  published: "Published",
  rejected: "Rejected",
  reserved: "Sale Pending",
};

export function sellerLabel(status: string): string {
  return isLifecycleStatus(status) ? STATUS_LABELS[status] : status;
}

export function adminLabel(status: string): string {
  return isLifecycleStatus(status) ? STATUS_LABELS[status] : status;
}

// Key each surface uses to reach the Hybrid C CSS custom properties in
// app/globals.css: --lc-<key>-line / -wash / -badge. A non-lifecycle value maps
// to 'neutral' (the default comparator — perimeter only, no wash).
export type LifecycleTokenKey = LifecycleStatus | "neutral";

export function statusTokenKey(status: string): LifecycleTokenKey {
  return isLifecycleStatus(status) ? status : "neutral";
}
