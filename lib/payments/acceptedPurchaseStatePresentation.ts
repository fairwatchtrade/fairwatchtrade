import {
  DISPUTE_STATES,
  LIFECYCLE,
  REFUND_STATES,
  type DisputeState,
  type Lifecycle,
  type RefundState,
} from "./paymentState.ts";
import {
  TRANSACTION_LIFECYCLE,
  transactionLifecycleState,
  type TransactionLifecycle,
} from "./transactionPayability.ts";
import type { BagMemberState } from "../purchases/bagMembership.ts";

/* Accepted-purchase/payment presentation, and nothing broader.

   Transaction lifecycle, payment-attempt lifecycle, refund, dispute and
   availability remain separate truth axes. This module assigns redundant
   visual meaning to an axis-qualified value; it never normalizes one axis
   into another and owns no payment mechanics.

   Transaction presentation derives from the product runtime vocabulary in
   transactionPayability. The database and its writers remain truth authority;
   the build-path contract inventories their literal states against that
   vocabulary and unknown reads stay on transaction:unresolved. */

export const ACCEPTED_PURCHASE_TRANSACTION_STATES = TRANSACTION_LIFECYCLE;
export type AcceptedPurchaseTransactionState = TransactionLifecycle;

export const ACCEPTED_PURCHASE_AVAILABILITY_STATES = [
  "read_unavailable",
  /* The Bag source contains this conservative fallback, but its current
     resolver cannot emit it. Dormancy is not semantic authority, so the
     founder gallery keeps it explicitly governance-pending. */
  "payment_unavailable",
] as const;
export type AcceptedPurchaseAvailabilityState = (typeof ACCEPTED_PURCHASE_AVAILABILITY_STATES)[number];

export type AcceptedPurchaseCheckoutContext = "open" | "return-pending" | "cancel-returned";
export type AcceptedPurchaseReturnContext = "return" | "cancel" | null;

/* These are the exact inherited product recipes around the color-only marker.
   Shopping Bag, Buyer Purchases and the controlled gallery consume this one
   registry, so a live typography/surface change cannot leave the fixture
   silently measuring a copied approximation. */
export const ACCEPTED_PURCHASE_STATE_CONTEXT_CLASSES = {
  primary: "mt-0.5 text-[11px] uppercase tracking-[1.2px]",
  "availability-14": "mt-4 text-[14px] leading-[1.6]",
  "availability-13-bag": "mt-3 text-[13px] leading-[1.6]",
  "availability-13-buyer": "mt-2 text-[13px] leading-[1.6]",
  "bag-chip": "fw-lifecycle-label mt-0.5 uppercase",
  "buyer-chip": "mt-1 text-[11px] uppercase tracking-[1.2px]",
} as const;

export const ACCEPTED_PURCHASE_FOCUSED_ROW_CLASS = "bg-[var(--gold-whisper)]";

type CheckoutCreatedPresentationInput = {
  axis: "payment-lifecycle";
  state: "checkout_created";
  context: AcceptedPurchaseCheckoutContext;
};

export type AcceptedPurchaseStateInput =
  | { axis: "payment-lifecycle"; state: Exclude<Lifecycle, "checkout_created">; context?: never }
  | CheckoutCreatedPresentationInput
  | { axis: "payment-lifecycle"; state: "unresolved"; context?: never }
  | { axis: "transaction"; state: AcceptedPurchaseTransactionState | "unresolved" }
  | { axis: "refund"; state: RefundState }
  | { axis: "dispute"; state: DisputeState }
  | { axis: "availability"; state: AcceptedPurchaseAvailabilityState };

export type AcceptedPurchaseStatePresentation = {
  axis: AcceptedPurchaseStateInput["axis"];
  state: string;
  context?: CheckoutCreatedPresentationInput["context"];
  governance: "settled" | "pending" | "out-of-surface";
  meaning: "actionable" | "operational" | "complete" | "adverse" | "unavailable" | "absent" | "unruled";
  text: string;
  line: string;
  surface: "var(--ink)";
};

type PresentationRecipe = Omit<AcceptedPurchaseStatePresentation, "axis" | "state">;

const recipe = (
  governance: PresentationRecipe["governance"],
  meaning: PresentationRecipe["meaning"],
  text: string,
  line: string,
): PresentationRecipe => ({ governance, meaning, text, line, surface: "var(--ink)" });

const actionable = recipe("settled", "actionable", "var(--lc-private_active-badge)", "var(--lc-private_active-line)");
const operational = recipe("settled", "operational", "var(--lc-private_active-badge)", "var(--lc-private_active-line)");
const complete = recipe("settled", "complete", "var(--lc-published-badge)", "var(--lc-published-line)");
const pending = recipe("pending", "unruled", "var(--platinum-dim)", "var(--lc-neutral-line)");
const absent = recipe("out-of-surface", "absent", "var(--muted)", "var(--lc-neutral-line)");

