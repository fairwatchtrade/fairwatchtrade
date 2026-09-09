/* ════════════════════════════════════════════════════════════════════════
   DEALER ACCESS — the one place the account workspace asks "is this a
   dealer/business account?"  (Tax Time shell, v8.30)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "A dealer is anyone who looks like one."

   It is not. FairWatchTrade's dealer identity is a row in
   `public.dealer_profiles` keyed by `seller_id` — the same row the public
   seller page, the signed-in business-name chain and the Dealer TrustMark
   already read. Nothing else is dealer truth. In particular, NONE of these
   grant dealer access here:

     · a business name typed into a client form (not yet a row);
     · anything in localStorage or a cookie;
     · how many listings an account holds, or whether it has sold;
     · having used Dealer Accelerator (the dealer-profile route admits an
       account with imported media into profile CREATION; that is a door
       into becoming a dealer, not proof of being one);
     · the display identity the masthead resolved;
     · the route or a ?module= value someone typed.

   The read runs on the SERVER, on the session client, so RLS on
   dealer_profiles decides what the caller may see, and only the minimal
   boolean result travels into the workspace. The workspace renders from
   it; it never re-derives it.

   Pure and impure halves are separated on purpose: `dealerAccessFrom()`
   is the decision and is unit-testable with in-memory rows;
   `readDealerAccess()` is the one database read that feeds it.
   ════════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DealerAccess = {
  /** Tax Time is visible and navigable only when this is true. */
  taxTime: boolean;
};

export const NO_DEALER_ACCESS: DealerAccess = Object.freeze({ taxTime: false });

/** The shape of the only row that matters. */
export type DealerProfileIdentityRow = { seller_id: string } | null | undefined;

/**
 * Decide dealer access from the dealer_profiles row read for this user.
 * The row must exist AND belong to the same user id — a row for anyone
 * else, however it arrived, is not this account's identity.
 */
export function dealerAccessFrom(row: DealerProfileIdentityRow, userId: string | null | undefined): DealerAccess {
  if (!userId || !row || typeof row.seller_id !== "string") return NO_DEALER_ACCESS;
  return row.seller_id === userId ? { taxTime: true } : NO_DEALER_ACCESS;
}

/** The session client the server pages already hold. Typed as the client
    class itself: a structural stand-in for the query builder made the
    compiler compare the client's whole generic surface against it at the
    call site and give up ("excessively deep"). The in-memory client the
    test hands in is shape-compatible at runtime; the test file is untyped. */
type DealerProfileReader = Pick<SupabaseClient, "from">;

/**
 * Read the account's dealer identity and reduce it to access. Fail closed:
 * a read error, a missing row, or a row for a different user all yield no
 * access. This is display/navigation truth for the workspace — every
 * dealer-only route and RPC keeps its own server gate.
 */
export async function readDealerAccess(db: DealerProfileReader, userId: string): Promise<DealerAccess> {
  try {
    const { data, error } = await db.from("dealer_profiles").select("seller_id").eq("seller_id", userId).maybeSingle();
    if (error) return NO_DEALER_ACCESS;
    return dealerAccessFrom(data as DealerProfileIdentityRow, userId);
  } catch {
    return NO_DEALER_ACCESS;
  }
}
