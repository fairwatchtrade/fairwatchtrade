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

   ⚠ THE "NO DB CHECK" NOTE THAT USED TO STAND HERE IS NO LONGER TRUE. The
   listing lifecycle Stage 1 migration added listings_status_lifecycle, a CHECK
   over exactly the six states below. The admin status route is still the
   write-time guard for the founder path, but it is no longer the only thing
   between a typo and the column.

   'reserved' is written only by the offer-accept RPC and shows to sellers as
   "Sale Pending". 'removed' is written only by remove_listing() — the seller
   took the watch off the market, and the listing stays theirs with all its
   data; only its public availability ended. Both are absent from
   WRITABLE_STATUSES because neither is a founder adjudication.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

// Canonical lifecycle order (draft → settled). 'reserved' = an offer was accepted.
export const LIFECYCLE_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "reserved",
  "removed",
  /* Private Listing V1 (v5.98) — a real listing offered to exactly ONE
     authorized buyer. Its own status value on purpose: every public surface
     filters status='published', so private rows are excluded from Browse,
     search, counts, broadcast bells, and saved-search matching BY
     CONSTRUCTION. Written by the private creation path and by founder
     approval of a held private submission; absent from WRITABLE_STATUSES
     because the founder dropdown must not hand-place it. */
  "private_active",
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
  /* PRODUCT VOCABULARY, and it deliberately differs from the stored value.

     'removed' is what the database says and stays implementation detail by
     ruling — no schema-renaming exercise, and no rewriting of listings that
     were genuinely recorded under the older Remove semantics.

     What the seller reads is "Paused", because that is what the action
     means: keep the listing, stop selling it for now. Delete is the separate,
     irreversible sibling — neither is a prerequisite for the other. A seller
     who has just shipped a watch should find Delete without first learning
     that this product has a lifecycle. */
  removed: "Paused",
  private_active: "Private",
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