export const PAYMENT_LIFECYCLE_PRESENTATION = {
  pending: actionable,
  confirming: operational,
  requires_capture: operational,
  succeeded: complete,
  /* The public read collapses provider payment failures and Checkout-session
     creation failures into this value while withholding provider_status.
     Without that discriminator, LS-2 cannot truthfully paint it adverse. */
  failed: pending,
  /* Current payment law makes these attempt states retryable and explicitly
     distinguishes `canceled` from failure. They are not transaction
     cancellation, legal expiry, or seller rescission. */
  canceled: actionable,
  expired: actionable,
  unresolved: pending,
} satisfies Record<Exclude<Lifecycle, "checkout_created"> | "unresolved", PresentationRecipe>;

export const CHECKOUT_CREATED_PRESENTATION = {
  open: actionable,
  "return-pending": operational,
  /* The query parameter is navigation context, not webhook truth. Preserve
     the existing product copy but do not assign it a settled outcome color. */
  "cancel-returned": pending,
} satisfies Record<CheckoutCreatedPresentationInput["context"], PresentationRecipe>;

export const TRANSACTION_LIFECYCLE_PRESENTATION = {
  pending: actionable,
  payment_pending: actionable,
  paid: complete,
  completed: complete,
  /* These schema values have no current writer or adopted buyer-facing color
     ruling. Their words remain readable and semantically neutral. */
  shipped: pending,
  delivered: pending,
  under_inspection: pending,
  cancelled: pending,
  disputed: pending,
  refunded: pending,
  unresolved: pending,
} satisfies Record<AcceptedPurchaseTransactionState | "unresolved", PresentationRecipe>;

export const REFUND_PRESENTATION = {
  none: absent,
  partial: pending,
  full: pending,
} satisfies Record<RefundState, PresentationRecipe>;

export const DISPUTE_PRESENTATION = {
  none: absent,
  open: pending,
  won: pending,
  lost: pending,
} satisfies Record<DisputeState, PresentationRecipe>;

export const AVAILABILITY_PRESENTATION = {
  read_unavailable: recipe("settled", "unavailable", "var(--platinum)", "var(--lc-neutral-line)"),
  payment_unavailable: pending,
} satisfies Record<AcceptedPurchaseAvailabilityState, PresentationRecipe>;

export function acceptedPurchaseStatePresentation(
  input: AcceptedPurchaseStateInput,
): AcceptedPurchaseStatePresentation {
  let presentation: PresentationRecipe;
  switch (input.axis) {
    case "payment-lifecycle":
      presentation = input.state === "checkout_created"
        ? CHECKOUT_CREATED_PRESENTATION[input.context]
        : PAYMENT_LIFECYCLE_PRESENTATION[input.state];
      break;
    case "transaction":
      presentation = TRANSACTION_LIFECYCLE_PRESENTATION[input.state];
      break;
    case "refund":
      presentation = REFUND_PRESENTATION[input.state];
      break;
    case "dispute":
      presentation = DISPUTE_PRESENTATION[input.state];
      break;
    case "availability":
      presentation = AVAILABILITY_PRESENTATION[input.state];
      break;
  }
  return {
    axis: input.axis,
    state: input.state,
    ...(input.axis === "payment-lifecycle" && input.state === "checkout_created"
      ? { context: input.context }
      : {}),
    ...presentation,
  };
}

/** The one adapter from public payment-attempt truth to presentation input.
    Both buyer surfaces use it, so identical lifecycle/context truth cannot
    drift before it reaches the shared semantic owner. */
export function acceptedPurchasePaymentInput(
  state: string | null | undefined,
  checkoutContext: AcceptedPurchaseCheckoutContext = "open",
): AcceptedPurchaseStateInput | null {
  if (state == null) return null;
  const lifecycle = acceptedPurchasePaymentLifecycleState(state);
  if (lifecycle === null) return { axis: "payment-lifecycle", state: "unresolved" };
  return lifecycle === "checkout_created"
    ? { axis: "payment-lifecycle", state: lifecycle, context: checkoutContext }
    : { axis: "payment-lifecycle", state: lifecycle };
}

export function acceptedPurchaseCheckoutContext(
  returned: AcceptedPurchaseReturnContext,
): AcceptedPurchaseCheckoutContext {
  return returned === "return"
    ? "return-pending"
    : returned === "cancel"
      ? "cancel-returned"
      : "open";
}

