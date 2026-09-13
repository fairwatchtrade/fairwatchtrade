/* ════════════════════════════════════════════════════════════════════════
   TRANSACTION PAYABILITY — the one predicate for "this accepted purchase can
   still be paid through Step 1 Checkout" (Accepted Purchase Continuity +
   Shopping Bag, 2026-09-11)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The Bag can decide for itself which purchases are payable."

   It cannot. Before this file the payable-status set lived twice, as a
   private constant in the checkout route and again in the payment-state
   route, and a third copy for the Bag would have been the moment the three
   drifted. Checkout enforces this predicate; payment-state and the Shopping
   Bag resolver consume the same one. There is no other copy.

   The values are transaction lifecycle statuses (transactions.status), not
   provider payment lifecycles — those live in lib/payments/paymentState.ts
   and are combined with this predicate by the resolver, never merged into
   it.

   Deliberately NOT here: any ruling on cancelled / disputed / refunded
   transactions. Those states are not payable, and whether they leave the
   Bag is an unruled product question the resolver answers conservatively.
   ════════════════════════════════════════════════════════════════════════ */

/** Exact transactions.status vocabulary. This is the product-owned source
    for exhaustive read/presentation coverage; it does not assign payability
    or merge transaction truth with any provider axis. */
export const TRANSACTION_LIFECYCLE = [
  "pending",
  "payment_pending",
  "paid",
  "shipped",
  "delivered",
  "under_inspection",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
] as const;
export type TransactionLifecycle = (typeof TRANSACTION_LIFECYCLE)[number];

const TRANSACTION_LIFECYCLE_SET: ReadonlySet<string> = new Set(TRANSACTION_LIFECYCLE);

/** Narrow untrusted database/browser text at the product boundary. Unknown
    future values remain unresolved until their meaning is governed. */
export function transactionLifecycleState(
  status: string | null | undefined,
): TransactionLifecycle | null {
  return status && TRANSACTION_LIFECYCLE_SET.has(status)
    ? status as TransactionLifecycle
    : null;
}

/** transactions.status values from which Step 1 Checkout may begin. */
const PAYABLE_TRANSACTION_LIFECYCLE = ["pending", "payment_pending"] as const satisfies readonly TransactionLifecycle[];
export const PAYABLE_TRANSACTION_STATUSES: ReadonlySet<string> = new Set(PAYABLE_TRANSACTION_LIFECYCLE);

/** transactions.status values that can only be reached after the buyer's
    payment/funding phase is complete. A Bag never contains these: the
    watch has left it and nothing downstream (shipment, inspection,
    completion) may bring it back. */
const POST_PAYMENT_TRANSACTION_LIFECYCLE = [
  "paid",
  "shipped",
  "delivered",
  "under_inspection",
  "completed",
] as const satisfies readonly TransactionLifecycle[];
export const POST_PAYMENT_TRANSACTION_STATUSES: ReadonlySet<string> = new Set(POST_PAYMENT_TRANSACTION_LIFECYCLE);

export function isPayableTransactionStatus(status: string | null | undefined): boolean {
  return PAYABLE_TRANSACTION_STATUSES.has(status ?? "");
}

export function isPostPaymentTransactionStatus(status: string | null | undefined): boolean {
  return POST_PAYMENT_TRANSACTION_STATUSES.has(status ?? "");
}
