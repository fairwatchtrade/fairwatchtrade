/* ════════════════════════════════════════════════════════════════════════
   DEALER ACCELERATOR ENTITLEMENT — the one place the product asks
   "may this seller account use Dealer Accelerator?"  (founder lock
   2026-09-10: designated dealers only)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "A dealer can use Dealer Accelerator."

   Not by default. Dealer identity (a `dealer_profiles` row, read by
   lib/dealerAccess.ts for Tax Time) and Dealer Accelerator entitlement are
   SEPARATE FACTS. The capability exists only for seller accounts
   FairWatchTrade explicitly designated, and that designation is one row in
   `public.dealer_accelerator_entitlements`, written by the founder, never by
   the account itself. None of these grant it:

     · a dealer_profiles row, or its admitted_at;
     · having used Dealer Accelerator before, batches, sources, imported
       media, listing counts;
     · anything in localStorage, a cookie, or a typed ?module= value;
     · a revoked entitlement row (revocation is deliberate and durable).

   Absence of entitlement means the capability does not exist for that
   account: it is not shown, not navigable, and every seller-facing Dealer
   Accelerator route refuses with a generic 403. Per-source authorization,
   the worker's bearer authority and the founder/admin routes are separate
   facts and keep their own gates.

   The read runs on the SERVER on the session client, so the table's RLS
   (own live row only) decides what the caller may see, and only the
   boolean travels into the workspace. Pure decision and single read are
   separated so the decision is unit-testable with in-memory rows.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DealerAcceleratorEntitlement = {
  /** Dealer Accelerator is visible, navigable and invokable only when true. */
  dealerAccelerator: boolean;
};

export const NO_DEALER_ACCELERATOR: DealerAcceleratorEntitlement = Object.freeze({ dealerAccelerator: false });

/** The shape of the only row that matters. `granted_at` is what makes a row
    an entitlement row at all: a dealer_profiles row (seller_id, admitted_at)
    has no such column and is refused by shape, not by table name. */
export type DealerAcceleratorEntitlementRow =
  | { seller_id: string; granted_at: string; revoked_at?: string | null }
  | null
  | undefined;

/**
 * Decide entitlement from the entitlement row read for this user. The row
 * must exist, carry a grant, belong to the same user id, and not be revoked.
 */
export function dealerAcceleratorEntitlementFrom(
  row: DealerAcceleratorEntitlementRow | Record<string, unknown>,
  userId: string | null | undefined,
): DealerAcceleratorEntitlement {
  if (!userId || !row || typeof row !== "object") return NO_DEALER_ACCELERATOR;
  const r = row as Record<string, unknown>;
  if (typeof r.seller_id !== "string" || typeof r.granted_at !== "string") return NO_DEALER_ACCELERATOR;
  if (r.seller_id !== userId) return NO_DEALER_ACCELERATOR;
  if (r.revoked_at != null) return NO_DEALER_ACCELERATOR;
  return { dealerAccelerator: true };
}

/** Same typing rationale as lib/dealerAccess.ts: the client class itself. */
type EntitlementReader = Pick<SupabaseClient, "from">;

/**
 * Read the account's entitlement and reduce it to the boolean. Fail closed:
 * a read error, a thrown client, a missing row, a revoked row or a row for
 * a different user all yield no Dealer Accelerator.
 */
export async function readDealerAcceleratorEntitlement(
  db: EntitlementReader,
  userId: string,
): Promise<DealerAcceleratorEntitlement> {
  try {
    const { data, error } = await db
      .from("dealer_accelerator_entitlements")
      .select("seller_id, granted_at, revoked_at")
      .eq("seller_id", userId)
      .maybeSingle();
    if (error) return NO_DEALER_ACCELERATOR;
    return dealerAcceleratorEntitlementFrom(data as DealerAcceleratorEntitlementRow, userId);
  } catch {
    return NO_DEALER_ACCELERATOR;
  }
}