type ShoppingBagPrimaryStateFacts = {
  memberState: BagMemberState;
  transactionStatus: string | null | undefined;
  paymentLifecycle: string | null | undefined;
  hasPayment: boolean;
  canPay: boolean;
  returned: AcceptedPurchaseReturnContext;
};

/** Executable Shopping Bag emitter contract. It selects only the authoritative
    axis-qualified input; existing labels, actions and copy remain in the Bag. */
export function shoppingBagPrimaryStateInput(
  facts: ShoppingBagPrimaryStateFacts,
): AcceptedPurchaseStateInput {
  const checkoutContext = acceptedPurchaseCheckoutContext(facts.returned);
  const paymentInput = acceptedPurchasePaymentInput(facts.paymentLifecycle, checkoutContext);
  const unresolvedPaymentInput = { axis: "payment-lifecycle", state: "unresolved" } as const;

  if (facts.memberState === "unruled") {
    const transactionState = acceptedPurchaseTransactionState(facts.transactionStatus);
    return (transactionState === "pending" || transactionState === "payment_pending") && facts.hasPayment
      ? paymentInput ?? unresolvedPaymentInput
      : transactionState
        ? { axis: "transaction", state: transactionState }
        : { axis: "transaction", state: "unresolved" };
  }
  if (facts.memberState === "confirming" || facts.memberState === "checkout_open" || facts.memberState === "retry") {
    return paymentInput ?? unresolvedPaymentInput;
  }
  if (facts.canPay) {
    const transactionState = acceptedPurchaseTransactionState(facts.transactionStatus);
    return facts.paymentLifecycle === "pending" && paymentInput
      ? paymentInput
      : transactionState
        ? { axis: "transaction", state: transactionState }
        : { axis: "transaction", state: "unresolved" };
  }
  return { axis: "availability", state: "payment_unavailable" };
}

type BuyerPurchasePrimaryStateFacts = {
  transactionStatus: string | null | undefined;
  paymentLifecycle: string | null | undefined;
  hasPayment: boolean;
  canPay: boolean;
  returned: AcceptedPurchaseReturnContext;
};

/** Executable Buyer Purchases emitter contract. Keeping this adjacent to the
    Bag projector makes same-truth parity directly testable without merging
    either surface's copy or behavior. */
export function buyerPurchasePrimaryStateInput(
  facts: BuyerPurchasePrimaryStateFacts,
): AcceptedPurchaseStateInput {
  const lifecycle = acceptedPurchasePaymentLifecycleState(facts.paymentLifecycle);
  const paymentInput = acceptedPurchasePaymentInput(
    facts.paymentLifecycle,
    acceptedPurchaseCheckoutContext(facts.returned),
  );
  const paymentOwned = lifecycle !== null && lifecycle !== "pending";
  if (paymentOwned || (facts.hasPayment && lifecycle === null) || (facts.canPay && lifecycle === "pending")) {
    return paymentInput ?? { axis: "payment-lifecycle", state: "unresolved" };
  }
  const transactionState = acceptedPurchaseTransactionState(facts.transactionStatus);
  return transactionState
    ? { axis: "transaction", state: transactionState }
    : { axis: "transaction", state: "unresolved" };
}

/* The founder gallery maps this registry directly. Adding a typed payment,
   refund or dispute state automatically adds a fixture; the build-path
   contract proves this list still equals every source vocabulary. */
export const PAYMENT_STATE_GALLERY_FIXTURES: readonly AcceptedPurchaseStateInput[] = [
  ...LIFECYCLE.flatMap((state): AcceptedPurchaseStateInput[] => state === "checkout_created"
    ? (["open", "return-pending", "cancel-returned"] as const).map((context) => ({
        axis: "payment-lifecycle" as const,
        state,
        context,
      }))
    : [{ axis: "payment-lifecycle" as const, state }]),
  { axis: "payment-lifecycle", state: "unresolved" },
  ...ACCEPTED_PURCHASE_TRANSACTION_STATES.map((state) => ({ axis: "transaction" as const, state })),
  { axis: "transaction", state: "unresolved" },
  ...REFUND_STATES.map((state) => ({ axis: "refund" as const, state })),
  ...DISPUTE_STATES.map((state) => ({ axis: "dispute" as const, state })),
  ...ACCEPTED_PURCHASE_AVAILABILITY_STATES.map((state) => ({ axis: "availability" as const, state })),
];

const paymentLifecycleSet: ReadonlySet<string> = new Set(LIFECYCLE);

export function acceptedPurchasePaymentLifecycleState(
  state: string | null | undefined,
): Lifecycle | null {
  return state && paymentLifecycleSet.has(state) ? state as Lifecycle : null;
}

export function acceptedPurchaseTransactionState(
  state: string | null | undefined,
): AcceptedPurchaseTransactionState | null {
  return transactionLifecycleState(state);
}
